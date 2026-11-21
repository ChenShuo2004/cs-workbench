// Adapted from mdldm-maitian-publisher (Apache-2.0); see NOTICE.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cdp_cjs_1 = require("../cdp.cjs");
const common_cjs_1 = require("./common.cjs");
const TITLE = `document.querySelector('input[placeholder="填写作品标题，为作品获得更多流量"]')`;
const EDITOR = `document.querySelector('.editor-kit-container[contenteditable=true]')`;
const COVER_INPUT = `[...document.querySelectorAll('input.semi-upload-hidden-input')].find(i=>{let p=i;for(let k=0;k<4;k++)p=p.parentElement;return p.innerText.includes('上传封面')})`;
exports.default = {
    id: 'douyin',
    name: '抖音',
    url: 'https://creator.douyin.com/creator-micro/content/upload',
    ready: `!!document.querySelector('input[type=file]')`,
    async fill(ctx) {
        const { tabId: T, p } = ctx;
        await (0, cdp_cjs_1.setFiles)(T, `document.querySelector('input[type=file]')`, [ctx.video]);
        ctx.log('视频开始上传');
        if (!await (0, cdp_cjs_1.waitFor)(T, `!!${TITLE}`, 30000))
            throw new Error('上传后没有出现作品表单');
        await (0, cdp_cjs_1.sleep)(1500);
        await (0, cdp_cjs_1.evaluate)(T, `${TITLE}.focus()`);
        await (0, cdp_cjs_1.insertText)(T, p.title);
        await (0, cdp_cjs_1.sleep)(300);
        await (0, common_cjs_1.checkTitle)(ctx, `${TITLE}.value`, p.title);
        await (0, cdp_cjs_1.focusEnd)(T, EDITOR);
        await (0, cdp_cjs_1.typeLines)(T, p.body);
        if (p.topics && p.topics.length) {
            await (0, cdp_cjs_1.pressKey)(T, 'Enter');
            const picked = await (0, common_cjs_1.pickTopics)(ctx, p.topics, `[...document.querySelectorAll('[class*=mention-suggest] [class*=tag-hash]')]`, { realClick: true });
            ctx.log(`话题：${picked.join('、') || '无'}`);
        }
        ctx.log(`简介：${p.body.length} 字`);
        const h = ctx.cover('4x3'), v = ctx.cover('3x4');
        if (h || v) {
            if (!await (0, cdp_cjs_1.click)(T, (0, cdp_cjs_1.firstByText)('选择封面')))
                throw new Error('找不到「选择封面」');
            if (!await (0, cdp_cjs_1.waitFor)(T, `!!${COVER_INPUT}`, 15000))
                throw new Error('封面弹窗没有打开');
            await (0, cdp_cjs_1.sleep)(1500);
            if (h) {
                await (0, cdp_cjs_1.setFiles)(T, COVER_INPUT, [h]);
                await (0, cdp_cjs_1.sleep)(3000);
                ctx.log('横封面：4:3');
            }
            if (v) {
                await (0, cdp_cjs_1.click)(T, (0, cdp_cjs_1.firstByText)('设置竖封面'));
                await (0, cdp_cjs_1.sleep)(2000);
                await (0, cdp_cjs_1.setFiles)(T, COVER_INPUT, [v]);
                await (0, cdp_cjs_1.sleep)(3000);
                ctx.log('竖封面：3:4');
            }
            if (!await (0, cdp_cjs_1.click)(T, (0, cdp_cjs_1.byText)('完成')))
                throw new Error('封面弹窗里找不到「完成」');
            await (0, cdp_cjs_1.sleep)(2000);
        }
    },
    uploadDone: `!document.body.innerText.includes('上传过程中')`,
};
