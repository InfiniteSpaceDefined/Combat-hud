'use strict';
// Combat HUD shared sessions: WebSocket handler (slice 1: seats, character sync, HP view toggle, feed).
// Runs inline from the CloudFormation template (CommonJS, AWS SDK v3 from the Lambda runtime).
const crypto = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { ApiGatewayManagementApiClient, PostToConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');

const TABLE = process.env.TABLE;
const HOURS = Number(process.env.SESSION_HOURS) || 24;
const ORIGINS = String(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const MAX_SEATS = Number(process.env.MAX_SEATS) || 5;      // 4 players + DM
const HOST_PASS = String(process.env.HOST_PASSPHRASE || ''); // only someone with this can start a session
const RATE_MAX = Number(process.env.RATE_MAX) || 30;       // messages per window per connection
const RATE_WIN = 10;                                       // seconds
const JOIN_MAX = 5;                                        // host/join attempts per minute per connection
const CHAR_MAX = 4096;                                     // bytes of play data
const BODY_MAX = 16384;
const FEED_KEEP = 50;
const OK = { statusCode: 200 };
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';       // 32 chars, no O/0/I/1

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient(process.env.DDB_ENDPOINT ? { endpoint: process.env.DDB_ENDPOINT } : {}),
  { marshallOptions: { removeUndefinedValues: true } });
let mgmt = null, mgmtUrl = '';
function api(ev) {
  const rc = ev.requestContext;
  const url = process.env.WS_ENDPOINT || ('https://' + rc.domainName + '/' + rc.stage);
  if (url !== mgmtUrl) { mgmt = new ApiGatewayManagementApiClient({ endpoint: url }); mgmtUrl = url; }
  return mgmt;
}

const now = () => Math.floor(Date.now() / 1000);
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const rnd = n => crypto.randomBytes(n).toString('base64url');
const P = code => 'S#' + code;
function sameHash(token, stored) {
  if (!okTok(token) || typeof stored !== 'string') return false;
  const a = sha(token), b = Buffer.from(stored, 'base64url');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function samePass(given) {
  if (!HOST_PASS || !okTok(given)) return false;
  return crypto.timingSafeEqual(sha(given), sha(HOST_PASS));
}
function newCode() { let s = ''; for (const x of crypto.randomBytes(6)) s += CODE_ABC[x % 32]; return s; }
function cleanName(s) { return typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40) : ''; }
const err = (code, re) => ({ t: 'err', code, re });
const okId = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(v);
const okTok = v => typeof v === 'string' && v.length > 0 && v.length <= 200;

const get = (pk, sk) => ddb.send(new GetCommand({ TableName: TABLE, Key: { pk, sk } })).then(r => r.Item);
const put = (Item, cond, vals) => ddb.send(new PutCommand({ TableName: TABLE, Item, ConditionExpression: cond, ExpressionAttributeValues: vals }));
const del = (pk, sk) => ddb.send(new DeleteCommand({ TableName: TABLE, Key: { pk, sk } }));
async function query(pk, prefix, opts) {
  opts = opts || {};
  const out = []; let start;
  do {
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE, KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
      ExpressionAttributeValues: { ':p': pk, ':s': prefix }, ExclusiveStartKey: start,
      ScanIndexForward: opts.desc ? false : true, Limit: opts.limit }));
    out.push(...(r.Items || []));
    start = opts.limit ? undefined : r.LastEvaluatedKey;
  } while (start);
  return out;
}

async function send(ev, connId, msg) {
  try {
    await api(ev).send(new PostToConnectionCommand({ ConnectionId: connId, Data: Buffer.from(JSON.stringify(msg)) }));
    return true;
  } catch (e) {
    if (e.name === 'GoneException' || (e.$metadata && e.$metadata.httpStatusCode === 410)) return false;
    console.error('post failed', e.name);
    return true;
  }
}
async function dropConn(code, connId) {
  await Promise.all([del('C#' + connId, 'C'), del(P(code), 'CONN#' + connId)]);
}
// Send make(conn) to every connection in the session; clean up any that are gone.
async function broadcast(ev, code, make, conns) {
  conns = conns || await query(P(code), 'CONN#');
  await Promise.all(conns.map(async c => {
    const m = make(c);
    if (!m) return;
    if (!(await send(ev, c.connId, m))) await dropConn(code, c.connId);
  }));
}

