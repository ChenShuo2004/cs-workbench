const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const blocked =
  /(?:发布|发表|投稿|分享|\bpost\b|\bpublish\b|\bshare\b|\bsubmit\b|\bschedule\b)/i;
function assertSafe(text) {
  if (blocked.test(String(text).trim()))
    throw new Error("已拦截自动发布，请自行确认并点击平台发布按钮");
}
async function send(tab, method, params = {}) {
  return tab.send(method, params);
}
// 在页面里执行表达式（可以 await），取回 JSON 值
async function evaluate(tabId, expression) {
  expression = `(async()=>{const old=HTMLElement.prototype.click; const dispatch=EventTarget.prototype.dispatchEvent;
 const check=e=>{const b=e?.closest?.('button,[role=button],a')||e; const t=(b?.innerText||b?.getAttribute?.('aria-label')||'').trim(); if (${blocked.toString()}.test(t)) throw new Error('自动发布已拦截');};
 HTMLElement.prototype.click=function(){check(this);return old.call(this)};
 EventTarget.prototype.dispatchEvent=function(e){if(e.type==='click')check(this);return dispatch.call(this,e)};
 try{return await (${expression})}finally{HTMLElement.prototype.click=old;EventTarget.prototype.dispatchEvent=dispatch}
 })()`;
  const r = await send(tabId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails)
    throw new Error(
      r.exceptionDetails.exception?.description || r.exceptionDetails.text,
    );
  return r.result.value;
}

// 轮询直到表达式为真值；超时返回 null
async function waitFor(tabId, expression, timeoutMs = 20000, intervalMs = 500) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const v = await evaluate(tabId, expression);
      if (v) return v;
    } catch {
      /* 页面还在加载 */
    }
    await sleep(intervalMs);
  }
  return null;
}

// expr 必须返回一个 <input type=file> 元素（可以穿透 Shadow DOM）
async function setFiles(tabId, expr, files) {
  const r = await send(tabId, "Runtime.evaluate", { expression: expr });
  if (!r.result || !r.result.objectId) throw new Error("找不到上传框");
  await send(tabId, "DOM.setFileInputFiles", {
    objectId: r.result.objectId,
    files,
  });
}

const insertText = (tabId, text) => send(tabId, "Input.insertText", { text });

const KEYS = { Enter: 13, Escape: 27 };
async function pressKey(tabId, key = "Enter") {
  const base = {
    key,
    code: key,
    windowsVirtualKeyCode: KEYS[key],
    nativeVirtualKeyCode: KEYS[key],
  };
  const text = key === "Enter" ? { text: "\r" } : {};
  await send(tabId, "Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    ...base,
    ...text,
  });
  if (key === "Enter")
    await send(tabId, "Input.dispatchKeyEvent", {
      type: "char",
      ...base,
      text: "\r",
    });
  await send(tabId, "Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

// 多行文字：逐行插入，行间按真实回车（各家富文本编辑器都认）
async function typeLines(tabId, text) {
  const lines = text.split("\n");
  for (const [i, l] of lines.entries()) {
    if (l) await insertText(tabId, l);
    if (i < lines.length - 1) await pressKey(tabId, "Enter");
    await sleep(50);
  }
}

// 元素中心坐标（先滚到可见）；expr 返回元素
async function rectOf(tabId, expr) {
  return evaluate(
    tabId,
    `(()=>{const e=${expr}; if(!e) return null; e.scrollIntoView({block:'center'});
    const r=e.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}})()`,
  );
}
const mouse = (tabId, type, x, y, extra = {}) =>
  send(tabId, "Input.dispatchMouseEvent", {
    type,
    x,
    y,
    button: "left",
    ...extra,
  });
async function hover(tabId, expr) {
  const r = await rectOf(tabId, expr);
  if (!r) throw new Error("找不到要悬停的元素");
  await mouse(tabId, "mouseMoved", r.x, r.y, { button: "none" });
}
async function click(tabId, expr) {
  const text = await evaluate(
    tabId,
    `(()=>{const e=${expr};const b=e?.closest('button,[role=button],a')||e;return (b?.innerText||b?.getAttribute('aria-label')||'').trim()})()`,
  );
  assertSafe(text);
  const r = await rectOf(tabId, expr);
  if (!r) return false;
  await mouse(tabId, "mouseMoved", r.x, r.y, { button: "none" });
  await mouse(tabId, "mousePressed", r.x, r.y, { clickCount: 1 });
  await mouse(tabId, "mouseReleased", r.x, r.y, { clickCount: 1 });
  return true;
}

// 生成「文字完全等于 text 的最后一个可见元素」的表达式；root 默认 document.body
const byText = (
  text,
  root = "document.body",
) => `(()=>{const w=document.createTreeWalker(${root},NodeFilter.SHOW_TEXT);let n;const h=[];
  while((n=w.nextNode())) if(n.nodeValue.trim()===${JSON.stringify(text)}) h.push(n.parentElement);
  return h.filter(e=>e.getClientRects().length).at(-1)||null})()`;
const clickText = (tabId, text, root) => click(tabId, byText(text, root));
// 同上，但取第一个可见元素
const firstByText = (text, root = "document.body") =>
  byText(text, root).replace(".at(-1)", "[0]");

// 原生 setter 赋值（Vue/React 受控输入框）
const setValue = (tabId, expr, value) =>
  evaluate(
    tabId,
    `(()=>{const el=${expr}; if(!el) return null;
  Object.getOwnPropertyDescriptor(el.constructor.prototype,'value').set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return el.value})()`,
  );

// 把光标放到可编辑元素末尾并聚焦
const focusEnd = (tabId, expr) =>
  evaluate(
    tabId,
    `(()=>{const e=${expr}; if(!e) return false; e.focus();
  const s=getSelection(); s.selectAllChildren(e); s.collapseToEnd(); return true})()`,
  );
const focusSelectAll = (tabId, expr) =>
  evaluate(
    tabId,
    `(()=>{const e=${expr}; if(!e) return false; e.focus();
  const s=getSelection(); s.selectAllChildren(e); return true})()`,
  );

// 合成一整套鼠标事件（pointerdown → mousedown → pointerup → mouseup → click），给只认 mousedown 的自定义组件用
const fire = (tabId, expr) =>
  evaluate(
    tabId,
    `(()=>{const e=${expr}; if(!e) return false;
  for (const t of ['pointerdown','mousedown','pointerup','mouseup','click']) e.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window}));
  return true})()`,
  );

module.exports = {
  sleep,
  send,
  evaluate,
  waitFor,
  setFiles,
  insertText,
  pressKey,
  typeLines,
  rectOf,
  hover,
  click,
  byText,
  clickText,
  firstByText,
  setValue,
  focusEnd,
  focusSelectAll,
  fire,
  assertSafe,
};
