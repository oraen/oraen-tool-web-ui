import React, { useState, useEffect, useRef } from "react";
import { Card, Input, Button, Typography, Row, Col, message, Slider, Upload, Space, Tag, Tooltip } from "antd";
import { CopyOutlined, ClearOutlined, UploadOutlined, BgColorsOutlined } from "@ant-design/icons";
import type { UploadProps } from 'antd';

const { Title, Text } = Typography;

// 推荐颜色数据
const recommendedColors = [
  { name: "经典红", rgb: "220, 20, 60", hex: "#DC143C", hsl: "348, 83%, 47%" },
  { name: "天空蓝", rgb: "135, 206, 235", hex: "#87CEEB", hsl: "197, 71%, 73%" },
  { name: "森林绿", rgb: "34, 139, 34", hex: "#228B22", hsl: "120, 61%, 34%" },
  { name: "阳光黄", rgb: "255, 215, 0", hex: "#FFD700", hsl: "51, 100%, 50%" },
  { name: "优雅紫", rgb: "138, 43, 226", hex: "#8A2BE2", hsl: "271, 76%, 53%" },
  { name: "珊瑚橙", rgb: "255, 127, 80", hex: "#FF7F50", hsl: "16, 100%, 66%" },
  { name: "薄荷绿", rgb: "152, 251, 152", hex: "#98FB98", hsl: "120, 93%, 79%" },
  { name: "玫瑰粉", rgb: "255, 20, 147", hex: "#FF1493", hsl: "328, 100%, 54%" },
  { name: "深海蓝", rgb: "0, 0, 139", hex: "#00008B", hsl: "240, 100%, 27%" },
  { name: "金色", rgb: "255, 215, 0", hex: "#FFD700", hsl: "51, 100%, 50%" },
  { name: "银灰色", rgb: "192, 192, 192", hex: "#C0C0C0", hsl: "0, 0%, 75%" },
  { name: "巧克力棕", rgb: "210, 105, 30", hex: "#D2691E", hsl: "25, 75%, 47%" },
  { name: "青绿色", rgb: "0, 206, 209", hex: "#00CED1", hsl: "181, 100%, 41%" },
  { name: "番茄红", rgb: "255, 99, 71", hex: "#FF6347", hsl: "9, 100%, 64%" },
  { name: "薰衣草", rgb: "230, 230, 250", hex: "#E6E6FA", hsl: "240, 67%, 94%" },
  { name: "橄榄绿", rgb: "128, 128, 0", hex: "#808000", hsl: "60, 100%, 25%" },
];

// RGB转HEX
const rgbToHex = (r: number, g: number, b: number): string => {
  return "#" + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("").toUpperCase();
};

// HEX转RGB
const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

// RGB转HSL
const rgbToHsl = (r: number, g: number, b: number): { h: number; s: number; l: number } => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
};

// HSL转RGB
const hslToRgb = (h: number, s: number, l: number): { r: number; g: number; b: number } => {
  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
};

