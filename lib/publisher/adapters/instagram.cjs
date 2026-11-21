// Adapted from mdldm-maitian-publisher (Apache-2.0); see NOTICE.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdp_cjs_1 = require("../cdp.cjs");
const L = (...t) => t;
const DLG = `[...document.querySelectorAll('[role=dialog]')]`;
const dlgText = `${DLG}.map(d=>d.innerText).join('\\n')`;
const anyText = (texts, xmax = 1e5) => `(()=>{const want=${JSON.stringify(texts)};const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;const h=[];
  while((n=w.nextNode())) if(want.includes(n.nodeValue.trim())){const e=n.parentElement,r=e.getBoundingClientRect();if(r.width&&r.x<${xmax})h.push(e)}return h.at(-1)||null})()`;
const svg = (...labels) => `(${JSON.stringify(labels)}.map(l=>[...document.querySelectorAll('svg[aria-label="'+l+'"]')].filter(e=>e.getClientRects().length).at(-1)).find(Boolean)||null)`;
const CROP = svg('选择“裁剪”', 'Select crop', 'Select Crop');
const CAPTION = `document.querySelector('[role=dialog] [contenteditable=true]')`;
async function realClick(T, expr, what) {
    if (!await (0, cdp_cjs_1.click)(T, expr))
        throw new Error(`找不到「${what}」`);
    await (0, cdp_cjs_1.sleep)(700);
}
const PATCH = `(async()=>{
  let m; try { m = require('PolarisInstajax'); } catch { return 'no-module'; }
  if (m.__maitianPatched) return 'already';
  const urls = performance.getEntriesByType('resource').map(e => e.name).filter(u => /\\.js(\\?|$)/.test(u));
  let buggy = false;
  for (const u of urls) { try { const t = await (await fetch(u, { cache: 'force-cache' })).text(); if (t.includes('rupload_igvideo/') && /JSON\\.parse\\(String\\(\\w\\)\\)\\.offset/.test(t)) { buggy = true; break; } } catch {} }
  if (!buggy) return 'fixed';
  const get = m.get_UNTYPED;
  m.get_UNTYPED = function (url) { const p = get.apply(this, arguments); return String(url).includes('rupload_igvideo') ? p.then(r => (r && typeof r === 'object') ? JSON.stringify(r) : r) : p; };
  m.__maitianPatched = true;
  return 'patched';
})()`;
const SCHED_LABEL = anyText(L('定时发布内容', 'Schedule this post', 'Schedule post'));
const SWITCH = `(()=>{let c=${SCHED_LABEL};for(let i=0;i<4&&c;i++){c=c.parentElement;const b=c&&c.querySelector('input[role=switch],input[type=checkbox]');if(b)return b}return null})()`;
const HOURS = `document.querySelector('[role=dialog] input[aria-label=Hours]')`;
const MINUTES = `document.querySelector('[role=dialog] input[aria-label=Minutes]')`;
const CAL = `[...document.querySelectorAll('[role=dialog]')].find(d=>d.querySelector('[role=grid]'))`;
async function typeDigits(T, expr, digits) {
    await realClick(T, expr, '时间');
    for (const k of digits) {
        const base = { key: k, code: 'Digit' + k, windowsVirtualKeyCode: 48 + +k, nativeVirtualKeyCode: 48 + +k };
        await (0, cdp_cjs_1.send)(T, 'Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: k });
        await (0, cdp_cjs_1.send)(T, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base });
        await (0, cdp_cjs_1.sleep)(120);
    }
    await (0, cdp_cjs_1.sleep)(300);
}
exports.default = {
    id: 'instagram',
    name: 'Instagram',
    url: 'https://www.instagram.com/',
    ready: `!!${svg('新帖子', 'New post')}`,
    async fill(ctx) {
        const { tabId: T, p } = ctx;
        await realClick(T, svg('新帖子', 'New post'), '创建');
        if (!await (0, cdp_cjs_1.waitFor)(T, `!!${anyText(L('帖子', 'Post'), 400)}`, 10000))
            throw new Error('「新帖子」菜单没弹出来');
        await (0, cdp_cjs_1.sleep)(900);
        await realClick(T, anyText(L('帖子', 'Post'), 400), '帖子');
        if (!await (0, cdp_cjs_1.waitFor)(T, `!!document.querySelector('[role=dialog] input[type=file][accept*=video]')`, 20000))
            throw new Error('「创建新帖子」窗口没打开');
        await (0, cdp_cjs_1.setFiles)(T, `document.querySelector('[role=dialog] input[type=file][accept*=video]')`, [ctx.video]);
        if (!await (0, cdp_cjs_1.waitFor)(T, `!!${CROP}`, 120000, 1000)) {
            const msg = await (0, cdp_cjs_1.evaluate)(T, dlgText);
            throw new Error(`视频没进到裁剪页：${(msg || '').replace(/\n/g, ' / ').slice(0, 120)}`);
        }
        ctx.log('视频已选（网页上传的视频按 Reels 发）');
        await (0, cdp_cjs_1.sleep)(1500);
        if (await (0, cdp_cjs_1.evaluate)(T, `/Reels 的形式分享|shared as reels/i.test(${dlgText})`))
            await realClick(T, anyText(L('确定', 'OK')), '确定');
        await realClick(T, CROP, '裁剪');
        await realClick(T, anyText(L('原版', 'Original')), '原版');
        await realClick(T, CROP, '裁剪');
        ctx.log('比例：原版（不裁）');
        await realClick(T, anyText(L('继续', 'Next')), '继续');
        if (!await (0, cdp_cjs_1.waitFor)(T, `/封面照片|Cover photo/i.test(${dlgText})`, 30000))
            throw new Error('没进到编辑页（封面、修剪）');
        const cover = ctx.cover('ig') || ctx.cover('16x9') || ctx.cover('4x3');
        if (cover) {
            await (0, cdp_cjs_1.setFiles)(T, `document.querySelector('[role=dialog] input[type=file][accept="image/jpeg,image/png"]')`, [cover]);
            await (0, cdp_cjs_1.sleep)(3000);
            ctx.log(`封面：${cover.split('/').pop()}`);
        }
        else
            ctx.note('没有 16:9 封面，用的是视频里自动截的一帧');
        const sound = await (0, cdp_cjs_1.evaluate)(T, `(document.querySelector('[role=dialog] input[type=checkbox]')||{}).checked`);
        if (sound === false)
            ctx.fail('「打开声音」是关着的，发出去会没声音');
        await realClick(T, anyText(L('继续', 'Next')), '继续');
        if (!await (0, cdp_cjs_1.waitFor)(T, `!!${CAPTION}`, 30000))
            throw new Error('没进到写配文这一步');
        await realClick(T, CAPTION, '配文框');
        await (0, cdp_cjs_1.typeLines)(T, p.caption);
        await (0, cdp_cjs_1.sleep)(800);
        await (0, cdp_cjs_1.click)(T, anyText(L('新 Reels', 'New reel', '创建新帖子', 'Create new post')));
        const got = await (0, cdp_cjs_1.evaluate)(T, `${CAPTION}.innerText`);
        const want = p.caption.replace(/\n+/g, '\n').trim(), have = (got || '').replace(/\n+/g, '\n').trim();
        if (have !== want)
            ctx.fail(`配文和素材不一致（页面 ${[...have].length} 字，应为 ${[...want].length} 字），请检查`);
        else
            ctx.log(`配文：${[...want].length} 字`);
        const patch = await (0, cdp_cjs_1.evaluate)(T, PATCH);
        if (patch === 'patched' || patch === 'already')
            ctx.log('已绕过 IG 网页长视频上传的 bug（不点就会「无法分享」）');
        else if (patch !== 'fixed')
            ctx.note(`没能检查 IG 上传 bug（${patch}），如果分享失败请手动检查`);
        ctx.note(`点右上角「${'分享'}」后视频才开始上传，十几分钟的视频要传几分钟到二十多分钟，传完前别关这个页面`);
    },
};
