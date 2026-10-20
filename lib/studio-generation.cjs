const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");
const wb = require("./workbench.cjs");
const { planGraph } = require("./generation-graph.cjs");
const UUID = /^[a-f0-9-]{36}$/i;
const ASPECTS = ["16:9", "9:16", "1:1", "4:3"];
const ACTIVE = ["queued", "submitting", "running", "saving"];

function createGeneration({
  userData,
  studio,
  bridge,
  videoProvider,
  onChange = () => {},
  pollMs = 4000,
}) {
  const directory = path.join(userData, "studio-generation");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "jobs.json");
  let jobs = [];
  if (fs.existsSync(file)) {
    jobs = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(jobs) || jobs.some((j) => !UUID.test(j.id)))
      throw Error("生成任务记录损坏，原文件已保留");
  }
  // Preserve the wire contract of jobs created by 0.5.1, including queued jobs.
  for (const job of jobs) {
    if (
      job.kind === "video" &&
      job.resolution === "1080P" &&
      job.nativeResolution !== true
    )
      job.legacy1080Transcode = true;
  }
  let stopping = false,
    busy = false;
  const timers = new Map();
  const attachments = new Map();
  const snapshot = (j) => {
    const { output, ...view } = j;
    return { ...view };
  };
  const persist = () => {
    wb.writeJson(file, jobs);
    onChange();
  };
  const get = (id) => {
    const job = jobs.find((j) => j.id === id);
    if (!job) throw Error("生成任务不存在");
    studio.read(job.root);
    return job;
  };
  const outputDir = (j) => path.join(directory, j.id);
  async function status() {
    let imageReady = false,
      imageDetail = "";
    try {
      await bridge.check();
      imageReady = true;
      imageDetail = "已连接本机 Codex 生图，生成使用现有账户额度";
    } catch (e) {
      imageDetail = e.message;
    }
    return {
      imageReady,
      imageDetail,
      video: videoProvider
        ? await videoProvider.status()
        : { ready: false, detail: "等待配置视频服务", models: [] },
    };
  }
  function previewGraph(root, ids) {
    const plan = planGraph(studio.read(root), ids);
    for (const node of plan.nodes) {
      if (
        jobs.some(
          (j) =>
            j.root === root &&
            j.nodeId === node.id &&
            [...ACTIVE, "paused"].includes(j.status),
        )
      )
        throw Error(`「${node.title}」已有进行中任务，请继续查询原任务`);
      if (node.kind === "video") {
        if (!videoProvider) throw Error("请先配置视频服务");
        videoProvider.validate(node);
      }
    }
    return plan;
  }
  function enqueueGraph(root, ids) {
    const plan = previewGraph(root, ids);
    if (
      jobs.filter((j) => ACTIVE.includes(j.status)).length + plan.nodes.length >
      200
    )
      throw Error("队列最多保留 200 个待完成任务");
    const batchId = crypto.randomUUID();
    const jobIds = Object.fromEntries(
      plan.nodes.map((n) => [n.id, crypto.randomUUID()]),
    );
    const added = plan.nodes.map((node, index) => ({
      id: jobIds[node.id],
      root,
      nodeId: node.id,
      nodeTitle: node.title,
      batchId,
      batchIndex: index,
      kind: node.kind,
      prompt: node.prompt.trim(),
      aspect: node.aspect,
      duration: node.duration,
      resolution: node.resolution,
      mode: node.mode,
      referenceId: "",
      model:
        node.kind === "image" ? "codex_builtin" : node.model || "MiniMax-H3",
      ...(node.kind === "video" ? { nativeResolution: true } : {}),
      inputs: plan.inputs[node.id].map(({ nodeId, ...ref }) => ({
        ...ref,
        ...(nodeId ? { jobId: jobIds[nodeId] } : {}),
      })),
      status: "queued",
      stage: "排队中 · 等待上游素材",
      createdAt: new Date().toISOString(),
      applied: false,
    }));
    jobs.unshift(...added.slice().reverse());
    persist();
    void pump();
    return added.map(snapshot);
  }
  function enqueue(root, input) {
    studio.read(root);
    if (
      !input ||
      !["image", "video"].includes(input.kind) ||
      typeof input.prompt !== "string" ||
      !input.prompt.trim() ||
      input.prompt.length > 4000 ||
      !ASPECTS.includes(input.aspect)
    )
      throw Error("请填写 1–4000 字提示词并选择画面比例");
    if (jobs.filter((j) => ACTIVE.includes(j.status)).length >= 4)
      throw Error("最多同时排队 4 个生成任务");
    if (
      !Number.isInteger(input.duration) ||
      input.duration < 1 ||
      input.duration > 15
    )
      throw Error("镜头时长需为 1–15 秒");
    if (input.kind === "video" && !videoProvider)
      throw Error("请先配置视频生成服务");
    if (input.kind === "video") videoProvider.validate(input);
    const state = studio.read(root);
    if (
      input.referenceId &&
      !state.media.some((m) => m.id === input.referenceId && m.kind === "image")
    )
      throw Error("请选择当前项目里的图片作为参考");
    const job = {
      id: crypto.randomUUID(),
      root,
      kind: input.kind,
      prompt: input.prompt.trim(),
      aspect: input.aspect,
      duration: input.duration,
      referenceId: input.referenceId || "",
      model:
        input.kind === "image"
          ? "codex_builtin"
          : String(input.model || "MiniMax-H3"),
      ...(input.kind === "video"
        ? { resolution: input.resolution || "1080P", nativeResolution: true }
        : {}),
      status: "queued",
      stage: "等待生成",
      createdAt: new Date().toISOString(),
      applied: false,
    };
    jobs.unshift(job);
    persist();
    void pump();
    return snapshot(job);
  }
  async function complete(job, source) {
    job.status = "saving";
    job.stage = "正在校验并保存生成素材";
    persist();
    const destination = path.join(
      outputDir(job),
      job.kind === "image" ? "generated.png" : "generated.mp4",
    );
    fs.mkdirSync(outputDir(job), { recursive: true });
    if (job.kind === "image") {
      const meta = await sharp(source).metadata();
      if (!meta.width || !meta.height) throw Error("生成图片无法解码");
      await sharp(source)
        .png()
        .toFile(destination + ".tmp");
      fs.renameSync(destination + ".tmp", destination);
    } else {
      // Video adapters return a verified local MP4, never a remote URL to the UI.
      if (path.resolve(source) !== destination)
        await fs.promises.copyFile(source, destination);
    }
    job.output = destination;
    job.status = "completed";
    job.stage = "生成完成";
    job.completedAt = new Date().toISOString();
    job.error = "";
    persist();
  }
  function schedule(job) {
    if (stopping || job.status !== "running") return;
    clearTimeout(timers.get(job.id));
    timers.set(
      job.id,
      setTimeout(() => {
        timers.delete(job.id);
        void poll(job);
      }, pollMs),
    );
  }
  async function poll(job) {
    if (stopping || job.status !== "running") return;
    try {
      const result =
        job.kind === "image"
          ? await bridge.poll(job.remoteId)
          : await videoProvider.poll(job);
      if (stopping || job.status !== "running") return;
      if (result.status === "completed") {
        const source =
          job.kind === "image" ? result.images?.[0]?.path : result.path;
        if (!source || !fs.existsSync(source))
          throw Error("生成服务未返回有效的本地素材");
        if (
          job.kind === "image" &&
          path.dirname(fs.realpathSync(source)) !==
            fs.realpathSync(outputDir(job))
        )
          throw Error("生图结果不属于当前生成任务");
        await complete(job, source);
      } else if (result.status === "failed") {
        job.status = "failed";
        job.stage = "生成失败";
        job.error = String(result.error || "生成服务未返回素材").slice(0, 1000);
        persist();
      } else if (Date.now() - Date.parse(job.watchingSince) > 15 * 60 * 1000) {
        job.status = "paused";
        job.stage = "查询已暂停";
        job.error = "等待超过 15 分钟。可继续查询原任务，不会再次提交生成。";
        persist();
      } else schedule(job);
    } catch (e) {
      if (stopping) return;
      job.status = "paused";
      job.stage = "查询暂停";
      job.error = String(e.message).slice(0, 1000);
      persist();
    }
    void pump();
  }
  async function pump() {
    if (busy || stopping) return;
    let changed = false;
    for (const j of jobs
      .slice()
      .reverse()
      .filter((j) => j.status === "queued")) {
      if (
        (j.inputs || []).some(
          (r) =>
            r.jobId &&
            ["failed", "cancelled", "interrupted"].includes(
              jobs.find((x) => x.id === r.jobId)?.status,
            ),
        )
      ) {
        j.status = "cancelled";
        j.stage = "上游任务未完成";
        j.error =
          "上游任务失败或已取消，本节点未提交、未扣费。修复上游后可重新生成。";
        changed = true;
      }
    }
    if (changed) persist();
    if (
      jobs.filter((j) => ["submitting", "running", "saving"].includes(j.status))
        .length >= 2
    )
      return;
    const job = jobs
      .slice()
      .reverse()
      .find(
        (j) =>
          j.status === "queued" &&
          (j.inputs || []).every(
            (r) =>
              !r.jobId ||
              jobs.find((x) => x.id === r.jobId)?.status === "completed",
          ),
      );
    if (!job) return;
    busy = true;
    try {
      studio.read(job.root);
      fs.mkdirSync(outputDir(job), { recursive: true });
      const references = job.inputs
        ? job.inputs.map((r) => {
            const upstream =
              r.jobId &&
              jobs.find((j) => j.id === r.jobId && j.root === job.root);
            const source = upstream
              ? upstream.output
              : studio.mediaPath(job.root, r.mediaId);
            if (!source || !fs.existsSync(source))
              throw Error("上游素材已丢失，请重新生成或连接素材");
            return { path: source, role: r.role, kind: r.kind };
          })
        : job.referenceId
          ? [
              {
                path: studio.mediaPath(job.root, job.referenceId),
                role: "first_frame",
                kind: "image",
              },
            ]
          : [];
      job.status = "submitting";
      job.stage = "正在提交生成请求";
      persist();
      const response =
        job.kind === "image"
          ? await bridge.submit({
              prompt: `${job.prompt}\n画面目标比例：${job.aspect}。`,
              aspect_ratio:
                job.aspect === "1:1"
                  ? "square"
                  : job.aspect === "9:16"
                    ? "portrait"
                    : "landscape",
              reference_images: references.map((r) => r.path),
              transparent_background: false,
              output_dir: outputDir(job),
            })
          : await videoProvider.submit(job, references);
      const remoteId = response.job_id || response.request_id;
      if (typeof remoteId !== "string" || !remoteId)
        throw Error("服务未返回任务编号，未自动重试");
      job.remoteId = remoteId;
      job.status = "running";
      job.stage = "正在生成";
      job.watchingSince = new Date().toISOString();
      persist();
      schedule(job);
    } catch (e) {
      job.status = "interrupted";
      job.stage = "提交未完成";
      job.error = `${String(e.message).slice(0, 800)}。请核对服务端任务后再重新生成，避免重复扣费。`;
      persist();
    } finally {
      busy = false;
      void pump();
    }
  }
  function pause(id) {
    const job = get(id);
    if (job.status === "queued") {
      job.status = "cancelled";
      job.stage = "已取消排队";
    } else if (job.status === "running") {
      job.status = "paused";
      job.stage = "查询已暂停，服务端可能仍在生成";
    } else throw Error("当前阶段不能暂停，请等待提交或保存完成");
    clearTimeout(timers.get(id));
    timers.delete(id);
    persist();
    void pump();
    return snapshot(job);
  }
  function resume(id) {
    const job = get(id);
    if (job.status !== "paused" || !job.remoteId)
      throw Error("此任务没有可继续查询的编号");
    job.status = "running";
    job.error = "";
    job.stage = "继续查询原任务";
    job.watchingSince = new Date().toISOString();
    persist();
    schedule(job);
    return snapshot(job);
  }
  async function attachOnce(id) {
    const job = get(id);
    if (job.status !== "completed" || !job.output)
      throw Error("生成素材尚未完成");
    const state = await studio.addMedia(job.root, job.output, {
      id: job.id,
      createClip: false,
      name: `AI-${job.kind === "image" ? "图片" : "视频"}-${job.id.slice(0, 8)}${path.extname(job.output)}`,
    });
    return { job: snapshot(job), media: state.media };
  }
  function attach(id) {
    if (!attachments.has(id))
      attachments.set(
        id,
        attachOnce(id).finally(() => attachments.delete(id)),
      );
    return attachments.get(id);
  }
  function acknowledge(id) {
    const job = get(id);
    if (
      !studio
        .read(job.root)
        .clips.some((c) => c.id === job.id && c.mediaId === job.id)
    )
      throw Error("镜头尚未保存到工程，生成素材仍可恢复");
    job.applied = true;
    persist();
    return true;
  }
  function start() {
    for (const job of jobs) {
      if (["submitting", "saving"].includes(job.status)) {
        job.status = job.remoteId ? "paused" : "interrupted";
        job.error = "上次运行中断，已保留任务记录；请核对后继续。";
      }
      if (job.status === "running") {
        job.watchingSince = new Date().toISOString();
        schedule(job);
      }
    }
    persist();
    void pump();
  }
  return {
    status,
    enqueue,
    previewGraph,
    enqueueGraph,
    pause,
    resume,
    attach,
    acknowledge,
    start,
    list: (root) => {
      studio.read(root);
      return jobs.filter((j) => j.root === root).map(snapshot);
    },
    shutdown: () => {
      stopping = true;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      bridge.close();
    },
  };
}
module.exports = { createGeneration };
