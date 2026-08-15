import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Form,
  Progress,
  Row,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import {
  CloudUploadOutlined,
  DownloadOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  MergeCellsOutlined,
  SwapOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import type { UploadFile } from "antd/es/upload/interface";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

type ToolMode = "convert" | "merge";
type FileKind = "image" | "video" | "unknown";
type ConvertFormat = "png" | "jpg" | "jpeg" | "svg" | "gif" | "mp4" | "avi" | "mkv" | "mov";
type ImageQuality = "high" | "balanced" | "small";
type VideoPreset = "copy" | "fast" | "balanced";

const imageFormats: ConvertFormat[] = ["png", "jpg", "jpeg", "svg", "gif"];
const videoFormats: ConvertFormat[] = ["mp4", "avi", "mkv", "mov"];

const mimeByFormat: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  gif: "image/gif",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  mp4: "video/mp4",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
};

const imageQualityOptions: Record<ImageQuality, number> = {
  high: 0.95,
  balanced: 0.82,
  small: 0.65,
};

const withBase = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

const formatLabel = (format: string) => format.toUpperCase();

const getExtension = (fileName: string) => {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext || "";
};

const getFileKind = (format: string): FileKind => {
  if (imageFormats.includes(format as ConvertFormat)) return "image";
  if (videoFormats.includes(format as ConvertFormat)) return "video";
  return "unknown";
};

const replaceExtension = (fileName: string, targetFormat: string) => {
  const baseName = fileName.replace(/\.[^/.]+$/, "");
  return `${baseName}.${targetFormat}`;
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const readImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    image.src = url;
  });
};

const canvasToBlob = (canvas: HTMLCanvasElement, mime: string, quality?: number) => {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("文件导出失败"));
        }
      },
      mime,
      quality,
    );
  });
};

const convertSvgToImage = async (file: File, targetFormat: ConvertFormat, quality: ImageQuality) => {
  const svgText = await file.text();
  const image = await readImage(new File([svgText], file.name, { type: "image/svg+xml" }));
  return rasterImage(image, targetFormat, quality);
};

const rasterImage = async (image: HTMLImageElement, targetFormat: ConvertFormat, quality: ImageQuality) => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("当前浏览器不支持 Canvas");
  }

  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  if (targetFormat === "jpg" || targetFormat === "jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.drawImage(image, 0, 0);

  if (targetFormat === "gif") {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const palette = quantize(imageData.data, 256);
    const index = applyPalette(imageData.data, palette);
    const gif = GIFEncoder();
    gif.writeFrame(index, canvas.width, canvas.height, { palette, delay: 0 });
    gif.finish();
    return new Blob([gif.bytes()], { type: "image/gif" });
  }

  return canvasToBlob(canvas, mimeByFormat[targetFormat], imageQualityOptions[quality]);
};

const wrapSvgFromImage = async (file: File) => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
  const image = await readImage(file);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${image.naturalWidth}" height="${image.naturalHeight}" viewBox="0 0 ${image.naturalWidth} ${image.naturalHeight}">`,
    `<image href="${dataUrl}" width="${image.naturalWidth}" height="${image.naturalHeight}" />`,
    "</svg>",
  ].join("");

  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
};

