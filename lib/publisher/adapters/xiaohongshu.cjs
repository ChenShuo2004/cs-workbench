// Adapted from mdldm-maitian-publisher (Apache-2.0); see NOTICE.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdp_cjs_1 = require("../cdp.cjs");
const common_cjs_1 = require("./common.cjs");
const TITLE = `document.querySelector('input[placeholder="填写标题会有更多赞哦"]')`;
const EDITOR = `document.querySelector('.tiptap.ProseMirror')`;
exports.default = {
    id: 'xhs',
    name: '小红书',
    url: 'https://creator.xiaohongshu.com/publish/publish?source=official&target=video',
    ready: `!!document.querySelector('input[type=file]')`,
    async fill(ctx) {
        const { tabId: T, p } = ctx;
        await (0, cdp_cjs_1.setFiles)(T, `document.querySelector('input[type=file]')`, [ctx.video]);
        ctx.log('视频开始上传');
        if (!await (0, cdp_cjs_1.waitFor)(T, `!!${TITLE}`, 30000))
            throw new Error('上传后没有出现笔记表单');
        await (0, cdp_cjs_1.sleep)(1500);
        await (0, cdp_cjs_1.click)(T, (0, cdp_cjs_1.byText)('我知道了'));
        await (0, cdp_cjs_1.setValue)(T, TITLE, p.title);
        await (0, cdp_cjs_1.sleep)(300);
        await (0, common_cjs_1.checkTitle)(ctx, `${TITLE}.value`, p.title);
        await (0, cdp_cjs_1.focusEnd)(T, EDITOR);
        await (0, cdp_cjs_1.typeLines)(T, p.body);
        if (p.topics && p.topics.length) {
            await (0, cdp_cjs_1.pressKey)(T, 'Enter');
            await (0, cdp_cjs_1.pressKey)(T, 'Enter');
            const picked = await (0, common_cjs_1.pickTopics)(ctx, p.topics, `[...document.querySelectorAll('.item')]`);
            ctx.log(`话题：${picked.join('、') || '无'}`);
        }
        const len = await (0, cdp_cjs_1.evaluate)(T, `${EDITOR}.innerText.length`);
        ctx.log(`正文：${p.body.length} 字（编辑器 ${len}）`);
        ctx.note('封面要等视频上传完才能设置，传完会自动补上');
    },
    uploadDone: `(()=>{const t=document.body.innerText; return !t.includes('上传中') && !t.includes('取消上传') && !!document.querySelector('.cover .default')})()`,
    async afterUpload(ctx) {
        const T = ctx.tabId;
        const cover = ctx.cover('3x4');
        if (!cover)
            return;
        await (0, cdp_cjs_1.hover)(T, `document.querySelector('.cover .default')`);
        await (0, cdp_cjs_1.sleep)(600);
        if (!await (0, cdp_cjs_1.click)(T, `document.querySelector('.cover-edit-entry-text')`))
            throw new Error('找不到「编辑封面」');
        const IMG = `[...document.querySelectorAll('input[type=file]')].find(i=>/image/.test(i.accept))`;
        if (!await (0, cdp_cjs_1.waitFor)(T, `!!${IMG}`, 20000))
            throw new Error('封面编辑器没有打开');
        await (0, cdp_cjs_1.sleep)(1500);
        await (0, cdp_cjs_1.setFiles)(T, IMG, [cover]);
        await (0, cdp_cjs_1.sleep)(3500);
        await (0, cdp_cjs_1.click)(T, (0, cdp_cjs_1.byText)('裁剪'));
        await (0, cdp_cjs_1.sleep)(1000);
        await (0, cdp_cjs_1.click)(T, `(${(0, cdp_cjs_1.byText)('3:4')})?.parentElement`);
        await (0, cdp_cjs_1.sleep)(1200);
        if (!await (0, cdp_cjs_1.click)(T, (0, cdp_cjs_1.byText)('完成')))
            throw new Error('封面编辑器里找不到「完成」');
        await (0, cdp_cjs_1.sleep)(2500);
        const ok = await (0, cdp_cjs_1.evaluate)(T, `document.body.innerText.includes('封面效果评估通过')`);
        ctx.log(`封面：3:4${ok ? '（平台评估通过）' : ''}`);
    },
};