// ---- visibility (DM toggle: exact numbers or HP bar only) ----
function exactFor(viewer, meta, seatId) { return meta.hpView !== 'bar' || viewer.role === 'dm' || viewer.seatId === seatId; }
function viewChar(ch, viewer, meta) {
  const d = Object.assign({}, ch.data);
  if (!exactFor(viewer, meta, ch.seatId)) {
    const max = Number(d.hpMax) || 0;
    d.hpPct = max > 0 ? Math.max(0, Math.min(100, Math.round((Number(d.hp) || 0) / max * 100))) : null;
    delete d.hp; delete d.hpMax; delete d.temp;
  }
  return { seatId: ch.seatId, rev: ch.rev, data: d };
}
function viewFeed(f, viewer, meta) {
  const exact = exactFor(viewer, meta, f.seatId);
  return { at: f.at, seatId: f.seatId, name: f.name, ev: exact ? f.ev : f.ev.map(e => ('v' in e && (e.k === 'dmg' || e.k === 'heal' || e.k === 'temp')) ? { k: e.k } : e) };
}

// ---- play data ----
// Strict schema for the parsed play data a player shares. Anything else is refused.
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v, max) => typeof v === 'string' && v.length <= max && !/[\u0000-\u001f\u007f<>]/.test(v);
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const onlyKeys = (o, keys) => Object.keys(o).every(k => keys.includes(k));
const CHAR_SCHEMA = {
  name: v => isStr(v, 60), cls: v => isStr(v, 60), conc: v => v === null || isStr(v, 60),
  level: v => isInt(v, 0, 30), hp: v => isInt(v, -999, 9999), hpMax: v => isInt(v, 0, 9999), temp: v => isInt(v, 0, 9999),
  ac: v => isInt(v, 0, 99), exhaustion: v => isInt(v, 0, 10), speed: v => isInt(v, 0, 999), inspiration: v => typeof v === 'boolean',
  death: v => isObj(v) && onlyKeys(v, ['s', 'f']) && (v.s == null || isInt(v.s, 0, 3)) && (v.f == null || isInt(v.f, 0, 3)),
  conditions: v => Array.isArray(v) && v.length <= 30 && v.every(x => isStr(x, 40)),
  spells: v => Array.isArray(v) && v.length <= 150 && v.every(x => isStr(x, 60)),
  slots: v => isObj(v) && Object.keys(v).length <= 10 && Object.keys(v).every(k => /^([1-9]|pact)$/.test(k)) &&
    Object.values(v).every(x => isObj(x) && onlyKeys(x, ['max', 'used', 'lvl']) && isInt(x.max, 0, 20) && isInt(x.used, 0, 20) && (x.lvl == null || isInt(x.lvl, 1, 9))),
};
function cleanChar(d) {
  if (!isObj(d)) return null;
  for (const [k, v] of Object.entries(d)) if (!Object.prototype.hasOwnProperty.call(CHAR_SCHEMA, k) || !(v == null || CHAR_SCHEMA[k](v))) return null;
  if (Buffer.byteLength(JSON.stringify(d)) > CHAR_MAX) return null;
  return d;
}
// Feed events from the change between two snapshots of a character.
function diff(a, b) {
  const ev = [];
  if (!a) return ev;
  const n = x => Number(x) || 0;
  const dhp = n(b.hp) - n(a.hp), dt = n(b.temp) - n(a.temp), tot = dhp + dt;
  if (tot < 0) ev.push({ k: 'dmg', v: -tot }); else if (dhp > 0) ev.push({ k: 'heal', v: dhp });
  if (dt > 0) ev.push({ k: 'temp', v: dt });
  if (n(a.hp) > 0 && n(b.hp) <= 0 && n(b.hpMax) > 0) ev.push({ k: 'down' });
  if (n(a.hp) <= 0 && n(b.hp) > 0 && n(a.hpMax) > 0) ev.push({ k: 'up' });
  const used = s => { const o = {}; if (s && typeof s === 'object') for (const l of Object.keys(s)) o[l] = n(s[l] && s[l].used); return o; };
  const ua = used(a.slots), ub = used(b.slots);
  for (const l of Object.keys(ub)) if (ub[l] > (ua[l] || 0)) ev.push({ k: 'slot', l, v: ub[l] - (ua[l] || 0) });
  const ca = new Set(a.conditions || []), cb = new Set(b.conditions || []);
  for (const c of cb) if (!ca.has(c)) ev.push({ k: 'cond+', c });
  for (const c of ca) if (!cb.has(c)) ev.push({ k: 'cond-', c });
  if ((b.conc || null) !== (a.conc || null)) ev.push(b.conc ? { k: 'conc', s: b.conc } : { k: 'conc-', s: a.conc });
  return ev;
}

