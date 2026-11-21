const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMaitian } = require('../lib/maitian.cjs');
const service = createMaitian({ getConfig: () => ({}) });
const report = { checkedAt: new Date().toISOString(), checks: [], uploaded: false };
(async () => {
  const info = await service.snapshot();
  assert.equal(info.connected, true, info.error);
  const { cfg } = service.installation();
  assert.ok(!JSON.stringify(info).includes(cfg.web.key));
  report.checks.push('Installed service connects and exposes a key-free frame URL');
  for (const route of ['/', '/p', '/api/overview']) {
    const url = new URL(route, info.frameUrl).href;
    const r = await fetch(url, { headers: service.frameHeaders(url), redirect: 'error' });
    assert.equal(r.status, 200, route);
    await r.text();
  }
  report.checks.push('Original dashboard, calendar/archive/system shell, and data API accept main-process authentication');
  assert.equal(service.acceptsURL('https://example.com/'), false);
  assert.equal(service.frameHeaders('https://example.com/').Cookie, undefined);
  report.checks.push('Authentication is restricted to the configured local origin');
})().catch(e => { report.error = e.stack; process.exitCode = 1; }).finally(() => {
  const output = path.resolve(__dirname, '../out/maitian-qa');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'integration.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
