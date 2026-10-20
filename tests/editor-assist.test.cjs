const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  checkSettings,
  fingerprint,
  parsePlan,
  snapEnd,
  detectTempo,
} = require("../lib/editor-assist.cjs");
const { fresh, withGaps, makeSRT } = require("../lib/studio.cjs");
function sample() {
  return {
    ...fresh(),
    media: [{ id: "media", duration: 20, hasAudio: true }],
    clips: [
      {
        id: "one",
        mediaId: "media",
        start: 0,
        end: 5,
        text: "观点",
        enabled: true,
      },
      {
        id: "two",
        mediaId: "media",
        start: 5,
        end: 8,
        text: "重复",
        enabled: true,
      },
      {
        id: "three",
        mediaId: "media",
        start: 8,
        end: 13,
        text: "结论",
        enabled: true,
      },
    ],
  };
}
test("subtitle gaps preserve source duration and SRT timestamps without empty cues", () => {
  const c = withGaps(
    [{ id: "spoken", start: 1, end: 2, text: "你好" }],
    "source",
    4,
  );
  assert.equal(
    c.reduce((n, c) => n + c.end - c.start, 0),
    4,
  );
  assert.equal(c.length, 3);
  assert.equal(makeSRT(c), "1\n00:00:01,000 --> 00:00:02,000\n你好\n");
  assert.throws(() => withGaps([{ start: 3, end: 5 }], "x", 4), /超出/);
});
test("Agent edits reject stale, fabricated, over-trimmed and out-of-range proposals", () => {
  const s = sample(),
    fp = fingerprint(s),
    cut = { ...s.clips[1], enabled: false, reason: "重复" };
  const plan = parsePlan(
    s,
    JSON.stringify({ summary: "保留观点", cuts: [cut] }),
    fp,
  );
  assert.equal(plan.after, 10);
  assert.equal(plan.changes.length, 1);
  assert.equal(s.clips[1].enabled, true);
  assert.throws(
    () =>
      parsePlan(s, JSON.stringify({ cuts: [{ ...cut, id: "unknown" }] }), fp),
    /未知/,
  );
  assert.throws(
    () => parsePlan(s, JSON.stringify({ cuts: [{ ...cut, start: 0 }] }), fp),
    /越界/,
  );
  assert.throws(
    () =>
      parsePlan(
        s,
        JSON.stringify({
          cuts: s.clips.map((c) => ({ ...c, enabled: false })),
        }),
        fp,
      ),
    /45%/,
  );
  assert.throws(
    () => parsePlan({ ...s, clips: s.clips.slice(1) }, "{}", fp),
    /已变化/,
  );
});
test("sound settings and beat nudges protect source and voice boundaries", () => {
  const s = sample();
  s.audio = { musicId: "media", musicOffset: 21 };
  assert.throws(() => checkSettings(s), /音乐起点/);
  s.audio = { musicId: "media", musicOffset: 0 };
  s.clips[0].voiceId = "media";
  s.clips[0].voiceStart = 19;
  assert.throws(() => checkSettings(s), /配音/);
  s.clips[0].voiceStart = 0;
  s.clips[0].end = 4.9;
  s.rhythm = { bpm: 120, offset: 0 };
  assert.equal(snapEnd(s, "one").clips[0].end, 5);
  s.rhythm = { bpm: 60, offset: 0.4 };
  assert.throws(() => snapEnd(s, "one"), /0.18/);
});
test("energy onset estimates periodic 120 BPM clicks and rejects silence", () => {
  const rate = 8000,
    buf = Buffer.alloc(rate * 12 * 4);
  for (let i = 0; i < rate * 12; i++) {
    const phase = (i % (rate * 0.5)) / rate;
    buf.writeFloatLE(
      phase < 0.04
        ? Math.exp(-phase * 120) * Math.sin((i * 2 * Math.PI * 800) / rate)
        : 0,
      i * 4,
    );
  }
  const result = detectTempo(buf, rate);
  assert.ok(Math.abs(result.bpm - 120) <= 2);
  assert.ok(result.confidence > 0.7);
  assert.throws(() => detectTempo(Buffer.alloc(rate * 5 * 4)), /瞬态/);
});

test("tempo remains 120 BPM with a quiet sustained music bed", () => {
  const rate = 8000,
    b = Buffer.alloc(rate * 12 * 4);
  for (let i = 0; i < rate * 12; i++) {
    const p = (i % (rate * 0.5)) / rate;
    b.writeFloatLE(
      0.025 * Math.sin((i * 2 * Math.PI * 220) / rate) +
        (p < 0.04
          ? 0.25 * Math.exp(-p * 120) * Math.sin((i * 2 * Math.PI * 800) / rate)
          : 0),
      i * 4,
    );
  }
  assert.ok(Math.abs(detectTempo(b).bpm - 120) <= 2);
});
