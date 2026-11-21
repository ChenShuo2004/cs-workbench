const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { createMetasoVideo } = require("../lib/metaso-video.cjs");
const token = "mk-" + "x".repeat(32); // Synthetic test credential.
const secureStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s.split("").reverse().join("")),
  decryptString: (b) => b.toString().split("").reverse().join(""),
};
function setup(t, fetchImpl) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "cs-metaso-unit-"));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const provider = createMetasoVideo({ userData, secureStorage, fetchImpl });
  provider.configure(token);
  return { provider, userData };
}
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status });
const job = {
  id: "12345678-1234-1234-1234-123456789abc",
  prompt: "A ship",
  duration: 5,
  aspect: "16:9",
  model: "MiniMax-H3",
  resolution: "2K",
};

test("metaso stores only encrypted credentials and builds the documented request without retry", async (t) => {
  let calls = [];
  const { provider, userData } = setup(t, async (url, init) => {
    calls.push({ url, init });
    return json({ task_id: "task-123" });
  });
  assert.equal(provider.status().ready, true);
  const stored = fs.readFileSync(
    path.join(userData, "studio-generation/metaso-key.enc"),
  );
  assert.equal(stored.includes(token), false);
  assert.equal(
    fs.statSync(path.join(userData, "studio-generation/metaso-key.enc")).mode &
      0o777,
    0o600,
  );
  assert.deepEqual(await provider.submit(job), { request_id: "task-123" });
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://metaso.cn/api/minimax/v2/video_generation",
  );
  assert.equal(calls[0].init.redirect, "error");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    model: "MiniMax-H3",
    content: [{ type: "text", text: "A ship" }],
    resolution: "2K",
    duration: 5,
    ratio: "16:9",
    fast_mode: false,
  });
  assert.throws(() => provider.validate({ ...job, duration: 3 }));
  assert.throws(() => provider.validate({ ...job, resolution: "4K" }));
});

test("metaso first-frame upload is referenced in creation and ratio follows image", async (t) => {
  const calls = [];
  const { provider, userData } = setup(t, async (url, init) => {
    calls.push({ url, init });
    return json(
      url.endsWith("/upload")
        ? { file: { file_id: "image-123" } }
        : { task_id: "task-123" },
    );
  });
  const image = path.join(userData, "first.png");
  await sharp({
    create: { width: 300, height: 300, channels: 3, background: "#fff" },
  })
    .png()
    .toFile(image);
  await provider.submit(job, image);
  assert.equal(calls[0].init.body.get("purpose"), "video_generation_input");
  const body = JSON.parse(calls[1].init.body);
  assert.deepEqual(body.content[1], {
    type: "image_url",
    role: "first_frame",
    image_url: { url: "mm_file://image-123" },
  });
  assert.equal("ratio" in body, false);
});

