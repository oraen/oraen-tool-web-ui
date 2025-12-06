import React, { useState, useRef } from "react";
import { Card, Input, Button, Row, Col, Space, Select, Slider, message, Typography } from "antd";
import { DownloadOutlined, CopyOutlined, ClearOutlined } from "@ant-design/icons";
import { QRCodeSVG } from "qrcode.react";

const { TextArea } = Input;
const { Text } = Typography;

const QRCodeUtil: React.FC = () => {
  const [text, setText] = useState<string>("https://oraen.com");
  const [size, setSize] = useState<number>(256);
  const [bgColor, setBgColor] = useState<string>("#FFFFFF");
  const [fgColor, setFgColor] = useState<string>("#000000");
  const [level, setLevel] = useState<"L" | "M" | "Q" | "H">("M");
  const qrRef = useRef<HTMLDivElement>(null);

  // 下载QR码为PNG
  const downloadQRCode = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) {
      message.error("未找到二维码");
      return;
    }

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    canvas.width = size;
    canvas.height = size;

    img.onload = () => {
      ctx?.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "qrcode.png";
          link.click();
          URL.revokeObjectURL(url);
          message.success("下载成功");
        }
      });
    };

    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  // 下载QR码为SVG
  const downloadSVG = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) {
      message.error("未找到二维码");
      return;
    }

    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "qrcode.svg";
    link.click();
    URL.revokeObjectURL(url);
    message.success("下载成功");
  };

  // 复制文本
  const copyText = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        message.success("复制成功！");
      }).catch(() => {
        message.error("复制失败，请手动复制");
      });
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        message.success("复制成功！");
      } catch (err) {
        message.error("复制失败，请手动复制");
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "auto" }}>
      <Row gutter={[16, 16]}>
        {/* 左侧：输入和配置 */}
        <Col xs={24} md={12}>
          <Card title="二维码配置">
            <Space direction="vertical" style={{ width: "100%" }} size="large">
              {/* 文本输入 */}
              <div>
                <Text strong>输入内容：</Text>
                <TextArea
                  rows={6}
                  placeholder="输入文本或URL生成二维码"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  style={{ marginTop: 8 }}
                />
                <Space style={{ marginTop: 8 }}>
                  <Button icon={<CopyOutlined />} onClick={copyText}>
                    复制内容
                  </Button>
                  <Button icon={<ClearOutlined />} onClick={() => setText("")}>
                    清空
                  </Button>
                </Space>
              </div>

              {/* 尺寸设置 */}
              <div>
                <Text strong>尺寸：{size}px</Text>
                <Slider
                  min={128}
                  max={512}
                  value={size}
                  onChange={setSize}
                  marks={{
                    128: "128",
                    256: "256",
                    384: "384",
                    512: "512",
                  }}
                  style={{ marginTop: 8 }}
                />
              </div>

              {/* 容错级别 */}
              <div>
                <Text strong>容错级别：</Text>
                <Select
                  value={level}
                  onChange={setLevel}
                  style={{ width: "100%", marginTop: 8 }}
                  options={[
                    { value: "L", label: "L - 低 (7%)" },
                    { value: "M", label: "M - 中 (15%)" },
                    { value: "Q", label: "Q - 高 (25%)" },
                    { value: "H", label: "H - 最高 (30%)" },
                  ]}
                />
                <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: "block" }}>
                  容错率越高，二维码越复杂，但更能抵抗损坏
                </Text>
              </div>

              {/* 颜色设置 */}
              <Row gutter={16}>
                <Col span={12}>
                  <Text strong>前景色：</Text>
                  <Input
                    type="color"
                    value={fgColor}
                    onChange={(e) => setFgColor(e.target.value)}
                    style={{ width: "100%", height: 40, marginTop: 8 }}
                  />
                  <Input
                    value={fgColor}
                    onChange={(e) => setFgColor(e.target.value)}
                    placeholder="#000000"
                    style={{ marginTop: 8 }}
                  />
                </Col>
                <Col span={12}>
                  <Text strong>背景色：</Text>
                  <Input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    style={{ width: "100%", height: 40, marginTop: 8 }}
                  />
                  <Input
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    placeholder="#FFFFFF"
                    style={{ marginTop: 8 }}
                  />
                </Col>
              </Row>

              {/* 快速预设 */}
              <div>
                <Text strong>快速预设：</Text>
                <Space wrap style={{ marginTop: 8 }}>
                  <Button
                    size="small"
                    onClick={() => {
                      setText("https://oraen.com");
                      setSize(256);
                      setFgColor("#000000");
                      setBgColor("#FFFFFF");
                      setLevel("M");
                    }}
                  >
                    默认
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setText("https://github.com");
                      setSize(256);
                      setFgColor("#24292e");
                      setBgColor("#FFFFFF");
                      setLevel("H");
                    }}
                  >
                    GitHub
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setSize(384);
                      setFgColor("#1890ff");
                      setBgColor("#f0f5ff");
                      setLevel("Q");
                    }}
                  >
                    蓝色主题
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setSize(384);
                      setFgColor("#52c41a");
                      setBgColor("#f6ffed");
                      setLevel("Q");
                    }}
                  >
                    绿色主题
                  </Button>
                </Space>
              </div>
            </Space>
          </Card>
        </Col>

        {/* 右侧：二维码预览和下载 */}
        <Col xs={24} md={12}>
          <Card title="二维码预览">
            <Space direction="vertical" style={{ width: "100%" }} size="large">
              {/* 二维码显示 */}
              <div
                ref={qrRef}
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  padding: 20,
                  backgroundColor: "#f5f5f5",
                  borderRadius: 8,
                  minHeight: 300,
                }}
              >
                {text ? (
                  <QRCodeSVG
                    value={text}
                    size={size}
                    bgColor={bgColor}
                    fgColor={fgColor}
                    level={level}
                    includeMargin={true}
                  />
                ) : (
                  <Text type="secondary">请输入内容生成二维码</Text>
                )}
              </div>

              {/* 下载按钮 */}
              {text && (
                <Space style={{ width: "100%", justifyContent: "center" }}>
                  <Button
                    type="primary"
                    icon={<DownloadOutlined />}
                    onClick={downloadQRCode}
                  >
                    下载 PNG
                  </Button>
                  <Button icon={<DownloadOutlined />} onClick={downloadSVG}>
                    下载 SVG
                  </Button>
                </Space>
              )}

              {/* 使用说明 */}
              <Card size="small" title="使用说明" style={{ marginTop: 16 }}>
                <Space direction="vertical" size="small">
                  <Text>• 支持文本、URL、联系信息等各种内容</Text>
                  <Text>• 可自定义二维码颜色和尺寸</Text>
                  <Text>• 支持PNG和SVG两种格式下载</Text>
                  <Text>• 容错级别越高，二维码越复杂但更耐损坏</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    提示：扫描二维码前请确保打印或显示清晰
                  </Text>
                </Space>
              </Card>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 底部反馈信息 */}
      <Card
        title="反馈BUG: 1543493541@qq.com"
        style={{ marginTop: 20, textAlign: "center" }}
      >
        <Text strong style={{ fontSize: 24 }}>
          {"oraen.com"}
        </Text>
      </Card>
    </div>
  );
};

const QRCodeUtilComponent = QRCodeUtil as any;
QRCodeUtilComponent.route = { [MENU_PATH]: "/qrcodeUtil" };

export default QRCodeUtil;
