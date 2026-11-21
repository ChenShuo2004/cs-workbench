// Local, read-only UI verification harness; never loads the real application profile.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const refs = require('../lib/video-references.cjs');
const repo = path.resolve(__dirname, '..');
const root = refs.defaultReferenceDirectory();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-references-qa-'));
const health = require('../lib/health.cjs').createHealth(temporary);
const content = require('../lib/content-ops.cjs').createContentOps(temporary);
const origin = 'http://127.0.0.1:4326';
const methods = {
  bootstrap: () => ({ config: { workspace: temporary, library: '', projects: [] }, projects: [], catalog: [], tools: {} }),
  personalRead: () => ({ version: 1, date: '2026-10-18', dataPath: temporary, tasks: [], notes: [], folders: [], journal: {}, events: [], conversations: [] }),
  personalProviders: () => [], healthRead: () => health.snapshot(), contentRead: () => content.read(),
  referencesRead: () => refs.readCatalog(root),
  referencesMedia: (id, kind) => { refs.referenceMedia(root, id, kind); return `/media/${encodeURIComponent(id)}/${encodeURIComponent(kind)}`; },
};
const bridge = `window.cs = new Proxy({}, {get: (_, key) => String(key).startsWith('on') ? () => () => {} : key === 'copy' ? text => navigator.clipboard.writeText(text) : (...args) => fetch('/qa-api', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,args})}).then(async r => {const v=await r.json();if(!r.ok)throw Error(v.error);return v;})});`;
http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/qa-api') {
      if (req.headers.origin !== origin) throw Error('Origin denied');
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 100000) throw Error('Too large'); }
      const { key, args } = JSON.parse(body);
      if (!Object.hasOwn(methods, key)) throw Error('Preview only: action unavailable');
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(await methods[key](...args))); return;
    }
    if (req.url === '/qa-bridge.js') { res.setHeader('Content-Type','text/javascript'); res.end(bridge); return; }
    const media = req.url.match(/^\/media\/([^/]+)\/(video|image|evidence)$/);
    if (media) {
      const file = refs.referenceMedia(root, decodeURIComponent(media[1]), media[2]);
      const size = fs.statSync(file).size;
      res.setHeader('Content-Type', media[2] === 'video' ? 'video/mp4' : 'image/jpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range && range[2] ? Math.min(Number(range[2]), size-1) : size-1;
      if (start > end || start >= size) { res.writeHead(416); res.end(); return; }
      if (range) { res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`); }
      res.setHeader('Content-Length', end-start+1); fs.createReadStream(file,{start,end}).pipe(res); return;
    }
    const name = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0].slice(1));
    const file = path.resolve(repo, 'dist', name);
    if (!file.startsWith(path.join(repo, 'dist') + path.sep)) throw Error('Path denied');
    let data = fs.readFileSync(file);
    if (name === 'index.html') data = data.toString().replace('<head>', '<head><script src="/qa-bridge.js"></script>').replace('media-src data:', "media-src 'self' data:");
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.png') ? 'image/png' : 'text/html'); res.end(data);
  } catch(e) { res.statusCode = 400; res.end(JSON.stringify({error:e.message})); }
}).listen(4326, '127.0.0.1', () => console.log(`Isolated reference preview: ${origin}`));
