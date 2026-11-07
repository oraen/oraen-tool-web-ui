export const MB = 1024 * 1024;
export const bytesLabel = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < MB
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / MB).toFixed(1)} MB`;
export const fileId = () =>
  crypto.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const safeName = (name: string) =>
  name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "") || "未命名";
export const stem = (name: string) => safeName(name.replace(/\.[^.]+$/, ""));
export function uniqueName(name: string, used: Set<string>) {
  let candidate = name;
  const dot = name.lastIndexOf(".");
  const slash = name.lastIndexOf("/");
  const base = dot > slash ? name.slice(0, dot) : name;
  const extension = dot > slash ? name.slice(dot) : "";
  for (let index = 2; used.has(candidate.toLowerCase()); index++)
    candidate = `${base} (${index})${extension}`;
  used.add(candidate.toLowerCase());
  return candidate;
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName(name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("操作已取消", "AbortError");
}
export const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";
export const errorLabel = (error: unknown) =>
  error instanceof Error ? error.message : "处理失败，请重试";
export const breathe = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));
export function canvasBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("图片编码失败，请尝试较小的尺寸"));
        else if (blob.type !== type)
          reject(new Error("当前浏览器不支持此导出格式"));
        else resolve(blob);
      },
      type,
      quality,
    ),
  );
}
export async function decodeImage(file: Blob) {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap as CanvasImageSource,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return {
        source: img as CanvasImageSource,
        width: img.naturalWidth,
        height: img.naturalHeight,
        close: () => {
          img.src = "";
        },
      };
    } catch {
      throw new Error("无法读取图片，请确认它是有效的 PNG、JPEG 或 WebP 图片");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
export async function thumbnail(file: Blob) {
  const image = await decodeImage(file);
  const canvas = document.createElement("canvas");
  try {
    if (!image.width || image.width * image.height > 32_000_000)
      throw new Error("图片超过 3200 万像素，请缩小后再导入");
    const scale = Math.min(1, 260 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas
      .getContext("2d")!
      .drawImage(image.source, 0, 0, canvas.width, canvas.height);
    return {
      blob: await canvasBlob(canvas),
      width: image.width,
      height: image.height,
    };
  } finally {
    image.close();
    canvas.width = canvas.height = 0;
  }
}
