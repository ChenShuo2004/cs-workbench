const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMaitian } = require('../lib/maitian.cjs');

function fixture(t, fetchImpl) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maitian-frame-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/hub.mjs'), '');
  const cfg = { web: { port: 8787, key: 'private-test-key' } };
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify(cfg));
  return { root, cfg, service: createMaitian({ getConfig: () => ({ maitianRoot: root }), fetchImpl: fetchImpl || (async () => ({ ok: true })) }) };
}
test('frame URL is loopback-only and does not expose the web access key', async t => {
  const f = fixture(t, async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:8787/api/overview');
    assert.equal(init.headers.Cookie, 'mt_key=private-test-key');
    assert.equal(init.redirect, 'error');
    return { ok: true };
  });
  const state = await f.service.snapshot();
  assert.equal(state.connected, true);
  assert.equal(state.frameUrl, 'http://127.0.0.1:8787/');
  assert.ok(!JSON.stringify(state).includes('private-test-key'));
});
test('credentials are never attached to external hosts, spoofed hosts, other ports, or URL userinfo', t => {
  const { service } = fixture(t);
  const headers = { Accept: 'text/html' };
  for (const url of ['https://example.com/', 'http://127.0.0.1.evil.com:8787/', 'http://127.0.0.1:8788/', 'http://user@127.0.0.1:8787/', 'file:///tmp/index.html', 'http://localhost:8787/']) {
    assert.equal(service.acceptsURL(url), false);
    assert.deepEqual(service.frameHeaders(url, headers), headers);
  }
  assert.equal(service.acceptsURL('http://127.0.0.1:8787/p#/calendar'), true);
});
test('stale cookies are replaced case-insensitively while preserving unrelated headers and cookies', t => {
  const { service } = fixture(t);
  const input = { cookie: 'mt_key=old; other=retained', Accept: 'application/json' };
  const result = service.frameHeaders('http://127.0.0.1:8787/api/overview', input);
  assert.equal(result.Cookie, 'other=retained; mt_key=private-test-key');
  assert.equal(result.cookie, undefined);
  assert.equal(result.Accept, input.Accept);
  assert.equal(input.cookie, 'mt_key=old; other=retained');
});
test('configured port changes are read on the next navigation without restarting the app', t => {
  const { service, root, cfg } = fixture(t);
  cfg.web.port = 8799;
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify(cfg));
  assert.equal(service.acceptsURL('http://127.0.0.1:8787/'), false);
  assert.equal(service.acceptsURL('http://127.0.0.1:8799/'), true);
});
test('offline service and rejected authentication produce recoverable errors', async t => {
  const offline = fixture(t, async () => { throw Error('fetch failed'); });
  const result = await offline.service.snapshot();
  assert.equal(result.installed, true);
  assert.equal(result.connected, false);
  assert.match(result.error, /服务已启动/);
  const denied = fixture(t, async () => ({ ok: false, status: 401 }));
  assert.match((await denied.service.snapshot()).error, /401/);
});
test('invalid config cannot inject request headers and is not overwritten', async t => {
  const { root, cfg, service } = fixture(t);
  cfg.web.key = 'bad\r\nInjected: yes';
  const text = JSON.stringify(cfg);
  fs.writeFileSync(path.join(root, 'config.json'), text);
  assert.equal((await service.snapshot()).connected, false);
  assert.equal(service.acceptsURL('http://127.0.0.1:8787/'), false);
  assert.equal(fs.readFileSync(path.join(root, 'config.json'), 'utf8'), text);
});
