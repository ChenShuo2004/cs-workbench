// Local UI regression harness: synthetic records in an isolated temporary folder.
// Never reads the real user profile or connects to ChatGPT Health.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const repo = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-health-refresh-qa-'));
const port = 4320;
const origin = `http://127.0.0.1:${port}`;
const health = require('../lib/health.cjs').createHealth(root);
const control = path.join(root, 'control.json');
fs.writeFileSync(control, JSON.stringify({ delayMs: 0, error: '' }));
health.save({ metric: 'steps', value: 1001, date: '2026-10-17', source: 'file-import', sourceLabel: '验收样例，非本人数据' });
const methods = {
  bootstrap: () => ({ config: { workspace: path.join(root, 'projects'), library: '', projects: [] }, projects: [], catalog: [], tools: {} }),
  personalRead: () => ({ version: 1, date: '2026-10-20', dataPath: root, tasks: [], notes: [], folders: [], journal: {}, events: [], conversations: [] }),
  personalProviders: () => [],
  healthRead: async () => {
    const settings = JSON.parse(fs.readFileSync(control, 'utf8'));
    const snapshot = health.snapshot();
    await new Promise(resolve => setTimeout(resolve, Math.min(settings.delayMs || 0, 30000)));
    if (settings.error) throw Error(settings.error);
    return snapshot;
  },
};
const bridge = `window.cs=new Proxy({}, {get:(_,key)=>String(key).startsWith('on')?()=>()=>{}:(...args)=>fetch('/qa-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,args})}).then(async r=>{const value=await r.json();if(!r.ok)throw Error(value.error);return value;})});`;
http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/qa-api') {
      if (req.headers.origin !== origin) throw Error('Origin denied');
      let body = '';
      for await (const part of req) { body += part; if (body.length > 10000) throw Error('Too large'); }
      const { key, args } = JSON.parse(body);
      if (!Object.hasOwn(methods, key)) throw Error('Action unavailable in QA');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(await methods[key](...args)));
      return;
    }
    if (req.url === '/qa-bridge.js') {
      res.setHeader('Content-Type', 'text/javascript'); res.end(bridge); return;
    }
    const name = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0].slice(1));
    const file = path.resolve(repo, 'dist', name);
    if (!file.startsWith(path.join(repo, 'dist') + path.sep)) throw Error('Path denied');
    let data = fs.readFileSync(file);
    if (name === 'index.html') data = data.toString().replace('<head>', '<head><script src="/qa-bridge.js"></script>');
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(data);
  } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error.message })); }
}).listen(port, '127.0.0.1', () => console.log(JSON.stringify({ url: origin, root, control })));
