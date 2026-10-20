const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  parseSRT,
  makeSRT,
  speechRanges,
  validate,
  fresh,
} = require("../lib/studio.cjs");
test("SRT parsing handles Chinese BOM, rejects overlap, and exports kept timeline offsets", () => {
  const clips = parseSRT(
    "\uFEFF1\r\n00:00:01,000 --> 00:00:02,500\r\n你好\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n下一句",
  );
  assert.equal(clips.length, 2);
  assert.equal(clips[0].start, 1);
  assert.match(makeSRT(clips), /00:00:01,500 --> 00:00:02,500/);
  assert.throws(
    () =>
      parseSRT(
        "1\n00:00:01,000 --> 00:00:03,000\n一\n\n2\n00:00:02,000 --> 00:00:04,000\n二",
      ),
    /重叠/,
  );
});
test("silence detection handles leading, trailing and complete silence", () => {
  assert.deepEqual(
    speechRanges(
      "silence_start: 0\nsilence_end: 1\nsilence_start: 3\nsilence_end: 4",
      5,
    ),
    [
      [0.9, 3.1],
      [3.9, 5],
    ],
  );
  assert.deepEqual(speechRanges("silence_start: 0", 2), []);
  assert.deepEqual(speechRanges("", 5), [[0, 5]]);
});
test("timeline validation rejects invalid source bounds and duplicate IDs", () => {
  const s = fresh();
  s.media = [{ id: "a", duration: 2 }];
  s.clips = [
    { id: "c", mediaId: "a", start: 0, end: 3, text: "x", enabled: true },
  ];
  assert.throws(() => validate(s), /超出/);
  s.clips[0].end = 1;
  s.clips.push({ ...s.clips[0] });
  assert.throws(() => validate(s), /重复/);
});
test("canvas projects retain mixed scene, image and video shots with bounded layouts", () => {
  const s = fresh();
  s.media = [
    { id: "image", kind: "image", duration: 5 },
    { id: "video", kind: "video", duration: 3 },
  ];
  s.clips = [
    {
      id: "scene",
      visual: "scene",
      start: 0,
      end: 1,
      text: "场景",
      enabled: true,
    },
    {
      id: "still",
      visual: "media",
      mediaId: "image",
      start: 0,
      end: 8,
      text: "",
      enabled: true,
    },
    {
      id: "movie",
      visual: "media",
      mediaId: "video",
      start: 0,
      end: 2,
      text: "",
      enabled: true,
    },
  ];
  s.canvas = {
    positions: { scene: { x: -500, y: 100 } },
    notes: [{ id: "n", text: "参考", x: 100, y: 0 }],
    view: { x: 0, y: 20, zoom: 0.8 },
  };
  assert.equal(validate(s), s);
  s.clips[2].end = 4;
  assert.throws(() => validate(s), /超出素材范围/);
  s.clips[2].end = 2;
  s.canvas.view.zoom = 0;
  assert.throws(() => validate(s), /画布布局/);
  s.canvas.view.zoom = 1;
  s.canvas.positions.scene.x = Infinity;
  assert.throws(() => validate(s), /画布布局/);
});