const FileConversion: React.FC = () => {
  const [mode, setMode] = useState<ToolMode>("convert");
  const [convertFile, setConvertFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<ConvertFormat | undefined>();
  const [imageQuality, setImageQuality] = useState<ImageQuality>("balanced");
  const [videoPreset, setVideoPreset] = useState<VideoPreset>("fast");
  const [convertLoading, setConvertLoading] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [mergeOutput, setMergeOutput] = useState<"pdf" | "docx">("pdf");
  const [mergeLoading, setMergeLoading] = useState(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const sourceFormat = convertFile ? getExtension(convertFile.name) : "";
  const sourceKind = getFileKind(sourceFormat);

  const targetOptions = useMemo(() => {
    if (!convertFile || sourceKind === "unknown") return [];
    const groups = sourceKind === "image" ? imageFormats : videoFormats;
    return groups
      .filter((format) => format !== sourceFormat)
      .map((format) => ({ value: format, label: formatLabel(format) }));
  }, [convertFile, sourceFormat, sourceKind]);

  const uploadFileList: UploadFile[] = convertFile
    ? [
        {
          uid: "-1",
          name: convertFile.name,
          status: "done",
          size: convertFile.size,
        },
      ]
    : [];

  const mergeUploadList: UploadFile[] = mergeFiles.map((file, index) => ({
    uid: `${index}`,
    name: file.name,
    status: "done",
    size: file.size,
  }));

  const handleSelectConvertFile = (file: File) => {
    const format = getExtension(file.name);
    const kind = getFileKind(format);

    setConvertFile(file);
    setTargetFormat(undefined);
    setVideoProgress(0);

    if (kind === "unknown") {
      message.warning(`暂不支持 .${format || "unknown"} 格式`);
      return false;
    }

    message.success(`已识别为 ${kind === "image" ? "图片" : "视频"}文件`);
    return false;
  };

  const convertImage = async (file: File, target: ConvertFormat) => {
    if (sourceFormat === "svg" && target !== "svg") {
      return convertSvgToImage(file, target, imageQuality);
    }
    if (target === "svg") {
      return wrapSvgFromImage(file);
    }
    const image = await readImage(file);
    return rasterImage(image, target, imageQuality);
  };

  const loadFfmpeg = async () => {
    if (!ffmpegRef.current) {
      ffmpegRef.current = new FFmpeg();
      ffmpegRef.current.on("progress", ({ progress }) => {
        setVideoProgress(Math.max(0, Math.min(100, Math.round(progress * 100))));
      });
    }

    if (!ffmpegRef.current.loaded) {
      await ffmpegRef.current.load({
        classWorkerURL: withBase("ffmpeg/worker.js"),
        coreURL: withBase("ffmpeg/ffmpeg-core.js"),
        wasmURL: withBase("ffmpeg/ffmpeg-core.wasm"),
      });
    }

    return ffmpegRef.current;
  };

  const convertVideo = async (file: File, target: ConvertFormat) => {
    const ffmpeg = await loadFfmpeg();
    const inputName = `input.${sourceFormat}`;
    const outputName = `output.${target}`;
    const args =
      videoPreset === "copy"
        ? ["-i", inputName, "-c", "copy", outputName]
        : [
            "-i",
            inputName,
            "-preset",
            videoPreset === "fast" ? "ultrafast" : "medium",
            "-crf",
            videoPreset === "fast" ? "28" : "23",
            outputName,
          ];

    setVideoProgress(1);
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    const code = await ffmpeg.exec(args);
    if (code !== 0) {
      throw new Error("视频转码失败");
    }

    const data = await ffmpeg.readFile(outputName);
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);
    setVideoProgress(100);
    return new Blob([data], { type: mimeByFormat[target] || "application/octet-stream" });
  };

  const handleConvert = async () => {
    if (!convertFile) {
      message.warning("请先选择文件");
      return;
    }
    if (sourceKind === "unknown") {
      message.warning(`暂不支持 .${sourceFormat || "unknown"} 格式`);
      return;
    }
    if (!targetFormat) {
      message.warning("请选择目标格式");
      return;
    }
    setConvertLoading(true);
    try {
      const blob =
        sourceKind === "image"
          ? await convertImage(convertFile, targetFormat)
          : await convertVideo(convertFile, targetFormat);
      downloadBlob(blob, replaceExtension(convertFile.name, targetFormat));
      message.success("转换完成，文件已开始下载");
    } catch (error) {
      console.error(error);
      message.error(error instanceof Error ? error.message : "转换失败，请重试");
    } finally {
      setConvertLoading(false);
    }
  };

  const validateMergeFiles = () => {
    if (mergeFiles.length < 2) {
      message.warning("请至少选择 2 个文件");
      return null;
    }

    const formats = mergeFiles.map((file) => getExtension(file.name));
    const firstFormat = formats[0];
    const sameType = formats.every((format) => format === firstFormat);

    if (!sameType) {
      message.warning("请上传同一种格式的文件");
      return null;
    }

    if (firstFormat !== "pdf" && firstFormat !== "docx" && firstFormat !== "doc") {
      message.warning("文档拼接仅支持 PDF、DOCX、DOC");
      return null;
    }

    if (firstFormat === "doc") {
      message.warning("DOC 是旧版二进制格式，当前本地页面暂不支持拼接，请先转为 DOCX。");
      return null;
    }

    return firstFormat as "pdf" | "docx";
  };

  const mergePdf = async () => {
    const outputPdf = await PDFDocument.create();

    for (const file of mergeFiles) {
      const sourcePdf = await PDFDocument.load(await file.arrayBuffer());
      const pages = await outputPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
      pages.forEach((page) => outputPdf.addPage(page));
    }

    const bytes = await outputPdf.save();
    return new Blob([bytes], { type: "application/pdf" });
  };

  const mergeDocx = async () => {
    const baseZip = await JSZip.loadAsync(mergeFiles[0]);
    const baseDocument = await baseZip.file("word/document.xml")?.async("string");

    if (!baseDocument) {
      throw new Error("DOCX 文件结构异常");
    }

    const bodyClose = "</w:body>";
    const documentClose = "</w:document>";
    let mergedBody = baseDocument.slice(0, baseDocument.lastIndexOf(bodyClose));

    for (const file of mergeFiles.slice(1)) {
      const zip = await JSZip.loadAsync(file);
      const docXml = await zip.file("word/document.xml")?.async("string");
      if (!docXml) {
        throw new Error(`${file.name} 文件结构异常`);
      }

      const bodyStart = docXml.indexOf("<w:body>");
      const bodyEnd = docXml.lastIndexOf(bodyClose);
      const bodyContent = docXml.slice(bodyStart + "<w:body>".length, bodyEnd);
      const sectionPropertyIndex = bodyContent.lastIndexOf("<w:sectPr");
      const cleanBody = sectionPropertyIndex >= 0 ? bodyContent.slice(0, sectionPropertyIndex) : bodyContent;
      mergedBody += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>${cleanBody}`;
    }

    const tail = baseDocument.slice(baseDocument.lastIndexOf(bodyClose), baseDocument.indexOf(documentClose) + documentClose.length);
    baseZip.file("word/document.xml", mergedBody + tail);

    return baseZip.generateAsync({
      type: "blob",
      mimeType: mimeByFormat.docx,
    });
  };

  const handleMerge = async () => {
    const fileType = validateMergeFiles();
    if (!fileType) return;

    if (mergeOutput !== fileType) {
      message.warning(`当前本地拼接会保持原格式，请选择导出 ${formatLabel(fileType)}`);
      setMergeOutput(fileType);
      return;
    }

    setMergeLoading(true);
    try {
      const blob = fileType === "pdf" ? await mergePdf() : await mergeDocx();
      downloadBlob(blob, `merged-${Date.now()}.${fileType}`);
      message.success("拼接完成，文件已开始下载");
    } catch (error) {
      console.error(error);
      message.error(error instanceof Error ? error.message : "拼接失败，请检查文件是否损坏");
    } finally {
      setMergeLoading(false);
    }
  };

  return (
    <div style={{ padding: 20, minHeight: "100vh", background: "#f5f7fb" }}>
      <Space direction="vertical" size={18} style={{ width: "100%" }}>
        <Card bordered={false} bodyStyle={{ padding: 20 }}>
          <Row gutter={[12, 12]} align="middle">
            <Col flex="auto">
              <Title level={3} style={{ margin: 0 }}>
                文件处理
              </Title>
              <Text type="secondary">所有处理都在当前浏览器本地完成，文件不会上传到服务器。</Text>
            </Col>
            <Col>
              <Space>
                <Tag color="blue">图片</Tag>
                <Tag color="green">PDF</Tag>
                <Tag color="orange">视频</Tag>
                <Tag>DOCX</Tag>
              </Space>
            </Col>
          </Row>
        </Card>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(120px, 1fr))",
            gap: 14,
          }}
        >
          <Card
            hoverable
            onClick={() => setMode("convert")}
            bodyStyle={{ height: 132, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 10 }}
            style={{ borderColor: mode === "convert" ? "#1677ff" : undefined }}
          >
            <SwapOutlined style={{ fontSize: 34, color: "#1677ff" }} />
            <Text strong>文件转换</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              图片 / 视频
            </Text>
          </Card>
          <Card
            hoverable
            onClick={() => setMode("merge")}
            bodyStyle={{ height: 132, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 10 }}
            style={{ borderColor: mode === "merge" ? "#1677ff" : undefined }}
          >
            <MergeCellsOutlined style={{ fontSize: 34, color: "#13a8a8" }} />
            <Text strong>文档拼接</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              PDF / DOCX
            </Text>
          </Card>
        </div>

        {mode === "convert" ? (
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Card title="文件转换" bordered={false}>
                <Space direction="vertical" size="large" style={{ width: "100%" }}>
                  <Dragger
                    maxCount={1}
                    fileList={uploadFileList}
                    beforeUpload={handleSelectConvertFile}
                    onRemove={() => {
                      setConvertFile(null);
                      setTargetFormat(undefined);
                    }}
                    accept=".png,.jpg,.jpeg,.svg,.gif,.mp4,.avi,.mkv,.mov"
                  >
                    <p className="ant-upload-drag-icon">
                      <CloudUploadOutlined />
                    </p>
                    <p className="ant-upload-text">点击或拖拽文件到这里</p>
                    <p className="ant-upload-hint">识别文件格式后，会自动给出可转换的目标格式。</p>
                  </Dragger>

                  {convertFile ? (
                    <Alert
                      showIcon
                      type={sourceKind === "unknown" ? "warning" : "info"}
                      message={`当前文件：${convertFile.name}`}
                      description={
                        sourceKind === "unknown"
                          ? "暂不支持这个格式。"
                          : `已识别为 ${sourceKind === "image" ? "图片" : "视频"}，请选择目标格式后导出。`
                      }
                    />
                  ) : null}

                  <Form layout="vertical">
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Form.Item label="目标文件类型">
                          <Select
                            placeholder="请先上传文件"
                            value={targetFormat}
                            onChange={setTargetFormat}
                            options={targetOptions}
                            disabled={!convertFile || sourceKind === "unknown"}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item label="参数选择">
                          {sourceKind === "video" ? (
                            <Select
                              value={videoPreset}
                              onChange={setVideoPreset}
                              options={[
                                { value: "fast", label: "快速转码（体积适中）" },
                                { value: "balanced", label: "平衡质量（耗时更长）" },
                                { value: "copy", label: "仅封装转换（最快，兼容性取决于源编码）" },
                              ]}
                            />
                          ) : (
                            <Select
                              value={imageQuality}
                              onChange={setImageQuality}
                              disabled={sourceKind !== "image"}
                              options={[
                                { value: "high", label: "高质量" },
                                { value: "balanced", label: "均衡" },
                                { value: "small", label: "小体积" },
                              ]}
                            />
                          )}
                        </Form.Item>
                      </Col>
                    </Row>
                  </Form>

                  {sourceKind === "video" && convertLoading ? <Progress percent={videoProgress} status="active" /> : null}

                  <Button
                    type="primary"
                    size="large"
                    icon={<DownloadOutlined />}
                    loading={convertLoading}
                    disabled={convertLoading || !convertFile || !targetFormat || sourceKind === "unknown"}
                    onClick={handleConvert}
                    block
                    style={convertLoading ? { backgroundColor: "#d9d9d9", borderColor: "#d9d9d9", color: "rgba(0, 0, 0, 0.45)" } : undefined}
                  >
                    {convertLoading ? "转换中..." : "确认转换并下载"}
                  </Button>
                </Space>
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="支持范围" bordered={false} style={{ height: "100%" }}>
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <Paragraph>
                    <FileImageOutlined /> 图片支持 PNG、JPG、JPEG、SVG、GIF 互转。转换 SVG 到位图会按浏览器渲染结果导出。
                  </Paragraph>
                  <Paragraph>
                    <VideoCameraOutlined /> 视频支持 MP4、AVI、MKV、MOV 互转，首次使用会加载本地 FFmpeg WASM，较大文件会比较慢。
                  </Paragraph>
                </Space>
              </Card>
            </Col>
          </Row>
        ) : (
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Card title="文档拼接" bordered={false}>
                <Space direction="vertical" size="large" style={{ width: "100%" }}>
                  <Dragger
                    multiple
                    fileList={mergeUploadList}
                    beforeUpload={(file) => {
                      const format = getExtension(file.name);
                      if (!["pdf", "docx", "doc"].includes(format)) {
                        message.warning("只支持 PDF、DOCX、DOC 文档");
                        return false;
                      }
                      setMergeFiles((current) => [...current, file]);
                      if (format === "pdf" || format === "docx") {
                        setMergeOutput(format);
                      }
                      return false;
                    }}
                    onRemove={(file) => {
                      setMergeFiles((current) => current.filter((item) => item.name !== file.name));
                    }}
                    accept=".pdf,.doc,.docx"
                  >
                    <p className="ant-upload-drag-icon">
                      <CloudUploadOutlined />
                    </p>
                    <p className="ant-upload-text">选择多个同类型文档</p>
                    <p className="ant-upload-hint">文件会按上传列表顺序拼接，处理过程只发生在本地。</p>
                  </Dragger>

                  {mergeFiles.length ? (
                    <Alert
                      showIcon
                      type="info"
                      message={`已选择 ${mergeFiles.length} 个文件`}
                      description={mergeFiles.map((file, index) => `${index + 1}. ${file.name}`).join(" / ")}
                    />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有选择文件" />
                  )}

                  <Form layout="vertical">
                    <Form.Item label="导出格式">
                      <Select
                        value={mergeOutput}
                        onChange={setMergeOutput}
                        options={[
                          { value: "pdf", label: "PDF" },
                          { value: "docx", label: "DOCX" },
                        ]}
                      />
                    </Form.Item>
                  </Form>

                  <Button
                    type="primary"
                    size="large"
                    icon={<MergeCellsOutlined />}
                    loading={mergeLoading}
                    disabled={mergeLoading || mergeFiles.length < 2}
                    onClick={handleMerge}
                    block
                    style={mergeLoading ? { backgroundColor: "#d9d9d9", borderColor: "#d9d9d9", color: "rgba(0, 0, 0, 0.45)" } : undefined}
                  >
                    {mergeLoading ? "拼接中..." : "拼接并下载"}
                  </Button>
                </Space>
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="拼接规则" bordered={false} style={{ height: "100%" }}>
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                  <Paragraph>
                    <FilePdfOutlined /> 多个 PDF 会合并为一个 PDF，保留原页面顺序。
                  </Paragraph>
                  <Paragraph>
                    <FileWordOutlined /> 多个 DOCX 会合并为一个 DOCX，并在每个文档之间插入分页。
                  </Paragraph>
                  <Paragraph type="secondary">
                    DOC 旧格式无法在浏览器内安全解析，建议先转成 DOCX 后再拼接。
                  </Paragraph>
                  <Divider />
                  <Text type="secondary">复杂 DOCX 样式、页眉页脚和媒体关系可能无法完整合并，重要文档请在下载后检查。</Text>
                </Space>
              </Card>
            </Col>
          </Row>
        )}
      </Space>
    </div>
  );
};

export default FileConversion;