// 计算对比度
const getContrastRatio = (rgb1: { r: number; g: number; b: number }, rgb2: { r: number; g: number; b: number }): number => {
  const getLuminance = (r: number, g: number, b: number): number => {
    const [rs, gs, bs] = [r, g, b].map(val => {
      val = val / 255;
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };
  const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

// 获取对比度等级
const getContrastLevel = (ratio: number): { level: string; color: string } => {
  if (ratio >= 7) return { level: "AAA (大文本)", color: "#52c41a" };
  if (ratio >= 4.5) return { level: "AAA (正常文本)", color: "#52c41a" };
  if (ratio >= 3) return { level: "AA (大文本)", color: "#faad14" };
  if (ratio >= 1) return { level: "AA (正常文本)", color: "#faad14" };
  return { level: "不符合", color: "#ff4d4f" };
};

const ColorUtil: React.FC = () => {
  // 颜色转换相关状态
  const [colorInput, setColorInput] = useState<string>("");
  const [rgbValue, setRgbValue] = useState<{ r: number; g: number; b: number }>({ r: 47, g: 84, b: 235 });
  const [hexValue, setHexValue] = useState<string>("#2F54EB");
  const [hslValue, setHslValue] = useState<{ h: number; s: number; l: number }>({ h: 228, s: 82, l: 55 });

  // 调色板相关状态
  const [paletteColors, setPaletteColors] = useState<string[]>([]);

  // 渐变色相关状态
  const [gradientStart, setGradientStart] = useState<string>("#FF0000");
  const [gradientEnd, setGradientEnd] = useState<string>("#0000FF");
  const [gradientAngle, setGradientAngle] = useState<number>(90);
  const [gradientType, setGradientType] = useState<"linear" | "radial">("linear");

  // 图片取色相关状态
  const [imageUrl, setImageUrl] = useState<string>("");
  const [imageColors, setImageColors] = useState<Array<{ color: string; rgb: string; hex: string }>>([]);
  const [hoverColor, setHoverColor] = useState<{ color: string; rgb: string; hex: string } | null>(null);
  const [storedColors, setStoredColors] = useState<Array<{ color: string; rgb: string; hex: string }>>([
    { color: "#FFFFFF", rgb: "rgb(255, 255, 255)", hex: "#FFFFFF" },
    { color: "#FFFFFF", rgb: "rgb(255, 255, 255)", hex: "#FFFFFF" },
    { color: "#FFFFFF", rgb: "rgb(255, 255, 255)", hex: "#FFFFFF" },
  ]);
  const [nextStorageIndex, setNextStorageIndex] = useState<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // 对比度检查相关状态
  const [contrastColor1, setContrastColor1] = useState<string>("#FFFFFF");
  const [contrastColor2, setContrastColor2] = useState<string>("#000000");

  // 自动识别颜色格式并转换
  const handleColorInputChange = (value: string) => {
    setColorInput(value);
    value = value.trim();

    // 尝试解析HEX
    if (/^#?[0-9A-Fa-f]{6}$/.test(value)) {
      const hex = value.startsWith("#") ? value : `#${value}`;
      const rgb = hexToRgb(hex);
      if (rgb) {
        setRgbValue(rgb);
        setHexValue(hex.toUpperCase());
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        setHslValue(hsl);
      }
      return;
    }

    // 尝试解析RGB的两种格式：
    // 1. 裸格式：21,23,42
    // 2. 包裵格式：rgb(21, 23, 42) 或 rgb(21,23,42)
    const rgbMatch = value.match(/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*$/) || 
                     value.match(/rgb\(?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)?/i);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]);
      const g = parseInt(rgbMatch[2]);
      const b = parseInt(rgbMatch[3]);
      if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
        setRgbValue({ r, g, b });
        setHexValue(rgbToHex(r, g, b));
        const hsl = rgbToHsl(r, g, b);
        setHslValue(hsl);
      }
      return;
    }

    // 尝试解析HSL的两种格式：
    // 1. 裸格式：0,100,50 或 0,100%,50%
    // 2. 包裵格式：hsl(0, 100%, 50%) 或 hsl(0,100%,50%)
    const hslMatch = value.match(/^\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*$/) || 
                     value.match(/hsl\(?\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*\)?/i);
    if (hslMatch) {
      const h = parseInt(hslMatch[1]);
      const s = parseInt(hslMatch[2]);
      const l = parseInt(hslMatch[3]);
      if (h >= 0 && h <= 360 && s >= 0 && s <= 100 && l >= 0 && l <= 100) {
        setHslValue({ h, s, l });
        const rgb = hslToRgb(h, s, l);
        setRgbValue(rgb);
        setHexValue(rgbToHex(rgb.r, rgb.g, rgb.b));
      }
      return;
    }
  };

  // RGB滑块变化
  const handleRgbChange = (type: 'r' | 'g' | 'b', value: number) => {
    const newRgb = { ...rgbValue, [type]: value };
    setRgbValue(newRgb);
    setHexValue(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
    const hsl = rgbToHsl(newRgb.r, newRgb.g, newRgb.b);
    setHslValue(hsl);
    setColorInput(`rgb(${newRgb.r}, ${newRgb.g}, ${newRgb.b})`);
  };

  // HSL滑块变化
  const handleHslChange = (type: 'h' | 's' | 'l', value: number) => {
    const newHsl = { ...hslValue, [type]: value };
    setHslValue(newHsl);
    const rgb = hslToRgb(newHsl.h, newHsl.s, newHsl.l);
    setRgbValue(rgb);
    setHexValue(rgbToHex(rgb.r, rgb.g, rgb.b));
    setColorInput(`hsl(${newHsl.h}, ${newHsl.s}%, ${newHsl.l}%)`);
  };

  // HEX输入变化
  const handleHexChange = (value: string) => {
    if (/^#?[0-9A-Fa-f]{0,6}$/i.test(value)) {
      const hex = value.startsWith("#") ? value : `#${value}`;
      setHexValue(hex.toUpperCase());
      if (hex.length === 7) {
        const rgb = hexToRgb(hex);
        if (rgb) {
          setRgbValue(rgb);
          const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
          setHslValue(hsl);
          setColorInput(hex);
        }
      }
    }
  };

  // 添加到调色板
  const addToPalette = () => {
    const colorStr = hexValue;
    if (!paletteColors.includes(colorStr)) {
      setPaletteColors([...paletteColors, colorStr]);
      message.success("已添加到调色板");
    } else {
      message.warning("该颜色已在调色板中");
    }
  };

  // 从调色板选择颜色
  const selectFromPalette = (color: string) => {
    const rgb = hexToRgb(color);
    if (rgb) {
      setRgbValue(rgb);
      setHexValue(color);
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      setHslValue(hsl);
      setColorInput(color);
    }
  };

  // 处理图片上传
  const handleImageUpload: UploadProps['beforeUpload'] = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setImageUrl(url);
      extractColorsFromImage(url);
    };
    reader.readAsDataURL(file);
    return false;
  };

  // 从URL加载图片
  const handleImageUrlLoad = () => {
    if (imageUrl) {
      extractColorsFromImage(imageUrl);
    }
  };

  // 处理需色存储
  const handleColorStorage = (color: { color: string; rgb: string; hex: string }) => {
    const newStoredColors = [...storedColors];
    newStoredColors[nextStorageIndex] = color;
    setStoredColors(newStoredColors);
    
    // 更新下一个存储位置，循环覆盖
    setNextStorageIndex((nextStorageIndex + 1) % storedColors.length);
  };

  // 处理图片点击获取颜色
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (hoverColor) {
      handleColorStorage(hoverColor);
      message.success("颜色已保存");
    }
  };

  // 处理图片鼠标移动获取颜色
  const handleImageMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = imageRef.current;
    if (!img || !canvasRef.current) return;

    const rect = img.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 考虑 object-fit: contain 的情况，计算实际图片显示区域
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const displayAspect = rect.width / rect.height;
    
    let displayWidth = rect.width;
    let displayHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (imgAspect > displayAspect) {
      // 图片更宽，上下有空白
      displayHeight = rect.width / imgAspect;
      offsetY = (rect.height - displayHeight) / 2;
    } else {
      // 图片更高，左右有空白
      displayWidth = rect.height * imgAspect;
      offsetX = (rect.width - displayWidth) / 2;
    }

    // 检查鼠标是否在实际图片区域内
    const relX = x - offsetX;
    const relY = y - offsetY;
    
    if (relX < 0 || relY < 0 || relX >= displayWidth || relY >= displayHeight) {
      setHoverColor(null);
      return;
    }

    // 计算实际图片坐标
    const scaleX = img.naturalWidth / displayWidth;
    const scaleY = img.naturalHeight / displayHeight;
    const imgX = Math.floor(relX * scaleX);
    const imgY = Math.floor(relY * scaleY);

    // 获取该位置的颜色
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx || imgX < 0 || imgY < 0 || imgX >= img.naturalWidth || imgY >= img.naturalHeight) return;

    const pixel = ctx.getImageData(imgX, imgY, 1, 1).data;
    const r = pixel[0];
    const g = pixel[1];
    const b = pixel[2];
    const hex = rgbToHex(r, g, b);
    const rgb = `rgb(${r}, ${g}, ${b})`;

    setHoverColor({
      color: hex,
      rgb: rgb,
      hex: hex
    });
  };

  // 处理图片鼠标离开
  const handleImageMouseLeave = () => {
    setHoverColor(null);
  };

  // 从图片提取颜色
  const extractColorsFromImage = (url: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // 提取主要颜色（简化版：采样）
      const colors: Map<string, number> = new Map();
      const step = Math.max(1, Math.floor(img.width / 50));

      for (let x = 0; x < img.width; x += step) {
        for (let y = 0; y < img.height; y += step) {
          const pixel = ctx.getImageData(x, y, 1, 1).data;
          const r = pixel[0];
          const g = pixel[1];
          const b = pixel[2];
          const hex = rgbToHex(r, g, b);
          colors.set(hex, (colors.get(hex) || 0) + 1);
        }
      }

      // 排序并取前10个颜色
      const sortedColors = Array.from(colors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([hex]) => {
          const rgb = hexToRgb(hex);
          return {
            color: hex,
            rgb: rgb ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : "",
            hex: hex
          };
        });

      setImageColors(sortedColors);
    };
    img.onerror = () => {
      message.error("图片加载失败");
    };
    img.src = url;
  };

  // 复制到剪贴板
  const handleCopy = (text: string) => {
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

  // 计算对比度
  const contrastRatio = getContrastRatio(
    hexToRgb(contrastColor1) || { r: 255, g: 255, b: 255 },
    hexToRgb(contrastColor2) || { r: 0, g: 0, b: 0 }
  );
  const contrastLevel = getContrastLevel(contrastRatio);

  // 生成渐变CSS
  const getGradientCss = (): string => {
    if (gradientType === "linear") {
      return `linear-gradient(${gradientAngle}deg, ${gradientStart}, ${gradientEnd})`;
    } else {
      return `radial-gradient(circle, ${gradientStart}, ${gradientEnd})`;
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 1800, margin: "auto" }}>
      <Title level={3}>颜色工具</Title>

      <Row gutter={[16, 16]}>
        {/* 颜色转换和预览 */}
        <Col span={12}>
          <Card title="颜色转换与预览" extra={<BgColorsOutlined />}>
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Input
                  placeholder="输入 HEX (#FF0000 或 FF0000)、RGB (255,0,0 或 rgb(255,0,0)) 或 HSL (0,100,50 或 hsl(0,100%,50%)) - 自动识别"
                  value={colorInput}
                  onChange={(e) => handleColorInputChange(e.target.value)}
                  allowClear
                  style={{ marginBottom: 16 }}
                />
              </Col>
              <Col span={24}>
                <div
                  style={{
                    width: "100%",
                    height: 120,
                    backgroundColor: hexValue,
                    borderRadius: 8,
                    border: "1px solid #d9d9d9",
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: rgbValue.r + rgbValue.g + rgbValue.b > 382 ? "#000" : "#fff",
                    fontSize: 18,
                    fontWeight: "bold",
                  }}
                >
                  {hexValue}
                </div>
              </Col>
              <Col span={24}>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <div>
                    <Text strong>HEX: </Text>
                    <Input
                      value={hexValue}
                      onChange={(e) => handleHexChange(e.target.value)}
                      style={{ width: 120, display: "inline-block", marginLeft: 8 }}
                    />
                    <Button
                      type="link"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(hexValue)}
                      style={{ marginLeft: 8 }}
                    >
                      复制
                    </Button>
                  </div>
                  <div>
                    <Text strong>RGB: </Text>
                    <Input
                      value={`rgb(${rgbValue.r}, ${rgbValue.g}, ${rgbValue.b})`}
                      readOnly
                      style={{ width: 200, display: "inline-block", marginLeft: 8 }}
                    />
                    <Button
                      type="link"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(`rgb(${rgbValue.r}, ${rgbValue.g}, ${rgbValue.b})`)}
                      style={{ marginLeft: 8 }}
                    >
                      复制
                    </Button>
                  </div>
                  <div>
                    <Text strong>HSL: </Text>
                    <Input
                      value={`hsl(${hslValue.h}, ${hslValue.s}%, ${hslValue.l}%)`}
                      readOnly
                      style={{ width: 200, display: "inline-block", marginLeft: 8 }}
                    />
                    <Button
                      type="link"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(`hsl(${hslValue.h}, ${hslValue.s}%, ${hslValue.l}%)`)}
                      style={{ marginLeft: 8 }}
                    >
                      复制
                    </Button>
                  </div>
                </Space>
              </Col>
              <Col span={24}>
                <div style={{ marginTop: 16 }}>
                  <Text strong>RGB 滑块调节: </Text>
                  <div style={{ marginTop: 8 }}>
                    <Text>R: {rgbValue.r}</Text>
                    <Slider
                      min={0}
                      max={255}
                      value={rgbValue.r}
                      onChange={(val) => handleRgbChange('r', val)}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Text>G: {rgbValue.g}</Text>
                    <Slider
                      min={0}
                      max={255}
                      value={rgbValue.g}
                      onChange={(val) => handleRgbChange('g', val)}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Text>B: {rgbValue.b}</Text>
                    <Slider
                      min={0}
                      max={255}
                      value={rgbValue.b}
                      onChange={(val) => handleRgbChange('b', val)}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                </div>
              </Col>
              <Col span={24}>
                <div style={{ marginTop: 16 }}>
                  <Text strong>HSL 滑块调节: </Text>
                  <div style={{ marginTop: 8 }}>
                    <Text>H: {hslValue.h}°</Text>
                    <Slider
                      min={0}
                      max={360}
                      value={hslValue.h}
                      onChange={(val) => handleHslChange('h', val)}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Text>S: {hslValue.s}%</Text>
                    <Slider
                      min={0}
                      max={100}
                      value={hslValue.s}
                      onChange={(val) => handleHslChange('s', val)}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Text>L: {hslValue.l}%</Text>
                    <Slider
                      min={0}
                      max={100}
                      value={hslValue.l}
                      onChange={(val) => handleHslChange('l', val)}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                </div>
              </Col>
              <Col span={24}>
                <Button
                  type="primary"
                  onClick={addToPalette}
                  style={{ width: "100%", marginTop: 16 }}
                >
                  添加到调色板
                </Button>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* 颜色调色板 */}
        <Col span={12}>
          <Card title="颜色调色板">
            <Row gutter={[8, 8]}>
              {paletteColors.length === 0 ? (
                <Col span={24}>
                  <Text type="secondary">调色板为空，请先添加颜色</Text>
                </Col>
              ) : (
                paletteColors.map((color, index) => (
                  <Col span={6} key={index}>
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        paddingBottom: "100%",
                        backgroundColor: color,
                        borderRadius: 4,
                        border: "1px solid #d9d9d9",
                        cursor: "pointer",
                      }}
                      onClick={() => selectFromPalette(color)}
                      onDoubleClick={() => {
                        setPaletteColors(paletteColors.filter((_, i) => i !== index));
                        message.success("已删除");
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          bottom: 4,
                          left: 4,
                          right: 4,
                          fontSize: 10,
                          color: hexToRgb(color) && (hexToRgb(color)!.r + hexToRgb(color)!.g + hexToRgb(color)!.b > 382) ? "#000" : "#fff",
                          textAlign: "center",
                          fontWeight: "bold",
                        }}
                      >
                        {color}
                      </div>
                    </div>
                  </Col>
                ))
              )}
            </Row>
            {paletteColors.length > 0 && (
              <Button
                danger
                onClick={() => {
                  setPaletteColors([]);
                  message.success("已清空调色板");
                }}
                style={{ marginTop: 16, width: "100%" }}
              >
                清空调色板
              </Button>
            )}
          </Card>
        </Col>

        {/* 渐变色生成器 */}
        <Col span={12}>
          <Card title="渐变色生成器">
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <div>
                  <Text strong>起始颜色: </Text>
                  <Input
                    type="color"
                    value={gradientStart}
                    onChange={(e) => setGradientStart(e.target.value)}
                    style={{ width: "100%", height: 40, marginTop: 8 }}
                  />
                  <Input
                    value={gradientStart}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (/^#?[0-9A-Fa-f]{0,6}$/i.test(value)) {
                        const hex = value.startsWith("#") ? value : `#${value}`;
                        setGradientStart(hex.toUpperCase());
                      }
                    }}
                    style={{ marginTop: 8 }}
                  />
                </div>
              </Col>
              <Col span={12}>
                <div>
                  <Text strong>结束颜色: </Text>
                  <Input
                    type="color"
                    value={gradientEnd}
                    onChange={(e) => setGradientEnd(e.target.value)}
                    style={{ width: "100%", height: 40, marginTop: 8 }}
                  />
                  <Input
                    value={gradientEnd}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (/^#?[0-9A-Fa-f]{0,6}$/i.test(value)) {
                        const hex = value.startsWith("#") ? value : `#${value}`;
                        setGradientEnd(hex.toUpperCase());
                      }
                    }}
                    style={{ marginTop: 8 }}
                  />
                </div>
              </Col>
              <Col span={24}>
                <div
                  style={{
                    width: "100%",
                    height: 150,
                    background: getGradientCss(),
                    borderRadius: 8,
                    border: "1px solid #d9d9d9",
                    marginBottom: 16,
                  }}
                />
              </Col>
              <Col span={12}>
                <Text strong>渐变角度: {gradientAngle}°</Text>
                <Slider
                  min={0}
                  max={360}
                  value={gradientAngle}
                  onChange={setGradientAngle}
                  disabled={gradientType === "radial"}
                />
              </Col>
              <Col span={12}>
                <Text strong>渐变类型: </Text>
                <Button.Group style={{ marginTop: 8, display: "block" }}>
                  <Button
                    type={gradientType === "linear" ? "primary" : "default"}
                    onClick={() => setGradientType("linear")}
                  >
                    线性
                  </Button>
                  <Button
                    type={gradientType === "radial" ? "primary" : "default"}
                    onClick={() => setGradientType("radial")}
                  >
                    径向
                  </Button>
                </Button.Group>
              </Col>
              <Col span={24}>
                <Input.TextArea
                  readOnly
                  value={`background: ${getGradientCss()};`}
                  rows={2}
                  style={{ marginTop: 16 }}
                />
                <Button
                  type="primary"
                  icon={<CopyOutlined />}
                  onClick={() => handleCopy(`background: ${getGradientCss()};`)}
                  style={{ marginTop: 8, width: "100%" }}
                >
                  复制CSS代码
                </Button>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* 图片取色 */}
        <Col span={12}>
          <Card title="图片取色">
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Upload
                    beforeUpload={handleImageUpload}
                    showUploadList={false}
                    accept="image/*"
                  >
                    <Button icon={<UploadOutlined />} block>
                      上传本地图片
                    </Button>
                  </Upload>
                  <Input
                    placeholder="或输入图片URL"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    onPressEnter={handleImageUrlLoad}
                    allowClear
                  />
                  <Button
                    type="primary"
                    onClick={handleImageUrlLoad}
                    block
                    disabled={!imageUrl}
                  >
                    加载图片
                  </Button>
                </Space>
              </Col>
              {imageUrl && (
                <>
                  <Col span={24}>
                    <img
                      ref={imageRef}
                      src={imageUrl}
                      alt="取色图片"
                      style={{
                        width: "100%",
                        maxHeight: 300,
                        objectFit: "contain",
                        borderRadius: 8,
                        border: "1px solid #d9d9d9",
                        cursor: "crosshair",
                      }}
                      onLoad={() => extractColorsFromImage(imageUrl)}
                      onMouseMove={handleImageMouseMove}
                      onMouseLeave={handleImageMouseLeave}
                      onClick={handleImageClick}
                    />
                    <canvas ref={canvasRef} style={{ display: "none" }} />
                  </Col>
                  {imageColors.length > 0 && (
                    <Col span={24}>
                      <Text strong>提取的主要颜色: </Text>
                      <Row gutter={[8, 8]} style={{ marginTop: 8 }}>
                        {/* 第一个块：实时显示鼠标悬停颜色 */}
                        {hoverColor ? (
                          <Col span={6}>
                            <Tooltip
                              title={(
                                <div>
                                  <div>HEX: {hoverColor.hex}</div>
                                  <div>RGB: {hoverColor.rgb}</div>
                                </div>
                              )}
                              placement="top"
                            >
                              <div
                                style={{
                                  position: "relative",
                                  width: "100%",
                                  paddingBottom: "100%",
                                  backgroundColor: hoverColor.color,
                                  borderRadius: 4,
                                  border: "2px solid #1890ff",
                                  cursor: "pointer",
                                }}
                              >
                                <div
                                  style={{
                                    position: "absolute",
                                    bottom: 4,
                                    left: 4,
                                    right: 4,
                                    fontSize: 10,
                                    color: hexToRgb(hoverColor.color) && (hexToRgb(hoverColor.color)!.r + hexToRgb(hoverColor.color)!.g + hexToRgb(hoverColor.color)!.b > 382) ? "#000" : "#fff",
                                    textAlign: "center",
                                    fontWeight: "bold",
                                  }}
                                >
                                  {hoverColor.hex}
                                </div>
                              </div>
                            </Tooltip>
                            <div style={{ textAlign: "center", marginTop: 4, fontSize: 12 }}>
                              <Button
                                type="link"
                                size="small"
                                icon={<CopyOutlined />}
                                onClick={() => handleCopy(hoverColor.hex)}
                              >
                                复制
                              </Button>
                            </div>
                          </Col>
                        ) : (
                          <Col span={6}>
                            <div
                              style={{
                                position: "relative",
                                width: "100%",
                                paddingBottom: "100%",
                                backgroundColor: "#FFFFFF",
                                borderRadius: 4,
                                border: "2px dashed #ccc",
                                cursor: "default",
                              }}
                            />
                          </Col>
                        )}
                        {/* 存储的颜色块 */}
                        {storedColors.map((item, index) => (
                          <Col span={6} key={`stored-${index}`}>
                            <Tooltip
                              title={(
                                <div>
                                  <div>HEX: {item.hex}</div>
                                  <div>RGB: {item.rgb}</div>
                                </div>
                              )}
                              placement="top"
                            >
                              <div
                                style={{
                                  position: "relative",
                                  width: "100%",
                                  paddingBottom: "100%",
                                  backgroundColor: item.color,
                                  borderRadius: 4,
                                  border: item.color === "#FFFFFF" ? "2px dashed #ccc" : "2px solid #1890ff",
                                  cursor: "pointer",
                                }}
                                onClick={() => {
                                  const rgb = hexToRgb(item.color);
                                  if (rgb) {
                                    setRgbValue(rgb);
                                    setHexValue(item.color);
                                    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
                                    setHslValue(hsl);
                                    setColorInput(item.color);
                                  }
                                }}
                              >
                                {item.color !== "#FFFFFF" && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      bottom: 4,
                                      left: 4,
                                      right: 4,
                                      fontSize: 10,
                                      color: hexToRgb(item.color) && (hexToRgb(item.color)!.r + hexToRgb(item.color)!.g + hexToRgb(item.color)!.b > 382) ? "#000" : "#fff",
                                      textAlign: "center",
                                      fontWeight: "bold",
                                    }}
                                  >
                                    {item.hex}
                                  </div>
                                )}
                              </div>
                            </Tooltip>
                            {item.color !== "#FFFFFF" && (
                              <div style={{ textAlign: "center", marginTop: 4, fontSize: 12 }}>
                                <Button
                                  type="link"
                                  size="small"
                                  icon={<CopyOutlined />}
                                  onClick={() => handleCopy(item.hex)}
                                >
                                  复制
                                </Button>
                              </div>
                            )}
                          </Col>
                        ))}
                      </Row>
                    </Col>
                  )}
                </>
              )}
            </Row>
          </Card>
        </Col>

        {/* 颜色对比度检查 */}
        <Col span={12}>
          <Card title="颜色对比度检查">
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Text strong>前景色: </Text>
                <Input
                  type="color"
                  value={contrastColor1}
                  onChange={(e) => setContrastColor1(e.target.value)}
                  style={{ width: "100%", height: 40, marginTop: 8 }}
                />
                <Input
                  value={contrastColor1}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (/^#?[0-9A-Fa-f]{0,6}$/i.test(value)) {
                      const hex = value.startsWith("#") ? value : `#${value}`;
                      setContrastColor1(hex.toUpperCase());
                    }
                  }}
                  style={{ marginTop: 8 }}
                />
              </Col>
              <Col span={12}>
                <Text strong>背景色: </Text>
                <Input
                  type="color"
                  value={contrastColor2}
                  onChange={(e) => setContrastColor2(e.target.value)}
                  style={{ width: "100%", height: 40, marginTop: 8 }}
                />
                <Input
                  value={contrastColor2}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (/^#?[0-9A-Fa-f]{0,6}$/i.test(value)) {
                      const hex = value.startsWith("#") ? value : `#${value}`;
                      setContrastColor2(hex.toUpperCase());
                    }
                  }}
                  style={{ marginTop: 8 }}
                />
              </Col>
              <Col span={24}>
                <div
                  style={{
                    width: "100%",
                    height: 100,
                    backgroundColor: contrastColor2,
                    borderRadius: 8,
                    border: "1px solid #d9d9d9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: contrastColor1,
                    fontSize: 24,
                    fontWeight: "bold",
                    marginTop: 16,
                  }}
                >
                  示例文本
                </div>
              </Col>
              <Col span={24}>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <div>
                    <Text strong>对比度比率: </Text>
                    <Text style={{ fontSize: 18, fontWeight: "bold" }}>
                      {contrastRatio.toFixed(2)}:1
                    </Text>
                  </div>
                  <div>
                    <Text strong>WCAG等级: </Text>
                    <Tag color={contrastLevel.color}>{contrastLevel.level}</Tag>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      • AAA (大文本): 对比度 ≥ 4.5:1<br />
                      • AAA (正常文本): 对比度 ≥ 7:1<br />
                      • AA (大文本): 对比度 ≥ 3:1<br />
                      • AA (正常文本): 对比度 ≥ 4.5:1
                    </Text>
                  </div>
                </Space>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* 推荐颜色 */}
        <Col span={24}>
          <Card title="推荐颜色">
            <Row gutter={[16, 16]}>
              {recommendedColors.map((color, index) => {
                const rgb = hexToRgb(color.hex);
                const isLight = rgb && (rgb.r + rgb.g + rgb.b > 382);
                return (
                  <Col xs={12} sm={8} md={6} lg={4} xl={3} key={index}>
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        paddingBottom: "100%",
                        backgroundColor: color.hex,
                        borderRadius: 8,
                        border: "1px solid #d9d9d9",
                        cursor: "pointer",
                        overflow: "hidden",
                      }}
                      onClick={() => {
                        if (rgb) {
                          setRgbValue(rgb);
                          setHexValue(color.hex);
                          const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
                          setHslValue(hsl);
                          setColorInput(color.hex);
                        }
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          padding: 8,
                          backgroundColor: "rgba(0,0,0,0.6)",
                          color: "#fff",
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: "bold" }}>{color.name}</div>
                        <div style={{ fontSize: 10, marginTop: 4 }}>{color.hex}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, textAlign: "center" }}>
                      <Space direction="vertical" size="small" style={{ width: "100%" }}>
                        <Button
                          type="link"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => handleCopy(color.hex)}
                        >
                          HEX
                        </Button>
                        <Button
                          type="link"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => handleCopy(`rgb(${color.rgb})`)}
                        >
                          RGB
                        </Button>
                        <Button
                          type="link"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => handleCopy(`hsl(${color.hsl})`)}
                        >
                          HSL
                        </Button>
                      </Space>
                    </div>
                  </Col>
                );
              })}
            </Row>
          </Card>
        </Col>
      </Row>

      {/* 公共底部 */}
      <Card title="反馈BUG: 1543493541@qq.com" style={{ marginTop: 20, textAlign: "center" }}>
        <Text strong style={{ fontSize: 24 }}>
          {"oraen.com"}
        </Text>
      </Card>
    </div>
  );
};

const ColorUtilComponent = ColorUtil as any;
ColorUtilComponent.route = { [MENU_PATH]: "/colorUtil" };

export default ColorUtil;

