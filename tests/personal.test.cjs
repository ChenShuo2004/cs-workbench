const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { createPersonal } = require("../lib/personal.cjs");
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-personal-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, p: createPersonal({ userData: dir, findTool: () => "" }) };
}
test("tasks, recurring days, journal and memories survive restart without duplicating daily tasks", (t) => {
  const { dir, p } = setup(t);
  p.task({ title: "读书", date: "2026-10-17", repeat: "daily" });
  const task = p.snapshot().tasks[0];
  p.task({ ...task, status: "done" });
  p.carryDaily("2026-10-18");
  p.carryDaily("2026-10-18");
  assert.equal(p.snapshot().tasks.length, 2);
  p.journal("2026-10-17", "今天完成了第一版。");
  p.note({ title: "偏好", body: "保留可编辑源文件", pinned: true });
  const again = createPersonal({ userData: dir, findTool: () => "" });
  assert.equal(
    again.snapshot().tasks.filter((t) => t.status === "done").length,
    1,
  );
  assert.equal(
    again.snapshot().journal["2026-10-17"].body,
    "今天完成了第一版。",
  );
  assert.equal(again.snapshot().notes[0].pinned, true);
});
test("connected folders deny traversal, symlink escape and hidden credentials", (t) => {
  const { dir, p } = setup(t);
  const root = path.join(dir, "files");
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "note.md"), "hello");
  fs.writeFileSync(path.join(root, ".env"), "SECRET");
  fs.symlinkSync("/etc", path.join(root, "outside"));
  p.connect(root);
  const id = p.snapshot().folders[0].id;
  assert.equal(p.readFile(id, "note.md").body, "hello");
  assert.throws(() => p.readFile(id, "../personal/workspace.json"), /超出/);
  assert.throws(() => p.readFile(id, ".env"), /隐藏/);
  assert.throws(() => p.browse(id, "outside"), /超出/);
  p.disconnect(id);
  assert.equal(fs.readFileSync(path.join(root, "note.md"), "utf8"), "hello");
});
test("corrupt personal database is never silently replaced", (t) => {
  const { dir } = setup(t);
  const file = path.join(dir, "personal/workspace.json");
  fs.writeFileSync(file, "broken");
  assert.throws(
    () => createPersonal({ userData: dir, findTool: () => "" }),
    /损坏/,
  );
  assert.equal(fs.readFileSync(file, "utf8"), "broken");
});
test("xAI streaming preserves Chinese, rejects interrupted/error streams, and excludes keys from backups", async (t) => {
  const { dir } = setup(t);
  let responseMode = "success";
  t.mock.method(global, "fetch", async (url) => {
    if (String(url).endsWith("/models"))
      return Response.json({ data: [{ id: "grok-test" }] });
    const prefix =
      'data: {"choices":[{"delta":{"content":"你好，创作者"}}]}\n\n';
    const tail =
      responseMode === "success"
        ? "data:[DONE]"
        : responseMode === "error"
          ? 'data: {"error":{"message":"test error"}}\n'
          : "";
    const bytes = new TextEncoder().encode(prefix + tail);
    return new Response(
      new ReadableStream({
        start(controller) {
          for (let n = 0; n < bytes.length; n += 7)
            controller.enqueue(bytes.slice(n, n + 7));
          controller.close();
        },
      }),
    );
  });
  const p = createPersonal({
    userData: dir,
    findTool: () => "",
    secureStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(s),
      decryptString: (b) => b.toString(),
    },
  });
  await p.configureXai("unit-test-key-only");
  for (const mode of ["success", "interrupted", "error"]) {
    responseMode = mode;
    const c = p.newConversation();
    await p.send({ id: c.id, provider: "xai", prompt: "你好" });
    for (
      let n = 0;
      n < 100 && p.snapshot().conversations[0].status === "running";
      n++
    )
      await new Promise((r) => setTimeout(r, 5));
    const result = p.snapshot().conversations[0];
    assert.equal(result.status, mode === "success" ? "complete" : "failed");
    assert.equal(result.messages.at(-1).text, "你好，创作者");
  }
  const backup = path.join(dir, "backup.json");
  p.exportData(backup);
  assert.ok(!fs.readFileSync(backup, "utf8").includes("unit-test-key-only"));
});
test("backup restoration validates before writing and retains a recoverable prior workspace", (t) => {
  const { dir, p } = setup(t);
  p.task({ title: "原任务", date: "2026-10-17" });
  p.note({ title: "偏好", body: "保留源文件" });
  const backup = path.join(dir, "restore.json");
  p.exportData(backup);
  p.task({ title: "后来的任务", date: "2026-10-18" });
  const restored = p.restoreData(backup);
  assert.equal(restored.data.tasks.length, 1);
  assert.equal(
    JSON.parse(fs.readFileSync(restored.previous, "utf8")).tasks.length,
    2,
  );
  const before = fs.readFileSync(
    path.join(dir, "personal/workspace.json"),
    "utf8",
  );
  const bad = JSON.parse(fs.readFileSync(backup, "utf8"));
  bad.tasks[0].status = "garbage";
  fs.writeFileSync(backup, JSON.stringify(bad));
  assert.throws(() => p.restoreData(backup), /任务字段/);
  assert.equal(
    fs.readFileSync(path.join(dir, "personal/workspace.json"), "utf8"),
    before,
  );
});

test("reference metadata persists independently of memories and rejects executable links", (t) => {
  const { dir, p } = setup(t);
  p.note({
    title: "资料",
    body: "摘录",
    kind: "reference",
    sourceUrl: "https://example.com",
    project: "/project/a",
  });
  const n = p.snapshot().notes[0];
  p.note({ ...n, processed: true });
  const again = createPersonal({ userData: dir, findTool: () => "" });
  assert.equal(again.snapshot().notes[0].processed, true);
  assert.equal(again.snapshot().notes[0].project, "/project/a");
  assert.throws(
    () => p.note({ ...n, sourceUrl: "javascript:alert(1)" }),
    /HTTP/,
  );
  assert.equal(p.snapshot().notes[0].sourceUrl, "https://example.com");
});
