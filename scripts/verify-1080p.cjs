// Historical 0.5.1 transcoding regression only; not native-generation evidence.
// Reuses the prior real 2K result through a simulated transport; no API calls or new charges.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {createMetasoVideo}=require('../lib/metaso-video.cjs');
const repo=path.resolve(__dirname,'..'),out=path.join(repo,'out/1080p-qa');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'cs-1080-qa-'));
 const source=path.join(repo,'out/video-generation-qa/metaso-generated.mp4');
 const provider=createMetasoVideo({userData:data,secureStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},fetchImpl:async url=>url.includes('/query/')?new Response(JSON.stringify({task:{status:'success',content:{url:'https://cdn.example.com/reused.mp4'}}})):new Response(fs.readFileSync(source))});
 provider.configure('mk-'+'x'.repeat(32));
 const result=await provider.poll({id:'12345678-1234-1234-1234-123456789abc',remoteId:'reused-fixture',resolution:'1080P',legacy1080Transcode:true});
 const output=path.join(out,'generated-1080p.mp4');fs.copyFileSync(result.path,output);
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8'}));
 const video=probe.streams.find(s=>s.codec_type==='video');assert.equal(video.width,1920);assert.equal(video.height,1080);
 execFileSync('ffmpeg',['-v','error','-i',output,'-f','null','-']);
 const report={source,output,width:video.width,height:video.height,duration:Number(probe.format.duration),hasAudio:probe.streams.some(s=>s.codec_type==='audio'),newPaidRequests:0,transport:'simulated; reused prior real 2K result',fullDecode:true};
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
