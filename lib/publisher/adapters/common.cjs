// Adapted from mdldm-maitian-publisher (Apache-2.0); see NOTICE.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickTopics = pickTopics;
exports.checkTitle = checkTitle;
exports.bjTime = bjTime;
const cdp_cjs_1 = require("../cdp.cjs");
async function pickTopics(ctx, topics, itemsExpr, { realClick = false } = {}) {
    const picked = [], plain = [];
    for (const t of topics) {
        await (0, cdp_cjs_1.insertText)(ctx.tabId, '#' + t);
        let hit = 'none';
        const find = `${itemsExpr}.filter(e=>e.getClientRects().length).find(e=>e.innerText.split('\\n')[0].trim()==='#'+${JSON.stringify(t)})`;
        for (let i = 0; i < 8 && hit !== 'picked'; i++) {
            await (0, cdp_cjs_1.sleep)(500);
            hit = await (0, cdp_cjs_1.evaluate)(ctx.tabId, `(()=>{const it=${itemsExpr}.filter(e=>e.getClientRects().length);
        const h=it.find(e=>e.innerText.split('\\n')[0].trim()==='#'+${JSON.stringify(t)}); if(h){${realClick ? "return 'found'" : "h.click(); return 'picked'"}}
        return it.length ? 'nomatch' : 'none'})()`);
            if (hit === 'found')
                hit = (await (0, cdp_cjs_1.click)(ctx.tabId, find)) ? 'picked' : 'none';
        }
        if (hit === 'picked')
            picked.push(t);
        else {
            plain.push(t);
            await (0, cdp_cjs_1.insertText)(ctx.tabId, ' ');
        }
        await (0, cdp_cjs_1.sleep)(400);
    }
    if (plain.length)
        ctx.note(`没有同名话题，保留为普通文字：${plain.join('、')}`);
    return picked;
}
async function checkTitle(ctx, expr, expected, label = '标题') {
    const got = await (0, cdp_cjs_1.evaluate)(ctx.tabId, expr);
    if ((got || '').trim() !== expected.trim())
        ctx.fail(`${label}异常：期望「${expected}」，页面上是「${got || '空'}」`);
    else
        ctx.log(`${label}：${expected}`);
}
function bjTime(iso) {
    const d = new Date(Date.parse(iso) + 8 * 3600e3);
    const p = (n) => String(n).padStart(2, '0');
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate(), hh = d.getUTCHours(), mm = d.getUTCMinutes();
    return { y, m, d: day, hh, mm, ymd: `${y}-${p(m)}-${p(day)}`, hm: `${p(hh)}:${p(mm)}`, text: `${y}-${p(m)}-${p(day)} ${p(hh)}:${p(mm)}` };
}
