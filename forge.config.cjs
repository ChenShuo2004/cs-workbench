const path = require("node:path");
const { promisify } = require("node:util");
const execFile = promisify(require("node:child_process").execFile);

module.exports = {
  packagerConfig: {
    name: "Kaige-work",
    executableName: "Kaige-work",
    appBundleId: "ai.chenshuo.cswork",
    icon: "assets/icon",
    asar: { unpack: "{**/*.node,**/*.dylib}" },
    ignore: [
      /^\/out($|\/)/,
      /^\/release($|\/)/,
      /^\/tests($|\/)/,
      /^\/src($|\/)/,
      /^\/extras($|\/)/,
      /^\/workspace-projects($|\/)/,
      /^\/产品蓝图-v0\.1\.md$/,
      /^\/README\.md$/,
    ],
  },
  hooks: {
    postPackage: async (_config, { platform, outputPaths }) => {
      if (platform !== "darwin") return;
      for (const output of outputPaths) {
        const bundle = path.join(output, "Kaige-work.app");
        // Packager changes Electron resources; renew the local ad-hoc signature.
        await execFile("/usr/bin/xattr", ["-cr", bundle]);
        await execFile("/usr/bin/codesign", [
          "--force",
          "--deep",
          "--sign",
          "-",
          bundle,
        ]);
        await execFile("/usr/bin/codesign", ["--verify", "--deep", bundle]);
      }
    },
  },
  makers: [{ name: "@electron-forge/maker-zip", platforms: ["darwin"] }],
};
