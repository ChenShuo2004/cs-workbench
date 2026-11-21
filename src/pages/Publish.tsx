import React, { useEffect, useState, useRef } from "react";
import type {
  PlatformAccount,
  PostDraft,
  PostRecord,
  AccountPlatform,
} from "../types";
import platforms from "../../shared/account-platforms.json";
import rules from "../../shared/platform-rules.json";
const empty: PostDraft = {
  title: "",
  body: "",
  topics: "",
  video: "",
  covers: {},
  overrides: {},
};
export function Publish({
  accounts,
  onOpenAccounts,
  onNotice,
}: {
  accounts: PlatformAccount[];
  onOpenAccounts: () => void;
  onNotice: (s: string, e?: boolean) => void;
}) {
  const [d, D] = useState<PostDraft>(empty),
    [records, R] = useState<PostRecord[]>([]),
    [ids, I] = useState<string[]>([]),
    [platform, P] = useState("master"),
    [ready, S] = useState(false),
    [busy, B] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    let live = true;
    window.cs
      .postsRead()
      .then((s) => {
        if (live) {
          D(s.draft);
          R(s.records);
          S(true);
        }
      })
      .catch((e) => onNotice(String(e), true));
    const t = setInterval(
      () =>
        window.cs
          .postsRead()
          .then((s) => {
            if (live) R(s.records);
          })
          .catch(() => {}),
      1500,
    );
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const n = ++revision.current;
    const t = setTimeout(
      () =>
        window.cs.postsDraft(d).catch((e) => {
          if (n === revision.current)
            onNotice("草稿保存失败：" + String(e), true);
        }),
      500,
    );
    return () => clearTimeout(t);
  }, [d, ready]);
  const p = platform === "master" ? d : { ...d, ...d.overrides[platform] };
  const edit = (key: "title" | "body" | "topics", v: string) =>
    D((x) =>
      platform === "master"
        ? { ...x, [key]: v }
        : {
            ...x,
            overrides: {
              ...x.overrides,
              [platform]: { ...x.overrides[platform], [key]: v },
            },
          },
    );
  const choose = async (kind: string, key?: string) => {
    try {
      const f = await window.cs.postsChoose(kind);
      if (f)
        D((x) =>
          key
            ? { ...x, covers: { ...x.covers, [key]: f } }
            : { ...x, video: f },
        );
    } catch (e) {
      onNotice(String(e), true);
    }
  };
  const run = async () => {
    B(true);
    try {
      await window.cs.postsDraft(d);
      const s = await window.cs.postsStart(d, ids);
      R(s.records);
      onNotice("任务已加入队列，到待确认后请自行检查发布");
    } catch (e) {
      onNotice(String(e), true);
    } finally {
      B(false);
    }
  };
  return (
    <div className="accounts-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PUBLISH</span>
          <h1>一稿多发</h1>
          <p>填好各平台表单，停在发布前等你确认。</p>
        </div>
        <button className="button subtle" onClick={onOpenAccounts}>
          管理账号
        </button>
      </div>
      <div className="publish-grid">
        <section className="settings-card" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const file=e.dataTransfer.files[0];if(file&&/\.(mp4|mov|m4v|webm)$/i.test(file.name)){try{const video=window.cs.pathForFile(file);D(x=>({...x,video}));}catch(err){onNotice(String(err),true)}}else onNotice('请拖入视频文件',true);}}>
          <h2>素材与文案</h2><p className="muted">可将视频拖入此处</p>
          <button
            className="button subtle"
            onClick={() =>
              void window.cs
                .postsImport()
                .then((s) => {
                  if (s) D(s.draft);
                })
                .catch((e) => onNotice(String(e), true))
            }
          >
            从工程文件夹导入
          </button>
          <button
            className="button subtle"
            onClick={() => void choose("video")}
          >
            选择视频
          </button>
          <p className="muted file-path">{d.video || "尚未选择视频"}</p>
          <div className="cover-row">
            {["16x9", "3x4", "4x3"].map((k) => (
              <button
                key={k}
                className="button subtle"
                onClick={() => void choose("image", k)}
              >
                {k} 封面{d.covers[k] ? " ✓" : ""}
              </button>
            ))}
          </div>
          <label>
            编辑版本
            <select value={platform} onChange={(e) => P(e.target.value)}>
              <option value="master">主文案</option>
              {Object.entries(platforms).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          {platform !== "master" && (
            <p className="muted">
              限制：{JSON.stringify(rules[platform as AccountPlatform])}
              ；未修改字段继承主文案
            </p>
          )}
          <label>
            标题（{[...p.title].length}）
            <input
              value={p.title}
              onChange={(e) => edit("title", e.target.value)}
            />
          </label>
          <label>
            正文（{[...p.body].length}）
            <textarea
              rows={7}
              value={p.body}
              onChange={(e) => edit("body", e.target.value)}
            />
          </label>
          <label>
            话题（空格分隔）
            <input
              value={p.topics}
              onChange={(e) => edit("topics", e.target.value)}
            />
          </label>
          <small>{ready ? "草稿自动保存到本机" : "正在读取草稿"}</small>
        </section>
        <section className="settings-card">
          <h2>选择账号</h2>
          <div className="cover-row">
            {[
              ["全部", "all"],
              ["国内", "cn"],
              ["海外", "global"],
            ].map(([name, region]) => (
              <button
                key={region}
                className="button subtle"
                onClick={() =>
                  I(
                    accounts
                      .filter(
                        (a) =>
                          region === "all" ||
                          platforms[a.platform].region === region,
                      )
                      .map((a) => a.id),
                  )
                }
              >
                {name}
              </button>
            ))}
            <button className="button subtle" onClick={() => I([])}>
              清空
            </button>
          </div>
          {accounts.map((a) => (
            <label className="account-pick" key={a.id}>
              <input
                type="checkbox"
                checked={ids.includes(a.id)}
                onChange={(e) =>
                  I(
                    e.target.checked
                      ? [...ids, a.id]
                      : ids.filter((id) => id !== a.id),
                  )
                }
              />
              <span>
                {platforms[a.platform].name} · {a.name}
                <small>
                  {a.error ||
                    a.networkWarnings.join("；") ||
                    "登录态请在平台窗口确认"}
                </small>
              </span>
            </label>
          ))}
          <button
            className="button primary"
            disabled={
              !ready ||
              busy ||
              !ids.length ||
              records.some((r) =>
                ["排队", "启动窗口", "上传中", "填写中"].includes(r.status),
              )
            }
            onClick={() => void run()}
          >
            开始自动填表（{ids.length}）
          </button>
        </section>
      </div>
      <section className="settings-card">
        <h2>任务与发布记录</h2>
        {!records.length && <p className="muted">还没有分发任务</p>}
        {records.map((r) => (
          <article className="post-record" key={r.id}>
            <div>
              <strong>{r.name}</strong> <span>{r.status}</span>{" "}
              <small>{new Date(r.createdAt).toLocaleString()}</small>
            </div>
            <details>
              <summary>{r.logs.at(-1) || "等待处理"}</summary>
              {r.logs.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </details>
            <div className="cover-row">
              <button
                className="button subtle"
                onClick={() =>
                  void window.cs
                    .openAccountBrowser(r.accountId)
                    .catch((e) => onNotice(String(e), true))
                }
              >
                查看账号窗口
              </button>
              {r.status === "失败" && (
                <button
                  className="button subtle"
                  onClick={() => {
                    if (
                      confirm(
                        "请先检查平台是否已上传或已有草稿。重试可能重新上传，确认继续？",
                      )
                    )
                      void window.cs
                        .postsRetry(r.id)
                        .then((s) => R(s.records))
                        .catch((e) => onNotice(String(e), true));
                  }}
                >
                  重试
                </button>
              )}
              {r.status === "待你确认" && (
                <button
                  className="button subtle"
                  onClick={() => {
                    const url = prompt(
                      "确认你已在平台手动发布。可粘贴作品 HTTPS 链接；留空只标记。",
                    );
                    if (url !== null)
                      void window.cs
                        .postsMark(r.id, url)
                        .then((s) => R(s.records))
                        .catch((e) => onNotice(String(e), true));
                  }}
                >
                  已手动发布
                </button>
              )}
              {r.url && <span>{r.url}</span>}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
