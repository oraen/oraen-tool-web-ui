import { renderToString } from "./plantuml.js";

// Only packaged assets may be loaded. Diagram includes must never become
// arbitrary URLs or requests carrying document contents.
const bundles = new Map([
  ["emoji.js", "emoji.js"],
  ["openiconic.js", "openiconic.js"],
  ["themes.js", "themes.js"],
]);
globalThis.PLANTUML_STDLIB_LOADER = (name, ok, fail) => {
  const asset = bundles.get(name);
  if (!asset) {
    fail("此附加库未随应用提供；本地绘图不加载网络资源");
    return true;
  }
  const script = document.createElement("script");
  script.src = asset;
  script.onload = () => ok();
  script.onerror = () => fail("本地附加资源加载失败");
  document.head.appendChild(script);
  return true;
};
globalThis.PLANTUML_FILE_LOADER = (_path, _from, _ok, fail) => {
  fail(
    "当前 Markdown 未包含引用文件；请将需要的定义写入图表源码，网络引用已禁用",
  );
};
const send = (data) =>
  parent.postMessage({ channel: "oraen-local-plantuml", ...data }, "*");
window.addEventListener("message", (event) => {
  if (event.source !== parent || event.data?.channel !== "oraen-local-plantuml")
    return;
  const { id, source } = event.data;
  if (!Number.isSafeInteger(id) || typeof source !== "string") return;
  if (source.length > 40000) {
    send({ id, error: "图表源码过长，请拆分后重试" });
    return;
  }
  try {
    const body = source.trim().startsWith("@start")
      ? source
      : `@startuml\n${source}\n@enduml`;
    renderToString(
      body.split(/\r\n|\r|\n/),
      (svg) => send({ id, svg }),
      (error) => send({ id, error: String(error) }),
      { maxSvgSize: 8192 },
    );
  } catch (error) {
    send({
      id,
      error: error instanceof Error ? error.message : "本地 PlantUML 绘制失败",
    });
  }
});
send({ ready: true });