// ---- session snapshot ----
async function load(code) {
  const pk = P(code);
  const [seats, chars, conns, feed] = await Promise.all([
    query(pk, 'SEAT#'), query(pk, 'CHAR#'), query(pk, 'CONN#'), query(pk, 'FEED#', { desc: true, limit: FEED_KEEP })]);
  return { seats, chars, conns, feed: feed.reverse() };
}
function view(raw, meta, viewer) {
  const online = new Set(raw.conns.map(c => c.seatId));
  return {
    settings: { hpView: meta.hpView },
    expiresAt: meta.expiresAt,
    seats: raw.seats.map(s => ({ seatId: s.seatId, name: s.name, role: s.role, online: online.has(s.seatId) })),
    chars: raw.chars.map(c => viewChar(c, viewer, meta)),
    feed: raw.feed.map(f => viewFeed(f, viewer, meta)),
  };
}
async function attach(ev, connId, code, seat, exp) {
  const t = now(), ttl = exp + 3600;
  await Promise.all([
    put({ pk: P(code), sk: 'CONN#' + connId, connId, seatId: seat.seatId, role: seat.role, at: t, ttl }),
    put({ pk: 'C#' + connId, sk: 'C', code, seatId: seat.seatId, role: seat.role, at: t, ttl }),
  ]);
  const conns = await query(P(code), 'CONN#');
  const info = { seatId: seat.seatId, name: seat.name, role: seat.role, online: true };
  await broadcast(ev, code, c => c.connId === connId ? null : { t: 'seat', seat: info }, conns);
}

// ---- routes ----
const joinTries = new Map(); // best effort per warm container; stage throttling is the hard limit
function tooManyJoins(connId) {
  const t = now(), e = joinTries.get(connId) || { at: t, n: 0 };
  if (t - e.at >= 60) { e.at = t; e.n = 0; }
  e.n++; joinTries.set(connId, e);
  if (joinTries.size > 5000) joinTries.clear();
  return e.n > JOIN_MAX;
}

async function host(ev, connId, msg) {
  if (await get('C#' + connId, 'C')) return send(ev, connId, err('already_joined', 'host'));
  if (!samePass(msg.passphrase)) return send(ev, connId, err('bad_passphrase', 'host'));
  const t = now(), exp = t + HOURS * 3600, hostToken = rnd(32);
  let code = null;
  for (let i = 0; i < 5 && !code; i++) {
    const c = newCode();
    try {
      await put({ pk: P(c), sk: 'META', hostHash: sha(hostToken).toString('base64url'), hpView: 'exact', createdAt: t, expiresAt: exp, ttl: exp + 3600 }, 'attribute_not_exists(pk)');
      code = c;
    } catch (e) { if (e.name !== 'ConditionalCheckFailedException') throw e; }
  }
  if (!code) return send(ev, connId, err('server', 'host'));
  const seat = { pk: P(code), sk: 'SEAT#dm', seatId: 'dm', role: 'dm', name: cleanName(msg.name) || 'DM', ttl: exp + 3600 };
  await put(seat);
  await attach(ev, connId, code, seat, exp);
  const meta = { hpView: 'exact', expiresAt: exp };
  return send(ev, connId, { t: 'welcome', code, role: 'dm', seatId: 'dm', hostToken, snapshot: view(await load(code), meta, seat) });
}

