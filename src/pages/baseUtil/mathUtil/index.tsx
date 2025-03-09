import React, { useState } from "react";
import { Card, Input, Button, Typography, Row, Col, message } from "antd";





const { Title, Text } = Typography;


const MathUtil: React.FC = () => {


  return (
    <div style={{padding: 20, maxWidth: 1800, margin: "auto"}}>
      <Title level={3}>数学工具</Title>

      <Row gutter={80}>
        {/* 第一个组件  计算器*/}
        <Col span={8}>
          <Card title="计算器">

          </Card>
        </Col>

        {/* 第二个组件  随机工具*/}
        <Col span={8}>
          <Card title="随机工具">
          </Card>
        </Col>

        {/* 第三个组件  开发者*/}
        <Col span={8}>
          <Card title="开发中...">
          </Card>
        </Col>

      </Row>

      {/* 公共底部 */}
      <Card title="反馈BUG: 1543493541@qq.com" style={{marginTop: 20, textAlign: "center"}}>
        <Text strong style={{fontSize: 24}}>
          {"oraen.com"}
        </Text>
      </Card>
    </div>
  );
};

export default MathUtil;
