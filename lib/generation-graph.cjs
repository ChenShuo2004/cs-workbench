const videoModels = require("../shared/video-models.json");
const {
  referenceBindings,
  resolveMentions,
} = require("../shared/canvas-references.mjs");
const roles = {
  prompt_text: ["text", 9],
  image_reference: ["image", 9],
  first_frame: ["image", 1],
  last_frame: ["image", 1],
  reference_image: ["image", 9],
  reference_video: ["video", 3],
  reference_audio: ["audio", 3],
};
function graphData(state) {
  const c = state.canvas || {};
  const generators = c.generators || [],
    sources = c.sources || [],
    edges = c.edges || [];
  if (
    !Array.isArray(generators) ||
    generators.length > 200 ||
    !Array.isArray(sources) ||
    sources.length > 500 ||
    !Array.isArray(edges) ||
    edges.length > 2000
  )
    throw Error("生成画布节点数量无效");
  const all = new Map(
    state.clips.map((x) => [
      x.id,
      {
        kind: state.media.find((m) => m.id === x.mediaId)?.kind,
        mediaId: x.mediaId,
      },
    ]),
  );
  for (const n of c.notes || []) {
    if (all.has(n.id)) throw Error("文本节点编号重复");
    all.set(n.id, { kind: "text", text: n.text });
  }
  for (const n of [...generators, ...sources]) {
    if (
      typeof n.id !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(n.id) ||
      all.has(n.id)
    )
      throw Error("画布节点编号无效或重复");
    if (sources.includes(n)) {
      const media = state.media.find((m) => m.id === n.mediaId);
      if (!media) throw Error("素材节点的文件不存在");
      all.set(n.id, { kind: media.kind, mediaId: n.mediaId });
    } else {
      if (
        !["image", "video"].includes(n.kind) ||
        typeof n.prompt !== "string" ||
        n.prompt.length > 4000 ||
        !["frames", "omni"].includes(n.mode) ||
        !["16:9", "9:16", "1:1", "4:3"].includes(n.aspect) ||
        !Number.isInteger(n.duration) ||
        n.duration < (n.kind === "video" ? 4 : 1) ||
        n.duration > 15 ||
        !["720P", "768P", "1080P", "2K"].includes(n.resolution) ||
        (n.kind === "video" &&
          !videoModels.some(
            (m) =>
              m.id === (n.model || "MiniMax-H3") &&
              m.resolutions.includes(n.resolution),
          )) ||
        typeof n.title !== "string" ||
        n.title.length > 100
      )
        throw Error("生成节点参数无效");
      if (
        n.outputMediaId &&
        !state.media.some((m) => m.id === n.outputMediaId && m.kind === n.kind)
      )
        throw Error("生成节点结果素材无效");
      all.set(n.id, { kind: n.kind, mediaId: n.outputMediaId, generator: n });
    }
  }
  const edgeIds = new Set(),
    pairs = new Set();
  for (const e of edges) {
    if (
      e.alias !== undefined &&
      (!/^@(图片|视频|声音|文本)\d{1,4}$/.test(e.alias) ||
        edges.some(
          (other) =>
            other !== e && other.to === e.to && other.alias === e.alias,
        ))
    )
      throw Error("素材引用编号无效或重复");
    const source = all.get(e.from),
      target = all.get(e.to)?.generator;
    if (
      !e.id ||
      edgeIds.has(e.id) ||
      !source ||
      !target ||
      e.from === e.to ||
      !roles[e.role] ||
      source.kind !== roles[e.role][0]
    )
      throw Error("连线的节点或素材类型无效");
    const allowed =
      target.kind === "image"
        ? ["image_reference"]
        : target.mode === "frames"
          ? ["first_frame", "last_frame"]
          : ["reference_image", "reference_video", "reference_audio"];
    if (e.role !== "prompt_text" && !allowed.includes(e.role))
      throw Error("首尾帧和全能参考不能混用，请切换节点模式");
    const pair = `${e.from}:${e.to}:${e.role}`;
    if (pairs.has(pair)) throw Error("该素材已经连接到这个输入");
    if (
      edges.filter((x) => x.to === e.to && x.role === e.role).length >
      roles[e.role][1]
    )
      throw Error("此输入的连接数量已达上限");
    edgeIds.add(e.id);
    pairs.add(pair);
  }
  const visiting = new Set(),
    visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw Error("生成连线不能形成循环");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const e of edges.filter((e) => e.to === id))
      if (all.get(e.from)?.generator) visit(e.from);
    visiting.delete(id);
    visited.add(id);
  }
  generators.forEach((n) => visit(n.id));
  return { generators, sources, edges, all };
}
function planGraph(state, selected) {
  const graph = graphData(state);
  if (
    !Array.isArray(selected) ||
    !selected.length ||
    selected.length > 50 ||
    new Set(selected).size !== selected.length
  )
    throw Error("请选择 1–50 个生成节点");
  const requested = new Set(selected),
    ordered = [],
    seen = new Set();
  function visit(id) {
    if (seen.has(id)) return;
    const n = graph.all.get(id)?.generator;
    if (!n) throw Error("选择中包含非生成节点");
    seen.add(id);
    for (const e of graph.edges.filter((e) => e.to === id)) {
      const src = graph.all.get(e.from);
      if (src.generator && (requested.has(e.from) || !src.mediaId))
        visit(e.from);
    }
    const prompt = [
      ...graph.edges
        .filter((e) => e.to === id && e.role === "prompt_text")
        .map((e) => graph.all.get(e.from).text?.trim()),
      n.prompt.trim(),
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!prompt) throw Error(`「${n.title}」还没有填写提示词`);
    if (prompt.length > 4000)
      throw Error(`「${n.title}」合并后的提示词超过 4000 字`);
    const incoming = graph.edges.filter((e) => e.to === id);
    if (
      incoming.some((e) => e.role === "reference_audio") &&
      !incoming.some((e) =>
        ["reference_image", "reference_video"].includes(e.role),
      )
    )
      throw Error(`「${n.title}」的声音参考还需要至少一张图片或一段视频参考`);
    ordered.push({
      ...n,
      prompt: resolveMentions(prompt, referenceBindings(incoming), n.title),
    });
  }
  selected.forEach(visit);
  if (ordered.length > 50) throw Error("包含上游后超过 50 个任务，请分批生成");
  return {
    nodes: ordered,
    inputs: Object.fromEntries(
      ordered.map((n) => [
        n.id,
        graph.edges
          .filter((e) => e.to === n.id && e.role !== "prompt_text")
          .map((e) => {
            const source = graph.all.get(e.from);
            return {
              role: e.role,
              kind: source.kind,
              ...(seen.has(e.from)
                ? { nodeId: e.from }
                : { mediaId: source.mediaId }),
            };
          }),
      ]),
    ),
    imageCount: ordered.filter((n) => n.kind === "image").length,
    videoCount: ordered.filter((n) => n.kind === "video").length,
    videoSeconds: ordered
      .filter((n) => n.kind === "video")
      .reduce((s, n) => s + n.duration, 0),
  };
}
module.exports = { graphData, planGraph, roles };
