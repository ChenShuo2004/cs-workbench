import {PlatformIcon} from "../platform-icons";
import React, { useState } from "react";
import { DouyinAccounts } from "../DouyinAccounts";
import platforms from "../../shared/account-platforms.json";
export function Accounts(props: React.ComponentProps<typeof DouyinAccounts>) {
  const [cards, C] = useState(false),
    [sync, S] = useState(false);
  const run = async () => {
    S(true);
    try {
      await window.cs.syncAll();
      await props.onRefresh();
      props.onNotice("同步完成，请检查需扫码或读取失败的账号");
    } catch (e) {
      props.onNotice(String(e), true);
    } finally {
      S(false);
    }
  };
  return (
    <div className="accounts-page">
      <div className="cover-row">
        <button
          className="button subtle"
          disabled={sync}
          onClick={() => void run()}
        >
          {sync ? "正在同步…" : "同步全部账号"}
        </button>
        <button className="button subtle" onClick={() => C(!cards)}>
          {cards ? "表格视图" : "卡片与管理"}
        </button>
      </div>
      {cards ? (
        <DouyinAccounts {...props} />
      ) : (
        <>
          <div className="page-heading">
            <h1>账号与数据</h1>
            <button className="button subtle" onClick={() => C(true)}>
              添加与配置账号
            </button>
          </div>
          <div className="account-totals">
            {[
              ["粉丝", "followers"],
              ["播放", "views"],
              ["获赞", "likes"],
            ].map(([name, k]) => (
              <div key={k}>
                <small>{name} · 最近快照合计</small>
                <strong>
                  {props.accounts.some(
                    (a) => a.dataSnapshot?.kpis[k as "followers"] != null,
                  )
                    ? props.accounts
                        .reduce(
                          (n, a) =>
                            n + (a.dataSnapshot?.kpis[k as "followers"] || 0),
                          0,
                        )
                        .toLocaleString()
                    : "—"}
                </strong>
              </div>
            ))}
          </div>
          <div className="table-scroll">
            <table className="account-table">
              <thead>
                <tr>
                  {[
                    "平台 / 账号",
                    "登录 / 会话",
                    "粉丝",
                    "播放",
                    "互动（赞评藏转）",
                    "粉丝趋势",
                    "线路 / 出口",
                    "操作",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {props.accounts.map((a) => {
                  const h = a.dataSnapshot?.history?.slice(-30) || [];
                  const values = h
                    .map((x) => x.kpis.followers)
                    .filter((v): v is number => v !== null);
                  const min = Math.min(...values),
                    max = Math.max(...values);
                  const points = values
                    .map(
                      (v, i) =>
                        `${(i * 90) / Math.max(1, values.length - 1)},${26 - (22 * (v - min)) / Math.max(1, max - min)}`,
                    )
                    .join(" ");
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong><PlatformIcon platform={a.platform}/>{platforms[a.platform].name}</strong>
                        <small>{a.name}</small>
                      </td>
                      <td>
                        {a.error || "登录态待确认"}
                        <small>
                          {a.dataConnected ? "窗口已连接" : "窗口未连接"}
                        </small>
                      </td>
                      {(["followers", "views"] as const).map((k) => (
                        <td key={k}>
                          {a.dataSnapshot?.kpis[k]?.toLocaleString() ?? "—"}
                          <small>
                            {a.dataSnapshot?.deltas?.[k] != null
                              ? `${a.dataSnapshot.deltas[k]! >= 0 ? "+" : ""}${a.dataSnapshot.deltas[k]}`
                              : ""}
                          </small>
                        </td>
                      ))}
                      <td>
                        {a.dataSnapshot
                          ? (["likes", "comments", "saves", "shares"] as const)
                              .map((k) => a.dataSnapshot?.kpis[k] ?? "—")
                              .join(" / ")
                          : "—"}
                      </td>
                      <td>
                        {values.length > 1 ? (
                          <svg width="94" height="30" aria-label="粉丝历史趋势">
                            <polyline
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              points={points}
                            />
                          </svg>
                        ) : (
                          "暂无趋势"
                        )}
                      </td>
                      <td>
                        {a.network.label || "直连"}
                        <small>{a.lastNetworkCheck?.ip || "未检测"}</small>
                      </td>
                      <td>
                        <div className="cover-row">
                          <button
                            className="button subtle"
                            onClick={() =>
                              void window.cs
                                .openAccountBrowser(a.id)
                                .then(props.onRefresh)
                                .catch((e) => props.onNotice(String(e), true))
                            }
                          >
                            后台 / 扫码
                          </button>
                          <button
                            className="button subtle"
                            disabled={sync}
                            onClick={() =>
                              void window.cs
                                .readAccountData(a.id, { navigateToData: true })
                                .then(props.onRefresh)
                                .catch((e) => props.onNotice(String(e), true))
                            }
                          >
                            读数据
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!props.accounts.length && <p>暂无账号，请添加账号后扫码登录。</p>}
          </div>
        </>
      )}
    </div>
  );
}
