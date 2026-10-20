const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {createAccountStore}=require('../lib/douyin-accounts.cjs');
const {browserProfile,launchArguments,createAccountBrowser}=require('../lib/account-browser.cjs');
function fixture(t){ const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs-browser-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,store:createAccountStore(root)}; }
test('each account and platform uses a stable dedicated Chrome profile without importing default browser data',t=>{
 const {root,store}=fixture(t),a=store.add('相同名字','channels'),b=store.add('相同名字','channels');
 assert.notEqual(browserProfile(root,a),browserProfile(root,b));
 store.rename(a.id,'新备注');
 assert.equal(browserProfile(root,a),browserProfile(root,createAccountStore(root).get(a.id)));
 const args=launchArguments(root,a);
 assert.ok(args.includes('--app=https://channels.weixin.qq.com/'));
 assert.ok(args.includes(`--user-data-dir=${browserProfile(root,a)}`));
 assert.equal(args.some(x=>/remote-debugging|disable-web-security|no-sandbox|enable-automation/.test(x)),false);
 assert.throws(()=>browserProfile(root,{id:'../Default',platform:'channels'}));
});
test('missing Chrome and process launch failures are reported without deleting existing data',async t=>{
 const {root,store}=fixture(t),a=store.add('主号','channels');
 await assert.rejects(createAccountBrowser(root,{findChrome(){throw Error('未找到 Chrome')}}).open(a),/未找到/);
 const mgr=createAccountBrowser(root,{findChrome:()=>'/missing/chrome'});
 await assert.rejects(mgr.open(a),/启动失败/);
 assert.equal(store.get(a.id).name,'主号');
});
test('concurrent opens are deduplicated and shell interpolation is never used',async t=>{
 const {root,store}=fixture(t),a=store.add('主号','channels');let count=0;
 const mgr=createAccountBrowser(root,{findChrome:()=>'/fake/Chrome',spawnBrowser(_exe,args,options){
  count++;assert.equal(options.shell,false);assert.ok(args.includes(`--user-data-dir=${browserProfile(root,a)}`));
  const child=new EventEmitter();child.unref=()=>{};
  process.nextTick(()=>{child.emit('spawn');child.emit('exit',0)});return child;
 }});
 await Promise.all([mgr.open(a),mgr.open(a)]);assert.equal(count,1);
});
test('removal only clears the selected profile and fails closed for a foreign live lock',async t=>{
 const {root,store}=fixture(t),a=store.add('a','channels'),b=store.add('b','douyin');
 for(const account of [a,b]) {fs.mkdirSync(browserProfile(root,account),{recursive:true});fs.writeFileSync(path.join(browserProfile(root,account),'sentinel'),'keep');}
 const mgr=createAccountBrowser(root);
 fs.symlinkSync(`host-${process.pid}`,path.join(browserProfile(root,a),'SingletonLock'));
 await assert.rejects(mgr.remove(a),/正在使用/);
 assert.ok(fs.existsSync(path.join(browserProfile(root,a),'sentinel')));
 fs.unlinkSync(path.join(browserProfile(root,a),'SingletonLock'));
 await mgr.remove(a);
 assert.equal(fs.existsSync(browserProfile(root,a)),false);
 assert.ok(fs.existsSync(path.join(browserProfile(root,b),'sentinel')));
});