async function join(ev, connId, msg) {
  if (await get('C#' + connId, 'C')) return send(ev, connId, err('already_joined', 'join'));
  const code = typeof msg.code === 'string' && msg.code.length <= 20 ? msg.code.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  if (code.length !== 6) return send(ev, connId, err('bad_code', 'join'));
  const meta = await get(P(code), 'META');
  if (!meta) return send(ev, connId, err('bad_code', 'join'));
  if (meta.expiresAt <= now()) return send(ev, connId, err('expired', 'join'));
  const ttl = meta.expiresAt + 3600;
  let seat, seatToken;
  if (msg.hostToken) {
    if (!sameHash(msg.hostToken, meta.hostHash)) return send(ev, connId, err('bad_token', 'join'));
    seat = await get(P(code), 'SEAT#dm');
  } else if (msg.seatId || msg.seatToken) {
    seat = okId(msg.seatId) && msg.seatId !== 'dm' ? await get(P(code), 'SEAT#' + msg.seatId) : null;
    if (!seat || !sameHash(msg.seatToken, seat.tokHash)) return send(ev, connId, err('bad_token', 'join'));
  } else {
    const seats = await query(P(code), 'SEAT#');
    if (seats.length >= MAX_SEATS) return send(ev, connId, err('full', 'join'));
    seatToken = rnd(24);
    seat = { pk: P(code), sk: '', seatId: rnd(6), role: 'player', name: cleanName(msg.name) || 'Player', ttl };
    seat.sk = 'SEAT#' + seat.seatId;
    seat.tokHash = sha(seatToken).toString('base64url');
    await put(seat, 'attribute_not_exists(pk)');
  }
  await attach(ev, connId, code, seat, meta.expiresAt);
  return send(ev, connId, { t: 'welcome', code, role: seat.role, seatId: seat.seatId, seatToken, snapshot: view(await load(code), meta, seat) });
}

async function charUpdate(ev, connId, conn, meta, msg) {
  if (conn.role !== 'player') return send(ev, connId, err('not_owner', 'char'));
  const d = cleanChar(msg.data);
  if (!d) return send(ev, connId, err('bad_char', 'char'));
  const rev = msg.rev;
  if (!isInt(rev, 1, 1e12)) return send(ev, connId, err('bad_msg', 'char'));
  const pk = P(conn.code), t = now(), ttl = meta.expiresAt + 3600;
  const old = await get(pk, 'CHAR#' + conn.seatId);
  if (old && old.rev >= rev) return send(ev, connId, { t: 'stale', rev: old.rev });
  const item = { pk, sk: 'CHAR#' + conn.seatId, seatId: conn.seatId, rev, data: d, at: t, ttl };
  try { await put(item, 'attribute_not_exists(pk) OR rev < :r', { ':r': rev }); }
  catch (e) {
    if (e.name !== 'ConditionalCheckFailedException') throw e;
    const cur = await get(pk, 'CHAR#' + conn.seatId);
    return send(ev, connId, { t: 'stale', rev: cur ? cur.rev : rev });
  }
  const evs = diff(old && old.data, d);
  let feed = null;
  if (evs.length) {
    feed = { pk, sk: 'FEED#' + String(Date.now()).padStart(13, '0') + '#' + rnd(3), at: t, seatId: conn.seatId, name: cleanName(d.name) || 'Someone', ev: evs, ttl };
    await put(feed);
  }
  await broadcast(ev, conn.code, c => c.connId === connId
    ? { t: 'ack', rev, feed: feed ? viewFeed(feed, c, meta) : undefined }
    : { t: 'char', char: viewChar(item, c, meta), feed: feed ? viewFeed(feed, c, meta) : undefined });
}

