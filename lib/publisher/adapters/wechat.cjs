const {waitFor,setValue,evaluate}=require('../cdp.cjs');
module.exports.default={id:'wechat',url:'https://mp.weixin.qq.com/',ready:`!!document.querySelector('#title') && !!document.querySelector('[contenteditable=true]')`,async fill(ctx){
 await setValue(ctx.tabId,`document.querySelector('#title')`,ctx.p.title);
 const ok=await evaluate(ctx.tabId,`(()=>{const e=document.querySelector('[contenteditable=true]');e.focus();document.execCommand('insertText',false,${JSON.stringify(ctx.p.body)});return e.innerText.includes(${JSON.stringify(ctx.p.body)})})()`);
 if(!ok)ctx.fail('公众号正文回读失败');
}};
