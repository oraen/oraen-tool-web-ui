import JSZip from "jszip";
import { checkAbort, MB } from "../shared/files";
export interface ZipEntryInfo {
  path: string;
  sourcePath?: string;
  size: number;
  compressed: number;
  crc: number;
  directory: boolean;
}
export interface OpenArchive {
  zip: JSZip;
  entries: ZipEntryInfo[];
  size: number;
  name: string;
}
export const ZIP_LIMITS = {
  entries: 2000,
  total: 200 * MB,
  file: 50 * MB,
  archive: 100 * MB,
};
export function cleanPath(path: string): string {
  const name = path.replace(/\\/g, "/");
  if (
    !name ||
    name.length > 1024 ||
    /^[a-z]:|^\//i.test(name) ||
    /[\x00-\x1f]/.test(name) ||
    name.split("/").some((part) => part === ".." || part === ".")
  )
    throw new Error("压缩包包含不安全的文件路径");
  return name.replace(/\/+$/, "");
}
const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crcChunk(crc: number, data: Uint8Array) {
  let value = crc;
  for (const byte of data)
    value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return value >>> 0;
}
export async function openArchive(
  file: File,
  encoding: "utf-8" | "gb18030",
  signal: AbortSignal,
): Promise<OpenArchive> {
  if (file.size > ZIP_LIMITS.archive) throw new Error("压缩包不能超过 100 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  checkAbort(signal);
  const view = new DataView(bytes.buffer);
  let end = -1;
  for (
    let offset = bytes.length - 22;
    offset >= Math.max(0, bytes.length - 65557);
    offset--
  ) {
    if (
      view.getUint32(offset, true) === 0x06054b50 &&
      offset + 22 + view.getUint16(offset + 20, true) === bytes.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error("不是有效的 ZIP 文件，或文件已损坏");
  const count = view.getUint16(end + 10, true),
    directorySize = view.getUint32(end + 12, true),
    directoryOffset = view.getUint32(end + 16, true);
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    view.getUint16(end + 8, true) !== count
  )
    throw new Error("暂不支持分卷 ZIP");
  if (
    count === 65535 ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  )
    throw new Error("暂不支持 ZIP64，请创建普通 ZIP 后再导入");
  if (count > ZIP_LIMITS.entries) throw new Error("压缩包最多支持 2000 个条目");
  if (directoryOffset + directorySize > end)
    throw new Error("压缩包目录信息不完整");
  const entries: ZipEntryInfo[] = [];
  const seen = new Set<string>();
  let total = 0,
    offset = directoryOffset;
  for (let index = 0; index < count; index++) {
    if (
      offset + 46 > bytes.length ||
      view.getUint32(offset, true) !== 0x02014b50
    )
      throw new Error("压缩包目录已损坏");
    const flags = view.getUint16(offset + 8, true),
      method = view.getUint16(offset + 10, true),
      crc = view.getUint32(offset + 16, true);
    const compressed = view.getUint32(offset + 20, true),
      size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true),
      extraLength = view.getUint16(offset + 30, true),
      commentLength = view.getUint16(offset + 32, true);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > directoryOffset + directorySize)
      throw new Error("压缩包条目信息不完整");
    if (flags & 0x41) throw new Error("暂不支持带密码或加密的 ZIP");
    if (![0, 8].includes(method))
      throw new Error("仅支持 STORE / DEFLATE 压缩方式");
    if (
      size === 0xffffffff ||
      compressed === 0xffffffff ||
      view.getUint32(offset + 42, true) === 0xffffffff
    )
      throw new Error("暂不支持 ZIP64");
    const rawName = new TextDecoder(flags & 0x800 ? "utf-8" : encoding).decode(
      bytes.slice(offset + 46, offset + 46 + nameLength),
    );
    const directory = rawName.endsWith("/") || rawName.endsWith("\\");
    const path = cleanPath(rawName);
    if (seen.has(path)) throw new Error("压缩包包含重复路径，请整理后重试");
    seen.add(path);
    if (size > ZIP_LIMITS.file || (total += size) > ZIP_LIMITS.total)
      throw new Error("解压后单文件不能超过 50 MB，总计不能超过 200 MB");
    const attributes = view.getUint32(offset + 38, true) >>> 16;
    if ((attributes & 0xf000) === 0xa000)
      throw new Error("压缩包包含符号链接，暂不支持");
    entries.push({ path, size, compressed, crc, directory });
    offset = next;
  }
  const zip = await JSZip.loadAsync(bytes, {
    createFolders: false,
    decodeFileName: (data) =>
      new TextDecoder(encoding).decode(
        data instanceof Uint8Array
          ? data
          : Uint8Array.from(data as unknown as number[]),
      ),
  });
  checkAbort(signal);
  // JSZip may apply a Unicode-path extra field. Validate its final names as well as the central-directory names.
  for (const entry of Object.values(zip.files)) {
    cleanPath(entry.name);
    const unsafe = (
      entry as JSZip.JSZipObject & { unsafeOriginalName?: string }
    ).unsafeOriginalName;
    if (unsafe) cleanPath(unsafe);
  }
  // Match by raw directory order, allowing JSZip's validated Unicode path extra fields.
  const loaded = Object.values(zip.files);
  if (loaded.length !== entries.length)
    throw new Error("压缩包目录存在重复或冲突条目");
  const finalEntries = loaded.map((entry, index) => ({
    ...entries[index],
    path: cleanPath(entry.name),
    sourcePath: entry.name,
    directory: entry.dir || entries[index].directory,
  }));
  // Do not trust object insertion order when a filename is an integer-like JavaScript key.
  if (finalEntries.some((entry, index) => entry.path !== entries[index].path)) {
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));
    for (let index = 0; index < loaded.length; index++) {
      const original =
        (loaded[index] as JSZip.JSZipObject & { unsafeOriginalName?: string })
          .unsafeOriginalName || loaded[index].name;
      const metadata =
        byPath.get(cleanPath(original)) ||
        byPath.get(cleanPath(loaded[index].name));
      if (!metadata)
        throw new Error("压缩包文件名编码不一致，请切换文件名编码后重试");
      finalEntries[index] = {
        ...metadata,
        path: cleanPath(loaded[index].name),
        sourcePath: loaded[index].name,
        directory: loaded[index].dir || metadata.directory,
      };
    }
  }
  return { zip, entries: finalEntries, size: total, name: file.name };
}
export function extractEntry(
  archive: OpenArchive,
  info: ZipEntryInfo,
  signal: AbortSignal,
): Promise<Blob> {
  checkAbort(signal);
  const entry = archive.zip.file(info.sourcePath || info.path) as
    | (JSZip.JSZipObject & {
        internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array>;
      })
    | null;
  if (!entry || info.directory) return Promise.reject(new Error("文件不存在"));
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0,
      crc = 0xffffffff,
      finished = false;
    const stream = entry.internalStream("uint8array");
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
      .on("data", (data) => {
        if (finished) return;
        size += data.length;
        if (size > ZIP_LIMITS.file || size > info.size) {
          fail(new Error("解压数据超过声明大小，已停止"));
          return;
        }
        crc = crcChunk(crc, data);
        chunks.push(data);
      })
      .on("error", fail)
      .on("end", () => {
        if (finished) return;
        if (size !== info.size || (crc ^ 0xffffffff) >>> 0 !== info.crc) {
          fail(new Error("文件校验失败，压缩包可能已损坏"));
          return;
        }
        finished = true;
        signal.removeEventListener("abort", abort);
        resolve(new Blob(chunks));
      })
      .resume();
  });
}
