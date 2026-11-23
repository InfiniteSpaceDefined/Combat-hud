// Kill switch tests against a fake API Gateway v2 + Lambda control-plane endpoint.
const http = require('http'), path = require('path'), assert = require('assert');
const reqs = [];
const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
  reqs.push({ m: req.method, u: req.url, b: b ? JSON.parse(b) : null });
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(req.url.includes('concurrency') && req.method === 'DELETE' ? '' : '{}'); }); });
Object.assign(process.env, { AWS_REGION: 'eu-west-2', AWS_ACCESS_KEY_ID: 'x', AWS_SECRET_ACCESS_KEY: 'x',
  APIGW_ENDPOINT: 'http://127.0.0.1:48010', LAMBDA_ENDPOINT: 'http://127.0.0.1:48010',
  API_ID: 'abc123', STAGE: 'live', TARGET_FUNCTION: 'combat-hud-sessions-ws', THROTTLE_RATE: '20', THROTTLE_BURST: '40', RESERVED_CONCURRENCY: '10' });
const sns = state => ({ Records: [{ Sns: { Message: JSON.stringify({ AlarmName: 'too-many-messages', NewStateValue: state }) } }] });
let pass = 0, fail = 0;
async function test(n, fn) { reqs.length = 0; try { await fn(); pass++; console.log('  ok  ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message); } }
srv.listen(48010, async () => {
  const K = require(path.join(__dirname, '..', 'killswitch.js'));
  await test('ALARM: throttle to 0 and Lambda concurrency to 0', async () => {
    assert.deepEqual(await K.handler(sns('ALARM')), { stopped: true });
    const st = reqs.find(r => r.u === '/v2/apis/abc123/stages/live'); assert.equal(st.m, 'PATCH');
    assert.deepEqual(st.b.defaultRouteSettings, { throttlingRateLimit: 0, throttlingBurstLimit: 0 });
    const c = reqs.find(r => r.u.includes('/functions/combat-hud-sessions-ws/concurrency')); assert.equal(c.m, 'PUT'); assert.equal(c.b.ReservedConcurrentExecutions, 0);
  });
  await test('OK message and junk: nothing touched', async () => {
    assert.deepEqual(await K.handler(sns('OK')), { stopped: false });
    assert.deepEqual(await K.handler({ Records: [{ Sns: { Message: 'hello' } }] }), { stopped: false });
    assert.equal(reqs.length, 0);
  });
  await test('revive: restores throttle 20/40 and concurrency 10', async () => {
    assert.deepEqual(await K.handler({ action: 'revive' }), { revived: true });
    const st = reqs.find(r => r.u === '/v2/apis/abc123/stages/live');
    assert.deepEqual(st.b.defaultRouteSettings, { throttlingRateLimit: 20, throttlingBurstLimit: 40 });
    assert.equal(reqs.find(r => r.u.includes('concurrency')).b.ReservedConcurrentExecutions, 10);
  });
  await test('stop by hand: same as an alarm (throttle 0, concurrency 0)', async () => {
    process.env.RESERVED_CONCURRENCY = '10';
    assert.deepEqual(await K.handler({ action: 'stop' }), { stopped: true });
    const st = reqs.find(r => r.u === '/v2/apis/abc123/stages/live');
    assert.deepEqual(st.b.defaultRouteSettings, { throttlingRateLimit: 0, throttlingBurstLimit: 0 });
    assert.equal(reqs.find(r => r.u.includes('concurrency')).b.ReservedConcurrentExecutions, 0);
  });
  await test('unknown actions do nothing', async () => {
    assert.deepEqual(await K.handler({ action: 'explode' }), { stopped: false }); assert.equal(reqs.length, 0);
  });
  await test('revive with ReservedConcurrency 0: removes the reservation', async () => {
    process.env.RESERVED_CONCURRENCY = '0';
    await K.handler({ action: 'revive' });
    assert.equal(reqs.find(r => r.u.includes('concurrency')).m, 'DELETE');
  });
  console.log(`\n${pass} passed, ${fail} failed`); srv.close(); process.exit(fail ? 1 : 0);
});
