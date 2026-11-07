import { version } from "@plantuml/core/package.json";

let frame: HTMLIFrameElement | undefined;
let loading: Promise<HTMLIFrameElement> | undefined;
let failLoading: ((error: Error) => void) | undefined;
let requestId = 0;
let removeListener: (() => void) | undefined;
const jobs = new Map<
  number,
  {
    resolve: (svg: string) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function reset(message: string) {
  removeListener?.();
  removeListener = undefined;
  failLoading?.(new Error(message));
  failLoading = undefined;
  frame?.remove();
  frame = undefined;
  loading = undefined;
  for (const job of jobs.values()) {
    clearTimeout(job.timer);
    job.reject(new Error(message));
  }
  jobs.clear();
}
function load() {
  if (loading) return loading;
  loading = new Promise<HTMLIFrameElement>((resolve, reject) => {
    const element = document.createElement("iframe");
    frame = element;
    element.title = "本地 PlantUML 绘图引擎";
    element.setAttribute("aria-hidden", "true");
    element.style.cssText =
      "position:fixed;left:-20000px;top:0;width:1200px;height:900px;visibility:hidden;pointer-events:none;border:0";
    const timer = setTimeout(
      () => reset("本地 PlantUML 引擎加载超时，请刷新后重试"),
      20000,
    );
    failLoading = (error) => {
      clearTimeout(timer);
      reject(error);
    };
    element.onerror = () => reset("本地 PlantUML 引擎加载失败");
    const onMessage = (event: MessageEvent) => {
      if (frame !== element) {
        window.removeEventListener("message", onMessage);
        return;
      }
      if (
        event.source !== element.contentWindow ||
        event.data?.channel !== "oraen-local-plantuml"
      )
        return;
      if (event.data.ready) {
        clearTimeout(timer);
        failLoading = undefined;
        resolve(element);
        return;
      }
      const job = jobs.get(event.data.id);
      if (!job) return;
      clearTimeout(job.timer);
      jobs.delete(event.data.id);
      if (typeof event.data.error === "string")
        job.reject(new Error(event.data.error));
      else if (typeof event.data.svg === "string") job.resolve(event.data.svg);
      else job.reject(new Error("本地引擎未生成有效图片"));
    };
    window.addEventListener("message", onMessage);
    removeListener = () => window.removeEventListener("message", onMessage);
    element.src = new URL(
      `${import.meta.env.BASE_URL}plantuml/${version}/frame.html`,
      document.baseURI,
    ).href;
    document.body.appendChild(element);
  });
  return loading;
}
export async function renderPlantuml(source: string) {
  const element = await load();
  return new Promise<string>((resolve, reject) => {
    const id = ++requestId;
    const timer = setTimeout(
      () => reset("PlantUML 绘制超时，请减少节点或拆分图表后重试"),
      20000,
    );
    jobs.set(id, { resolve, reject, timer });
    element.contentWindow!.postMessage(
      { channel: "oraen-local-plantuml", id, source },
      "*",
    );
  });
}
