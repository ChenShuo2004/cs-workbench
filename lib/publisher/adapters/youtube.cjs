// Adapted from mdldm-maitian-publisher (Apache-2.0); see NOTICE.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdp_cjs_1 = require("../cdp.cjs");
const common_cjs_1 = require("./common.cjs");
const BOX = (i) => `[...document.querySelectorAll('#textbox[contenteditable]')][${i}]`;
const TAG_INPUT = `document.querySelector('input[aria-label="标签"], input[aria-label="Tags"]')`;
exports.default = {
    id: 'youtube',
    name: 'YouTube',
    url: 'https://www.youtube.com/upload',
    ready: `!!document.querySelector('input[type=file][name=Filedata]')`,
    async fill(ctx) {
        const { tabId: T, p } = ctx;
        await (0, cdp_cjs_1.setFiles)(T, `document.querySelector('input[type=file][name=Filedata]')`, [ctx.video]);
        ctx.log('视频开始上传（默认私享）');
        if (!await (0, cdp_cjs_1.waitFor)(T, `document.querySelectorAll('#textbox[contenteditable]').length>=2`, 30000))
            throw new Error('上传后没有出现详细信息表单');
        await (0, cdp_cjs_1.sleep)(2000);
        await (0, cdp_cjs_1.focusSelectAll)(T, BOX(0));
        await (0, cdp_cjs_1.insertText)(T, p.title);
        await (0, cdp_cjs_1.sleep)(500);
        await (0, common_cjs_1.checkTitle)(ctx, `${BOX(0)}.innerText`, p.title);
        await (0, cdp_cjs_1.focusSelectAll)(T, BOX(1));
        await (0, cdp_cjs_1.insertText)(T, p.desc);
        await (0, cdp_cjs_1.sleep)(500);
        const lines = await (0, cdp_cjs_1.evaluate)(T, `${BOX(1)}.innerText.split('\\n').length`);
        if (lines < p.desc.split('\n').length)
            ctx.fail(`说明的换行没保留（页面 ${lines} 行，应为 ${p.desc.split('\n').length} 行）`);
        else
            ctx.log(`说明：${p.desc.length} 字`);
        const thumb = ctx.cover('16x9');
        if (thumb) {
            await (0, cdp_cjs_1.setFiles)(T, `[...document.querySelectorAll('input[type=file]')].find(i=>/image/.test(i.accept))`, [thumb]);
            await (0, cdp_cjs_1.sleep)(3000);
            ctx.log('缩略图：16:9');
        }
        if (p.tags && p.tags.length) {
            await (0, cdp_cjs_1.evaluate)(T, `(()=>{const b=document.querySelector('#toggle-button'); if(b && !${TAG_INPUT}) b.click(); return 1})()`);
            if (!await (0, cdp_cjs_1.waitFor)(T, `!!${TAG_INPUT}`, 8000))
                ctx.fail('找不到标签输入框，标签没有填');
            else {
                await (0, cdp_cjs_1.setValue)(T, TAG_INPUT, '');
                await (0, cdp_cjs_1.evaluate)(T, `${TAG_INPUT}.focus()`);
                for (const t of p.tags) {
                    await (0, cdp_cjs_1.insertText)(T, t);
                    await (0, cdp_cjs_1.sleep)(200);
                    await (0, cdp_cjs_1.pressKey)(T, 'Enter');
                    await (0, cdp_cjs_1.sleep)(300);
                }
                ctx.log(`标签：${p.tags.join('、')}`);
            }
        }
    },
    uploadDone: `(()=>{const p=document.querySelector('ytcp-video-upload-progress'); const t=(p&&p.offsetParent?p.innerText:'')||((document.querySelector('ytcp-multi-progress-monitor')||{}).innerText||''); return /上传完毕|Upload complete|处理|Processing|检查完毕|Checks complete/.test(t) && !/正在上传|Uploading/.test(t)})()`,
};
