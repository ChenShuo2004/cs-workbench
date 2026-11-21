// Adapted from mdldm-maitian-publisher (Apache-2.0); see NOTICE.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdp_cjs_1 = require("../cdp.cjs");
const common_cjs_1 = require("./common.cjs");
const TITLE = `document.querySelector('input[placeholder="请输入稿件标题"]')`;
const TAG_INPUT = `document.querySelector('input[placeholder="按回车键Enter创建标签"]')`;
const TAGS = `[...document.querySelectorAll('.tag-pre-wrp .label-item-v2-content')].map(e=>e.innerText.trim())`;
const COVER_SET = `(()=>{const e=document.querySelector('.cover-module-main .cover-empty'); return !e || !e.offsetParent})()`;
const IMG_INPUT = `[...document.querySelectorAll('input[type=file]')].find(i=>/image\\/png/.test(i.accept))`;
const CLOSE_MODAL = `(()=>{const m=[...document.querySelectorAll('*')].find(e=>e.childElementCount===0&&e.textContent.trim()==='封面制作'&&e.getClientRects().length);
  let p=m; for(let i=0;i<6&&p;i++){const x=p.querySelector('[class*=close]'); if(x){x.click(); return true} p=p.parentElement} return false})()`;
async function setCover(T, file) {
    const open = await (0, cdp_cjs_1.evaluate)(T, `!![...document.querySelectorAll('*')].find(e=>e.childElementCount===0&&e.textContent.trim()==='封面制作'&&e.getClientRects().length)`);
    if (!open)
        await (0, cdp_cjs_1.evaluate)(T, `document.querySelector('.cover-module-main .cover-empty, .cover-module-main .cover-slot').click()`);
    if (!await (0, cdp_cjs_1.waitFor)(T, `!!${IMG_INPUT}`, 15000))
        throw new Error('封面弹窗没有打开');
    await (0, cdp_cjs_1.sleep)(1000);
    await (0, cdp_cjs_1.evaluate)(T, `(()=>{const c=document.querySelector('.operation .sync'); if(c && c.querySelector('input').value!=='true') c.querySelector('label.sync-checkbox').click(); return 1})()`);
    await (0, cdp_cjs_1.sleep)(500);
    await (0, cdp_cjs_1.setFiles)(T, IMG_INPUT, [file]);
    await (0, cdp_cjs_1.sleep)(4500);
    await (0, cdp_cjs_1.click)(T, (0, cdp_cjs_1.byText)('完成'));
    await (0, cdp_cjs_1.sleep)(2500);
}
const TC = '.time-container';
exports.default = {
    id: 'bilibili',
    name: 'B 站',
    url: 'https://member.bilibili.com/platform/upload/video/frame',
    ready: `!!document.querySelector('.bcc-upload-wrapper input[type=file]')`,
    async fill(ctx) {
        const { tabId: T, p } = ctx;
        await (0, cdp_cjs_1.setFiles)(T, `document.querySelector('.bcc-upload-wrapper input[type=file]')`, [ctx.video]);
        ctx.log('视频开始上传');
        if (!await (0, cdp_cjs_1.waitFor)(T, `!!${TITLE}`, 30000))
            throw new Error('上传后没有出现稿件表单');
        await (0, cdp_cjs_1.sleep)(1500);
        const cover = ctx.cover('4x3');
        if (cover) {
            await ctx.withFocus(async () => {
                for (let attempt = 1; attempt <= 2; attempt++) {
                    await setCover(T, cover);
                    if (await (0, cdp_cjs_1.evaluate)(T, COVER_SET)) {
                        ctx.log('封面：4:3（16:9 同步）');
                        return;
                    }
                    await (0, cdp_cjs_1.evaluate)(T, CLOSE_MODAL);
                    await (0, cdp_cjs_1.sleep)(800);
                }
                ctx.fail('封面没设上，请手动上传 4:3 封面');
            });
        }
        await (0, cdp_cjs_1.setValue)(T, TITLE, p.title);
        await (0, cdp_cjs_1.sleep)(300);
        await (0, common_cjs_1.checkTitle)(ctx, `${TITLE}.value`, p.title);
        const desc = await (0, cdp_cjs_1.evaluate)(T, `(()=>{const ed=[...document.querySelectorAll('.ql-editor')].find(e=>(e.dataset.placeholder||'').startsWith('填写更全面'));
      const q=ed && ed.closest('.ql-container').__quill; if(!q) return null; q.setText(${JSON.stringify(p.desc)}); return ed.innerText.length})()`);
        if (desc == null)
            ctx.fail('简介编辑器没找到，简介没有填');
        else
            ctx.log(`简介：${p.desc.length} 字`);
        for (let i = 0; i < 12; i++) {
            const n = await (0, cdp_cjs_1.evaluate)(T, `(()=>{const c=document.querySelector('.tag-pre-wrp .label-item-v2-container svg.close'); if(!c) return 0; c.dispatchEvent(new MouseEvent('click',{bubbles:true})); return 1})()`);
            if (!n)
                break;
            await (0, cdp_cjs_1.sleep)(300);
        }
        const skipped = [];
        for (const t of p.tags || []) {
            const before = (await (0, cdp_cjs_1.evaluate)(T, TAGS)).length;
            await (0, cdp_cjs_1.evaluate)(T, `${TAG_INPUT}.focus()`);
            await (0, cdp_cjs_1.insertText)(T, t);
            await (0, cdp_cjs_1.sleep)(500);
            await (0, cdp_cjs_1.pressKey)(T, 'Enter');
            await (0, cdp_cjs_1.sleep)(900);
            const after = await (0, cdp_cjs_1.evaluate)(T, TAGS);
            if (after.length <= before) {
                skipped.push(t);
                await (0, cdp_cjs_1.setValue)(T, TAG_INPUT, '');
            }
        }
        const got = await (0, cdp_cjs_1.evaluate)(T, TAGS);
        ctx.log(`标签：${got.join('、')}`);
        if (skipped.length)
            ctx.note(`B 站拒收、已跳过的标签：${skipped.join('、')}`);
        const cat = p.category || '人工智能';
        const CUR = `(document.querySelector('.video-human-type .select-item-cont')?.innerText||'').trim()`;
        if (await (0, cdp_cjs_1.evaluate)(T, CUR) !== cat) {
            await (0, cdp_cjs_1.evaluate)(T, `document.querySelector('.video-human-type .select-controller')?.click()`);
            await (0, cdp_cjs_1.sleep)(800);
            await (0, cdp_cjs_1.evaluate)(T, `[...document.querySelectorAll('.video-human-type .item-cont-main')].find(e=>e.innerText.trim()===${JSON.stringify(cat)})?.click()`);
            await (0, cdp_cjs_1.sleep)(800);
        }
        const gotCat = await (0, cdp_cjs_1.evaluate)(T, CUR);
        if (gotCat === cat)
            ctx.log(`分区：${cat}`);
        else
            ctx.fail(`分区没选上：页面上是「${gotCat}」，应该是「${cat}」`);
        ctx.note('还需要你选「创作声明」（必填）');
    },
    uploadDone: `document.body.innerText.includes('上传完成')`,
};
