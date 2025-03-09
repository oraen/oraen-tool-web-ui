import React, { useState, useEffect } from "react";
import {Card, Input, Button, Typography, Row, Col, message, DatePicker, Select} from "antd";
import dayjs, {ManipulateType} from "dayjs";
import { CalendarOutlined } from "@ant-design/icons";
import utc from 'dayjs/plugin/utc';
import timezone from "dayjs/plugin/timezone"; // 引入时区插件

const { Title, Text } = Typography;

// 时区数据
const timeZones = [
  { value: -13, label: "UTC-13" },
  { value: -12, label: "UTC-12" },
  { value: -11, label: "UTC-11" },
  { value: -10, label: "UTC-10" },
  { value: -9, label: "UTC-9" },
  { value: -8, label: "UTC-8" },
  { value: -7, label: "UTC-7" },
  { value: -6, label: "UTC-6" },
  { value: -5, label: "UTC-5" },
  { value: -4, label: "UTC-4" },
  { value: -3, label: "UTC-3" },
  { value: -2, label: "UTC-2" },
  { value: -1, label: "UTC-1" },
  { value: 0, label: "UTC" },
  { value: 1, label: "UTC+1" },
  { value: 2, label: "UTC+2" },
  { value: 3, label: "UTC+3" },
  { value: 4, label: "UTC+4" },
  { value: 5, label: "UTC+5" },
  { value: 6, label: "UTC+6" },
  { value: 7, label: "UTC+7" },
  { value: 8, label: "UTC+8" },
  { value: 9, label: "UTC+9" },
  { value: 10, label: "UTC+10" },
  { value: 11, label: "UTC+11" },
  { value: 12, label: "UTC+12" },
  { value: 13, label: "UTC+13" },
  { value: -12, label: "埃尼威托克岛（UTC-12)" },
  { value: -11, label: "帕果帕果（UTC-11)" },
  { value: -10, label: "檀香山（UTC-10)" },
  { value: -9, label: "安克雷奇（UTC-9)" },
  { value: -8, label: "洛杉矶（UTC-8)" },
  { value: -7, label: "丹佛（UTC-7)" },
  { value: -6, label: "墨西哥城（UTC-6)" },
  { value: -5, label: "纽约（UTC-5)" },
  { value: -4, label: "圣地亚哥（UTC-4)" },
  { value: -3, label: "布宜诺斯艾利斯（UTC-3)" },
  { value: -2, label: "努克（UTC-2)" },
  { value: -1, label: "普拉亚（UTC-1)" },
  { value: 0, label: "伦敦（UTC)" },
  { value: 1, label: "巴黎（UTC+1)" },
  { value: 2, label: "开罗（UTC+2)" },
  { value: 3, label: "莫斯科（UTC+3)" },
  { value: 4, label: "迪拜（UTC+4)" },
  { value: 4.5, label: "喀布尔（UTC+4:30)" },
  { value: 5, label: "伊斯兰堡（UTC+5)" },
  { value: 5.5, label: "新德里（UTC+5:30)" },
  { value: 5.75, label: "加德满都（UTC+5:45)" },
  { value: 6, label: "达卡（UTC+6)" },
  { value: 6.5, label: "仰光（UTC+6:30)" },
  { value: 7, label: "曼谷（UTC+7)" },
  { value: 8, label: "北京时间（UTC+8)" },
  { value: 9, label: "东京（UTC+9)" },
  { value: 9.5, label: "阿德莱德（UTC+9:30)" },
  { value: 10, label: "悉尼（UTC+10)" },
  { value: 10.5, label: "豪勋爵岛（UTC+10:30)" },
  { value: 11, label: "霍尼亚拉（UTC+11)" },
  { value: 12, label: "奥克兰（UTC+12)" },
  { value: 12.75, label: "查塔姆群岛（UTC+12:45)" },
  { value: 13, label: "阿皮亚（UTC+13)" },
  { value: 14, label: "基里蒂马蒂（UTC+14)" },
  { value: -3.5, label: "圣约翰斯（UTC-3:30)" },
  { value: -4.5, label: "加拉加斯（UTC-4:30)" },
  { value: -9.5, label: "马克萨斯群岛（UTC-9:30)" },
  { value: 3.5, label: "德黑兰（UTC+3:30)" },
  { value: 8.75, label: "尤克拉（UTC+8:45)" },
  { value: -10.5, label: "马克萨斯群岛（UTC-10:30)" },
  { value: -11.5, label: "纽埃（UTC-11:30)" },
  { value: 6.25, label: "科科斯群岛（UTC+6:30)" },
  { value: 7.75, label: "圣诞岛（UTC+7:45)" },
];

