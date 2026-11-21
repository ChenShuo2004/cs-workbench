// Adapted from mdldm-maitian-publisher (Apache-2.0); see NOTICE.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdp_cjs_1 = require("../cdp.cjs");
const common_cjs_1 = require("./common.cjs");
const R = `document.querySelector('wujie-app').shadowRoot`;
const SHORT = `${R}.querySelector('input[placeholder="填写短标题有机会获得更多流量"]')`;
const EDITOR = `${R}.querySelector('.input-editor')`;
const IMG = `[...${R}.querySelectorAll('input[type=file]')].find(i=>/image/.test(i.accept))`;
exports.default = {
    id: 'channels',
    name: '视频号',
    url: 'https://channels.weixin.qq.com/platform/post/create',
    ready: `!!(document.querySelector('wujie-app')?.shadowRoot?.querySelector('input[type=file][accept^=video]'))`,
    async fill(ctx) {
        const { tabId: T, p } = ctx;
        await (0, cdp_cjs_1.setFiles)(T, `${R}.querySelector('input[type=file][accept^=video]')`, [ctx.video]);
        ctx.log('视频开始上传');
        if (!await (0, cdp_cjs_1.waitFor)(T, `!!${SHORT} && !!${EDITOR}`, 30000))
            throw new Error('上传后没有出现表单');
        await (0, cdp_cjs_1.sleep)(1500);
        await (0, cdp_cjs_1.evaluate)(T, `${SHORT}.focus()`);
        await (0, cdp_cjs_1.insertText)(T, p.shortTitle);
        await (0, cdp_cjs_1.sleep)(300);
        await (0, common_cjs_1.checkTitle)(ctx, `${SHORT}.value`, p.shortTitle, '短标题');
        await (0, cdp_cjs_1.focusEnd)(T, EDITOR);
        await (0, cdp_cjs_1.typeLines)(T, p.body);
        if (p.topics && p.topics.length) {
            await (0, cdp_cjs_1.pressKey)(T, 'Enter');
            for (const t of p.topics) {
                await (0, cdp_cjs_1.insertText)(T, '#' + t + ' ');
                await (0, cdp_cjs_1.sleep)(400);
            }
            const got = await (0, cdp_cjs_1.evaluate)(T, `[...${EDITOR}.querySelectorAll('.topic, [class*=topic]')].map(e=>e.innerText.trim())`);
            ctx.log(`话题：${got.join(' ')}`);
        }
        ctx.log(`描述：${p.body.length} 字`);
        ctx.note('封面要等视频上传完才能设置，传完会自动补上');
    },
    uploadDone: `!${R}.textContent.includes('取消上传')`,
    async afterUpload(ctx) {
        const T = ctx.tabId;
        const set = async (wrap, file, label) => {
            if (!await (0, cdp_cjs_1.click)(T, `${R}.querySelector('${wrap} .edit-btn')`))
                throw new Error(`找不到${label}的「编辑」`);
            await (0, cdp_cjs_1.sleep)(1500);
            await (0, cdp_cjs_1.click)(T, (0, cdp_cjs_1.byText)('直接编辑', R));
            if (!await (0, cdp_cjs_1.waitFor)(T, `!!${IMG}`, 15000))
                throw new Error(`${label}编辑框没有打开`);
            await (0, cdp_cjs_1.sleep)(800);
            await (0, cdp_cjs_1.setFiles)(T, IMG, [file]);
            await (0, cdp_cjs_1.sleep)(3500);
            if (!await (0, cdp_cjs_1.click)(T, (0, cdp_cjs_1.byText)('确认', R)))
                throw new Error(`${label}编辑框里找不到「确认」`);
            await (0, cdp_cjs_1.sleep)(2000);
            ctx.log(`${label}：已设置`);
        };
        const v = ctx.cover('3x4'), h = ctx.cover('4x3');
        if (v)
            await set('.vertical-cover-wrap', v, '个人主页卡片 3:4');
        if (h)
            await set('.horizon-cover-wrap', h, '分享卡片 4:3');
    },
};
