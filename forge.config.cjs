module.exports = {
  packagerConfig: {
    name: "CS 工作台",
    executableName: "CS 工作台",
    appBundleId: "ai.chenshuo.csworkbench",
    icon: "assets/icon",
    asar: true,
    ignore: [
      /^\/out($|\/)/,
      /^\/release($|\/)/,
      /^\/tests($|\/)/,
      /^\/src($|\/)/,
      /^\/产品蓝图-v0\.1\.md$/,
      /^\/README\.md$/,
    ],
  },
  makers: [{ name: "@electron-forge/maker-zip", platforms: ["darwin"] }],
};
