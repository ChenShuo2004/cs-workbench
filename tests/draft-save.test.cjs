const test = require("node:test");
const assert = require("node:assert/strict");
const { createDraftSaver } = require("../shared/draft-save.mjs");
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
test("flush serializes edits made during save and coalesces simultaneous navigation/save", async () => {
  const first = deferred(),
    second = deferred(),
    writes = [],
    saving = [];
  let draft = { body: "first", dirty: true };
  const saver = createDraftSaver({
    snapshot: () => (draft.dirty ? draft : null),
    write: async (snapshot) => {
      writes.push(snapshot.body);
      await (writes.length === 1 ? first : second).promise;
    },
    acknowledge: (snapshot) => {
      if (draft === snapshot) draft = { ...draft, dirty: false };
    },
    onSaving: (value) => saving.push(value),
  });
  const flush = saver.flush();
  assert.equal(saver.flush(), flush);
  await Promise.resolve();
  draft = { body: "newer input", dirty: true };
  first.resolve();
  await new Promise(setImmediate);
  assert.deepEqual(writes, ["first", "newer input"]);
  assert.equal(draft.dirty, true);
  second.resolve();
  await flush;
  assert.equal(draft.dirty, false);
  assert.deepEqual(saving, [true, false]);
});
test("a failed save preserves the draft and can be retried without acknowledging failure", async () => {
  let draft = { body: "keep me", dirty: true },
    attempts = 0;
  const saver = createDraftSaver({
    snapshot: () => (draft.dirty ? draft : null),
    write: async () => {
      if (++attempts === 1) throw Error("disk unavailable");
    },
    acknowledge: (snapshot) => {
      assert.equal(snapshot, draft);
      draft = { ...draft, dirty: false };
    },
  });
  await assert.rejects(saver.flush(), /disk unavailable/);
  assert.equal(draft.dirty, true);
  await saver.flush();
  assert.equal(attempts, 2);
  assert.equal(draft.dirty, false);
  await saver.flush();
  assert.equal(attempts, 2);
});