const TimeConverter: React.FC = () => {
  // 初始化时区插件
  dayjs.extend(utc)
  dayjs.extend(timezone)
  dayjs.tz.setDefault("UTC")

  // ...（省略已有代码，保持原样）

  // 计时器相关状态
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [startTime, setStartTime] = useState<dayjs.Dayjs | null>(null);
  const [endTime, setEndTime] = useState<dayjs.Dayjs | null>(null);
  const [intervalTime, setIntervalTime] = useState<string>("");

  // 多行文本框内容
  const [textAreaValue, setTextAreaValue] = useState<string>("");

  // 开始计时
  const handleStartTimer = () => {
    setTimerRunning(true);
    setStartTime(dayjs());
    setEndTime(null);
    setIntervalTime("");
  };

  // 停止计时
  const handleStopTimer = () => {
    if (!timerRunning) return;
    setTimerRunning(false);
    const end = dayjs();
    setEndTime(end);
    if (startTime) {
      const duration = end.diff(startTime, "millisecond"); // 计算毫秒
      setIntervalTime(`${(duration / 1000).toFixed(3)} 秒`); // 转换为秒并保留3位小数
    }
  };

  // 计时器显示的时间
  const timerDisplay = () => {
    if (!startTime) return "00:00:00";
    const now = dayjs();
    const duration = now.diff(startTime, "second");
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = duration % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  // 每秒更新计时器显示
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerRunning) {
      interval = setInterval(() => {
        // 更新计时器显示
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerRunning]);

  const [selectedTimeZone, setSelectedTimeZone] = useState<number>(8); // 默认时区为中国 (UTC+8)

  // 处理时区选择变化
  const handleTimeZoneChange = (value: number) => {
    setSelectedTimeZone(value);
    // 当时区改变时，重新格式化当前输入值
    if (inputValue) {
      handleInputChange(inputValue);
    }
  };

  useEffect(() => {
    if (inputValue) {
      handleInputChange(inputValue);
    }
  }, [selectedTimeZone]);

  // 自定义筛选函数
  const filterOption = (input: string, option: any) => {
    return option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0;
  };


  const [inputValue, setInputValue] = useState<string>(""); // 输入框的值

  // 存储格式化后的值
  const [formattedValues, setFormattedValues] = useState<{ [key: string]: string }>({
    "Unix 时间戳（秒）": "",
    "Unix 时间戳（毫秒）": "",
    "YYYY-MM-DD HH:mm:ss": "",
    "YYYY-MM-DDTHH:mm:ss.sssZ": "",
    "YYYY-MM-DDTHH:mm:ss.sssZ0": "",
    "YYYY-MM-DDTHH:mm:ss": "",
    "YYYY/MM/DD HH:mm:ss": "",
    "DD-MM-YYYY HH:mm:ss": "",
    "MM/DD/YYYY HH:mm:ss": "",
    "YYYY年MM月DD日 HH时mm分ss秒": "",
    "RFC 2822 格式": "",
    "HTTP 日期格式": "",
  });

  // 存储格式化后的值
  const [nowTimeFormattedValues, setNowTimeFormattedValues] = useState<{ [key: string]: string }>({
    "Unix 时间戳（秒）": "",
    "Unix 时间戳（毫秒）": "",
    "YYYY-MM-DD HH:mm:ss": "",
    "YYYY-MM-DDTHH:mm:ss.sssZ": "",
    "YYYY-MM-DDTHH:mm:ss.sssZ0": "",
    "YYYY-MM-DDTHH:mm:ss": "",
    "YYYY/MM/DD HH:mm:ss": "",
    "DD-MM-YYYY HH:mm:ss": "",
    "MM/DD/YYYY HH:mm:ss": "",
    "YYYY年MM月DD日 HH时mm分ss秒": "",
    "RFC 2822 格式": "",
    "HTTP 日期格式": "",
  });


  // 每秒更新当前时间戳
  useEffect(() => {
    const interval = setInterval(() => {

      let zone = `Etc/GMT${selectedTimeZone > 0 ? "-" + selectedTimeZone : "+" + Math.abs(selectedTimeZone)}`
      let localDate = dayjs().tz(zone)
      setNowTimeFormattedValues({
        "Unix 时间戳（秒）": localDate.unix().toString(),
        "Unix 时间戳（毫秒）": localDate.valueOf().toString(),
        "YYYY-MM-DD HH:mm:ss": localDate.format("YYYY-MM-DD HH:mm:ss"),
        "YYYY-MM-DDTHH:mm:ss.sssZ": localDate.format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
        "YYYY-MM-DDTHH:mm:ss.sssZ0": localDate.subtract(selectedTimeZone * 60, "minute").format("YYYY-MM-DDTHH:mm:ss.SSS[Z]"),
        "YYYY-MM-DDTHH:mm:ss": localDate.format("YYYY-MM-DDTHH:mm:ss"),
        "YYYY/MM/DD HH:mm:ss": localDate.format("YYYY/MM/DD HH:mm:ss"),
        "DD-MM-YYYY HH:mm:ss": localDate.format("DD-MM-YYYY HH:mm:ss"),
        "MM/DD/YYYY HH:mm:ss": localDate.format("MM/DD/YYYY HH:mm:ss"),
        "YYYY年MM月DD日 HH时mm分ss秒": localDate.format("YYYY年MM月DD日 HH时mm分ss秒"),
        "RFC 2822 格式": localDate.format("ddd, DD MMM YYYY HH:mm:ss [GMT]ZZ"), //utcOffset(selectedTimeZone * 60)
        "HTTP 日期格式": localDate.toDate().toUTCString(),
      });
    }, 300);
    return () => clearInterval(interval);
  }, [selectedTimeZone]);

  // 判断输入内容的格式并更新下面的输入框
  const handleInputChange = (value: string) => {
    setInputValue(value);

    // 尝试解析输入的内容
    let date: dayjs.Dayjs | null = null;
    let zone = `Etc/GMT${selectedTimeZone > 0 ? "-" + selectedTimeZone : "+" + Math.abs(selectedTimeZone)}`

    // 1. 检查是否是 Unix 时间戳（秒或毫秒）
    if (/^\d+$/.test(value)) {
      const timestamp = parseInt(value, 10);
      if (value.length === 10) {
        date = dayjs.unix(timestamp).tz(zone); // 秒级时间戳
      } else if (value.length === 13) {
        date = dayjs(timestamp).tz(zone); // 毫秒级时间戳
      }
    }

    // 2. 检查是否是带时区的ISO格式
    if (!date && /Z|[+-]\d{2}:?\d{2}$/.test(value)) {
      const parsedDate = dayjs(value);
      if (parsedDate.isValid()) {
        date = parsedDate.tz(zone);
      }
    }

    // 3. 检查是否是自然语言格式（如 "2023年10月01日 12:34:56"）
    if (!date && dayjs(value, "YYYY年MM月DD日 HH:mm:ss").isValid()) {
      date = dayjs.tz(value, zone);
    }

    // 4. 处理其他格式的时间字符串（假定为当前选择的时区）
    if (!date && dayjs(value).isValid()) {
      date = dayjs.tz(value, zone);
    }



    // 如果解析成功，更新下面的输入框
    if (date) {
      // 将时间转换为选定的时区
      const localDate = date;
      //localDate.subtract(selectedTimeZone, "hour")

      setFormattedValues({
        "Unix 时间戳（秒）": localDate.unix().toString(),
        "Unix 时间戳（毫秒）": localDate.valueOf().toString(),
        "YYYY-MM-DD HH:mm:ss": localDate.format("YYYY-MM-DD HH:mm:ss"),
        "YYYY-MM-DDTHH:mm:ss.sssZ": localDate.format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
        "YYYY-MM-DDTHH:mm:ss.sssZ0": localDate.subtract(selectedTimeZone * 60, "minute").format("YYYY-MM-DDTHH:mm:ss.SSS[Z]"),
        "YYYY-MM-DDTHH:mm:ss": localDate.format("YYYY-MM-DDTHH:mm:ss"),
        "YYYY/MM/DD HH:mm:ss": localDate.format("YYYY/MM/DD HH:mm:ss"),
        "DD-MM-YYYY HH:mm:ss": localDate.format("DD-MM-YYYY HH:mm:ss"),
        "MM/DD/YYYY HH:mm:ss": localDate.format("MM/DD/YYYY HH:mm:ss"),
        "YYYY年MM月DD日 HH时mm分ss秒": localDate.format("YYYY年MM月DD日 HH时mm分ss秒"),
        "RFC 2822 格式": localDate.format("ddd, DD MMM YYYY HH:mm:ss [GMT]ZZ"), //utcOffset(selectedTimeZone * 60)
        "HTTP 日期格式": date.toDate().toUTCString(),
      });
    }
    // 如果解析失败，不更新下面的输入框
  };

  // 复制内容到剪贴板
  const handleCopy = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          message.success("复制成功！");
        })
        .catch(() => {
          message.error("复制失败，请手动复制");
        });
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        message.success("复制成功！！");
      } catch (err) {
        message.error("复制失败，请手动复制");
      }
      document.body.removeChild(textArea);
    }
  };

  // 处理时间选择器的变化
  const handleDateChange = (date: any, dateString: string | string[]) => {
    const selectedDate = Array.isArray(dateString) ? dateString[0] : dateString;
    handleInputChange(selectedDate);
  };

  return (
    <div style={{padding: 20, maxWidth: 1800, margin: "auto"}}>
      <Title level={3}>时间工具</Title>
      <div style={{display: "flex", alignItems: "center", gap: 10}}>
        <Select
          defaultValue={8} // 默认选中中国时区
          style={{width: 300}}
          onChange={handleTimeZoneChange}
          showSearch // 启用搜索功能
          filterOption={filterOption} // 自定义筛选函数
          placeholder="选择时区"
        >
          {/* 标准时区选项 */}
          {timeZones.map((zone) => (
            <Select.Option key={zone.label} value={zone.value}>
              {zone.label}
            </Select.Option>
          ))}
        </Select>
        {/* 显示当前时区 */}
        <Text strong>当前时区: UTC{selectedTimeZone >= 0 ? `+${selectedTimeZone}` : selectedTimeZone}</Text>
      </div>

      <Row gutter={80}>
        {/* 第一个组件  时间格式转化*/}
        <Col span={8}>
          <Card title="时间格式转化">
            {/* 输入框和时间选择器 */}
            <Row gutter={10} style={{marginTop: 20}}>
              <Col flex="auto">
                <Input
                  placeholder="输入任意格式时间（自动识别）"
                  value={inputValue}
                  onChange={(e) => handleInputChange(e.target.value)}
                  allowClear
                />
              </Col>
              <Col>
                <DatePicker
                  showTime
                  format="YYYY-MM-DD HH:mm:ss"
                  onChange={handleDateChange}
                  suffixIcon={<CalendarOutlined/>}
                  placeholder="选择时间"
                />
              </Col>
            </Row>

            {/* 动态生成格式化后的输入框 */}
            {Object.entries(formattedValues).map(([format, value]) => (
              <Row gutter={10} style={{marginTop: 20}} key={format}>
                <Col flex="auto">
                  <Input placeholder={format} readOnly value={value}/>
                </Col>
                <Col>
                  <Button type="primary" onClick={() => handleCopy(value)}>
                    复制
                  </Button>
                </Col>
              </Row>
            ))}
          </Card>
        </Col>

        {/* 第二个组件  当前时间*/}
        <Col span={8}>
          <Card title="当前时间">
            {/* 输入框和时间选择器 */}
            <Row gutter={10} style={{marginTop: 20}}>
              <Col flex="auto">
                <Input
                  placeholder="占位框"
                  value={''}
                  onChange={(e) => handleInputChange(e.target.value)}
                  disabled={true}
                />
              </Col>
              <Col>
                <DatePicker
                  showTime
                  format="YYYY-MM-DD HH:mm:ss"
                  onChange={handleDateChange}
                  suffixIcon={<CalendarOutlined/>}
                  placeholder="选择时间"
                  disabled={true}
                />
              </Col>
            </Row>

            {/* 动态生成格式化后的输入框 */}
            {Object.entries(nowTimeFormattedValues).map(([format, value]) => (
              <Row gutter={10} style={{marginTop: 20}} key={format}>
                <Col flex="auto">
                  <Input placeholder={format} readOnly value={value}/>
                </Col>
                <Col>
                  <Button type="primary" onClick={() => handleCopy(value)}>
                    复制
                  </Button>
                </Col>
              </Row>
            ))}
          </Card>
        </Col>

        {/* 第三个组件  时间小工具*/}
        <Col span={8}>
          <Card title="时间小工具">
            <Text style={{ fontSize: 18}}> 计时器 </Text>
            {/* 计时器 */}
            <Row gutter={10} style={{ marginTop: 20 }}>
              <Col flex="auto">
                <Input
                  placeholder="计时器"
                  value={timerRunning ? timerDisplay() : intervalTime}
                  readOnly
                />
              </Col>
              <Col>
                <Button
                  type="primary"
                  onClick={timerRunning ? handleStopTimer : handleStartTimer}
                >
                  {timerRunning ? "停止计时" : "开始计时"}
                </Button>
              </Col>
            </Row>

            {/* 开始时间 */}
            <Row gutter={10} style={{ marginTop: 20, display: "flex", alignItems: "center" }}>
              <Col style={{ flex: "none" }}>
                <Text strong>开始时间：</Text>
              </Col>
              <Col style={{ flex: 1 }}>
                <Input
                  value={startTime ? startTime.format("YYYY-MM-DD HH:mm:ss.SSS") : ""}
                  readOnly
                />
              </Col>
            </Row>

            {/* 结束时间 */}
            <Row gutter={10} style={{ marginTop: 20, display: "flex", alignItems: "center" }}>
              <Col style={{ flex: "none" }}>
                <Text strong>结束时间：</Text>
              </Col>
              <Col span={18}>
                <Input
                  value={endTime ? endTime.format("YYYY-MM-DD HH:mm:ss.SSS") : ""}
                  readOnly
                />
              </Col>
            </Row>

            {/* 间隔时间 */}
            <Row  gutter={10} style={{ marginTop: 20, display: "flex", alignItems: "center" }}>
              <Col style={{ flex: "none" }}>
                <Text strong>间隔时间：</Text>
              </Col>
              <Col span={18}>
                <Input
                  value={intervalTime}
                  readOnly
                />
              </Col>
            </Row>

            {/* 多行文本框 */}
            <Row gutter={10} style={{ marginTop: 20 }}>
              <Col flex="auto">
                <Input.TextArea
                  placeholder="自由输入内容"
                  rows={8}
                />
              </Col>
            </Row>
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

export default TimeConverter;
