import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Form,
  Input,
  InputNumber,
  Progress,
  Select,
  Slider,
  Space,
  Tag,
  message,
} from "antd";
import {
  DeleteOutlined,
  DownloadOutlined,
  FileImageOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import JSZip from "jszip";
import ToolPage from "../shared/ToolPage";
import useUrls from "../shared/useUrls";
import {
  MB,
  bytesLabel,
  checkAbort,
  downloadBlob,
  errorLabel,
  fileId,
  isAbort,
  stem,
  thumbnail,
  uniqueName,
} from "../shared/files";
import { defaultSettings, ImageSettings, processImage } from "./processor";
import { generateZip } from "../shared/zip";

interface ImageRecord {
  id: string;
  file: File;
  thumb: string;
  width: number;
  height: number;
  status: "pending" | "working" | "done" | "error";
  error?: string;
  result?: {
    blob: Blob;
    thumb: string;
    width: number;
    height: number;
    reached: boolean;
  };
}
const ImageBatch: React.FC = () => {
  const [records, setRecords] = useState<ImageRecord[]>([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const urls = useUrls();
  useEffect(() => () => operation.current?.abort(), []);
  const results = records.filter((record) => record.result);
  function change<K extends keyof ImageSettings>(
    key: K,
    value: ImageSettings[K],
  ) {
    setSettings((previous) => ({ ...previous, [key]: value }));
    setRecords((previous) =>
      previous.map((record) => {
        urls.revoke(record.result?.thumb);
        return {
          ...record,
          result: undefined,
          status: "pending",
          error: undefined,
        };
      }),
    );
  }
  async function addFiles(files: File[]) {
    if (operation.current || !files.length) return;
    if (
      files.length + records.length > 50 ||
      files.reduce(
        (sum, file) => sum + file.size,
        records.reduce((sum, record) => sum + record.file.size, 0),
      ) >
        100 * MB
    ) {
      message.warning("每批最多 50 张图片，原文件总计不超过 100 MB");
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setProgress(0);
    setPhase("读取图片");
    const added: ImageRecord[] = [];
    try {
      for (const [index, file] of files.entries()) {
        checkAbort(controller.signal);
        try {
          if (
            !/\.(png|jpe?g|webp|bmp)$/i.test(file.name) ||
            file.size > 20 * MB
          )
            throw new Error("仅支持 PNG/JPEG/WebP/BMP，单张不超过 20 MB");
          const preview = await thumbnail(file);
          checkAbort(controller.signal);
          added.push({
            id: fileId(),
            file,
            thumb: urls.make(preview.blob),
            width: preview.width,
            height: preview.height,
            status: "pending",
          });
        } catch (error) {
          if (isAbort(error)) throw error;
          message.error(`${file.name}：${errorLabel(error)}`);
        }
        setProgress(Math.round(((index + 1) / files.length) * 100));
      }
      setRecords((previous) => [...previous, ...added]);
    } catch (error) {
      added.forEach((record) => urls.revoke(record.thumb));
      if (!isAbort(error)) message.error(errorLabel(error));
    } finally {
      operation.current = null;
      setBusy(false);
      setPhase("");
    }
  }
  async function run() {
    if (operation.current || !records.length) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setPhase("处理图片");
    setProgress(0);
    try {
      for (const [index, record] of records.entries()) {
        checkAbort(controller.signal);
        urls.revoke(record.result?.thumb);
        setRecords((previous) =>
          previous.map((item) =>
            item.id === record.id
              ? {
                  ...item,
                  result: undefined,
                  status: "working",
                  error: undefined,
                }
              : item,
          ),
        );
        try {
          const result = await processImage(
            record.file,
            settings,
            controller.signal,
          );
          const preview = await thumbnail(result.blob);
          checkAbort(controller.signal);
          const output = { ...result, thumb: urls.make(preview.blob) };
          setRecords((previous) =>
            previous.map((item) =>
              item.id === record.id
                ? { ...item, status: "done", result: output }
                : item,
            ),
          );
        } catch (error) {
          if (isAbort(error)) throw error;
          setRecords((previous) =>
            previous.map((item) =>
              item.id === record.id
                ? { ...item, status: "error", error: errorLabel(error) }
                : item,
            ),
          );
        }
        setProgress(Math.round(((index + 1) / records.length) * 100));
      }
    } catch (error) {
      if (!isAbort(error)) message.error(errorLabel(error));
    } finally {
      setRecords((previous) =>
        previous.map((item) =>
          item.status === "working" ? { ...item, status: "pending" } : item,
        ),
      );
      operation.current = null;
      setBusy(false);
      setPhase("");
    }
  }
  async function exportAll() {
    if (operation.current || !results.length) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setPhase("打包下载");
    setProgress(0);
    try {
      const zip = new JSZip();
      const used = new Set<string>();
      results.forEach((record) =>
        zip.file(
          uniqueName(
            `${stem(record.file.name)}.${settings.format === "jpeg" ? "jpg" : settings.format}`,
            used,
          ),
          record.result!.blob,
        ),
      );
      const blob = await generateZip(zip, controller.signal, setProgress);
      checkAbort(controller.signal);
      downloadBlob(blob, "处理后的图片.zip");
    } catch (error) {
      if (!isAbort(error)) message.error(errorLabel(error));
    } finally {
      operation.current = null;
      setBusy(false);
      setPhase("");
    }
  }
  function remove(record: ImageRecord) {
    urls.revoke(record.thumb);
    urls.revoke(record.result?.thumb);
    setRecords((previous) => previous.filter((item) => item.id !== record.id));
  }
  return (
    <ToolPage
      title="图片批量处理"
      description="一次处理整批图片，自定义尺寸、裁剪、体积和水印。"
      icon={<FileImageOutlined />}
    >
      <input
        ref={input}
        id="image-batch-input"
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.bmp"
        multiple
        hidden
        onChange={(event) => {
          void addFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      <div className="tool-two-columns">
        <section className="tool-panel tool-options">
          <h3>处理设置</h3>
          <Form layout="vertical" disabled={busy}>
            <Form.Item label="导出格式">
              <Select
                aria-label="导出格式"
                value={settings.format}
                onChange={(value) => change("format", value)}
                options={[
                  { value: "jpeg", label: "JPEG · 更小体积" },
                  { value: "png", label: "PNG · 保留透明" },
                  { value: "webp", label: "WebP · 高效压缩" },
                ]}
              />
            </Form.Item>
            <Form.Item label="最长边（像素，不放大原图）">
              <InputNumber
                aria-label="最长边"
                min={32}
                max={8192}
                value={settings.maxEdge}
                onChange={(value) => value && change("maxEdge", value)}
              />
            </Form.Item>
            <Form.Item label="裁剪比例">
              <Select
                aria-label="裁剪比例"
                value={settings.ratio}
                onChange={(value) => change("ratio", value)}
                options={[
                  { value: 0, label: "保留完整画面" },
                  { value: 1, label: "1 : 1 · 正方形" },
                  { value: 4 / 3, label: "4 : 3" },
                  { value: 16 / 9, label: "16 : 9" },
                  { value: 3 / 4, label: "3 : 4 · 竖图" },
                ]}
              />
            </Form.Item>
            {!!settings.ratio && (
              <>
                <Form.Item label="裁剪焦点 · 水平">
                  <Slider
                    aria-label="水平焦点"
                    min={0}
                    max={100}
                    value={settings.focalX}
                    onChange={(value) => change("focalX", value)}
                  />
                </Form.Item>
                <Form.Item label="裁剪焦点 · 垂直">
                  <Slider
                    aria-label="垂直焦点"
                    value={settings.focalY}
                    onChange={(value) => change("focalY", value)}
                  />
                </Form.Item>
              </>
            )}
            <Form.Item label={`最高质量 · ${settings.quality}%`}>
              <Slider
                min={10}
                max={100}
                disabled={busy || settings.format === "png"}
                value={settings.quality}
                onChange={(value) => change("quality", value)}
              />
            </Form.Item>
            <Form.Item label="目标体积（KB，0 表示不限制）">
              <InputNumber
                aria-label="目标体积"
                min={0}
                max={20000}
                value={settings.targetKB}
                onChange={(value) => change("targetKB", value || 0)}
              />
            </Form.Item>
            {!!settings.targetKB && (
              <Form.Item>
                <Checkbox
                  checked={settings.shrink}
                  onChange={(event) => change("shrink", event.target.checked)}
                >
                  允许缩小尺寸以满足体积
                </Checkbox>
              </Form.Item>
            )}
            {settings.format === "jpeg" && (
              <Form.Item label="透明区域背景">
                <input
                  type="color"
                  aria-label="透明区域背景"
                  value={settings.background}
                  disabled={busy}
                  onChange={(event) => change("background", event.target.value)}
                />
              </Form.Item>
            )}
            <Form.Item label="文字水印（可选）">
              <Input
                aria-label="文字水印"
                maxLength={120}
                value={settings.watermark}
                onChange={(event) => change("watermark", event.target.value)}
                placeholder="例如：仅供资料审核使用"
              />
            </Form.Item>
            {!!settings.watermark && (
              <>
                <Form.Item label="水印位置">
                  <Select
                    value={settings.watermarkPosition}
                    onChange={(value) => change("watermarkPosition", value)}
                    options={[
                      { value: "bottom-right", label: "右下角" },
                      { value: "center", label: "居中" },
                      { value: "tile", label: "平铺" },
                    ]}
                  />
                </Form.Item>
                <Form.Item label="水印不透明度">
                  <Slider
                    min={10}
                    max={100}
                    value={settings.watermarkOpacity}
                    onChange={(value) => change("watermarkOpacity", value)}
                  />
                </Form.Item>
                <Form.Item label="水印字号（相对图片宽度 %）">
                  <Slider
                    min={1}
                    max={10}
                    value={settings.watermarkSize}
                    onChange={(value) => change("watermarkSize", value)}
                  />
                </Form.Item>
              </>
            )}
          </Form>
          <p className="tool-note">
            图片重新编码后不保留原始 EXIF 等元信息。PNG
            不支持有损质量调节；若未达到体积目标，会明确标记。
          </p>
        </section>
        <section
          className="tool-panel"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void addFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <div className="tool-toolbar">
            <Space wrap>
              <Button
                icon={<UploadOutlined />}
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                添加图片
              </Button>
              <Button
                type="primary"
                aria-label="开始处理"
                disabled={busy || !records.length}
                onClick={run}
              >
                开始处理
              </Button>
              {busy && (
                <Button
                  aria-label="取消处理"
                  onClick={() => operation.current?.abort()}
                >
                  取消
                </Button>
              )}
            </Space>
            <Space>
              <span>
                {records.length} 张 /{" "}
                {bytesLabel(
                  records.reduce((sum, record) => sum + record.file.size, 0),
                )}
              </span>
              <Button
                icon={<DownloadOutlined />}
                disabled={busy || !results.length}
                onClick={exportAll}
              >
                打包下载 {results.length || ""}
              </Button>
              <Button
                disabled={busy || !records.length}
                onClick={() => {
                  records.forEach((record) => {
                    urls.revoke(record.thumb);
                    urls.revoke(record.result?.thumb);
                  });
                  setRecords([]);
                }}
              >
                清空
              </Button>
            </Space>
          </div>
          {busy && (
            <div className="tool-progress">
              <span>{phase}</span>
              <Progress percent={progress} />
            </div>
          )}
          {!!results.length && (
            <Alert
              style={{ marginBottom: 16 }}
              type={
                results.some((record) => !record.result?.reached)
                  ? "warning"
                  : "success"
              }
              showIcon
              message={`已完成 ${results.length} 张 · 输出 ${bytesLabel(results.reduce((sum, record) => sum + record.result!.blob.size, 0))}`}
            />
          )}
          {records.length ? (
            <div className="tool-grid">
              {records.map((record) => (
                <div className="tool-file-card" key={record.id}>
                  <div className="tool-file-preview">
                    <img
                      src={record.result?.thumb || record.thumb}
                      alt={record.file.name}
                    />
                  </div>
                  <div className="tool-file-info">
                    <strong title={record.file.name}>{record.file.name}</strong>
                    <small>
                      原图 {record.width} × {record.height} ·{" "}
                      {bytesLabel(record.file.size)}
                    </small>
                    {record.result && (
                      <>
                        <small>
                          输出 {record.result.width} × {record.result.height} ·{" "}
                          {bytesLabel(record.result.blob.size)}
                        </small>
                        <Tag color={record.result.reached ? "green" : "orange"}>
                          {record.result.reached
                            ? "处理完成"
                            : "未达到目标体积"}
                        </Tag>
                      </>
                    )}
                    {record.status === "working" && (
                      <Tag color="blue">处理中</Tag>
                    )}
                    {record.error && (
                      <p className="tool-error">{record.error}</p>
                    )}
                    <Space>
                      <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        disabled={busy || !record.result}
                        aria-label={`下载 ${record.file.name}`}
                        onClick={() =>
                          downloadBlob(
                            record.result!.blob,
                            `${stem(record.file.name)}.${settings.format === "jpeg" ? "jpg" : settings.format}`,
                          )
                        }
                      >
                        下载
                      </Button>
                      <Button
                        size="small"
                        type="text"
                        disabled={busy}
                        icon={<DeleteOutlined />}
                        aria-label={`移除 ${record.file.name}`}
                        onClick={() => remove(record)}
                      />
                    </Space>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="tool-empty">
              <Empty description="添加图片，或将整批图片拖到这里" />
              <span className="tool-note">
                最多 50 张，总计 100 MB；支持 PNG、JPEG、WebP、BMP。
              </span>
            </div>
          )}
        </section>
      </div>
    </ToolPage>
  );
};
export default ImageBatch;
