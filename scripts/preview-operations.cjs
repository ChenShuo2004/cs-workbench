// Isolated browser layout harness. Does not use the real user profile or expose an Agent.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const repo=path.resolve(__dirname,'..'),wb=require('../lib/workbench.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs-ops-browser-'));
const config={workspace:path.join(root,'projects'),library:'',projects:[]};
const p=wb.createProject(config,{title:'验收样例：从一个真实问题开始',platforms:['X','小红书']});
const health=require('../lib/health.cjs').createHealth(root),content=require('../lib/content-ops.cjs').createContentOps(root);
health.save({metric:'weight',date:'2026-07',value:70,source:'chatgpt-snapshot',sourceLabel:'验收样例，非本人数据'});
health.save({metric:'steps',date:'2026-10-17',value:6000,sourceLabel:'验收样例，非本人数据'});
const methods={bootstrap:()=>({config,projects:wb.listProjects(config),catalog:wb.libraryCatalog(''),tools:{}}),personalRead:()=>({version:1,date:'2026-10-18',dataPath:root,tasks:[],notes:[],folders:[],journal:{},events:[],conversations:[]}),personalProviders:()=>[],healthRead:()=>health.snapshot(),healthSave:x=>health.save(x),contentRead:()=>content.read(),contentSave:x=>content.save(x,wb.listProjects(config)),readProject:x=>wb.readProject(config,x),copy:()=>true};
const bridge=`window.cs=new Proxy({}, {get:(_,key)=>String(key).startsWith('on')?()=>()=>{}:(...args)=>fetch('/qa-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,args})}).then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.error);return v;})});`;
http.createServer(async(req,res)=>{try{
 if(req.method==='POST'&&req.url==='/qa-api'){
  if(req.headers.origin!=='http://127.0.0.1:4318')throw Error('Origin denied');
  let body='';for await(const b of req){body+=b;if(body.length>100000)throw Error('Too large');}
  const {key,args}=JSON.parse(body);if(!Object.hasOwn(methods,key))throw Error('QA harness: action unavailable');
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await methods[key](...args)));return;
 }
 if(req.url==='/qa-bridge.js'){res.setHeader('Content-Type','text/javascript');res.end(bridge);return;}
 const name=req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0].slice(1));
 const f=path.resolve(repo,'dist',name);if(!f.startsWith(path.join(repo,'dist')+path.sep))throw Error('Path denied');
 let data=fs.readFileSync(f);
 if(name==='index.html')data=data.toString().replace('<head>','<head><script src="/qa-bridge.js"></script>');
 res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(data);
}catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}}).listen(4318,'127.0.0.1',()=>console.log('Isolated UI preview: http://127.0.0.1:4318'));
