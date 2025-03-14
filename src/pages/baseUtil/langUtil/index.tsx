import React from "react";
import { Card, Typography } from "antd";
import { ControlOutlined } from "@ant-design/icons";
import "antd/dist/reset.css";

const { Title, Text } = Typography;

const UnderConstruction: React.FC = () => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        backgroundColor: "#f0f2f5",
      }}
    >
      <Card
        style={{
          textAlign: "center",
          padding: "40px",
          borderRadius: "12px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
        }}
      >
        <ControlOutlined style={{ fontSize: "64px", color: "#fa8c16" }} />
        <Title level={2} style={{ marginTop: "20px" }}>
          施工中
        </Title>
        <Text type="secondary">敬请期待，我们即将上线！</Text>
      </Card>
    </div>
  );
};

export default UnderConstruction;
