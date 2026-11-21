const { spawn } = require("child_process"),
  fs = require("fs"),
  os = require("os"),
  path = require("path"),
  assert = require("assert/strict");
const { createChromeCdpPipe } = require("../lib/chrome-cdp-pipe.cjs");
const cdp = require("../lib/publisher/cdp.cjs");
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kaige-publisher-"));
  const file = path.join(root, "fixture.html"),
    video = path.join(root, "fixture.mp4");
  fs.writeFileSync(video, "fixture");
  fs.writeFileSync(
    file,
    `<meta charset="utf-8"><div contenteditable="true" data-testid="tweetTextarea_0"></div><input type="file" data-testid="fileInput"><button id="publish" onclick="window.published=true">发布</button><script>window.published=false</script>`,
  );
  const child = spawn(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      `--user-data-dir=${root}/chrome`,
      "--remote-debugging-pipe",
      "--headless=new",
      "--no-first-run",
      `file://${file}`,
    ],
    { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] },
  );
  const pipe = createChromeCdpPipe(child);
  try {
    let target;
    for (let i = 0; i < 40 && !target; i++) {
      const r = await pipe.send("Target.getTargets");
      target = r.targetInfos.find((t) => t.url.includes("fixture.html"));
      if (!target) await cdp.sleep(200);
    }
    assert.ok(target);
    const session = await pipe.attachSession(target.targetId);
    const tab = { send: (m, p) => pipe.send(m, p, session) };
    await cdp.waitFor(tab, `!!document.querySelector('[contenteditable]')`);
    await require("../lib/publisher/adapters/x.cjs").default.fill({
      tabId: tab,
      video,
      p: { text: "测试标题\n测试正文 #AI" },
      log() {},
      note() {},
    });
    assert.equal(
      await cdp.evaluate(tab, `document.querySelector('input').files[0].name`),
      "fixture.mp4",
    );
    assert.match(
      await cdp.evaluate(
        tab,
        `document.querySelector('[contenteditable]').innerText`,
      ),
      /测试正文/,
    );
    await assert.rejects(
      cdp.click(tab, `document.querySelector('#publish')`),
      /拦截/,
    );
    await assert.rejects(
      cdp.evaluate(tab, `document.querySelector('#publish').click()`),
      /拦截/,
    );
    assert.equal(await cdp.evaluate(tab, "window.published"), false);
    console.log(
      "PASS: real Chrome pipe; video selection and multiline text; real and scripted publication clicks blocked; no TCP debug port",
    );
  } finally {
    await pipe.send("Browser.close").catch(() => {});
    pipe.dispose();
    await new Promise((r) =>
      child.exitCode !== null ? r() : child.once("exit", r),
    );
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
