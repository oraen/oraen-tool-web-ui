import { MAX_DIAGRAM_SOURCE } from "./types";
import { instance } from "@viz-js/viz";
import { renderSvg } from "nomnoml";

let viz: ReturnType<typeof instance> | undefined;
self.onmessage = async ({
  data,
}: MessageEvent<{ id: number; kind: string; source: string }>) => {
  try {
    if (data.source.length > MAX_DIAGRAM_SOURCE)
      throw new Error("图表源码过长，请拆分为多个图表");
    let svg: string;
    if (data.kind === "dot") {
      viz ||= instance();
      const engine = await viz;
      svg = engine.renderString(data.source, { format: "svg", engine: "dot" });
    } else {
      svg = renderSvg(data.source);
    }
    self.postMessage({ id: data.id, svg });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : "图表绘制失败",
    });
  }
};
