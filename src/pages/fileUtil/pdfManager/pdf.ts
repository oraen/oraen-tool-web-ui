import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { degrees, PDFDocument } from "pdf-lib";
import {
  canvasBlob,
  checkAbort,
  decodeImage,
  fileId,
  MB,
} from "../shared/files";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export interface PdfSource {
  id: string;
  name: string;
  bytes: Uint8Array;
  preview: pdfjs.PDFDocumentProxy;
}
export interface PdfPage {
  id: string;
  sourceId: string;
  index: number;
  rotation: number;
}
export const normalizeRotation = (value: number) => ((value % 360) + 360) % 360;
export async function loadPdf(
  file: File,
  paper: "original" | "a4",
  signal: AbortSignal,
): Promise<{ source: PdfSource; pages: PdfPage[] }> {
  if (file.size > 100 * MB) throw new Error("单个文件不能超过 100 MB");
  checkAbort(signal);
  let bytes: Uint8Array;
  if (/\.pdf$/i.test(file.name))
    bytes = new Uint8Array(await file.arrayBuffer());
  else {
    if (!/\.(png|jpe?g|webp)$/i.test(file.name))
      throw new Error("仅支持 PDF、PNG、JPEG、WebP");
    const decoded = await decodeImage(file);
    const canvas = document.createElement("canvas");
    try {
      if (decoded.width * decoded.height > 32_000_000)
        throw new Error("图片超过 3200 万像素");
      canvas.width = decoded.width;
      canvas.height = decoded.height;
      canvas.getContext("2d")!.drawImage(decoded.source, 0, 0);
      const png = await canvasBlob(canvas);
      const doc = await PDFDocument.create();
      const image = await doc.embedPng(await png.arrayBuffer());
      const landscape = image.width > image.height;
      const size: [number, number] =
        paper === "a4"
          ? landscape
            ? [841.89, 595.28]
            : [595.28, 841.89]
          : [Math.max(1, image.width * 0.75), Math.max(1, image.height * 0.75)];
      const page = doc.addPage(size);
      const margin = paper === "a4" ? 24 : 0;
      const scale = Math.min(
        (size[0] - margin * 2) / image.width,
        (size[1] - margin * 2) / image.height,
      );
      page.drawImage(image, {
        x: (size[0] - image.width * scale) / 2,
        y: (size[1] - image.height * scale) / 2,
        width: image.width * scale,
        height: image.height * scale,
      });
      bytes = await doc.save();
    } finally {
      decoded.close();
      canvas.width = canvas.height = 0;
    }
  }
  checkAbort(signal);
  try {
    await PDFDocument.load(bytes);
  } catch (error) {
    if (error instanceof Error && /encrypted/i.test(error.message))
      throw new Error("带密码或加密的 PDF 请先解密后再导入");
    throw new Error("PDF 无法读取，文件可能已损坏或不是有效 PDF");
  }
  const base = import.meta.env.BASE_URL;
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    cMapUrl: `${base}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
  });
  const abort = () => {
    void task.destroy();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const preview = await task.promise;
    if (signal.aborted || preview.numPages > 300) {
      await preview.destroy();
      checkAbort(signal);
      throw new Error("单个 PDF 最多支持 300 页");
    }
    const source: PdfSource = { id: fileId(), name: file.name, bytes, preview };
    return {
      source,
      pages: Array.from({ length: preview.numPages }, (_, index) => ({
        id: fileId(),
        sourceId: source.id,
        index,
        rotation: 0,
      })),
    };
  } catch (error) {
    await task.destroy();
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
export async function exportPages(
  pages: PdfPage[],
  sources: Map<string, PdfSource>,
  signal: AbortSignal,
  progress: (percent: number) => void,
  loaded = new Map<string, PDFDocument>(),
) {
  if (!pages.length) throw new Error("请至少保留一页");
  const output = await PDFDocument.create();
  for (const [index, record] of pages.entries()) {
    checkAbort(signal);
    if (!loaded.has(record.sourceId))
      loaded.set(
        record.sourceId,
        await PDFDocument.load(sources.get(record.sourceId)!.bytes),
      );
    const [page] = await output.copyPages(loaded.get(record.sourceId)!, [
      record.index,
    ]);
    page.setRotation(
      degrees(normalizeRotation(page.getRotation().angle + record.rotation)),
    );
    output.addPage(page);
    progress(Math.round(((index + 1) / pages.length) * 90));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  checkAbort(signal);
  const result = await output.save();
  checkAbort(signal);
  progress(100);
  return new Blob([result], { type: "application/pdf" });
}
export function parsePageRange(text: string, total: number) {
  if (!text.trim()) throw new Error("请输入页码，例如 1-3, 5");
  const result = new Set<number>();
  for (const part of text.replace(/[，、]/g, ",").split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match) throw new Error("页码格式不正确，请使用 1-3, 5 这样的格式");
    const start = Number(match[1]),
      end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > total)
      throw new Error(`页码需在 1–${total} 之间，区间需从小到大`);
    for (let page = start; page <= end; page++) result.add(page - 1);
  }
  return result;
}
