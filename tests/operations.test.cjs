const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { createHealth } = require("../lib/health.cjs");
const { createContentOps } = require("../lib/content-ops.cjs");
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-operations-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test("health keeps month precision and provenance, updates same-source duplicates and survives restart", (t) => {
  const dir = setup(t),
    h = createHealth(dir);
  h.save({
    metric: "weight",
    value: 70,
    date: "2026-07",
    source: "chatgpt-snapshot",
    sourceLabel: "QA snapshot",
  });
  h.save({
    metric: "steps",
    value: 1234,
    date: "2026-10-17",
    source: "manual",
  });
  h.save({
    metric: "steps",
    value: 1500,
    date: "2026-10-17",
    source: "manual",
  });
  const data = createHealth(dir).snapshot();
  assert.equal(data.records.length, 2);
  assert.equal(data.records[0].date, "2026-07");
  assert.equal(data.records[1].value, 1500);
  assert.equal(data.connection, "local-only");
  assert.equal(
    fs.statSync(path.join(dir, "health/records.json")).mode & 0o777,
    0o600,
  );
  assert.equal(fs.existsSync(path.join(dir, "personal/workspace.json")), false);
});
test("health rejects bad dates, blank or nonfinite values, and invalid units without replacing prior records", (t) => {
  const h = createHealth(setup(t));
  h.save({ metric: "weight", value: 70, date: "2026-10-17" });
  for (const input of [
    { metric: "sleep", value: 25, date: "2026-10-17" },
    { metric: "weight", value: 70, date: "2026-02-30" },
    { metric: "steps", value: 1.5, date: "2026-10-17" },
    { metric: "weight", value: "", date: "2026-10-17" },
    { metric: "weight", value: Infinity, date: "2026-10-17" },
  ])
    assert.throws(() => h.save(input));
  assert.equal(h.snapshot().records.length, 1);
});
test("content plans validate linked projects and result provenance, preserve zero metrics, and never mutate project status", (t) => {
  const dir = setup(t),
    ops = createContentOps(dir),
    projects = [{ path: "/qa/project", status: { publish: "草稿" } }];
  const input = {
    project: "/qa/project",
    plannedDate: "2026-10-18",
    hook: "真实项目的问题",
    views: 0,
    measuredAt: "2026-10-18",
    resultUrl: "https://example.com/qa",
  };
  assert.throws(
    () => ops.save({ ...input, project: "/outside" }, projects),
    /已连接/,
  );
  assert.throws(
    () => ops.save({ ...input, measuredAt: "" }, projects),
    /统计日期/,
  );
  assert.throws(
    () => ops.save({ ...input, resultUrl: "javascript:alert(1)" }, projects),
    /HTTP/,
  );
  ops.save(input, projects);
  ops.save({ ...input, hook: "更新开头" }, projects);
  const restored = createContentOps(dir).read();
  assert.equal(restored.plans.length, 1);
  assert.equal(restored.plans[0].views, 0);
  assert.equal(restored.plans[0].hook, "更新开头");
  assert.equal(projects[0].status.publish, "草稿");
});
test("corrupt health and content stores are never silently replaced", (t) => {
  const dir = setup(t),
    h = createHealth(dir),
    ops = createContentOps(dir);
  for (const relative of ["health/records.json", "content-ops/plans.json"])
    fs.writeFileSync(path.join(dir, relative), "broken");
  assert.throws(() => h.snapshot(), /损坏/);
  assert.throws(() => ops.read(), /损坏/);
  assert.throws(
    () => h.save({ metric: "weight", value: 70, date: "2026-10-17" }),
    /损坏/,
  );
  assert.equal(
    fs.readFileSync(path.join(dir, "health/records.json"), "utf8"),
    "broken",
  );
});
test("health observation import converts units, preserves month precision and is idempotent", t => {
  const dir = setup(t), h = createHealth(dir);
  const input = { sourceUrl: "https://chatgpt.com/health?tab=home", appleHealthConnected: true, observedAt: new Date().toISOString(), records: [
    { metric: "distance", value: 10, unit: "mi", date: "2026-07-16" },
    { metric: "weight", value: 150, unit: "lb", date: "2026-07" },
    { metric: "restingHeartRate", value: 60, unit: "/min", date: "2026-07-16" },
  ] };
  const first = h.importObservation(input);
  assert.equal(first.records[0].value, 16.09);
  assert.equal(first.records[1].value, 68.04);
  assert.equal(first.records[1].date, "2026-07");
  assert.equal(first.records[2].value, 60);
  assert.match(first.records[2].sourceLabel, /60 \/min/);
  h.configureSync({ automationId: "test", scheduleLabel: "QA twice daily" });
  const second = createHealth(dir).importObservation(input);
  assert.equal(second.records.length, 3);
  assert.equal(second.sync.changedCount, 0);
  assert.equal(second.records[0].recordedAt, first.records[0].recordedAt);
  assert.equal(second.connection, "scheduled-browser");
  const failed = h.syncFailure("QA login expired");
  assert.deepEqual(failed.records, second.records);
  assert.equal(failed.sync.lastSuccessAt, second.sync.lastSuccessAt);
  assert.equal(failed.sync.status, "error");
  assert.equal(h.importObservation(input).sync.error, "");
});
test("invalid observation batches cannot partially overwrite health history", t => {
  const dir = setup(t), h = createHealth(dir);
  h.save({metric: "steps", value: 42, date: "2026-07-16"});
  const input = {sourceUrl: "https://chatgpt.com/health", appleHealthConnected: true, observedAt: new Date().toISOString(), records: [{metric: "steps", value: 10, unit: "count", date: "2026-07-16"}]};
  const before = fs.readFileSync(path.join(dir, "health/records.json"), "utf8");
  for (const bad of [
    {...input, appleHealthConnected: false},
    {...input, sourceUrl: "https://example.com/health"},
    {...input, observedAt: "2000-01-01T00:00:00Z"},
    {...input, records: []},
    {...input, records: [...input.records, {metric: "sleep", value: 30, unit: "h", date: "2026-07-16"}]},
    {...input, records: [{...input.records[0], unit: "km"}]},
    {...input, records: [{...input.records[0], value: 1.001}]},
    {...input, records: [{...input.records[0], date: "2999-07-16"}]},
  ]) { assert.throws(() => h.importObservation(bad)); assert.equal(fs.readFileSync(path.join(dir, "health/records.json"), "utf8"), before); }
  fs.writeFileSync(path.join(dir, "health/.write-lock"), "busy");
  assert.throws(() => h.importObservation(input), /正在写入/);
  assert.equal(fs.readFileSync(path.join(dir, "health/records.json"), "utf8"), before);
});
