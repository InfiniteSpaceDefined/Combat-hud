// Handler tests: dynalite stands in for DynamoDB, a local HTTP server stands in for the
// API Gateway @connections endpoint. Run: NODE_PATH=<node_modules> node test/ws.test.js
const http = require('http'), path = require('path'), assert = require('assert');
const dynalite = require('dynalite');

const DDB_PORT = 48001, WS_PORT = 48002;
Object.assign(process.env, {
  AWS_REGION: 'eu-west-2', AWS_ACCESS_KEY_ID: 'x', AWS_SECRET_ACCESS_KEY: 'x',
  TABLE: 'hud', DDB_ENDPOINT: 'http://127.0.0.1:' + DDB_PORT, WS_ENDPOINT: 'http://127.0.0.1:' + WS_PORT,
  ALLOWED_ORIGINS: 'https://infinitespacedefined.github.io', SESSION_HOURS: '24', HOST_PASSPHRASE: 'correct horse battery',
});

const inbox = {}, gone = new Set();
const ws = http.createServer((req, res) => {
  const id = decodeURIComponent(req.url.split('/@connections/')[1] || '');
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    if (gone.has(id)) { res.writeHead(410, { 'x-amzn-errortype': 'GoneException' }); return res.end('{"message":"Gone"}'); }
    (inbox[id] = inbox[id] || []).push(JSON.parse(b)); res.writeHead(200); res.end();
  });
});

