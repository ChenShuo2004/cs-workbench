import React, { useEffect, useState } from "react";
import { Check, LoaderCircle, SlidersHorizontal } from "lucide-react";
import { uiErrorMessage } from "../ui-error";

export function AutomationSettings({
  onNotice,
}: {
  onNotice: (s: string, e?: boolean) => void;
}) {
  const [value, setValue] = useState({ concurrency: 2, clashPath: "" });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.cs
      .settingsRead()
      .then((s) => {
        setValue(s);
        setReady(true);
      })
      .catch((e) => onNotice(uiErrorMessage(e), true));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const next = await window.cs.settingsSave(value);
      setValue(next);
      onNotice("自动化与环境设置已保存，下一批任务生效");
    } catch (e) {
      onNotice(uiErrorMessage(e), true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="kw-card">
      <div className="kw-card-head">
        <div>
          <h2>
            <SlidersHorizontal size={16} /> 自动化与环境
          </h2>
          <p className="kw-card-sub">
            控制一稿多发并行窗口数，以及本机 Clash Verge 配置文件路径。
          </p>
        </div>
      </div>

      <div className="kw-setting-row">
        <div>
          <strong>并发执行账号数</strong>
          <small>同时打开并自动填表的账号窗口上限（建议 2 个以保持稳定）</small>
        </div>
        <div className="kw-segmented" role="group" aria-label="并发账号数">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              disabled={!ready}
              className={value.concurrency === n ? "active" : ""}
              onClick={() => setValue({ ...value, concurrency: n })}
            >
              {n} 个
            </button>
          ))}
        </div>
      </div>

      <div className="settings-divider" style={{ margin: "14px 0" }} />

      <div className="kw-field" style={{ marginBottom: 14 }}>
        <label htmlFor="kw-clash-path">Clash 运行配置路径（留空自动检测）</label>
        <input
          id="kw-clash-path"
          className="kw-input"
          disabled={!ready}
          placeholder="~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/clash-verge.yaml"
          value={value.clashPath}
          onChange={(e) => setValue({ ...value, clashPath: e.target.value })}
        />
      </div>

      <div className="settings-actions">
        <button
          type="button"
          className="button primary"
          disabled={!ready || saving}
          onClick={() => void save()}
        >
          {saving ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <Check size={14} />
          )}
          保存设置
        </button>
      </div>
    </section>
  );
}
