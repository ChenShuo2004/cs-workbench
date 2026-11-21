const test=require('node:test'),assert=require('node:assert/strict');
test('full recording voice routing follows source cuts and preserves other media',async()=>{
 const {routeSourceVoice}=await import('../shared/voice-routing.mjs');
 const state={media:[{id:'voice',hasAudio:true,duration:20}],clips:[{id:'a',mediaId:'source',start:1,end:3,enabled:true},{id:'b',mediaId:'source',start:6,end:9,voiceId:'voice',voiceStart:6.2,enabled:true},{id:'c',mediaId:'other',start:0,end:4}]};
 const result=routeSourceVoice(state,'b');assert.equal(result.count,2);assert.equal(result.clips[0].voiceStart,1.2);assert.equal(result.clips[1].voiceStart,6.2);assert.deepEqual(result.clips[2],state.clips[2]);assert.equal(state.clips[0].voiceId,undefined);
 const tooShort={...state,media:[{id:'voice',hasAudio:true,duration:8}]};assert.throws(()=>routeSourceVoice(tooShort,'b'),/无法覆盖/);assert.equal(state.clips[0].voiceId,undefined);
 const reset=routeSourceVoice({...state,clips:result.clips.map(c=>c.id==='b'?{...c,voiceId:undefined}:c)},'b');assert.equal(reset.clips[0].voiceId,undefined);assert.equal(reset.clips[1].voiceId,undefined);
});
