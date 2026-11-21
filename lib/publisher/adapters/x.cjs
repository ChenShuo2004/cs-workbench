// Adapted from mdldm-maitian-publisher (Apache-2.0); see NOTICE.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdp_cjs_1 = require("../cdp.cjs");
const BOX = `document.querySelector('[data-testid=tweetTextarea_0]')`;
exports.default = {
    id: 'x',
    name: 'X',
    url: 'https://x.com/compose/post',
    ready: `!!document.querySelector('[data-testid=tweetTextarea_0]') && !!document.querySelector('input[data-testid=fileInput]')`,
    async fill(ctx) {
        const { tabId: T, p } = ctx;
        await (0, cdp_cjs_1.focusEnd)(T, BOX);
        await (0, cdp_cjs_1.typeLines)(T, p.text);
        ctx.log(`正文：${p.text.length} 字`);
        await (0, cdp_cjs_1.setFiles)(T, `document.querySelector('input[data-testid=fileInput]')`, [ctx.video]);
        ctx.log('视频开始上传');
        await (0, cdp_cjs_1.sleep)(3000);
        ctx.note('不要关掉发帖框，关掉会丢失');
    },
    uploadDone: `!/Uploading \\(\\d+%\\)/.test(document.body.innerText)`,
};
