const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const wb = require("../lib/workbench.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cs-workbench-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = {
    workspace: path.join(root, "projects"),
    library: path.join(root, "library"),
    projects: [],
  };
  return { root, config };
}

test("one topic creates editable article and video files in an isolated project", (t) => {
  const { config } = fixture(t);
  const p = wb.createProject(config, {
    title: "AI/小白入门",
    audience: "首次使用的人",
    platforms: ["小红书", "抖音"],
  });
  assert.equal(p.title, "AI/小白入门");
  assert.ok(p.path.startsWith(config.workspace));
  assert.equal(path.basename(p.path).includes("/"), false);
  const detail = wb.readProject(config, p.path);
  assert.match(detail.docs.brief, /首次使用的人/);
  assert.match(detail.docs.shotlist, /镜头,预计秒数/);
  assert.deepEqual(detail.sources, []);
  wb.saveDocument(config, p.path, "article", "# 文章\n\n这是第一版正文");
  assert.match(wb.readProject(config, p.path).docs.article, /第一版正文/);
  assert.equal(wb.readProject(config, p.path).status.article, "草稿");
  wb.updatePlatformStatus(config, p.path, "小红书", "已发布");
  assert.equal(
    wb.readProject(config, p.path).platformStatus["小红书"],
    "已发布",
  );
  assert.notEqual(wb.readProject(config, p.path).status.publish, "已发布");
  assert.throws(
    () => wb.saveDocument(config, p.path, "../../secret", "x"),
    /未知稿件/,
  );
});

test("import is read-only and leaves the original files untouched", (t) => {
  const { root, config } = fixture(t);
  const old = path.join(root, "old");
  fs.mkdirSync(old);
  fs.writeFileSync(path.join(old, "文章.md"), "# 原文章\n内容");
  wb.importProject(config, old);
  const data = wb.readProject(config, old);
  assert.equal(data.managed, false);
  assert.match(data.docs.article, /原文章/);
  assert.throws(() => wb.saveDocument(config, old, "article", "改写"), /只读/);
  assert.equal(
    fs.readFileSync(path.join(old, "文章.md"), "utf8"),
    "# 原文章\n内容",
  );
});

test("library keeps unverified NetEase candidates out of project assets", (t) => {
  const { config } = fixture(t);
  const audioDir = path.join(config.library, "assets/sfx");
  const neteaseDir = path.join(config.library, "assets/bgm/网易云可导入");
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(neteaseDir, { recursive: true });
  const wav = Buffer.from("sample-audio");
  fs.writeFileSync(path.join(audioDir, "click.wav"), wav);
  fs.writeFileSync(
    path.join(neteaseDir, "candidate.mp3"),
    Buffer.from("candidate"),
  );
  wb.writeJson(path.join(config.library, "manifest.json"), {
    items: [
      {
        id: "click",
        title: "轻点击",
        category: "sfx",
        path: "assets/sfx/click.wav",
        license: "CC0",
        sha256: crypto.createHash("sha256").update(wav).digest("hex"),
      },
    ],
  });
  const project = wb.createProject(config, { title: "素材测试" });
  const catalog = wb.libraryCatalog(config.library);
  assert.equal(catalog.audio.length, 1);
  assert.equal(catalog.netease.length, 1);
  assert.throws(
    () => wb.addAsset(config, project.path, "netease:candidate.mp3"),
    /不能加入/,
  );
  const selected = wb.addAsset(config, project.path, "audio:click");
  assert.equal(selected.length, 1);
  assert.equal(selected[0].license, "CC0");
  assert.ok(fs.existsSync(path.join(project.path, selected[0].path)));
});

test("QA identifies missing evidence and only a real video can pass stream probe", (t) => {
  const { config } = fixture(t);
  const project = wb.createProject(config, { title: "待制作选题" });
  const qa = wb.runQA(config, project.path, "/usr/bin/false");
  assert.ok(qa.issues.some((i) => i.message.includes("文章正文")));
  assert.ok(qa.issues.some((i) => i.message.includes("资料来源")));
  assert.ok(qa.issues.some((i) => i.message.includes("尚未找到")));
  assert.ok(fs.existsSync(path.join(project.path, "qa/latest.json")));
});

test("article export creates a ZIP and records local export without claiming publication", (t) => {
  const { config } = fixture(t);
  const project = wb.createProject(config, {
    title: "导出测试",
    platforms: ["小红书"],
  });
  wb.saveDocument(
    config,
    project.path,
    "article",
    "# 导出测试\n\n这是一篇已经写完的文章正文，包含足够的内容用于生成一个真实的本地交付包。",
  );
  const output = wb.exportProject(config, project.path, "article");
  assert.ok(
    output.qa.issues.some((issue) => issue.message.includes("资料来源")),
  );
  assert.equal(
    output.qa.issues.some((issue) => issue.branch === "video"),
    false,
  );
  assert.ok(fs.existsSync(path.join(output.folder, "收尾检查.json")));
  assert.match(
    fs.readFileSync(path.join(output.folder, "交付说明.md"), "utf8"),
    /不能标为完整交付/,
  );
  assert.ok(fs.existsSync(output.zip));
  assert.ok(fs.existsSync(path.join(output.folder, "writing/article.md")));
  const updated = wb.readProject(config, project.path);
  assert.equal(updated.status.article, "已导出");
  assert.equal(updated.status.publish, "准备中");
  assert.equal(updated.platformStatus["小红书"], "准备中");
});
