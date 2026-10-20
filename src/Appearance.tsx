import React, { useState } from "react";

export const THEMES = [
  { id: "forest", name: "深林", color: "#c1ee86" },
  { id: "paper", name: "纯白", color: "#ffffff" },
  { id: "ocean", name: "海蓝", color: "#85c9f4" },
  { id: "violet", name: "暮紫", color: "#c5b2f5" },
] as const;
export type Theme = (typeof THEMES)[number]["id"];
const KEY = "cs-workbench.appearance.v1";
const EXPERIENCE_KEY = "cs-workbench.experience.v1";
export type Motion = "system" | "gentle" | "reduced";
export type Density = "comfortable" | "compact";
type Experience = { motion: Motion; density: Density };
function restoreExperience(): Experience {
  try {
    const value = JSON.parse(localStorage.getItem(EXPERIENCE_KEY) || "{}");
    return {
      motion: ["system", "gentle", "reduced"].includes(value?.motion)
        ? value.motion
        : "system",
      density: value?.density === "compact" ? "compact" : "comfortable",
    };
  } catch {
    return { motion: "system", density: "comfortable" };
  }
}
const initialExperience = restoreExperience();
document.documentElement.dataset.motion = initialExperience.motion;
document.documentElement.dataset.density = initialExperience.density;

export function prefersReducedMotion() {
  const motion = document.documentElement.dataset.motion;
  return (
    motion === "reduced" ||
    (motion !== "gentle" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  );
}

function restoreTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return THEMES.find((theme) => theme.id === value)?.id || "paper";
  } catch {
    return "paper";
  }
}
// Apply before React mounts so a saved light theme does not flash dark.
const initialTheme = restoreTheme();
document.documentElement.dataset.theme = initialTheme;

export function useAppearance() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [experience, setExperience] = useState(initialExperience);
  const [error, setError] = useState("");
  function changeTheme(value: Theme) {
    document.documentElement.dataset.theme = value;
    setTheme(value);
    try {
      localStorage.setItem(KEY, value);
      setError("");
    } catch {
      setError("配色已应用，但无法保存，下次启动需要重新选择。");
    }
  }
  function changeExperience(value: Partial<Experience>) {
    const next = { ...experience, ...value };
    document.documentElement.dataset.motion = next.motion;
    document.documentElement.dataset.density = next.density;
    setExperience(next);
    try {
      localStorage.setItem(EXPERIENCE_KEY, JSON.stringify(next));
      setError("");
    } catch {
      setError("外观已应用，但无法保存，下次启动需要重新选择。");
    }
  }
  return { theme, changeTheme, ...experience, changeExperience, error };
}

export function ExperienceSettings({
  appearance,
}: {
  appearance: ReturnType<typeof useAppearance>;
}) {
  return (
    <div className="experience-settings">
      <label>
        <span>
          <strong>界面密度</strong>
          <small>调整导航、列表与面板的留白。</small>
        </span>
        <select
          aria-label="界面密度"
          value={appearance.density}
          onChange={(e) =>
            appearance.changeExperience({ density: e.target.value as Density })
          }
        >
          <option value="comfortable">舒适</option>
          <option value="compact">紧凑</option>
        </select>
      </label>
      <label>
        <span>
          <strong>动态效果</strong>
          <small>控制页面、弹窗与交互反馈的过渡。</small>
        </span>
        <select
          aria-label="动态效果"
          value={appearance.motion}
          onChange={(e) =>
            appearance.changeExperience({ motion: e.target.value as Motion })
          }
        >
          <option value="system">跟随系统</option>
          <option value="gentle">轻柔</option>
          <option value="reduced">减少动态效果</option>
        </select>
      </label>
    </div>
  );
}

export function AppearancePicker({
  theme,
  onChange,
  compact = false,
}: {
  theme: Theme;
  onChange: (value: Theme) => void;
  compact?: boolean;
}) {
  if (compact)
    return (
      <label className="appearance-quick">
        <span
          aria-hidden="true"
          style={{ background: THEMES.find((t) => t.id === theme)?.color }}
        />
        <select
          aria-label="工作台配色"
          value={theme}
          onChange={(e) => onChange(e.target.value as Theme)}
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <div
      className="appearance-options"
      role="group"
      aria-label="选择工作台配色"
    >
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={theme === t.id}
          onClick={() => onChange(t.id)}
        >
          <span style={{ background: t.color }} aria-hidden="true" />
          <strong>{t.name}</strong>
          <small>{theme === t.id ? "正在使用" : "点击切换"}</small>
        </button>
      ))}
    </div>
  );
}
