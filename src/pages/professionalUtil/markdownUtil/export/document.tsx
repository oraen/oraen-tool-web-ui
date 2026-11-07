import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getHeadings, headingPlugin } from "../markdown";
import { diagramKind, diagramNames } from "../diagrams/types";
export type ExportTheme = "clean" | "paper" | "night";
export interface ExportSettings {
  theme: ExportTheme;
  fontSize: number;
  title: boolean;
  width: number;
}
export const exportDefaults: ExportSettings = {
  theme: "clean",
  fontSize: 16,
  title: false,
  width: 900,
};
const palette = {
  clean: {
    bg: "#ffffff",
    text: "#253047",
    muted: "#65738a",
    accent: "#2563eb",
    line: "#dfe5ee",
    fill: "#f4f6fa",
    font: 'system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif',
  },
  paper: {
    bg: "#faf7ef",
    text: "#3f382e",
    muted: "#827465",
    accent: "#9b603c",
    line: "#e4dccb",
    fill: "#f0eadf",
    font: 'Georgia,"Noto Serif SC","Songti SC",SimSun,serif',
  },
  night: {
    bg: "#151b25",
    text: "#e2e8f0",
    muted: "#a0aec0",
    accent: "#8ab7ff",
    line: "#344154",
    fill: "#202a38",
    font: 'system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif',
  },
};
export function exportStyles(settings: ExportSettings) {
  const p = palette[settings.theme];
  return `*{box-sizing:border-box}html{background:${p.bg};color-scheme:${settings.theme === "night" ? "dark" : "light"}}body{margin:0;background:${p.bg};color:${p.text};font:${settings.fontSize}px/1.85 ${p.font};overflow-wrap:anywhere}.export-document{max-width:${settings.width}px;margin:0 auto;padding:48px 52px 64px}.export-file-title{color:${p.muted};font:12px/1.5 system-ui,sans-serif;padding-bottom:18px;margin-bottom:28px;border-bottom:1px solid ${p.line}}h1,h2,h3,h4,h5,h6{line-height:1.4;font-weight:650;margin:1.6em 0 .7em;break-after:avoid}h1{font-size:2em;padding-bottom:.5em;border-bottom:1px solid ${p.line}}h2{font-size:1.45em;padding-bottom:.4em;border-bottom:1px solid ${p.line}}h3{font-size:1.2em}h4,h5,h6{font-size:1em}.export-content>:first-child{margin-top:0}p,ul,ol{margin:0 0 1em}ul,ol{padding-left:1.8em}li>p{margin-bottom:.4em}a{color:${p.accent};text-underline-offset:3px}blockquote{margin:1.4em 0;padding:12px 20px;background:${p.fill};border-left:3px solid ${p.accent};color:${p.muted}}blockquote>:last-child{margin-bottom:0}code{font:.88em/1.7 Consolas,Monaco,monospace;background:${p.fill};padding:2px 5px;border-radius:4px}pre{padding:20px;background:${p.fill};border:1px solid ${p.line};border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:2}pre code{padding:0;background:none;font-size:13px}table{border-collapse:collapse;width:100%;font-size:.92em;margin:1.4em 0}thead{display:table-header-group}th,td{border:1px solid ${p.line};padding:8px 12px;overflow-wrap:anywhere}th{background:${p.fill}}tr{break-inside:avoid}img{max-width:100%;height:auto;break-inside:avoid}hr{border:0;border-top:1px solid ${p.line};margin:2em 0}.contains-task-list{list-style:none;padding-left:.3em}input[type=checkbox]{margin-right:8px}.export-missing-image{display:block;border:1px dashed ${p.line};border-radius:6px;padding:16px;color:${p.muted};font:12px/1.7 system-ui,sans-serif}.export-diagram{margin:1.4em 0;padding:18px;border:1px solid ${p.line};border-radius:8px;break-inside:avoid}.export-diagram>img{display:block;margin:0 auto;max-height:640px;background:#fff}.export-diagram summary{cursor:pointer;font-size:12px;color:${p.muted};margin-top:12px}.export-diagram figcaption{font-size:13px;color:${p.muted};white-space:pre-wrap}p{orphans:3;widows:3}@page{size:A4;margin:18mm 16mm}@media print{.export-diagram details{display:none}html,body{background:#fff!important;color:#172033!important;font-size:11pt}.export-document{max-width:none;padding:0}.export-file-title{color:#667085}a{color:#2458a4}pre,blockquote,th,code{background:#f4f5f7!important;color:#253047!important}pre{font-size:9pt}pre,table,blockquote{max-width:100%}img{max-height:240mm;object-fit:contain}h1{font-size:24pt}h2{font-size:17pt}h3{font-size:13pt}}`;
}
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
export function buildExportHtml(
  name: string,
  content: string,
  settings: ExportSettings,
) {
  const headings = getHeadings(content);
  const body = renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={[remarkGfm, headingPlugin]}
      components={{
        pre: ({ children }) => <>{children}</>,
        code: ({ inline, className, children }) => {
          if (inline) return <code className={className}>{children}</code>;
          const kind = diagramKind(
            /language-([^\s]+)/.exec(className || "")?.[1] || "",
          );
          return kind ? (
            <figure className="export-diagram" data-md-diagram={kind}>
              <figcaption>
                {diagramNames[kind]} 图表正在准备，源码如下
              </figcaption>
              <pre>
                <code>{children}</code>
              </pre>
            </figure>
          ) : (
            <pre>
              <code className={className}>{children}</code>
            </pre>
          );
        },
        a: ({ href, children, node, ...props }) => {
          let link = href;
          if (href?.startsWith("#")) {
            let anchor = href.slice(1);
            try {
              anchor = decodeURIComponent(anchor);
            } catch {}
            const match = headings.find(
              (heading) => heading.slug === anchor || heading.id === anchor,
            );
            if (match) link = `#${match.id}`;
          }
          return (
            <a {...props} href={link} rel="noopener noreferrer">
              {children}
            </a>
          );
        },
        img: ({ src, alt }) =>
          src && /^(https?:|data:image\/|blob:)/i.test(src) ? (
            <img
              src={src}
              alt={alt || "文档图片"}
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="export-missing-image">
              {alt || "图片"}（相对路径资源未包含在文档中）
            </span>
          ),
      }}
    >
      {content}
    </ReactMarkdown>,
  );
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http: blob:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"><title>${escapeHtml(name)}</title><style>${exportStyles(settings)}</style></head><body><main class="export-document">${settings.title ? `<header class="export-file-title">${escapeHtml(name)}</header>` : ""}<article class="export-content">${body}</article></main></body></html>`;
}
