import JSZip from "jszip";
import {
  checkAbort,
  canvasBlob,
  downloadBlob,
  MB,
  stem,
} from "../../../fileUtil/shared/files";
import { generateZip } from "../../../fileUtil/shared/zip";
const blobData = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(blob);
  });
export async function embedImages(html: string, signal: AbortSignal) {
  const document = new DOMParser().parseFromString(html, "text/html");
  const images = Array.from(document.querySelectorAll<HTMLImageElement>("img"));
  let missing = document.querySelectorAll(".export-missing-image").length;
  let size = 0;
  for (const image of images) {
    checkAbort(signal);
    if (image.src.startsWith("data:")) continue;
    try {
      if (images.indexOf(image) >= 30) throw new Error("图片数量过多");
      const timeout = new AbortController();
      const abort = () => timeout.abort();
      signal.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(abort, 6000);
      try {
        const response = await fetch(image.src, {
          signal: timeout.signal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        if (
          !response.ok ||
          Number(response.headers.get("content-length")) > 10 * MB
        )
          throw new Error("图片无法读取");
        const blob = await response.blob();
        if (
          !blob.type.startsWith("image/") ||
          blob.size > 10 * MB ||
          size + blob.size > 30 * MB
        )
          throw new Error("图片过大或格式不支持");
        size += blob.size;
        image.src = await blobData(blob);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
      }
    } catch {
      checkAbort(signal);
      missing++;
      const label = document.createElement("span");
      label.className = "export-missing-image";
      label.textContent = `${image.alt || "图片"}（无法嵌入，可能不允许跨域读取）`;
      image.replaceWith(label);
    }
  }
  checkAbort(signal);
  return {
    html: `<!doctype html>\n${document.documentElement.outerHTML}`,
    missing,
  };
}
export async function exportFrame(
  html: string,
  width: number,
  signal: AbortSignal,
) {
  checkAbort(signal);
  const frame = document.createElement("iframe");
  frame.title = "导出文档渲染";
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:1000px;border:0;pointer-events:none;`;
  const loaded = new Promise<void>((resolve, reject) => {
    frame.onload = () => resolve();
    frame.onerror = () => reject(new Error("导出预览加载失败"));
  });
  frame.srcdoc = html;
  document.body.appendChild(frame);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      loaded,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("导出预览加载超时")), 10000);
      }),
    ]);
    checkAbort(signal);
    const doc = frame.contentDocument!;
    await doc.fonts.ready;
    await Promise.all(
      Array.from(doc.images).map((image) =>
        image.decode().catch(() => undefined),
      ),
    );
    checkAbort(signal);
    return frame;
  } catch (error) {
    frame.remove();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export async function printDocument(
  html: string,
  width: number,
  signal: AbortSignal,
) {
  const frame = await exportFrame(html, width, signal);
  const cleanup = () => frame.remove();
  frame.contentWindow!.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 120000);
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
}
export async function imageDocument(
  html: string,
  name: string,
  width: number,
  signal: AbortSignal,
  progress: (value: number) => void,
) {
  const frame = await exportFrame(html, width, signal);
  try {
    const { default: html2canvas } = await import("html2canvas");
    checkAbort(signal);
    const body = frame.contentDocument!.body;
    const height = Math.ceil(body.scrollHeight);
    if (height > 80000)
      throw new Error("文档过长，请分段导出，或改用 HTML / PDF");
    const partHeight = height <= 6000 ? height : 4000;
    const count = Math.ceil(height / partHeight);
    const zip = new JSZip();
    for (let part = 0; part < count; part++) {
      checkAbort(signal);
      const canvas = await html2canvas(body, {
        width,
        height: Math.min(partHeight, height - part * partHeight),
        y: part * partHeight,
        scale: 1.5,
        windowWidth: width,
        windowHeight: 1000,
        scrollX: 0,
        scrollY: 0,
        logging: false,
        useCORS: true,
        backgroundColor: null,
      });
      try {
        checkAbort(signal);
        const blob = await canvasBlob(canvas);
        if (count === 1) {
          downloadBlob(blob, `${stem(name)}.png`);
          progress(100);
          return;
        }
        zip.file(
          `${stem(name)}-${String(part + 1).padStart(2, "0")}.png`,
          blob,
        );
        progress(Math.round(((part + 1) / count) * 90));
      } finally {
        canvas.width = canvas.height = 0;
      }
    }
    const archive = await generateZip(zip, signal, (value) =>
      progress(90 + Math.round(value / 10)),
    );
    checkAbort(signal);
    downloadBlob(archive, `${stem(name)}-长图分段.zip`);
  } finally {
    frame.remove();
  }
}
