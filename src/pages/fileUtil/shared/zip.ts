import JSZip from "jszip";
import { checkAbort } from "./files";
export function generateZip(
  zip: JSZip,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
  compression: "STORE" | "DEFLATE" = "STORE",
): Promise<Blob> {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const stream = zip.generateInternalStream({
      type: "uint8array",
      compression,
      compressionOptions: { level: 6 },
      streamFiles: true,
    });
    let finished = false;
    const fail = (error: unknown) => {
      if (finished) return;
      finished = true;
      stream.pause();
      chunks.length = 0;
      signal.removeEventListener("abort", abort);
      reject(error);
    };
    const abort = () => fail(new DOMException("操作已取消", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    stream
      .on("data", (data, info) => {
        if (finished) return;
        chunks.push(data);
        onProgress(Math.round(info.percent));
      })
      .on("error", fail)
      .on("end", () => {
        if (finished) return;
        finished = true;
        signal.removeEventListener("abort", abort);
        resolve(new Blob(chunks, { type: "application/zip" }));
      })
      .resume();
  });
}
