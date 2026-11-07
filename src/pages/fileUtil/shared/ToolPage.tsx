import React from "react";
import { theme } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import "./tools.less";
export default function ToolPage({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const { token } = theme.useToken();
  return (
    <div
      className="local-tool-page"
      style={
        {
          "--tool-bg": token.colorBgContainer,
          "--tool-fill": token.colorFillAlter,
          "--tool-text": token.colorText,
          "--tool-muted": token.colorTextSecondary,
          "--tool-border": token.colorBorderSecondary,
          "--tool-accent": token.colorPrimary,
          "--tool-selected": token.colorPrimaryBg,
        } as React.CSSProperties
      }
    >
      <header className="local-tool-heading">
        <div>
          <h2 aria-label={title}>
            {icon} {title}
          </h2>
          <p>{description}</p>
        </div>
        <span>
          <SafetyCertificateOutlined /> 文件本地处理
        </span>
      </header>
      {children}
    </div>
  );
}
