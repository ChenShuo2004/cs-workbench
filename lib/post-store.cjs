const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function emptyDraft() {
  return {
    title: "",
    body: "",
    topics: "",
    video: "",
    covers: {},
    overrides: {},
  };
}

function normalizeDraft(d) {
  const base = emptyDraft();
  if (!d || typeof d !== "object") return base;
  return {
    title: String(d.title || ""),
    body: String(d.body || ""),
    topics: String(d.topics || ""),
    video: String(d.video || ""),
    covers:
      d.covers && typeof d.covers === "object" ? { ...d.covers } : {},
    overrides:
      d.overrides && typeof d.overrides === "object"
        ? structuredClone(d.overrides)
        : {},
  };
}

function deriveDraftName(draft, fallback = "未命名草稿") {
  const title = String(draft?.title || "").trim();
  if (title) return title.slice(0, 32);
  if (draft?.video) {
    const base = path.basename(String(draft.video)).replace(/\.[^.]+$/, "");
    if (base) return base.slice(0, 32);
  }
  return fallback;
}

function createPostStore(dir) {
  const file = path.join(dir, "posts.json");
  const now = () => new Date().toISOString();

  function makeInitialData() {
    const first = emptyDraft();
    return {
      draft: first,
      activeDraftId: "default",
      drafts: [
        {
          id: "default",
          name: "未命名草稿",
          updatedAt: now(),
          draft: structuredClone(first),
        },
      ],
      records: [],
    };
  }

  let data = makeInitialData();
  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const legacyDraft = normalizeDraft(raw.draft);
    const records = Array.isArray(raw.records) ? raw.records : [];
    let drafts = Array.isArray(raw.drafts)
      ? raw.drafts
          .filter((item) => item && typeof item === "object" && item.id)
          .map((item) => {
            const norm = normalizeDraft(item.draft);
            return {
              id: String(item.id),
              name: String(item.name || deriveDraftName(norm)),
              updatedAt: String(item.updatedAt || now()),
              draft: norm,
            };
          })
      : [];
    if (!drafts.length) {
      drafts = [
        {
          id: "default",
          name: deriveDraftName(legacyDraft),
          updatedAt: now(),
          draft: structuredClone(legacyDraft),
        },
      ];
    }
    const activeDraftId = drafts.some((d) => d.id === raw.activeDraftId)
      ? raw.activeDraftId
      : drafts[0].id;
    const active = drafts.find((d) => d.id === activeDraftId) || drafts[0];
    data = {
      draft: structuredClone(active.draft),
      activeDraftId: active.id,
      drafts,
      records,
    };
  }

  const syncActiveMirror = () => {
    const active =
      data.drafts.find((item) => item.id === data.activeDraftId) ||
      data.drafts[0];
    if (!active) {
      const fresh = {
        id: randomUUID(),
        name: "未命名草稿",
        updatedAt: now(),
        draft: emptyDraft(),
      };
      data.drafts = [fresh];
      data.activeDraftId = fresh.id;
      data.draft = structuredClone(fresh.draft);
      return;
    }
    data.activeDraftId = active.id;
    data.draft = structuredClone(active.draft);
  };

  const save = () => {
    syncActiveMirror();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file + ".tmp", JSON.stringify(data, null, 2), {
      mode: 0o600,
    });
    fs.renameSync(file + ".tmp", file);
  };

  return {
    read: () => structuredClone(data),
    draft(d) {
      const norm = normalizeDraft(d);
      let active = data.drafts.find((item) => item.id === data.activeDraftId);
      if (!active) {
        active = {
          id: data.activeDraftId || "default",
          name: deriveDraftName(norm),
          updatedAt: now(),
          draft: norm,
        };
        data.drafts.unshift(active);
      } else {
        active.draft = norm;
        active.name = deriveDraftName(norm, active.name || "未命名草稿");
        active.updatedAt = now();
      }
      data.draft = structuredClone(norm);
      save();
      return this.read();
    },
    createDraft(initial) {
      const norm = normalizeDraft(initial);
      const item = {
        id: randomUUID(),
        name: deriveDraftName(norm, `草稿 ${data.drafts.length + 1}`),
        updatedAt: now(),
        draft: norm,
      };
      data.drafts.unshift(item);
      data.activeDraftId = item.id;
      data.draft = structuredClone(norm);
      save();
      return this.read();
    },
    duplicateDraft(id) {
      const source =
        data.drafts.find((item) => item.id === id) ||
        data.drafts.find((item) => item.id === data.activeDraftId);
      const cloned = normalizeDraft(source?.draft);
      const baseName = source?.name || deriveDraftName(cloned);
      const item = {
        id: randomUUID(),
        name: `${baseName.replace(/（副本\d*）$/, "")}（副本）`.slice(0, 36),
        updatedAt: now(),
        draft: cloned,
      };
      data.drafts.unshift(item);
      data.activeDraftId = item.id;
      data.draft = structuredClone(cloned);
      save();
      return this.read();
    },
    selectDraft(id) {
      const target = data.drafts.find((item) => item.id === id);
      if (!target) throw Error("找不到指定草稿");
      data.activeDraftId = target.id;
      data.draft = structuredClone(target.draft);
      save();
      return this.read();
    },
    deleteDraft(id) {
      const idx = data.drafts.findIndex((item) => item.id === id);
      if (idx < 0) return this.read();
      data.drafts.splice(idx, 1);
      if (!data.drafts.length) {
        const fresh = emptyDraft();
        data.drafts.push({
          id: randomUUID(),
          name: "未命名草稿",
          updatedAt: now(),
          draft: fresh,
        });
      }
      if (data.activeDraftId === id) {
        data.activeDraftId = data.drafts[0].id;
      }
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