test("metaso polling keeps failed tasks failed and never leaks credentials or downloads private URLs", async (t) => {
  let result = { task: { status: "processing" } },
    calls = 0;
  const { provider } = setup(t, async () => {
    calls++;
    return json(result);
  });
  assert.deepEqual(await provider.poll({ ...job, remoteId: "task-123" }), {
    status: "running",
  });
  result = {
    task: {
      status: "failed",
      error: { message: `rejected ${token}` },
      content: { url: "https://cdn.example.com/a.mp4" },
    },
  };
  const failed = await provider.poll({ ...job, remoteId: "task-123" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.error.includes(token), false);
  result = {
    task: { status: "success", content: { url: "https://127.0.0.1/video" } },
  };
  await assert.rejects(
    provider.poll({ ...job, remoteId: "task-123" }),
    /地址无效/,
  );
  assert.equal(calls, 3);
  result = { base_resp: { status_code: 1004, status_msg: `invalid ${token}` } };
  await assert.rejects(
    provider.submit(job),
    (e) => !e.message.includes(token) && e.message.includes("拒绝"),
  );
  assert.equal(calls, 4);
});

test("metaso rejects a successful response without a task id without retrying", async (t) => {
  let calls = 0;
  const { provider } = setup(t, async () => {
    calls++;
    return json({ status: "ok" });
  });
  await assert.rejects(provider.submit(job), /任务编号/);
  assert.equal(calls, 1);
});

test("metaso accepts both end frames, supports 4–15 seconds and rejects mixing omni roles before upload", async (t) => {
  const calls = [];
  const { provider, userData } = setup(t, async (url, init) => {
    calls.push({ url, init });
    return json(
      url.endsWith("/upload")
        ? { file: { file_id: String(calls.length) } }
        : { task_id: "task-frames" },
    );
  });
  const image = path.join(userData, "frame.png");
  await sharp({
    create: { width: 300, height: 300, channels: 3, background: "#fff" },
  })
    .png()
    .toFile(image);
  const first = { path: image, role: "first_frame", kind: "image" };
  await provider.submit({ ...job, duration: 4 }, [
    first,
    { ...first, role: "last_frame" },
  ]);
  assert.equal(calls.length, 3);
  const payload = JSON.parse(calls[2].init.body);
  assert.deepEqual(
    payload.content.slice(1).map((x) => x.role),
    ["first_frame", "last_frame"],
  );
  assert.equal(payload.duration, 4);
  assert.equal("ratio" in payload, false);
  await assert.rejects(
    provider.submit(job, [first, { ...first, role: "reference_image" }]),
    /混用/,
  );
  assert.equal(calls.length, 3);
  await provider.submit({ ...job, duration: 7 }, [
    { ...first, role: "reference_image" },
  ]);
  const omni = JSON.parse(calls.at(-1).init.body);
  assert.equal(omni.ratio, "16:9");
  assert.equal(omni.content[1].role, "reference_image");
});

test("omni uploads image, video and audio roles, and rejects aggregate media duration before uploads", async (t) => {
  const { execFileSync } = require("node:child_process");
  const calls = [];
  const { provider, userData } = setup(t, async (url, init) => {
    calls.push({ url, init });
    return json(
      url.endsWith("/upload")
        ? { file: { file_id: String(calls.length) } }
        : { task_id: "omni" },
    );
  });
  const movie = path.join(userData, "video.mp4"),
    audio = path.join(userData, "sound.wav"),
    image = path.join(userData, "image.png");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=320x320:r=24",
    "-t",
    "8",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    movie,
  ]);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=44100",
    "-t",
    "2",
    audio,
  ]);
  await sharp({
    create: { width: 320, height: 320, channels: 3, background: "#fff" },
  })
    .png()
    .toFile(image);
  const refs = [
    { kind: "image", role: "reference_image", path: image },
    { kind: "video", role: "reference_video", path: movie },
    { kind: "audio", role: "reference_audio", path: audio },
  ];
  await provider.submit({ ...job, duration: 9 }, refs);
  assert.equal(calls.length, 4);
  const body = JSON.parse(calls.at(-1).init.body);
  assert.deepEqual(
    body.content.slice(1).map((x) => [x.type, x.role]),
    [
      ["image_url", "reference_image"],
      ["video_url", "reference_video"],
      ["audio_url", "reference_audio"],
    ],
  );
  assert.equal(body.ratio, "16:9");
  await assert.rejects(provider.submit(job, [refs[2]]), /声音参考/);
  await assert.rejects(provider.submit(job, [...refs, refs[1]]), /总时长/);
  assert.equal(
    calls.length,
    4,
    "invalid aggregate duration never uploads or submits",
  );
});

test("legacy 0.5.1 1080P requests 2K and produces a verified 1080p MP4 with audio without submitting again", async (t) => {
  const { execFileSync } = require("node:child_process");
  let submitted = 0,
    downloads = 0,
    payload,
    bytes;
  const { provider, userData } = setup(t, async (url, init) => {
    if (url.includes("/query/"))
      return json({
        task: {
          status: "success",
          content: { url: "https://cdn.example.com/video.mp4" },
        },
      });
    if (url.includes("cdn.example.com")) {
      downloads++;
      return new Response(bytes);
    }
    submitted++;
    payload = JSON.parse(init.body);
    return json({ task_id: "1080-test" });
  });
  const source = path.join(userData, "fixture.mp4");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=green:s=2560x1440:r=24",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000",
    "-t",
    "0.25",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    source,
  ]);
  bytes = fs.readFileSync(source);
  const input = { ...job, resolution: "1080P", legacy1080Transcode: true };
  const response = await provider.submit(input);
  assert.equal(payload.resolution, "2K");
  const result = await provider.poll({
    ...input,
    remoteId: response.request_id,
  });
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-of", "json", result.path],
      { encoding: "utf8" },
    ),
  );
  const video = probe.streams.find((s) => s.codec_type === "video");
  assert.equal(video.width, 1920);
  assert.equal(video.height, 1080);
  assert.ok(probe.streams.some((s) => s.codec_type === "audio"));
  execFileSync("ffmpeg", ["-v", "error", "-i", result.path, "-f", "null", "-"]);
  assert.ok(
    fs.existsSync(path.join(path.dirname(result.path), "source-2k.mp4")),
  );
  await provider.poll({ ...input, remoteId: response.request_id });
  assert.equal(submitted, 1);
  assert.equal(downloads, 1);
});

