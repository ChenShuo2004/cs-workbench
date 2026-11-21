// Native Chrome integration; temporary profiles, local fixture server, no real credentials.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {createAccountStore}=require('../lib/douyin-accounts.cjs');
const {createAccountBrowser,browserProfile}=require('../lib/account-browser.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs-native-login-'));
const evidence=path.resolve(__dirname,'../out/browser-login-qa');fs.mkdirSync(evidence,{recursive:true});
const accounts=[],seen=new Map();let server,manager,phase='seed';
const report={checkedAt:new Date().toISOString(),checks:[],realPlatformLoginVerified:false};
async function waitSeen(key){const end=Date.now()+15000;while(!seen.has(key)){if(Date.now()>end)throw Error('No native Chrome response: '+key);await new Promise(r=>setTimeout(r,100));}return seen.get(key);}
(async()=>{
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/observed'){
   seen.set(url.searchParams.get('key'),{cookie:req.headers.cookie||'',local:url.searchParams.get('local')});
   res.end('ok');return;
  }
  const [,step,id]=url.pathname.split('/');
  if(!['seed','restore'].includes(step)){res.end('');return;}
  if(step==='seed')res.setHeader('Set-Cookie',`cs_fixture=${id}; Max-Age=3600; HttpOnly; SameSite=Lax; Path=/`);
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<h1>CS 登录保存自检（临时测试数据）</h1><p>正在检查独立浏览器会话，可以稍后自动关闭。</p><script>${step==='seed'?`localStorage.setItem('fixture',${JSON.stringify(id)});`:''}fetch('/observed?key=${step}-${id}&local='+localStorage.getItem('fixture'));</script>`);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const store=createAccountStore(root);
 accounts.push(store.add('临时A','channels'),store.add('临时B','channels'));
 function create(){return createAccountBrowser(root,{spawnBrowser(exe,args,opts){
  const profileArg=args.find(a=>a.startsWith('--user-data-dir='));
  const account=accounts.find(a=>profileArg===`--user-data-dir=${browserProfile(root,a)}`);
  const index=accounts.indexOf(account);
  const local=`http://127.0.0.1:${server.address().port}/${phase}/${index}`;
  return spawn(exe,args.map(a=>a.startsWith('--app=')?`--app=${local}`:a),opts);
 }});}
 manager=create();
 for(let i=0;i<accounts.length;i++){
  await manager.open(accounts[i]);
  const value=await waitSeen(`seed-${i}`);
  assert.equal(value.cookie,`cs_fixture=${i}`);assert.equal(value.local,String(i));
 }
 report.checks.push('Two actual Chrome processes retain distinct HttpOnly cookies and localStorage for the same origin');
 for(const a of accounts)await manager.close(a);
 // Recreate the launcher too, simulating a workbench restart; profile UUIDs are unchanged.
 phase='restore';manager=create();
 for(let i=0;i<accounts.length;i++){
  await manager.open(accounts[i]);const value=await waitSeen(`restore-${i}`);
  assert.equal(value.cookie,`cs_fixture=${i}`);assert.equal(value.local,String(i));
 }
 report.checks.push('Full Chrome quit and launcher restart restores both accounts without setting a new cookie');
 await manager.remove(accounts[0]);
 assert.equal(fs.existsSync(browserProfile(root,accounts[0])),false);
 assert.ok(fs.existsSync(browserProfile(root,accounts[1])));
 report.checks.push('Confirmed removal closes and deletes only the selected dedicated profile');
 fs.writeFileSync(path.join(evidence,'native-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
 let closed=true;
 if(manager)for(const a of accounts)await manager.close(a).catch(e=>{closed=false;console.error(e);});
 if(server)await new Promise(r=>server.close(r));
 if(closed)fs.rmSync(root,{recursive:true,force:true});
});
