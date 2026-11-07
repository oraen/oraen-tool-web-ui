import DOMPurify from "dompurify";
import { DiagramKind, MAX_DIAGRAM_SOURCE } from "./types";

const cache = new Map<string, string>();
const cacheKey = (kind: DiagramKind, source: string) => `${kind}\n${source}`;
export const cachedDiagram = (kind: DiagramKind, source: string) =>
  cache.get(cacheKey(kind, source));
let cacheBytes = 0;
function remember(kind: DiagramKind, source: string, svg: string) {
  const key = cacheKey(kind, source);
  if (cache.has(key)) return;
  cache.set(key, svg);
  cacheBytes += key.length + svg.length;
  while (cache.size > 32 || cacheBytes > 4 * 1024 * 1024) {
    const first = cache.keys().next().value as string;
    cacheBytes -= first.length + cache.get(first)!.length;
    cache.delete(first);
  }
}
export function cleanSvg(svg: string) {
  if (svg.length > 4 * 1024 * 1024) throw new Error("图表过大，请拆分后重试");
  const clean = String(
    DOMPurify.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: [
        "script",
        "foreignobject",
        "iframe",
        "object",
        "embed",
        "image",
        "feimage",
        "a",
        "set",
        "animate",
        "animatemotion",
        "animatetransform",
      ],
    }),
  );
  const document = new DOMParser().parseFromString(clean, "image/svg+xml");
  const root = document.documentElement;
  if (root.localName !== "svg" || document.querySelector("parsererror"))
    throw new Error("未生成有效的 SVG 图片");
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  // Mermaid emits width=100% without an intrinsic height. An <img> needs a
  // concrete natural size, otherwise shrink-to-fit wrappers can collapse to 0.
  const box = root
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    box?.length === 4 &&
    box.every(Number.isFinite) &&
    box[2] > 0 &&
    box[3] > 0
  ) {
    root.setAttribute("width", String(box[2]));
    root.setAttribute("height", String(box[3]));
  }
  for (const node of Array.from(root.querySelectorAll("use"))) {
    const href =
      node.getAttribute("href") || node.getAttribute("xlink:href") || "";
    if (!href.startsWith("#")) node.remove();
  }
  const safeCss = (css: string) =>
    css
      .replace(/@import[^;]*;?/gi, "")
      .replace(/url\(([^)]*)\)/gi, (match, value: string) =>
        value
          .trim()
          .replace(/^['"]|['"]$/g, "")
          .startsWith("#")
          ? match
          : "none",
      );
  root.querySelectorAll("style").forEach((style) => {
    style.textContent = safeCss(style.textContent || "");
  });
  root.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      if (/url\(/i.test(attribute.value))
        node.setAttribute(attribute.name, safeCss(attribute.value));
    }
  });
  return new XMLSerializer().serializeToString(root);
}
export function svgDataUrl(svg: string) {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

let worker: Worker | undefined;
let requestId = 0;
const pending = new Map<
  number,
  {
    resolve: (svg: string) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function resetWorker(message: string) {
  worker?.terminate();
  worker = undefined;
  for (const job of pending.values()) {
    clearTimeout(job.timer);
    job.reject(new Error(message));
  }
  pending.clear();
}
function layout(kind: DiagramKind, source: string): Promise<string> {
  if (!worker) {
    worker = new Worker(new URL("./layout.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      clearTimeout(job.timer);
      pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(data.svg);
    };
    worker.onerror = () => resetWorker("图表引擎加载失败，请重试");
  }
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = setTimeout(
      () => resetWorker("图表计算超时，请减少节点或拆分图表后重试"),
      20000,
    );
    pending.set(id, { resolve, reject, timer });
    worker!.postMessage({ id, kind, source });
  });
}

let mermaid: Promise<(typeof import("mermaid"))["default"]> | undefined;
let sequence = Promise.resolve();
let renderId = 0;
function renderMermaid(source: string): Promise<string> {
  const job = sequence.then(async () => {
    mermaid ||= import("mermaid").then(({ default: engine }) => {
      engine.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        maxTextSize: MAX_DIAGRAM_SOURCE,
        maxEdges: 500,
        htmlLabels: false,
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif',
        flowchart: { htmlLabels: false },
      });
      return engine;
    });
    const engine = await mermaid;
    const host = document.createElement("div");
    host.style.cssText =
      "position:fixed;left:-20000px;top:0;width:1200px;visibility:hidden;pointer-events:none";
    document.body.appendChild(host);
    try {
      return (await engine.render(`oraen-diagram-${++renderId}`, source, host))
        .svg;
    } finally {
      host.remove();
    }
  });
  sequence = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}
export async function renderDiagram(
  kind: DiagramKind,
  source: string,
  options: { signal?: AbortSignal } = {},
) {
  const existing = cachedDiagram(kind, source);
  if (existing) return existing;
  if (!source.trim()) throw new Error("图表源码为空");
  if (source.length > MAX_DIAGRAM_SOURCE)
    throw new Error("图表源码超过 40,000 字符，请拆分为多个图表");
  let svg: string;
  if (kind === "plantuml") {
    const { renderPlantuml } = await import("./plantuml/local");
    svg = await renderPlantuml(source);
  } else {
    svg =
      kind === "mermaid"
        ? await renderMermaid(source)
        : await layout(kind, source);
  }
  if (options.signal?.aborted) throw new DOMException("已取消", "AbortError");
  const clean = cleanSvg(svg);
  remember(kind, source, clean);
  return clean;
}
