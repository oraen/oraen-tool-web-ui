import { canvasBlob, checkAbort, decodeImage, breathe } from "../shared/files";
export interface ImageSettings {
  format: "jpeg" | "png" | "webp";
  maxEdge: number;
  quality: number;
  targetKB: number;
  shrink: boolean;
  ratio: number;
  focalX: number;
  focalY: number;
  background: string;
  watermark: string;
  watermarkPosition: "bottom-right" | "center" | "tile";
  watermarkOpacity: number;
  watermarkSize: number;
}
export const defaultSettings: ImageSettings = {
  format: "jpeg",
  maxEdge: 1920,
  quality: 85,
  targetKB: 0,
  shrink: true,
  ratio: 0,
  focalX: 50,
  focalY: 50,
  background: "#ffffff",
  watermark: "",
  watermarkPosition: "bottom-right",
  watermarkOpacity: 35,
  watermarkSize: 4,
};
export async function processImage(
  file: File,
  settings: ImageSettings,
  signal: AbortSignal,
) {
  checkAbort(signal);
  const image = await decodeImage(file);
  const canvas = document.createElement("canvas");
  try {
    if (
      !image.width ||
      !image.height ||
      image.width * image.height > 32_000_000
    )
      throw new Error("图片尺寸无效或超过 3200 万像素");
    let sw = image.width,
      sh = image.height;
    if (settings.ratio > 0) {
      if (sw / sh > settings.ratio) sw = sh * settings.ratio;
      else sh = sw / settings.ratio;
    }
    const sx = ((image.width - sw) * settings.focalX) / 100;
    const sy = ((image.height - sh) * settings.focalY) / 100;
    const scale = Math.min(1, settings.maxEdge / Math.max(sw, sh));
    let width = Math.max(1, Math.round(sw * scale)),
      height = Math.max(1, Math.round(sh * scale));
    const target = settings.targetKB * 1024;
    const mime = `image/${settings.format}`;
    let output: Blob | undefined;
    const draw = () => {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d")!;
      context.imageSmoothingQuality = "high";
      if (settings.format === "jpeg") {
        context.fillStyle = settings.background;
        context.fillRect(0, 0, width, height);
      }
      context.drawImage(image.source, sx, sy, sw, sh, 0, 0, width, height);
      if (settings.watermark.trim()) {
        const size = Math.max(
          10,
          Math.round((width * settings.watermarkSize) / 100),
        );
        context.font = `600 ${size}px system-ui, "Microsoft YaHei", sans-serif`;
        context.globalAlpha = settings.watermarkOpacity / 100;
        context.fillStyle = "#ffffff";
        context.strokeStyle = "#000000";
        context.lineWidth = Math.max(1, size / 18);
        const text = settings.watermark.trim().slice(0, 120);
        const textWidth = context.measureText(text).width;
        const padding = Math.max(8, Math.round(width * 0.025));
        const paint = (x: number, y: number) => {
          context.strokeText(text, x, y);
          context.fillText(text, x, y);
        };
        if (settings.watermarkPosition === "tile") {
          for (let y = size + padding; y < height; y += size * 4)
            for (
              let x = padding;
              x < width;
              x += Math.max(textWidth + padding * 3, width / 3)
            )
              paint(x, y);
        } else if (settings.watermarkPosition === "center")
          paint(Math.max(padding, (width - textWidth) / 2), height / 2);
        else
          paint(
            Math.max(padding, width - textWidth - padding),
            height - padding,
          );
        context.globalAlpha = 1;
      }
    };
    for (let attempt = 0; attempt < 9; attempt++) {
      checkAbort(signal);
      draw();
      await breathe();
      output = await canvasBlob(canvas, mime, settings.quality / 100);
      if (!target || output.size <= target) break;
      if (settings.format !== "png") {
        let low = 0.08,
          high = settings.quality / 100;
        const smallest = await canvasBlob(canvas, mime, low);
        if (smallest.size <= target) {
          output = smallest;
          for (let step = 0; step < 7; step++) {
            checkAbort(signal);
            const quality = (low + high) / 2;
            const trial = await canvasBlob(canvas, mime, quality);
            if (trial.size <= target) {
              output = trial;
              low = quality;
            } else high = quality;
          }
          break;
        }
        output = smallest;
      }
      if (!settings.shrink || Math.min(width, height) <= 32) break;
      const factor = Math.max(
        0.25,
        Math.min(0.85, Math.sqrt(target / output.size) * 0.9),
      );
      width = Math.max(1, Math.floor(width * factor));
      height = Math.max(1, Math.floor(height * factor));
    }
    checkAbort(signal);
    // canvas holds the dimensions of the actual last encoded image, even if the final retry proposed a smaller one.
    return {
      blob: output!,
      width: canvas.width,
      height: canvas.height,
      reached: !target || output!.size <= target,
    };
  } finally {
    image.close();
    canvas.width = canvas.height = 0;
  }
}
