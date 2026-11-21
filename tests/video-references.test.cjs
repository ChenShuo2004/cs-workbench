const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { readCatalog, referenceMedia, sourceURL } = require('../lib/video-references.cjs');
function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-refs-'));
  const root = path.join(temp, 'library'); fs.mkdirSync(root);
  const row = {id:'01',style:'白板',title:'测试案例',prompt:'适配提示词',source_prompt:'原片提示词',reference_clip:'clip.mp4',image:'image.jpg',evidence:'missing.jpg',post_url:'https://www.douyin.com/video/123'};
  fs.writeFileSync(path.join(root,'clip.mp4'),'fixture'); fs.writeFileSync(path.join(root,'image.jpg'),'fixture');
  const save = rows => fs.writeFileSync(path.join(root,'cases.json'),JSON.stringify(rows)); save([row]);
  t.after(() => fs.rmSync(temp,{recursive:true,force:true}));
  return {temp,root,row,save};
}
test('catalog retains separate prompts and reports missing optional evidence', t => {
  const {root}=fixture(t), result=readCatalog(root);
  assert.equal(result.connected,true); assert.equal(result.cases[0].sourcePrompt,'原片提示词');
  assert.equal(result.cases[0].prompt,'适配提示词'); assert.deepEqual(result.cases[0].available,{video:true,image:true,evidence:false});
  assert.equal(referenceMedia(root,'01','video'),fs.realpathSync(path.join(root,'clip.mp4')));
  assert.throws(()=>referenceMedia(root,'02','video'),/找不到/);
  assert.throws(()=>referenceMedia(root,'01','other'),/未知/);
});
test('missing library is connectable; invalid and duplicate indexes fail clearly',t=>{
  const {root,row,save}=fixture(t);
  assert.equal(readCatalog(path.join(root,'gone')).connected,false);
  save([row,row]); assert.throws(()=>readCatalog(root),/重复/);
  save([{...row,prompt:null}]); assert.throws(()=>readCatalog(root),/prompt/);
  fs.writeFileSync(path.join(root,'cases.json'),'{'); assert.throws(()=>readCatalog(root),/格式/);
});
test('media traversal and symlinks cannot expose files outside the selected library',t=>{
  const {temp,root,row,save}=fixture(t);
  const outside=path.join(temp,'outside.mp4');fs.writeFileSync(outside,'private');
  save([{...row,reference_clip:'../outside.mp4'}]);
  assert.equal(readCatalog(root).cases[0].available.video,false);
  assert.throws(()=>referenceMedia(root,'01','video'),/超出/);
  fs.symlinkSync(outside,path.join(root,'linked.mp4'));save([{...row,reference_clip:'linked.mp4'}]);
  assert.throws(()=>referenceMedia(root,'01','video'),/超出/);
  save([{...row,reference_clip:outside}]);assert.throws(()=>referenceMedia(root,'01','video'),/相对路径/);
});
test('media cannot serve arbitrary documents and source cannot launch non-HTTPS URLs',t=>{
  const {root,row,save}=fixture(t);fs.writeFileSync(path.join(root,'notes.txt'),'private');
  save([{...row,reference_clip:'notes.txt'}]);assert.throws(()=>referenceMedia(root,'01','video'),/格式/);
  for(const post_url of ['file:///etc/passwd','javascript:alert(1)','https://name:pass@example.com']) {
    save([{...row,post_url}]);assert.throws(()=>sourceURL(root,'01'));
  }
  save([row]);assert.equal(sourceURL(root,'01'),row.post_url);
});
