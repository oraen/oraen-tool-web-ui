import React, { useState } from "react";
import {Card, Button, Typography, Row, Col, message, Input, Tag} from "antd";
import {all, create, evaluate} from "mathjs"; // 引入 mathjs
import { Decimal } from "decimal.js"; // 引入 decimal.js

const { Title, Text } = Typography;
const { TextArea } = Input;

const MathUtil: React.FC = () => {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState(""); // 错误提示

  const math = create(all, {
    number: "BigNumber", // 使用高精度计算
    precision: 64, // 设置计算精度为 64 位
  });

  //进制转化
  // 新增状态：进制转换相关
  const [baseConvertInput, setBaseConvertInput] = useState("");
  const [baseConvertOutput, setBaseConvertOutput] = useState("");
  const [baseConvertError, settBaseConvertError] = useState(""); // 错误提示
  const [baseInput, setBaseInput] = useState("10"); // 当前进制
  const [baseOutput, setBaseOutput] = useState("2"); // 目标进制


  // 进制转换函数
  const handleConvert = () => {
    try {
      const inputBase = parseInt(baseInput, 10);
      const outputBase = parseInt(baseOutput, 10);

      // 检查输入是否为空
      if (!baseConvertInput.trim()) {
        settBaseConvertError("请输入需要转换的数字");
        setBaseConvertOutput("");
        return;
      }

      // 将输入从当前进制转换为十进制
      const decimalValue = parseInt(baseConvertInput, inputBase);

      // 检查输入是否有效
      if (isNaN(decimalValue)) {
        settBaseConvertError("输入的数字与当前进制不匹配");
        setBaseConvertOutput("");
        return;
      }

      // 将十进制转换为目标进制
      const result = decimalValue.toString(outputBase).toUpperCase();
      setBaseConvertOutput(result);
      settBaseConvertError("");
    } catch (error) {
      settBaseConvertError("进制转换失败，请检查输入");
      setBaseConvertOutput("");
    }
  };

  // 监听回车键
  const handleBaseConvertKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleConvert();
    }
  };



