import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  InputNumber,
  Modal,
  Progress,
  Radio,
  Select,
  Space,
  message,
} from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { MarkdownFile } from "../db";
import {
  downloadBlob,
  errorLabel,
  isAbort,
  stem,
} from "../../../fileUtil/shared/files";
import { buildExportHtml, exportDefaults, ExportSettings } from "./document";
import { embedImages, imageDocument, printDocument } from "./operations";
import { renderExportDiagrams } from "../diagrams/export";
import "./index.less";
export default function ExportDialog({
  file,
  onClose,
  onMarkdown,
}: {
  file: MarkdownFile;
  onClose: () => void;
  onMarkdown: () => Promise<void>;
}) {
  const [format, setFormat] = useState<"md" | "html" | "pdf" | "png">("md");
  const [settings, setSettings] = useState<ExportSettings>(exportDefaults);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const previewRef = useRef<HTMLElement>(null);
  const [previewSize, setPreviewSize] = useState({ width: 600, height: 500 });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setPreviewSize({
        width: element.clientWidth,
        height: element.clientHeight,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const html = useMemo(
    () =>
      format === "md" ? "" : buildExportHtml(file.name, file.content, settings),
    [file, settings, format],
  );
  const [diagramPreview, setDiagramPreview] = useState({ base: "", html: "" });
  useEffect(() => {
    if (!html) return;
    const job = new AbortController();
    renderExportDiagrams(html, job.signal)
      .then((result) => {
        if (!job.signal.aborted)
          setDiagramPreview({ base: html, html: result.html });
      })
      .catch(() => undefined);
    return () => job.abort();
  }, [html]);
  const previewScale = Math.max(
    0.1,
    Math.min(1, previewSize.width / settings.width),
  );
  async function save() {
    if (controller.current) return;
    const job = new AbortController();
    controller.current = job;
    setBusy(true);
    setProgress(0);
    setStatus("准备导出文档");
    try {
      if (format === "md") {
        await onMarkdown();
        setStatus("Markdown 已导出");
        return;
      }
      setStatus("正在绘制图表并准备图片");
      const diagrams = await renderExportDiagrams(html, job.signal);
      if (diagrams.missing)
        message.warning(
          `${diagrams.missing} 个图表未能绘制，已在导出中保留源码和原因`,
        );
      const embedded = await embedImages(diagrams.html, job.signal);
      if (embedded.missing)
        message.warning(
          `${embedded.missing} 张图片无法嵌入，已在导出文档中标明`,
        );
      if (format === "html") {
        downloadBlob(
          new Blob([embedded.html], { type: "text/html;charset=utf-8" }),
          `${stem(file.name)}.html`,
        );
        setStatus("HTML 已导出，可直接离线打开");
      }
      if (format === "pdf") {
        await printDocument(embedded.html, settings.width, job.signal);
        setStatus("请在系统打印窗口中选择“另存为 PDF”，并按需启用背景图形");
      }
      if (format === "png") {
        setStatus("渲染长图，超长文档会分段打包");
        await imageDocument(
          embedded.html,
          file.name,
          settings.width,
          job.signal,
          setProgress,
        );
        setStatus("图片已导出");
      }
    } catch (error) {
      if (!isAbort(error)) {
        message.error(errorLabel(error));
        setStatus(errorLabel(error));
      } else setStatus("已取消导出");
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title="导出 Markdown 文档"
      width={1040}
      onCancel={() => {
        if (!busy) onClose();
      }}
      maskClosable={!busy}
      closable={!busy}
      footer={
        <Space>
          {busy ? (
            <Button onClick={() => controller.current?.abort()}>
              取消导出
            </Button>
          ) : (
            <Button aria-label="关闭" onClick={onClose}>
              关闭
            </Button>
          )}
          <Button
            aria-label="开始导出文档"
            type="primary"
            icon={<DownloadOutlined />}
            loading={busy}
            onClick={save}
          >
            {format === "pdf"
              ? "打开打印 / 存为 PDF"
              : format === "md"
                ? "下载 Markdown"
                : format === "html"
                  ? "下载 HTML"
                  : "导出长图"}
          </Button>
        </Space>
      }
    >
      <div className="md-export-layout">
        <section className="md-export-options">
          <label>导出格式</label>
          <Select
            aria-label="文档导出格式"
            value={format}
            disabled={busy}
            onChange={setFormat}
            options={[
              { value: "md", label: "Markdown · 原始文本" },
              { value: "html", label: "HTML · 独立网页" },
              { value: "pdf", label: "PDF · 系统打印" },
              { value: "png", label: "PNG · 文档长图" },
            ]}
          />
          {format !== "md" && (
            <>
              <label>文档主题</label>
              <Radio.Group
                aria-label="文档导出主题"
                value={settings.theme}
                disabled={busy}
                onChange={(event) =>
                  setSettings({ ...settings, theme: event.target.value })
                }
              >
                <Radio.Button value="clean">简洁</Radio.Button>
                <Radio.Button value="paper">纸感</Radio.Button>
                <Radio.Button value="night">深色</Radio.Button>
              </Radio.Group>
              <label>正文字号（像素）</label>
              <InputNumber
                aria-label="导出正文字号"
                min={12}
                max={24}
                value={settings.fontSize}
                disabled={busy}
                onChange={(value) =>
                  value && setSettings({ ...settings, fontSize: value })
                }
              />
              <label>文档宽度（像素）</label>
              <Select
                aria-label="导出文档宽度"
                disabled={busy}
                value={settings.width}
                onChange={(width) => setSettings({ ...settings, width })}
                options={[
                  { value: 720, label: "720 · 紧凑" },
                  { value: 900, label: "900 · 舒适" },
                  { value: 1080, label: "1080 · 宽屏" },
                ]}
              />
              <Checkbox
                disabled={busy}
                checked={settings.title}
                onChange={(event) =>
                  setSettings({ ...settings, title: event.target.checked })
                }
              >
                显示文件名页眉
              </Checkbox>
            </>
          )}
          <Alert
            type="info"
            showIcon
            message={
              format === "md"
                ? "保留原始 Markdown 内容"
                : format === "pdf"
                  ? "使用系统打印保留可选择的文字"
                  : format === "png"
                    ? "超长文档会自动分段为多张 PNG，并打包下载"
                    : "样式和可读取的图片会嵌入 HTML"
            }
            description={
              format === "md"
                ? "导出当前内容，包括尚在编辑的修改。"
                : "图片需可访问并允许跨域读取；无法嵌入的图片会显示占位说明。PDF 使用适合打印的浅色配色。"
            }
          />
          {!!status && (
            <p className="md-export-status" role="status">
              {status}
            </p>
          )}
          {busy && format === "png" && <Progress percent={progress} />}
        </section>
        <section className="md-export-preview" ref={previewRef}>
          {format === "md" ? (
            <pre>{file.content || "（空文档）"}</pre>
          ) : (
            <iframe
              title="文档导出预览"
              sandbox=""
              srcDoc={diagramPreview.base === html ? diagramPreview.html : html}
              style={{
                width: settings.width,
                height: previewSize.height / previewScale,
                transform: `scale(${previewScale})`,
                transformOrigin: "top left",
              }}
            />
          )}
        </section>
      </div>
    </Modal>
  );
}