test("legacy 0.5.1 conversion preserves portrait, square and 4:3 proportions", async (t) => {
  const { execFileSync } = require("node:child_process");
  let bytes;
  const { provider, userData } = setup(t, async (url) =>
    url.includes("/query/")
      ? json({
          task: {
            status: "success",
            content: { url: "https://cdn.example.com/video.mp4" },
          },
        })
      : new Response(bytes),
  );
  for (const [i, dimensions, expected] of [
    [1, "1440x2560", [1080, 1920]],
    [2, "1440x1440", [1080, 1080]],
    [3, "1920x1440", [1440, 1080]],
  ]) {
    const source = path.join(userData, `fixture-${i}.mp4`);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=blue:s=${dimensions}:r=24`,
      "-t",
      "0.1",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      source,
    ]);
    bytes = fs.readFileSync(source);
    const result = await provider.poll({
      ...job,
      id: `12345678-1234-1234-1234-123456789ab${i}`,
      remoteId: "ratio-test",
      legacy1080Transcode: true,
      resolution: "1080P",
    });
    const info = JSON.parse(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_streams", "-of", "json", result.path],
        { encoding: "utf8" },
      ),
    );
    assert.deepEqual([info.streams[0].width, info.streams[0].height], expected);
  }
});

test("H3 and Seedance send native 1080p with model-specific parameters", async (t) => {
  const calls = [];
  const { provider, userData } = setup(t, async (url, init) => {
    calls.push({ url, init });
    return json(
      url.endsWith("/upload")
        ? { file: { file_id: "frame" } }
        : { task_id: "native" },
    );
  });
  assert.deepEqual(provider.status().models, ["MiniMax-H3", "seedance-2.0"]);
  for (const model of provider.status().models) {
    await provider.submit({ ...job, model, resolution: "1080P" });
    const body = JSON.parse(calls.at(-1).init.body);
    assert.equal(body.model, model);
    assert.equal(body.resolution, "1080p");
    assert.equal(body.ratio, "16:9");
    assert.equal("fast_mode" in body, model === "MiniMax-H3");
    if (model === "seedance-2.0") assert.equal(body.context_ir_enabled, false);
  }
  assert.throws(() =>
    provider.validate({ ...job, model: "seedance-2.0", resolution: "2K" }),
  );
  assert.throws(() =>
    provider.validate({ ...job, model: "invented", resolution: "1080P" }),
  );
  const image = path.join(userData, "frame.png");
  await sharp({
    create: { width: 300, height: 300, channels: 3, background: "#fff" },
  })
    .png()
    .toFile(image);
  await provider.submit(
    { ...job, model: "seedance-2.0", resolution: "720P" },
    image,
  );
  const body = JSON.parse(calls.at(-1).init.body);
  assert.equal(body.ratio, "adaptive");
  assert.equal(body.resolution, "720p");
  assert.equal(body.content[1].role, "first_frame");
});

test("native 1080P preserves provider bytes and rejects unexpected 2K without transcoding", async (t) => {
  const { execFileSync } = require("node:child_process");
  let bytes;
  const { provider, userData } = setup(t, async (url) =>
    url.includes("/query/")
      ? json({
          task: {
            status: "success",
            content: { url: "https://cdn.example.com/native.mp4" },
          },
        })
      : new Response(bytes),
  );
  for (const [size, valid] of [
    ["1920x1080", true],
    ["2560x1440", false],
  ]) {
    const fixture = path.join(userData, size + ".mp4");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=blue:s=${size}:r=24`,
      "-t",
      "0.1",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      fixture,
    ]);
    bytes = fs.readFileSync(fixture);
    const native = {
      ...job,
      resolution: "1080P",
      nativeResolution: true,
      remoteId: "native",
    };
    if (valid) {
      const result = await provider.poll(native);
      assert.deepEqual(
        fs.readFileSync(result.path),
        bytes,
        "No re-encoding of provider output",
      );
      assert.ok(
        !fs.existsSync(path.join(path.dirname(result.path), "source-2k.mp4")),
      );
    } else await assert.rejects(provider.poll(native), /不是原生 1080P/);
  }
});
