// Packaging only: preserve avatar artwork; generate platform sizes and render the editable HTML cover.
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");
const assets = path.join(root, "assets");
const avatar = path.join(assets, "branding/kai-avatar.png");
(async () => {
  const iconset = path.join(root, "out/kai.iconset");
  fs.mkdirSync(iconset, { recursive: true });
  for (const size of [16, 32, 128, 256, 512])
    for (const scale of [1, 2]) {
      await sharp(avatar)
        .resize(size * scale, size * scale, {
          fit: "contain",
          background: "#fff",
        })
        .png()
        .toFile(
          path.join(
            iconset,
            `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`,
          ),
        );
    }
  execFileSync("/usr/bin/iconutil", [
    "-c",
    "icns",
    iconset,
    "-o",
    path.join(assets, "icon.icns"),
  ]);
  await sharp(avatar)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(assets, "branding/icon-1024.png"));
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
    });
    await page.goto(
      pathToFileURL(path.join(assets, "branding/cover.html")).href,
    );
    await page.evaluate(() =>
      Promise.all([...document.images].map((img) => img.decode())),
    );
    await page.screenshot({
      path: path.join(assets, "branding/CS工作台-KAI封面.png"),
    });
  } finally {
    await browser.close();
  }
  const meta = {
    identity: "kai-duo-v3-2d-3d-approved / kai_boy",
    reference:
      "/Users/chenshuo/Documents/ChatGPT/陈硕 video/角色设定/references/kai_3d_ref.png",
    generatedSource:
      "/Users/chenshuo/.codex/generated_images/01a14c80-4086-7f93-aa9a-6004d6101b7f/exec-10817e8c-2ee1-4086-ab75-109f28af9388.png",
    avatarSha256: crypto
      .createHash("sha256")
      .update(fs.readFileSync(avatar))
      .digest("hex"),
    date: "2026-10-18",
    outputs: [
      "assets/icon.icns",
      "assets/branding/icon-1024.png",
      "assets/branding/CS工作台-KAI封面.png",
    ],
    coverSource: "assets/branding/cover.html",
    rebuild: "node scripts/build-branding.cjs",
    note: "KAI boy selected explicitly by user. Avatar generated from approved 3D master; icon sizes preserve artwork; cover is an editable HTML layout using that same avatar.",
  };
  fs.writeFileSync(
    path.join(assets, "branding/manifest.json"),
    JSON.stringify(meta, null, 2) + "\n",
  );
  console.log(JSON.stringify(meta, null, 2));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