let H, pass = 0, fail = 0;
const ctx = (id, route) => ({ connectionId: id, routeKey: route, domainName: 'x', stage: 'live' });
const connect = (id, origin) => H.handler({ requestContext: ctx(id, '$connect'), headers: { Origin: origin || 'https://infinitespacedefined.github.io' } });
const disconnect = id => H.handler({ requestContext: ctx(id, '$disconnect') });
const call = (id, msg) => H.handler({ requestContext: ctx(id, '$default'), body: typeof msg === 'string' ? msg : JSON.stringify(msg) });
const take = id => { const m = inbox[id] || []; inbox[id] = []; return m; };
const last = id => { const m = take(id); return m[m.length - 1]; };
async function test(name, fn) {
  try { await fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}
const char = (o) => Object.assign({ name: 'Kenneth', cls: 'Paladin', level: 5, hp: 44, hpMax: 44, temp: 0, ac: 18,
  slots: { 1: { max: 4, used: 0 }, 2: { max: 2, used: 0 } }, conditions: [], conc: null, death: { s: 0, f: 0 }, spells: ['Bless', 'Shield of Faith'] }, o);

(async () => {
  const db = dynalite({ createTableMs: 0, deleteTableMs: 0 });
  await new Promise(r => db.listen(DDB_PORT, r));
  await new Promise(r => ws.listen(WS_PORT, r));
  const { DynamoDBClient, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
  await new DynamoDBClient({ endpoint: process.env.DDB_ENDPOINT }).send(new CreateTableCommand({
    TableName: 'hud', BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'sk', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }] }));
  H = require(path.join(__dirname, '..', 'handler.js'));
  const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ endpoint: process.env.DDB_ENDPOINT }));
  const getItem = (pk, sk) => doc.send(new GetCommand({ TableName: 'hud', Key: { pk, sk } })).then(r => r.Item);

  let code, hostToken, A = {}, B = {};

  await test('connect: allowed origin 200, other origin 403', async () => {
    assert.equal((await connect('dm1')).statusCode, 200);
    assert.equal((await connect('evil', 'https://evil.example')).statusCode, 403);
  });
  await test('host: missing or wrong passphrase refused', async () => {
    await call('dm1', { t: 'host', name: 'Adam' }); assert.equal(last('dm1').code, 'bad_passphrase');
    await call('dm1', { t: 'host', name: 'Adam', passphrase: 'correct horse batter' }); assert.equal(last('dm1').code, 'bad_passphrase');
    assert.equal(await getItem('C#dm1', 'C'), undefined);
  });
  await test('host: welcome with 6-char code and host token', async () => {
    await call('dm1', { t: 'host', name: 'Adam', passphrase: 'correct horse battery' });
    const w = last('dm1');
    assert.equal(w.t, 'welcome'); assert.equal(w.role, 'dm');
    assert.match(w.code, /^[A-HJ-NP-Z2-9]{6}$/); assert.ok(w.hostToken.length > 30);
    assert.equal(w.snapshot.settings.hpView, 'exact');
    code = w.code; hostToken = w.hostToken;
  });
  await test('host twice on one connection is refused', async () => {
    await call('dm1', { t: 'host', passphrase: 'correct horse battery' }); assert.equal(last('dm1').code, 'already_joined');
  });
  await test('join: bad code', async () => {
    await call('pA0', { t: 'join', code: 'ZZZZZZ' }); assert.equal(last('pA0').code, 'bad_code');
  });
  await test('join: new seat (code typed lower case with dash), DM told seat online', async () => {
    await call('pA1', { t: 'join', code: code.slice(0, 3).toLowerCase() + '-' + code.slice(3), name: 'Adam P' });
    const w = last('pA1');
    assert.equal(w.t, 'welcome'); assert.equal(w.role, 'player'); assert.ok(w.seatToken);
    A = { seatId: w.seatId, seatToken: w.seatToken };
    const s = last('dm1'); assert.equal(s.t, 'seat'); assert.equal(s.seat.seatId, A.seatId); assert.equal(s.seat.online, true);
  });
  await test('char rev 1: ack to sender, exact char to DM, no feed on first sync', async () => {
    await call('pA1', { t: 'char', rev: 1, data: char() });
    const a = last('pA1'); assert.equal(a.t, 'ack'); assert.equal(a.rev, 1); assert.equal(a.feed, undefined);
    const c = last('dm1'); assert.equal(c.t, 'char'); assert.equal(c.char.data.hp, 44); assert.equal(c.feed, undefined);
  });
  await test('second player joins and the snapshot has the first character', async () => {
    await call('pB1', { t: 'join', code, name: 'Sam' });
    const w = last('pB1'); B = { seatId: w.seatId, seatToken: w.seatToken };
    assert.equal(w.snapshot.chars.length, 1); assert.equal(w.snapshot.chars[0].data.hp, 44);
    assert.equal(w.snapshot.seats.length, 3); assert.ok(w.snapshot.seats.every(s => s.online));
    take('dm1'); take('pA1');
  });
  await test('damage + slot + condition + concentration become feed events', async () => {
    await call('pA1', { t: 'char', rev: 2, data: char({ hp: 37, slots: { 1: { max: 4, used: 1 }, 2: { max: 2, used: 0 } }, conditions: ['Prone'], conc: 'Bless' }) });
    const b = last('pB1'); assert.equal(b.char.data.hp, 37);
    const ks = b.feed.ev.map(e => e.k).join(',');
    assert.equal(ks, 'dmg,slot,cond+,conc'); assert.equal(b.feed.ev[0].v, 7); assert.equal(b.feed.name, 'Kenneth');
    assert.ok(last('pA1').feed);
  });
  await test('temp HP absorbs damage: counts as damage, HP unchanged', async () => {
    await call('pA1', { t: 'char', rev: 3, data: char({ hp: 37, temp: 5, conditions: ['Prone'], conc: 'Bless', slots: { 1: { max: 4, used: 1 }, 2: { max: 2, used: 0 } } }) });
    assert.deepEqual(last('pB1').feed.ev, [{ k: 'temp', v: 5 }]);
    await call('pA1', { t: 'char', rev: 4, data: char({ hp: 37, temp: 2, conditions: ['Prone'], conc: 'Bless', slots: { 1: { max: 4, used: 1 }, 2: { max: 2, used: 0 } } }) });
    assert.deepEqual(last('pB1').feed.ev, [{ k: 'dmg', v: 3 }]);
    take('dm1'); take('pA1');
  });
  await test('stale rev is refused with the server rev', async () => {
    await call('pA1', { t: 'char', rev: 4, data: char() });
    assert.deepEqual(last('pA1'), { t: 'stale', rev: 4 }); assert.equal(take('pB1').length, 0);
  });
  await test('bad play data is refused (unknown key, too big, text HP)', async () => {
    await call('pA1', { t: 'char', rev: 9, data: char({ pdf: 'x' }) }); assert.equal(last('pA1').code, 'bad_char');
    await call('pA1', { t: 'char', rev: 9, data: char({ spells: Array(400).fill('Fireball') }) }); assert.equal(last('pA1').code, 'bad_char');
    await call('pA1', { t: 'char', rev: 9, data: char({ hp: '44' }) }); assert.equal(last('pA1').code, 'bad_char');
  });
  await test('strict schema: ranges, lengths, slot shape, markup and odd keys refused', async () => {
    const bad = [char({ hp: 1e300 }), char({ hp: 4.5 }), char({ level: 99 }), char({ name: 'x'.repeat(61) }),
      char({ name: '<img src=x onerror=alert(1)>' }), char({ conditions: ['Prone\u0007'] }), char({ conditions: Array(31).fill('Prone') }),
      char({ slots: { 10: { max: 1, used: 0 } } }), char({ slots: { 1: { max: 1, used: 0, evil: 1 } } }), char({ slots: { 1: { max: 99, used: 0 } } }),
      char({ slots: { 1: 'four' } }), char({ death: { s: 5, f: 0 } }), char({ inspiration: 'yes' }), char({ conc: 7 })];
    for (const d of bad) { await call('pA1', { t: 'char', rev: 9, data: d }); assert.equal(last('pA1').code, 'bad_char', JSON.stringify(d).slice(0, 80)); }
    const proto = '{"t":"char","rev":9,"data":{"name":"K","__proto__":{"x":1}}}';
    await call('pA1', proto); assert.equal(last('pA1').code, 'bad_char');
    await call('pA1', { t: 'char', rev: 1e13, data: char() }); assert.equal(last('pA1').code, 'bad_msg');
    assert.equal(take('pB1').length, 0);
  });
  await test('oversized ids and tokens refused cleanly (no server error)', async () => {
    await call('z1', { t: 'join', code, seatId: 'x'.repeat(5000), seatToken: 'y' }); assert.equal(last('z1').code, 'bad_token');
    await call('z2', { t: 'join', code, hostToken: 'h'.repeat(5000) }); assert.equal(last('z2').code, 'bad_token');
    await call('z3', { t: 'join', code: 'A'.repeat(5000) }); assert.equal(last('z3').code, 'bad_code');
    await call('z4', { t: 'join', code: 12345 }); assert.equal(last('z4').code, 'bad_code');
  });
  await test('only the DM changes settings; the DM has no character', async () => {
    await call('pB1', { t: 'settings', hpView: 'bar' }); assert.equal(last('pB1').code, 'not_dm');
    await call('dm1', { t: 'char', rev: 1, data: char() }); assert.equal(last('dm1').code, 'not_owner');
  });
  await test('HP bar mode: others get hpPct only, DM and owner keep exact', async () => {
    await call('dm1', { t: 'settings', hpView: 'bar' });
    const sb = last('pB1').snapshot, sd = last('dm1').snapshot, sa = last('pA1').snapshot;
    assert.equal(sb.settings.hpView, 'bar');
    const cb = sb.chars[0].data; assert.equal(cb.hp, undefined); assert.equal(cb.temp, undefined); assert.equal(cb.hpPct, 84);
    assert.equal(sd.chars[0].data.hp, 37); assert.equal(sa.chars[0].data.hp, 37);
    const fb = sb.feed.find(f => f.ev[0].k === 'dmg'); assert.equal(fb.ev[0].v, undefined);
    const fd = sd.feed.find(f => f.ev[0].k === 'dmg'); assert.equal(fd.ev[0].v, 7);
  });
  await test('HP bar mode: live damage hides the number from other players only', async () => {
    await call('pA1', { t: 'char', rev: 5, data: char({ hp: 0, temp: 0, conditions: ['Prone'], conc: 'Bless', slots: { 1: { max: 4, used: 1 }, 2: { max: 2, used: 0 } } }) });
    const b = last('pB1'), d = last('dm1'), a = last('pA1');
    assert.deepEqual(b.feed.ev, [{ k: 'dmg' }, { k: 'down' }]); assert.equal(b.char.data.hpPct, 0);
    assert.deepEqual(d.feed.ev, [{ k: 'dmg', v: 39 }, { k: 'down' }]);
    assert.equal(a.feed.ev[0].v, 39);
  });
  await test('disconnect: others see the seat go offline', async () => {
    await disconnect('pA1');
    assert.deepEqual(last('pB1'), { t: 'seat', seat: { seatId: A.seatId, online: false } });
    assert.equal(last('dm1').seat.online, false);
    assert.equal(await getItem('C#pA1', 'C'), undefined);
  });
  await test('reconnect: wrong token refused, right token gets own char back with rev', async () => {
    await call('pA2', { t: 'join', code, seatId: A.seatId, seatToken: 'nope' }); assert.equal(last('pA2').code, 'bad_token');
    await call('pA3', { t: 'join', code, seatId: A.seatId, seatToken: A.seatToken });
    const w = last('pA3'); assert.equal(w.seatId, A.seatId); assert.equal(w.seatToken, undefined);
    const mine = w.snapshot.chars.find(c => c.seatId === A.seatId); assert.equal(mine.rev, 5); assert.equal(mine.data.hp, 0);
    assert.equal(last('pB1').seat.online, true);
  });
  await test('reconnect: offline edits pushed with a higher rev are accepted', async () => {
    await call('pA3', { t: 'char', rev: 8, data: char({ hp: 10, conditions: [], conc: null }) });
    assert.equal(last('pA3').t, 'ack');
    assert.deepEqual(last('pB1').feed.ev.map(e => e.k), ['heal', 'up', 'slot', 'cond-', 'conc-'].filter(k => k !== 'slot'));
  });
  await test('DM reconnects with host token; DM seat cannot be claimed with a seat token', async () => {
    await call('dm2', { t: 'join', code, hostToken }); const w = last('dm2'); assert.equal(w.role, 'dm'); assert.equal(w.snapshot.chars[0].data.hp, 10);
    await call('x1', { t: 'join', code, seatId: 'dm', seatToken: hostToken }); assert.equal(last('x1').code, 'bad_token');
    await call('x2', { t: 'join', code, hostToken: 'wrong' }); assert.equal(last('x2').code, 'bad_token');
  });
  await test('gone connection (410) is cleaned up on the next broadcast', async () => {
    gone.add('pB1');
    await call('pA3', { t: 'char', rev: 9, data: char({ hp: 12 }) });
    assert.equal(await getItem('S#' + code, 'CONN#pB1'), undefined);
    assert.equal(await getItem('C#pB1', 'C'), undefined);
    gone.delete('pB1');
  });
  await test('char before joining: not_joined; ping: pong; junk: bad_msg; huge: too_big', async () => {
    await call('n1', { t: 'char', rev: 1, data: char() }); assert.equal(last('n1').code, 'not_joined');
    await call('n1', { t: 'ping' }); assert.deepEqual(last('n1'), { t: 'pong' });
    await call('n1', '{nope'); assert.equal(last('n1').code, 'bad_msg');
    await call('n1', 'x'.repeat(20000)); assert.equal(last('n1').code, 'too_big');
  });
  await test('too many join attempts on one connection: rate', async () => {
    for (let i = 0; i < 5; i++) await call('j1', { t: 'join', code: 'ZZZZZZ' });
    take('j1'); await call('j1', { t: 'join', code }); assert.equal(last('j1').code, 'rate');
  });
  await test('passphrase guessing on one connection: rate after 5 tries', async () => {
    for (let i = 0; i < 5; i++) await call('h9', { t: 'host', passphrase: 'guess' + i });
    assert.equal(take('h9').filter(m => m.code === 'bad_passphrase').length, 5);
    await call('h9', { t: 'host', passphrase: 'correct horse battery' }); assert.equal(last('h9').code, 'rate');
  });
  await test('rate limit: one rate error, then silence', async () => {
    take('pA3');
    for (let i = 0; i < 35; i++) await call('pA3', { t: 'settings', hpView: 'bar' });
    const m = take('pA3'), r = m.filter(x => x.code === 'rate').length;
    assert.ok(r >= 1 && r <= 2, 'rate errors ' + r); assert.ok(m.length <= 32, 'replies ' + m.length);
    assert.equal(m.filter(x => x.code === 'not_dm').length, m.length - r);
  });
  await test('seat cap: 5 seats (DM + 4) then full', async () => {
    for (let i = 0; i < 2; i++) await call('s' + i, { t: 'join', code, name: 'P' + i });
    assert.equal(last('s1').t, 'welcome');
    await call('s6', { t: 'join', code }); assert.equal(last('s6').code, 'full');
  });
  await test('encounter: only the DM adds enemies; players get names only and hidden ones not at all', async () => {
    await call('dmE', { t: 'join', code, hostToken }); assert.equal(last('dmE').t, 'welcome');
    await call('pE', { t: 'join', code, seatId: A.seatId, seatToken: A.seatToken }); assert.equal(last('pE').t, 'welcome'); take('dmE'); take('pE');
    await call('pE', { t: 'npc.add', list: [{ name: 'Goblin', hp: 7, init: 12 }] }); assert.equal(last('pE').code, 'not_dm');
    await call('dmE', { t: 'npc.add', list: [{ name: 'Goblin 1', hp: 7, ac: 15, init: 14 }, { name: 'Goblin 2', hp: 7, ac: 15, init: 9 }, { name: 'Ogre (hidden)', hp: 59, ac: 11, init: 20, hidden: true }] });
    const d = last('dmE'); assert.equal(d.t, 'enc');
    assert.equal(Object.keys(d.enc.npcs).length, 3); assert.equal(d.enc.order[0].init, 20);
    const pv = last('pE').enc;
    assert.deepEqual(pv.order.map(o => o.name), ['Goblin 1', 'Goblin 2']);
    assert.ok(pv.order.every(o => !('hp' in o) && !('ac' in o) && !('init' in o)));
    assert.equal(pv.npcs, undefined); assert.ok(!JSON.stringify(pv).includes('Ogre'));
  });
  await test('encounter: players roll their own initiative; DM can set anyone\'s', async () => {
    await call('pE', { t: 'roll', init: 17 }); const pv = last('pE').enc;
    assert.deepEqual(pv.order.map(o => o.ref.startsWith('s:') ? 'me' : o.name), ['me', 'Goblin 1', 'Goblin 2']);
    await call('pE', { t: 'roll', init: 99 }); assert.equal(last('pE').code, 'bad_msg');
    await call('pE', { t: 'init.set', ref: 'n:x', init: 1 }); assert.equal(last('pE').code, 'not_dm');
    await call('dmE', { t: 'init.set', ref: 's:' + A.seatId, init: 8 }); take('pE');
    const dv = last('dmE').enc; assert.equal(dv.order.find(o => o.ref === 's:' + A.seatId).init, 8);
    await call('dmE', { t: 'init.set', ref: 's:nobody', init: 8 }); assert.equal(last('dmE').code, 'bad_msg');
  });
  await test('encounter: turns go in order, wrap to a new round, and a hidden enemy\'s turn is hidden from players', async () => {
    await call('dmE', { t: 'combat', action: 'start' });
    let d = last('dmE').enc, p = last('pE').enc;
    assert.equal(d.active, true); assert.equal(d.round, 1); assert.equal(d.npcs[d.cur.slice(2)].name, 'Ogre (hidden)');
    assert.equal(p.cur, null); assert.equal(p.hiddenTurn, true);
    await call('dmE', { t: 'turn', dir: 'next' }); d = last('dmE').enc; p = last('pE').enc;
    assert.equal(d.npcs[d.cur.slice(2)].name, 'Goblin 1'); assert.equal(p.hiddenTurn, false);
    assert.equal(p.order.find(o => o.ref === p.cur).name, 'Goblin 1');
    for (let i = 0; i < 3; i++) await call('dmE', { t: 'turn', dir: 'next' });
    d = last('dmE').enc; assert.equal(d.round, 2); assert.equal(d.order[0].ref, d.cur);
    await call('dmE', { t: 'turn', dir: 'prev' }); d = last('dmE').enc; assert.equal(d.round, 1); assert.equal(d.order[d.order.length - 1].ref, d.cur);
    take('pE');
  });
  await test('encounter: enemy HP, conditions and reveal; bad values refused; players never see them', async () => {
    let d = last('dmE') || {}; await call('dmE', { t: 'turn', dir: 'next' }); d = last('dmE').enc;
    const g1 = Object.values(d.npcs).find(n => n.name === 'Goblin 1'), og = Object.values(d.npcs).find(n => /Ogre/.test(n.name));
    await call('dmE', { t: 'npc.set', id: g1.id, hp: 2, conds: ['Prone', 'Frightened'] }); d = last('dmE').enc;
    assert.equal(d.npcs[g1.id].hp, 2); assert.deepEqual(d.npcs[g1.id].conds, ['Prone', 'Frightened']);
    const p = last('pE').enc; assert.ok(!JSON.stringify(p).includes('Prone') && !JSON.stringify(p).includes('"hp"'));
    await call('dmE', { t: 'npc.set', id: g1.id, conds: ['<script>'] }); assert.equal(last('dmE').code, 'bad_msg');
    await call('dmE', { t: 'npc.set', id: g1.id, name: '<img>' }); assert.equal(last('dmE').code, 'bad_msg');
    await call('dmE', { t: 'npc.set', id: 'nope', hp: 1 }); assert.equal(last('dmE').code, 'not_found');
    await call('dmE', { t: 'npc.set', id: og.id, hidden: false }); take('dmE');
    assert.ok(last('pE').enc.order.some(o => /Ogre/.test(o.name)));
  });
  await test('encounter: removing the enemy whose turn it is moves the turn on; ending clears everything', async () => {
    await call('dmE', { t: 'npc.add', list: [{ name: 'Rat', hp: 1, init: 50 }] }); let d = last('dmE').enc; take('pE');
    const rat = Object.values(d.npcs).find(n => n.name === 'Rat');
    await call('dmE', { t: 'init.set', ref: 'n:' + rat.id, init: 50 }); take('dmE'); take('pE');
    // force the turn onto the rat, then delete it
    for (let i = 0; i < 10 && last('dmE') !== null; i++) { await call('dmE', { t: 'turn', dir: 'next' }); d = last('dmE').enc; if (d.cur === 'n:' + rat.id) break; }
    assert.equal(d.cur, 'n:' + rat.id);
    await call('dmE', { t: 'npc.del', id: rat.id }); d = last('dmE').enc;
    assert.ok(!d.npcs[rat.id]); assert.ok(d.cur && d.cur !== 'n:' + rat.id);
    await call('dmE', { t: 'combat', action: 'end' }); d = last('dmE').enc;
    assert.equal(d.active, false); assert.equal(d.order.length, 0); assert.equal(Object.keys(d.npcs).length, 0);
    assert.equal(last('pE').enc.order.length, 0);
  });
  await test('encounter: limits (10 per add, 30 total) and the snapshot carries the encounter', async () => {
    await call('dmE', { t: 'npc.add', list: Array(11).fill({ name: 'X', hp: 1, init: 1 }) }); assert.equal(last('dmE').code, 'bad_msg');
    for (let i = 0; i < 3; i++) await call('dmE', { t: 'npc.add', list: Array(10).fill({ name: 'Zombie', hp: 22, init: 3 }) });
    take('dmE');
    await call('dmE', { t: 'npc.add', list: [{ name: 'One too many', hp: 1, init: 1 }] }); assert.equal(last('dmE').code, 'too_many');
    await call('late2', { t: 'join', code, hostToken }); const w = last('late2');
    assert.equal(Object.keys(w.snapshot.enc.npcs).length, 30);
    await call('dmE', { t: 'combat', action: 'end' }); take('dmE');
  });
  await test('expired session: join and messages refused', async () => {
    await doc.send(new UpdateCommand({ TableName: 'hud', Key: { pk: 'S#' + code, sk: 'META' }, UpdateExpression: 'SET expiresAt = :e', ExpressionAttributeValues: { ':e': 1 } }));
    await call('late', { t: 'join', code }); assert.equal(last('late').code, 'expired');
    await call('s0', { t: 'char', rev: 1, data: char() }); assert.equal(last('s0').code, 'expired');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  ws.close(); db.close();
  process.exit(fail ? 1 : 0);
})();
