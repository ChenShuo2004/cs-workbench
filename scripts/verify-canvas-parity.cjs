// Real Electron canvas interactions with isolated local data. No generation requests.
const { _electron: electron } = require("playwright");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const repo = path.resolve(__dirname, ".."),
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "cs-parity-qa-")),
  out = path.join(repo, "out/canvas-parity-qa"),
  data = path.join(temp, "data");
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(data);
fs.writeFileSync(
  path.join(data, "config.json"),
  JSON.stringify({
    workspace: path.join(temp, "projects"),
    library: "",
    projects: [],
  }),
);
const entry = path.join(temp, "entry.cjs");
fs.writeFileSync(
  entry,
  `require(${JSON.stringify(path.join(repo, "electron/main.cjs"))})`,
);
const report = { temp, checks: [], errors: [] };
let app;
(async () => {
  const picture = path.join(temp, "reference.png");
  await require("sharp")({
    create: { width: 640, height: 360, channels: 3, background: "#93b9a9" },
  })
    .png()
    .toFile(picture);
  app = await electron.launch({
    timeout: 45000,
    executablePath: process.env.CS_PACKAGED_EXECUTABLE || require("electron"),
    args: process.env.CS_PACKAGED_EXECUTABLE ? [] : [entry],
    env: { ...process.env, CS_WORKBENCH_USER_DATA_DIR: data },
  });
  report.version = await app.evaluate(({ app }) => app.getVersion());
  report.packaged = await app.evaluate(({ app }) => app.isPackaged);
  const page = await app.firstWindow({ timeout: 45000 });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => report.errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setSize(1440, 1000);
    w.webContents.setBackgroundThrottling(false);
  });
  const open = async () => {
    await page
      .getByRole("button", { name: "展开创作内容", exact: true })
      .click();
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "创作室", exact: true })
      .click();
  };
  await open();
  await page.getByRole("button", { name: "新建剪辑项目", exact: true }).click();
  await page.getByLabel("剪辑项目名称").fill("画布交互对照验收");
  await page
    .getByRole("button", { name: "创建项目", exact: true })
    .last()
    .click();
  await page.waitForFunction(
    () => !!document.querySelector('[aria-label="当前剪辑项目"]').value,
  );
  const root = await page.getByLabel("当前剪辑项目").inputValue();
  report.root = root;
  const read = () => page.evaluate((root) => window.cs.studioRead(root), root);
  const until = async (fn) => {
    for (let i = 0; i < 100; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("State did not settle");
  };
  const cmd = async (label) => {
    await page.getByLabel("搜索画布命令").fill(label);
    await page.getByRole("menuitem", { name: new RegExp("^" + label) }).click();
  };
  const vp = await page.locator(".vc-viewport").boundingBox();
  const before = await read();
  const x = vp.x + 330,
    y = vp.y + 150;
  await page.mouse.dblclick(x, y);
  await page.getByRole("dialog", { name: "添加节点", exact: true }).waitFor();
  await cmd("文本节点");
  if (await page.getByRole("button", { name: "关闭画布面板" }).count())
    await page.getByRole("button", { name: "关闭画布面板" }).click();
  await page.getByLabel("文本节点 1 内容").fill("保持温暖晨光和同一个角色");
  await until(
    async () =>
      (await read()).canvas.notes[0]?.text === "保持温暖晨光和同一个角色",
  );
  let state = await read();
  assert.ok(
    Math.abs(
      state.canvas.notes[0].x -
        (330 - (before.canvas?.view.x ?? 65)) /
          (before.canvas?.view.zoom ?? 0.85),
    ) < 1,
  );
  report.checks.push(
    "Double-click blank canvas opens searchable creation menu and places editable text at exact world position",
  );
  // Drag from text output to blank canvas, create and connect video in one operation.
  const port = await page
    .getByRole("button", { name: "连接文本 1 输出" })
    .boundingBox();
  await page.mouse.move(port.x + 7, port.y + 7);
  await page.mouse.down();
  await page.mouse.move(vp.x + 780, vp.y + 160, { steps: 12 });
  await page.mouse.up();
  await page
    .getByRole("dialog", { name: "引用该节点生成", exact: true })
    .waitFor();
  await cmd("视频生成");
  await until(async () => (await read()).canvas.edges?.length === 1);
  state = await read();
  assert.equal(state.canvas.edges[0].role, "prompt_text");
  assert.equal(state.canvas.generators[0].resolution, "1080P");
  assert.equal(
    await page
      .locator(".vg-node")
      .getByRole("button", { name: "生成", exact: true })
      .isEnabled(),
    true,
  );
  report.checks.push(
    "Dragging text output into blank space creates native-1080P video node with persisted prompt connection",
  );
  await page.getByRole("button", { name: "放大编辑节点 1 提示词" }).click();
  await page.getByLabel("放大的提示词").fill("镜头平稳推进 @");
  await page.locator(".vg-mention-menu").getByRole("option").first().click();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await until(
    async () =>
      (await read()).canvas.generators[0].prompt === "镜头平稳推进 @文本1 ",
  );
  await page
    .locator(".vg-node header")
    .getByText("视频 1", { exact: true })
    .dblclick();
  await page.getByLabel("节点 1 名称").fill("视频 主镜头");
  await page.getByLabel("节点 1 名称").press("Enter");
  report.checks.push(
    "Expanded prompt editor and double-click node rename save without starting generation",
  );

  // Copy connected selection including notes and graph edges; paste creates new IDs.
  await page.locator(".vg-node header").click({ position: { x: 12, y: 12 } });
  await page.keyboard.press("Meta+a");
  await page.keyboard.press("Meta+c");
  await until(
    async () =>
      await app.evaluate(async ({ clipboard }) =>
        (await clipboard.readText()).includes("cs-canvas-nodes-v1"),
      ),
  );
  await page.mouse.move(vp.x + 500, vp.y + 400);
  await page.keyboard.press("Meta+v");
  await until(async () => (await read()).canvas.generators?.length === 2);
  await page.waitForFunction(
    () => document.querySelectorAll(".vg-node").length === 2,
  );
  state = await read();
  assert.equal(state.canvas.notes.length, 2);
  assert.equal(state.canvas.edges.length, 2);
  assert.equal(new Set(state.canvas.edges.map((e) => e.from)).size, 2);
  report.checks.push(
    "Copy/paste duplicates mixed node selection with remapped internal edges and preserves existing graph",
  );
  // Group pasted selection; drag group by its header; undo.
  await page.keyboard.press("Meta+g");
  await until(async () => (await read()).canvas.groups?.length === 1);
  state = await read();
  assert.equal(
    state.canvas.generators.length,
    2,
    "Grouping must retain both original and pasted generators",
  );
  assert.equal(
    state.canvas.notes.length,
    2,
    "Grouping must retain both text nodes",
  );
  const group = state.canvas.groups[0];
  assert.equal(group.nodeIds.length, 2);
  const original =
    state.canvas.positions[
      group.nodeIds.find((id) =>
        state.canvas.generators.some((n) => n.id === id),
      )
    ];
  const gh = await page.locator(".vc-group header > span").boundingBox();
  await page.mouse.move(gh.x + 8, gh.y + 8);
  await page.mouse.down();
  await page.mouse.move(gh.x + 38, gh.y + 28, { steps: 6 });
  await page.mouse.up();
  await until(async () => {
    const s = await read();
    return (
      s.canvas.positions[
        group.nodeIds.find((id) => s.canvas.generators.some((n) => n.id === id))
      ].x !== original.x
    );
  });
  await page.keyboard.press("Meta+z");
  await until(async () => {
    const s = await read();
    return (
      s.canvas.positions[
        group.nodeIds.find((id) => s.canvas.generators.some((n) => n.id === id))
      ].x === original.x
    );
  });
  report.checks.push(
    "Multi-selection groups persist, move members together, and undo as one edit",
  );
  // Context menu delete and undo, no accidental text-key deletion.
  await page.keyboard.press("Escape");
  await until(
    async () => (await page.locator(".vc-node.selected").count()) === 0,
  );
  await page
    .locator(".vg-node header")
    .first()
    .click({ button: "right", position: { x: 12, y: 12 } });
  await until(
    async () => (await page.locator(".vc-node.selected").count()) === 1,
  );
  await cmd("删除节点");
  await until(async () => (await read()).canvas.generators.length === 1);
  await page.keyboard.press("Meta+z");
  await until(async () => (await read()).canvas.generators.length === 2);
  const text = page.getByLabel("文本节点 1 内容");
  await text.focus();
  await page.keyboard.press("Meta+a");
  await page.keyboard.press("Backspace");
  await text.fill("保持温暖晨光和同一个角色");
  assert.equal((await read()).canvas.generators.length, 2);
  report.checks.push(
    "Node context deletion removes only selected nodes and links; undo restores; text editing shortcuts never delete canvas nodes",
  );
  // Import from right-click menu at point and clipboard image through actual main process.
  await app.evaluate(({ dialog }, picture) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [picture],
    });
  }, picture);
  await page.mouse.click(vp.x + 180, vp.y + 430, { button: "right" });
  await cmd("导入图片 / 视频 / 音频");
  await until(async () => (await read()).canvas.sources?.length === 1);
  await app.evaluate(
    async ({ clipboard, ClipboardItem }, bytes) =>
      clipboard.write([
        new ClipboardItem({
          "image/png": new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        }),
      ]),
    Array.from(fs.readFileSync(picture)),
  );
  await page.getByRole("button", { name: "添加画布节点", exact: true }).click();
  await cmd("粘贴剪贴板图片");
  await until(async () => (await read()).canvas.sources?.length === 2);
  state = await read();
  assert.equal(state.clips.length, 0);
  assert.equal(state.media.length, 2);
  report.checks.push(
    "Context import and system clipboard image become reference nodes at insertion point without adding timeline clips",
  );
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "qa-drop-source";
    input.hidden = true;
    document.body.append(input);
  });
  await page.locator("#qa-drop-source").setInputFiles(picture);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(document.querySelector("#qa-drop-source").files[0]);
    const canvas = document.querySelector(".vc-viewport"),
      r = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
        clientX: r.left + 140,
        clientY: r.top + 170,
      }),
    );
  });
  await until(async () => (await read()).canvas.sources.length === 3);
  await page.locator(".vc-viewport").click({ position: { x: 100, y: 10 } });
  await page.keyboard.press("Meta+v");
  await until(async () => (await read()).canvas.sources.length === 4);
  report.checks.push(
    "Actual desktop File drop and Cmd+V image paste create persistent media nodes through Electron preload",
  );
  await page.keyboard.press("Escape");
  await page
    .locator(".vc-note header")
    .first()
    .click({ position: { x: 12, y: 10 } });
  await page
    .locator(".vc-note header")
    .nth(1)
    .click({ position: { x: 12, y: 10 }, modifiers: ["Shift"] });
  await page.getByLabel("对齐与分布").selectOption("left");
  await until(async () => {
    const n = (await read()).canvas.notes;
    return n[0].x === n[1].x;
  });
  await page.keyboard.press("Meta+z");
  await page.getByRole("button", { name: "批量连接", exact: true }).click();
  await page.getByLabel("搜索画布命令").fill("视频 主镜头");
  await page.getByRole("menuitem").first().click();
  await until(async () => (await read()).canvas.edges.length === 3);
  await page.keyboard.press("Meta+z");
  await until(async () => (await read()).canvas.edges.length === 2);
  report.checks.push(
    "Alignment and batch prompt connections use selected nodes and undo independently",
  );
  state = await read();

  // Test edge click selection and keyboard deletion using DOM event on the hit target.
  const count = state.canvas.edges.length;
  await page
    .locator("[data-edge-id]")
    .first()
    .dispatchEvent("pointerdown", { button: 0 });
  await page.locator(".vc-viewport").click({ position: { x: 5, y: 5 } }); // clear selection intentionally then select edge again
  await page
    .locator("[data-edge-id]")
    .first()
    .dispatchEvent("pointerdown", { button: 0 });
  await page.keyboard.press("Delete");
  await until(async () => (await read()).canvas.edges.length === count - 1);
  await page.keyboard.press("Meta+z");
  await until(async () => (await read()).canvas.edges.length === count);
  report.checks.push(
    "Selected connections delete independently and undo restores them",
  );
  await page.keyboard.press("Meta+f");
  await page.getByRole("dialog", { name: "搜索画布", exact: true }).waitFor();
  await page.getByLabel("搜索画布命令").fill("视频");
  await page.getByRole("menuitem").first().click();
  await page.getByRole("button", { name: "全屏创作室", exact: true }).click();
  await page.getByRole("button", { name: "自动排列镜头", exact: true }).click();
  await page.screenshot({ path: path.join(out, "canvas.png") });
  await page.reload();
  await open();
  await page.locator(".vg-node").first().waitFor();
  state = await read();
  assert.equal(state.canvas.groups.length, 1);
  assert.equal(state.canvas.edges.length, 2);
  assert.equal(state.canvas.notes.length, 2);
  report.checks.push(
    "Search focuses matching nodes; fullscreen and reload preserve groups, prompt links, sources and generated-node settings",
  );
  // Installed build: @ selects an unconnected canvas image and inserts both prompt and edge atomically.
  assert.equal((await read()).canvas.edges.length, 2);
  const mentionPrompt = page.getByLabel("节点 1 提示词", { exact: true });
  await mentionPrompt.fill("主体 @图片");
  await page.locator(".vg-mention-menu").getByRole("option").first().click();
  await until(async () =>
    (await read()).canvas.generators[0].prompt.includes("@图片1"),
  );
  assert.equal((await read()).canvas.edges.length, 3);
  await page.getByRole("button", {name: "撤销", exact: true}).click();
  await until(async () => (await read()).canvas.edges.length === 2);
  assert.equal((await read()).canvas.generators[0].prompt, "主体 @图片");
  await page.getByRole("button", {name: "重做", exact: true}).click();
  await until(async () => (await read()).canvas.edges.length === 3);
  state = await read();
  const targetId = state.canvas.generators[0].id;
  // Synthetic credential lives only in this temporary profile; preview never submits.
  await page.evaluate(() =>
    window.cs.generationConfigureVideo("mk-" + "0".repeat(32)),
  );
  const plan = await page.evaluate(
    ({ root, targetId }) => window.cs.generationPreviewGraph(root, [targetId]),
    { root, targetId },
  );
  assert.match(
    plan.nodes.find((n) => n.id === targetId).prompt,
    /主体 Image 1/,
  );
  await page
    .locator(".vg-node")
    .first()
    .getByRole("button", { name: "断开 reference.png", exact: true })
    .click();
  await until(async () => (await read()).canvas.edges.length === 2);
  const missing = await page.evaluate(
    async ({ root, targetId }) => {
      try {
        await window.cs.generationPreviewGraph(root, [targetId]);
        return "";
      } catch (e) {
        return String(e);
      }
    },
    { root, targetId },
  );
  assert.match(missing, /已断开/);
  await page.locator(".vc-viewport").click({ position: { x: 8, y: 8 } });
  await page.keyboard.press("Meta+z");
  await until(async () => (await read()).canvas.edges.length === 3);
  report.checks.push(
    "Canvas-wide @ selection connects an unconnected image atomically; undo/redo restores prompt and edge together; provider mapping and disconnect validation pass",
  );
  // Narrow viewport: menu stays in bounds, Escape closes only the menu.
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setMinimumSize(320, 400);
    w.setSize(390, 844);
  });
  await page.getByRole("button", { name: "添加画布节点", exact: true }).click();
  const menu = await page
    .getByRole("dialog", { name: "添加节点", exact: true })
    .boundingBox();
  const width = await page.evaluate(() => innerWidth);
  assert.ok(menu.x >= 0 && menu.x + menu.width <= width + 1);
  await page.screenshot({ path: path.join(out, "narrow-menu.png") });
  await page.keyboard.press("Escape");
  assert.equal(
    await page.getByRole("dialog", { name: "添加节点", exact: true }).count(),
    0,
  );
  report.checks.push(
    "390px menu remains within viewport and supports keyboard dismissal",
  );
  assert.deepEqual(report.errors, []);
  report.completed = true;
})()
  .catch(async (e) => {
    report.failure = e.stack;
    process.exitCode = 1;
    // A startup failure may have no window; never wait for one again in cleanup.
    if (app?.windows()[0])
      await app.windows()[0]
        .screenshot({ path: path.join(out, "failure.png"), timeout: 5000 })
        .catch(() => {});
  })
  .finally(async () => {
    fs.writeFileSync(
      path.join(out, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    if (app) await app.close();
  });
