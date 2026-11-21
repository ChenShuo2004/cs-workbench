const fs = require("fs"),
  path = require("path");
function createPostStore(dir) {
  const file = path.join(dir, "posts.json");
  let data = {
    draft: {
      title: "",
      body: "",
      topics: "",
      video: "",
      covers: {},
      overrides: {},
    },
    records: [],
  };
  if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, "utf8"));
  const save = () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file + ".tmp", JSON.stringify(data, null, 2), {
      mode: 0o600,
    });
    fs.renameSync(file + ".tmp", file);
  };
  return {
    read: () => structuredClone(data),
    draft(d) {
      data.draft = d;
      save();
      return this.read();
    },
    record(r) {
      const i = data.records.findIndex((x) => x.id === r.id);
      if (i < 0) data.records.unshift(r);
      else data.records[i] = r;
      save();
    },
    mark(id, url) {
      const r = data.records.find((x) => x.id === id);
      if (!r || r.status !== "待你确认") throw Error("此任务不可标记");
      if (url && !/^https:\/\//.test(url)) throw Error("作品链接需要 HTTPS");
      r.status = "已发布（手动标记）";
      r.url = url;
      save();
      return this.read();
    },
  };
}
module.exports = { createPostStore };
