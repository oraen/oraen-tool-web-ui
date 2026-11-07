import { renderDiagram, svgDataUrl } from "./render";
import { DiagramKind, diagramNames } from "./types";

export async function renderExportDiagrams(html: string, signal: AbortSignal) {
  const document = new DOMParser().parseFromString(html, "text/html");
  const diagrams = Array.from(
    document.querySelectorAll<HTMLElement>("[data-md-diagram]"),
  );
  let missing = 0;
  for (const figure of diagrams) {
    if (signal.aborted) throw new DOMException("已取消", "AbortError");
    const kind = figure.dataset.mdDiagram as DiagramKind;
    const source = (figure.querySelector("code")?.textContent || "").replace(
      /\n$/,
      "",
    );
    try {
      const svg = await renderDiagram(kind, source, { signal });
      if (signal.aborted) throw new DOMException("已取消", "AbortError");
      const image = document.createElement("img");
      image.src = svgDataUrl(svg);
      image.alt = `${diagramNames[kind]} 图表`;
      const details = document.createElement("details");
      const label = document.createElement("summary");
      label.textContent = "图表源码";
      const code = figure.querySelector("pre");
      details.appendChild(label);
      if (code) details.appendChild(code);
      figure.replaceChildren(image, details);
    } catch (error) {
      if (signal.aborted) throw new DOMException("已取消", "AbortError");
      missing++;
      const label = figure.querySelector("figcaption");
      if (label)
        label.textContent =
          error instanceof Error ? error.message : "图表未能绘制，已保留源码";
    }
  }
  return {
    html: `<!doctype html>\n${document.documentElement.outerHTML}`,
    missing,
  };
}
