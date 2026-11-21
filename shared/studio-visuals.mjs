// Original deterministic scene art. References inform color/light, no reference pixels are used.
export const palettes = {
  mint: {
    bg: "#142a32",
    ink: "#e5e7d7",
    accent: "#c3d4c2",
    muted: "#52766b",
    sky: "#c3d4c2",
    far: "#8daa91",
    mid: "#52766b",
    near: "#285052",
  },
  violet: {
    bg: "#251743",
    ink: "#f2e6ad",
    accent: "#e4b987",
    muted: "#7a5397",
    sky: "#b58abb",
    far: "#7a5397",
    mid: "#4b2d70",
    near: "#352153",
  },
  amber: {
    bg: "#281c22",
    ink: "#f5d997",
    accent: "#dea45f",
    muted: "#8d4a32",
    sky: "#bc7443",
    far: "#8d4a32",
    mid: "#56302a",
    near: "#382327",
  },
};
const esc = (v) =>
  String(v).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
function landscape(p, theme, t, style) {
  let shapes = "";
  const pixel = style === "pixel";
  const tree = (x, y, size, color) =>
    `<g fill="${color}"><rect x="${x - size * 0.07}" y="${y - size * 0.2}" width="${size * 0.14}" height="${size * 0.28}"/>${[0, 1, 2, 3].map((i) => `<path d="M${x} ${y - size + i * size * 0.16}l${size * (0.17 + i * 0.035)} ${size * 0.27}h-${size * (0.34 + i * 0.07)}Z"/>`).join("")}</g>`;
  if (theme === "amber") {
    shapes = `<rect width="640" height="360" fill="${p.mid}"/><rect x="30" y="24" width="580" height="255" fill="${p.far}"/><rect x="320" y="36" width="232" height="175" fill="#e2ad74"/><rect x="329" y="44" width="214" height="158" fill="#754a4d"/><path d="M330 124h25v-23h23v31h25v-50h19v34h25V73h32v54h22v-29h41v105H330Z" fill="#4c3541"/>`;
    for (let i = 0; i < 22; i++) {
      const x = 338 + ((i * 29) % 194),
        y = 112 + Math.floor(i / 7) * 24;
      shapes += `<rect x="${x}" y="${y}" width="5" height="8" fill="${i % 3 === 0 ? "#e9bd7d" : "#8e6457"}"/>`;
    }
    shapes += `<path d="M431 40v164M325 139h220" stroke="#c38d59" stroke-width="7"/><rect x="52" y="49" width="154" height="181" fill="#3c252a"/>`;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 10; i++) {
        shapes += `<rect x="${61 + i * 13}" y="${61 + row * 54 + (i % 3) * 4}" width="${8 + (i % 3)}" height="${36 - (i % 3) * 4}" fill="${["#92694c", "#76583d", "#8b5340", "#b08256"][i % 4]}"/>`;
      }
      shapes += `<rect x="53" y="${103 + row * 54}" width="153" height="7" fill="#ad7447"/>`;
    }
    shapes += `<path d="M224 122L120 244H336Z" fill="#e5af65" opacity=".16"/><rect x="92" y="236" width="294" height="14" fill="#c48a51"/><rect x="105" y="250" width="14" height="95" fill="#4b3029"/><rect x="358" y="250" width="14" height="95" fill="#4b3029"/><path d="M211 234v-99l15-20" fill="none" stroke="#3e2928" stroke-width="6"/><path d="M211 108h28l12 22h-52Z" fill="#f0c77e"/><rect x="142" y="216" width="51" height="7" fill="#d9b77b"/><rect x="147" y="224" width="43" height="8" fill="#7b5239"/><rect x="275" y="220" width="19" height="16" fill="#d6ae6c"/><rect x="270" y="213" width="29" height="9" fill="#3b4a32"/><path d="M278 213v-23l-10-11m10 23l12-14" stroke="#5a6c3f" fill="none" stroke-width="5"/><path d="M450 239h137v81H427v-55Z" fill="#a05d3a"/><path d="M468 250h111v20H451Z" fill="#c28a55"/><rect x="0" y="322" width="640" height="38" fill="${p.bg}"/>`;
  } else {
    shapes = `<rect width="640" height="360" fill="${p.sky}"/><rect y="173" width="640" height="187" fill="${p.far}"/>`;
    if (theme === "violet")
      shapes += `<circle cx="439" cy="99" r="48" fill="#f2e6ad"/><path d="M0 143l65-36 55 12 75-65 79 62 41-20 66 43 79-26 44 17 54-42 82 69v88H0Z" fill="${p.far}"/><path d="M0 193l79-41 69 19 54-51 68 56 85-19 62 31 54-22 75 32 49-40 45 27v82H0Z" fill="${p.mid}"/><path d="M244 222h177l-41 9H265Zm27 17h102l-14 6h-65Zm-26 17h134v3H245Z" fill="#dcb28c" opacity=".65"/>`;
    else
      shapes += `<path d="M0 100L95 55l68 33 101-48 75 66 93-35 53 35 78-50 77 55v110H0Z" fill="#a7beaa"/><path d="M65 0h64l190 235h-90Z" fill="#e5e7d7" opacity=".18"/>`;
    for (let i = 0; i < 22; i++)
      shapes += tree(
        i * 32 - 12,
        201 + (i % 3) * 7,
        67 + ((i * 19) % 47),
        p.far,
      );
    for (let i = 0; i < 16; i++) {
      if (i > 5 && i < 10) continue;
      shapes += tree(
        i * 44 - 10,
        249 + (i % 3) * 6,
        98 + ((i * 31) % 48),
        p.mid,
      );
    }
    shapes += `<path d="M0 271q143-32 252 10l98-18q118-14 290 16v81H0Z" fill="${p.near}"/><path d="M277 249h49l-10 20 45 18-43 29 55 44H221l63-42-27-23 43-24Z" fill="${theme === "mint" ? "#91a58b" : "#a080a4"}"/><path d="M280 253h30l-14 22 22 9-24 9h-20l24-20Z" fill="${p.ink}" opacity=".24"/>`;
    for (let i = 0; i < 7; i++)
      shapes += tree(
        i < 4 ? i * 28 - 25 : 550 + (i - 4) * 39,
        340,
        165 + (i % 3) * 30,
        p.bg,
      );
    for (let i = 0; i < 45; i++) {
      const x = (i * 71) % 640,
        y = 299 + ((i * 13) % 55);
      if (x > 235 && x < 365) continue;
      shapes += `<rect x="${x}" y="${y}" width="${3 + (i % 5)}" height="${2 + (i % 3)}" fill="${i % 4 === 0 ? p.far : p.near}"/>`;
    }
  }
  const px = theme === "amber" ? 320 : 318,
    py = theme === "amber" ? 226 : 230;
  const bob = Math.round(Math.sin(t * Math.PI * 2));
  shapes += `<g transform="translate(${px} ${py + bob}) scale(1.35)"><ellipse cx="0" cy="27" rx="13" ry="4" fill="${p.bg}" opacity=".45"/><rect x="-5" y="-6" width="10" height="10" fill="#d7b48d"/><path d="M-6-8H6v5H2v-2H-6Z" fill="#322c32"/><path d="M-7 5H7v14H-7Z" fill="${theme === "amber" ? "#83968a" : "#dbb779"}"/><rect x="-5" y="19" width="4" height="9" fill="#303d42"/><rect x="2" y="19" width="4" height="9" fill="#303d42"/><rect x="-9" y="7" width="3" height="10" fill="#d7b48d"/></g>`;
  return `<g shape-rendering="${pixel ? "crispEdges" : "geometricPrecision"}">${shapes}</g>`;
}
export function sceneSVG(
  text,
  theme = "mint",
  progress = 0,
  width = 1280,
  height = 720,
  style = "pixel",
) {
  const p = palettes[theme] || palettes.mint,
    s = Math.min(width, height),
    portrait = width < height;
  const lines = Array.from(String(text || "从一个想法开始")).reduce((a, c) => {
    if (!a.length || a[a.length - 1].length >= (portrait ? 12 : 24)) a.push("");
    a[a.length - 1] += c;
    return a;
  }, []);
  const fontSize = Math.min(
    s * 0.043,
    (height * 0.25) / Math.max(1, lines.length * 1.4),
  );
  const baseline = height - s * 0.11 - (lines.length - 1) * fontSize * 1.4;
  const sceneHeight = portrait ? height * 0.66 : height,
    sceneScale = Math.max(width / 640, sceneHeight / 360),
    sceneX = (width - 640 * sceneScale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.bg}" stop-opacity="0"/><stop offset="1" stop-color="${p.bg}" stop-opacity=".97"/></linearGradient></defs><rect width="100%" height="100%" fill="${p.bg}"/><g transform="translate(${sceneX} 0) scale(${sceneScale})">${landscape(p, theme, progress, style)}</g><rect x="0" y="${height * 0.57}" width="${width}" height="${height * 0.43}" fill="url(#shade)"/><text x="${s * 0.06}" y="${s * 0.07}" fill="${theme === "mint" ? p.bg : p.ink}" font-family="sans-serif" font-size="${s * 0.021}" letter-spacing="3" opacity=".75">${{ mint: "FIELD NOTES / GROWTH", violet: "AFTERGLOW / NEW IDEAS", amber: "READING ROOM / STORIES" }[theme] || "FIELD NOTES"}</text>${lines.map((l, i) => `<text x="${width / 2}" y="${baseline + i * fontSize * 1.4}" text-anchor="middle" fill="${p.ink}" font-family="PingFang SC, Noto Sans CJK SC, sans-serif" font-weight="600" font-size="${fontSize}">${esc(l)}</text>`).join("")}<path d="M${s * 0.06} ${height - s * 0.05}h${width - s * 0.12}" stroke="${p.ink}" opacity=".2"/><rect x="${s * 0.06}" y="${height - s * 0.05}" width="${(width - s * 0.12) * Math.min(1, Math.max(0, progress))}" height="2" fill="${p.accent}"/></svg>`;
}
export function captionSVG(text, width, height, options = {}) {
  const preset = options.preset || "clean";
  const font = options.font || "PingFang SC";
  const color = options.color || (preset === "bold" ? "#f3de86" : "#ffffff");
  const scale = options.size || 0.047;
  const chars = Math.max(
    6,
    Math.floor((width / (Math.min(width, height) * scale)) * 0.82),
  );
  const lines = String(text)
    .split("\n")
    .flatMap((line) => {
      const a = [];
      for (const c of Array.from(line)) {
        if (!a.length || Array.from(a.at(-1)).length >= chars) a.push("");
        a[a.length - 1] += c;
      }
      return a;
    });
  const size = Math.min(
    Math.min(width, height) * scale,
    (height * 0.3) / Math.max(1, lines.length * 1.4),
  );
  const baseline = Math.max(
    height * 0.3,
    Math.min(height * 0.92, height * (options.position ?? 0.91)),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${lines
    .map((l, i) => {
      const y = baseline - (lines.length - 1 - i) * size * 1.4,
        boxWidth = Math.min(
          width * 0.94,
          Array.from(l).reduce(
            (n, c) => n + (/[\u0000-\u00ff]/.test(c) ? 0.58 : 1),
            0,
          ) *
            size +
            size,
        );
      return `${preset === "card" ? `<rect x="${(width - boxWidth) / 2}" y="${y - size * 1.04}" width="${boxWidth}" height="${size * 1.35}" rx="${size * 0.18}" fill="#101318" opacity=".88"/>` : ""}<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="${esc(font)},sans-serif" font-size="${size}" font-weight="${preset === "clean" ? 600 : 800}" fill="${esc(color)}" stroke="#101318" stroke-width="${preset === "card" ? 0 : size * 0.13}" paint-order="stroke">${esc(l)}</text>`;
    })
    .join("")}</svg>`;
}