async function settings(ev, connId, conn, meta, msg) {
  if (conn.role !== 'dm') return send(ev, connId, err('not_dm', 'settings'));
  const hv = msg.hpView === 'bar' || msg.hpView === 'exact' ? msg.hpView : null;
  if (!hv) return send(ev, connId, err('bad_msg', 'settings'));
  await ddb.send(new UpdateCommand({ TableName: TABLE, Key: { pk: P(conn.code), sk: 'META' }, UpdateExpression: 'SET hpView = :h', ExpressionAttributeValues: { ':h': hv } }));
  meta.hpView = hv;
  const raw = await load(conn.code);
  await broadcast(ev, conn.code, c => ({ t: 'snapshot', snapshot: view(raw, meta, c) }), raw.conns);
}

async function onDisconnect(ev, connId) {
  joinTries.delete(connId);
  const conn = await get('C#' + connId, 'C');
  if (!conn) return;
  await dropConn(conn.code, connId);
  const conns = await query(P(conn.code), 'CONN#');
  if (!conns.some(c => c.seatId === conn.seatId))
    await broadcast(ev, conn.code, () => ({ t: 'seat', seat: { seatId: conn.seatId, online: false } }), conns);
}

exports.handler = async (ev) => {
  const rc = ev.requestContext || {}, connId = rc.connectionId, route = rc.routeKey;
  try {
    if (route === '$connect') {
      const h = ev.headers || {}, origin = h.Origin || h.origin || '';
      if (ORIGINS.length && !ORIGINS.includes('*') && !ORIGINS.includes(origin)) return { statusCode: 403 };
      return OK;
    }
    if (route === '$disconnect') { await onDisconnect(ev, connId); return OK; }
    const body = ev.body || '';
    if (body.length > BODY_MAX) { await send(ev, connId, err('too_big')); return OK; }
    let msg;
    try { msg = JSON.parse(body); } catch (e) { msg = null; }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') { await send(ev, connId, err('bad_msg')); return OK; }
    if (msg.t === 'ping') { await send(ev, connId, { t: 'pong' }); return OK; }
    if (msg.t === 'host' || msg.t === 'join') {
      if (tooManyJoins(connId)) { await send(ev, connId, err('rate', msg.t)); return OK; }
      await (msg.t === 'host' ? host(ev, connId, msg) : join(ev, connId, msg));
      return OK;
    }
    const conn = await get('C#' + connId, 'C');
    if (!conn) { await send(ev, connId, err('not_joined', msg.t)); return OK; }
    const w = Math.floor(now() / RATE_WIN), cnt = conn.win === w ? (conn.cnt || 0) + 1 : 1;
    if (cnt > RATE_MAX + 1) return OK; // already told them; no more writes
    if (cnt === RATE_MAX + 1) await send(ev, connId, err('rate', msg.t));
    await ddb.send(new UpdateCommand({ TableName: TABLE, Key: { pk: 'C#' + connId, sk: 'C' }, UpdateExpression: 'SET win = :w, cnt = :c', ConditionExpression: 'attribute_exists(pk)', ExpressionAttributeValues: { ':w': w, ':c': cnt } })).catch(() => {});
    if (cnt > RATE_MAX) return OK;
    const meta = await get(P(conn.code), 'META');
    if (!meta || meta.expiresAt <= now()) { await send(ev, connId, err('expired', msg.t)); return OK; }
    if (msg.t === 'char') await charUpdate(ev, connId, conn, meta, msg);
    else if (msg.t === 'settings') await settings(ev, connId, conn, meta, msg);
    else await send(ev, connId, err('unknown', msg.t));
  } catch (e) {
    console.error('handler error', e && e.name, e && e.message);
    try { await send(ev, connId, err('server')); } catch (e2) { /* ignore */ }
  }
  return OK;
};
// Exposed for tests only.
exports._t = { diff, cleanChar, viewChar, viewFeed, newCode };
