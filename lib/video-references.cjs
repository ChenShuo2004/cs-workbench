const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function defaultReferenceDirectory(home = os.homedir()) {
  return path.join(home, 'Documents', 'ChatGPT', '陈硕 video', '资料库', 'Opus5.5十五种视频风格_20261018');
}

function localFile(root, relative, extensions) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative))
    throw new Error('案例文件必须使用库内相对路径');
  const base = fs.realpathSync(root);
  const candidate = path.resolve(base, relative);
  if (!candidate.startsWith(base + path.sep)) throw new Error('案例文件超出资料库');
  const real = fs.realpathSync(candidate);
  if (!real.startsWith(base + path.sep)) throw new Error('案例文件链接超出资料库');
  if (!extensions.includes(path.extname(real).toLowerCase()) || !fs.statSync(real).isFile())
    throw new Error('不支持此案例文件格式');
  return real;
}

function loadRows(root) {
  const file = localFile(root, 'cases.json', ['.json']);
  if (fs.statSync(file).size > 8_000_000) throw new Error('案例索引过大');
  let rows;
  try { rows = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error('cases.json 无法读取，请检查案例库格式'); }
  if (!Array.isArray(rows) || rows.length > 1000) throw new Error('案例索引必须是最多1000条的数组');
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(row.id) || ids.has(row.id))
      throw new Error('案例编号缺失或重复');
    ids.add(row.id);
    for (const field of ['style', 'title', 'prompt', 'source_prompt']) {
      if (typeof row[field] !== 'string' || !row[field].trim() || row[field].length > 100_000)
        throw new Error(`案例 ${row.id} 的 ${field} 字段无效`);
    }
  }
  return rows;
}

const MEDIA = { video: ['reference_clip', ['.mp4', '.webm']], image: ['image', ['.jpg', '.jpeg', '.png', '.webp']], evidence: ['evidence', ['.jpg', '.jpeg', '.png', '.webp']] };
const text = value => typeof value === 'string' ? value : '';
function readCatalog(root) {
  if (!root || !fs.existsSync(root)) return { connected: false, root: root || '', cases: [] };
  const rows = loadRows(root);
  return {
    connected: true, root,
    cases: rows.map(row => {
      const available = {};
      for (const [kind, [field, extensions]] of Object.entries(MEDIA)) {
        try { localFile(root, row[field], extensions); available[kind] = true; }
        catch { available[kind] = false; }
      }
      return {
        id: row.id, style: row.style, title: row.title,
        author: text(row.author), sourcePrompt: row.source_prompt, prompt: row.prompt,
        uses: text(row.uses), visual: text(row.visual), workTitle: text(row.work_title),
        checks: text(row.checks), sourceSkill: text(row.source_skill), localRoute: text(row.local_route),
        category: text(row.category), evidenceTime: Number(row.evidence_time) || 0,
        clipStart: Number(row.clip_start) || 0, clipEnd: Number(row.clip_end) || 0,
        available,
      };
    }),
  };
}
function referenceRow(root, id) {
  const row = loadRows(root).find(row => row.id === id);
  if (!row) throw new Error('找不到这个案例，请刷新案例库');
  return row;
}
function referenceMedia(root, id, kind) {
  const media = MEDIA[kind];
  if (!media) throw new Error('未知案例媒体类型');
  const row = referenceRow(root, id);
  return localFile(root, row[media[0]], media[1]);
}
function sourceURL(root, id) {
  const row = referenceRow(root, id);
  const url = new URL(row.post_url);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('来源链接必须是HTTPS网页');
  return url.href;
}
module.exports = { defaultReferenceDirectory, readCatalog, referenceMedia, sourceURL, localFile };