//
  const handleCalculate = () => {
    try {
      // 清理输入：去除空格和换行符
      const cleanedInput = input.replace(/\s+/g, "");
      // 使用 mathjs 计算表达式
      const result = math.evaluate(cleanedInput);
      // 使用 decimal.js 格式化结果，保留 16 位小数
      const formattedResult = new Decimal(result).toDecimalPlaces(16).toFixed().toString();
      setOutput(formattedResult);
      setError(""); // 清空错误提示
    } catch (error) {
      setError("表达式无效，请检查输入"); // 设置错误提示
      setOutput("");
    }
  };

  const handleCopy = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .then(() => {
          message.success('复制成功！');
        })
        .catch(() => {
          message.error('复制失败，请手动复制');
        });
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        message.success('复制成功！！');
      } catch (err) {
        message.error('复制失败，请手动复制');
      }
      document.body.removeChild(textArea);
    }
  };

  const handleKeyDown = (e: {shiftKey: boolean;  key: string; preventDefault: () => void; }) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        // Shift + Enter 允许换行，不执行计算
        return;
      }
      e.preventDefault(); // 阻止默认换行
      handleCalculate(); // 触发计算
    }
  };


  //随机工具
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [randomNumber, setRandomNumber] = useState("");
  const [stringInput, setStringInput] = useState("");
  const [randomString, setRandomString] = useState("");

  const generateRandomNumber = () => {
    const min = parseInt(minValue, 10);
    const max = parseInt(maxValue, 10);
    if (isNaN(min) || isNaN(max) || min > max) {
      message.error("请输入有效的整数范围");
      return;
    }
    setRandomNumber((Math.floor(Math.random() * (max - min + 1)) + min).toFixed().toString());
  };

  const generateRandomString = () => {
    const charSet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";

    // 检查输入是否为纯数字
    if (/^\d+$/.test(stringInput.trim())) {
      const length = parseInt(stringInput.trim(), 10);
      if (length <= 0) {
        message.error("请输入一个正整数");
        return;
      }

      if(length > 1000000){
        message.error("数字太大，你的电脑顶不住的");
        return;
      }

      let result = "";
      for (let i = 0; i < length; i++) {
        result += charSet.charAt(Math.floor(Math.random() * charSet.length));
      }

      setRandomString(result);
      return;
    }

    // 原来的字符串选择逻辑
    try {
      let items = stringInput.trim().startsWith("[")
        ? JSON.parse(stringInput)
        : stringInput.split(",").map(i => i.trim());

      if (!Array.isArray(items) || items.length === 0) {
        throw new Error();
      }

      setRandomString(items[Math.floor(Math.random() * items.length)]);
    } catch {
      message.error("输入格式无效，请输入 JSON 数组、逗号分隔字符串或一个正整数");
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 1800, margin: "auto" }}>
      <Title level={3}>数学工具</Title>

      <Row gutter={80}>
        {/* 第一个组件  计算器*/}
        <Col span={8}>
          <Card
            title="计算器"
            actions={[
              <Row gutter={16} style={{ marginTop: 16 }}>
                <Col span={12}>
                  <Button type="primary" block onClick={handleCalculate}>
                    计算结果
                  </Button>
                </Col>
                <Col span={12}>
                  <Button block onClick = {(e) => handleCopy(output)}>
                    复制结果
                  </Button>
                </Col>
              </Row>
            ]}
          >
            {/* 输入框：使用 Ant Design 的 TextArea */}
            <TextArea
              placeholder="5! + 3 * 2 - 2 ^ 3 * log(1024, 2) + sqrt(2) - tan(45 deg)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoSize={{ minRows: 6, maxRows: 9 }} // 自动调整高度
              style={{ marginBottom: 16 }}
              onKeyDown={handleKeyDown} // 监听回车键
            />
            {/* 错误提示 */}
            {error && (
              <Text type="danger" style={{ display: "block", marginBottom: 16 }}>
                {error}
              </Text>
            )}
            {/* 输出框：使用 Ant Design 的 TextArea */}
            <TextArea
              placeholder="计算结果将显示在这里，回车计算表达式，Shift + 回车换行"
              value={output}
              readOnly
              autoSize={{ minRows: 6, maxRows: 9 }} // 自动调整高度
              style={{ backgroundColor: "#f5f5f5" }} // 只读背景色
            />

            {/* 提示示例 */}
            {/* 提示示例 */}
            <Card title="计算示例" style={{ marginTop: 16, background: "#fafafa", borderRadius: 8 }}>
              <Row gutter={[16, 8]}>
                <Col span={12}><Tag color="blue">阶乘运算</Tag> <Text>6! </Text></Col>
                <Col span={12}><Tag color="green">求余运算</Tag> <Text>6 % 4</Text></Col>
                <Col span={12}><Tag color="orange">求幂运算</Tag> <Text>2 ^ 3</Text></Col>
                <Col span={12}><Tag color="red">开方运算</Tag> <Text>sqrt(2)</Text></Col>
                <Col span={12}><Tag color="purple">对数运算</Tag> <Text>log(1024, 2) </Text></Col>
                <Col span={12}><Tag color="gold">三角函数</Tag> <Text>sin(30 deg) </Text></Col>
                <Col span={12}><Tag color="cyan">角度表示</Tag> <Text>tan(45 deg) </Text></Col>
              </Row>

            </Card>

          </Card>
        </Col>

        {/* 第二个组件  随机工具*/}
        <Col span={8}>
          <Card title="随机数生成" actions={[
            <Row gutter={16}><Col span={12}><Button type="primary" block onClick={generateRandomNumber}>生成</Button></Col>
              <Col span={12}><Button block onClick={() => handleCopy(randomNumber)}>复制</Button></Col></Row>
          ]}>
            <Input placeholder="最小值" value={minValue} onChange={(e) => setMinValue(e.target.value)} />
            <Input placeholder="最大值" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} style={{ marginTop: 8 }} />
            <TextArea placeholder="随机数" value={randomNumber} readOnly autoSize={{ minRows: 3, maxRows: 6 }} style={{ marginTop: 8 }} />
          </Card>

          <Card title="随机字符串生成" actions={[
            <Row gutter={16}><Col span={12}><Button type="primary" block onClick={generateRandomString}>生成</Button></Col>
              <Col span={12}><Button block onClick={() => handleCopy(randomString)}>复制</Button></Col></Row>
          ]}>
            <TextArea placeholder="输入数字，JSON数组或逗号分隔的字符串" value={stringInput} onChange={(e) => setStringInput(e.target.value)} autoSize={{ minRows: 6, maxRows: 9 }} />
            <TextArea placeholder="随机选择的字符串" value={randomString} readOnly autoSize={{ minRows: 3, maxRows: 6 }} style={{ marginTop: 8 }} />
          </Card>
        </Col>


        {/* 第三个组件：数字转换 */}
        <Col span={8}>
          <Card
            title="进制转换"
            actions={[
              <Row gutter={16} style={{ marginTop: 16 }}>
                <Col span={12}>
                  <Button type="primary" block onClick={handleConvert}>
                    转换
                  </Button>
                </Col>
                <Col span={12}>
                  <Button block onClick={() => handleCopy(baseConvertOutput)}>
                    复制结果
                  </Button>
                </Col>
              </Row>,
            ]}
          >
            {/* 输入框 */}
            <Input
              placeholder="输入数字"
              value={baseConvertInput}
              onChange={(e) => setBaseConvertInput(e.target.value)}
              onKeyDown={handleBaseConvertKeyDown}
              style={{ marginBottom: 16 }}
            />

            {/* 当前进制和目标进制选择 */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={12}>
                <select
                  value={baseInput}
                  onChange={(e) => setBaseInput(e.target.value)}
                  style={{ width: "100%", padding: 8 }}
                >
                  <option value="2">二进制</option>
                  <option value="4">四进制</option>
                  <option value="8">八进制</option>
                  <option value="10">十进制</option>
                  <option value="16">十六进制</option>
                </select>
              </Col>
              <Col span={12}>
                <select
                  value={baseOutput}
                  onChange={(e) => setBaseOutput(e.target.value)}
                  style={{ width: "100%", padding: 8 }}
                >
                  <option value="2">二进制</option>
                  <option value="4">四进制</option>
                  <option value="8">八进制</option>
                  <option value="10">十进制</option>
                  <option value="16">十六进制</option>
                </select>
              </Col>
            </Row>

            {/* 错误提示 */}
            {baseConvertError && (
              <Text type="danger" style={{ display: "block", marginBottom: 16 }}>
                {baseConvertError}
              </Text>
            )}

            {/* 输出框 */}
            <TextArea
              placeholder="转换结果将显示在这里"
              value={baseConvertOutput}
              readOnly
              autoSize={{ minRows: 3, maxRows: 6 }}
              style={{ backgroundColor: "#f5f5f5" }}
            />
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

export default MathUtil;
