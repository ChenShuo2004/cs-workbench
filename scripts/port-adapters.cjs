const fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.join(require('os').homedir(),'maitian/mdldm-maitian-publisher');
for(const name of ['douyin','xhs','channels','bilibili','youtube','x','instagram','common']){
 let s=fs.readFileSync(path.join(root,'lib/platforms',name+'.js'),'utf8');
 const sf=ts.createSourceFile(name+'.js',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const edits=[];
 function visit(n){
  if(ts.isFunctionDeclaration(n)&&n.name?.text==='schedule') {edits.push([n.pos,n.end,'']);return;}
  if(ts.isPropertyAssignment(n)&&n.name.getText(sf)==='links'){edits.push([n.pos,n.end,'']);return;}
  if(ts.isIfStatement(n)&&n.expression.getText(sf)==='ctx.schedule'){edits.push([n.pos,n.end,'']);return;}
  ts.forEachChild(n,visit);
 } visit(sf);
 for(const [a,b,t] of edits.sort((a,b)=>b[0]-a[0]))s=s.slice(0,a)+t+s.slice(b);
 s=s.replace(/\.\.\/cdp\.js/g,'../cdp.cjs').replace('./common.js','./common.cjs');
 s=s.replace(/告诉麦田/g,'手动检查').replace(/ctx\.schedule \? '[^']*' : '([^']*)'/g,"'$1'");
 const out=ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,removeComments:true}}).outputText;
 fs.writeFileSync('lib/publisher/adapters/'+(name==='xhs'?'xiaohongshu':name)+'.cjs','// Adapted from mdldm-maitian-publisher (Apache-2.0); see NOTICE.\n'+out);
}
fs.copyFileSync(path.join(root,'LICENSE'),'lib/publisher/LICENSE');
