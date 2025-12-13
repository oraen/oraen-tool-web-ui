import React, {useEffect, useRef, useState} from 'react';
import {Input, Button, Row, Col, Card, Space, message, Modal} from 'antd';
import { isJson, isXml, isSql, isCsv, formatJson, formatXml, formatSql, formatCsv } from '../../../common/common';
import {Editor} from "@monaco-editor/react";
import { Typography } from 'antd';
import { useTextUtil } from '@/store/textUtil/hooks';
import { preloadMonaco } from '@/utils/monacoLoader';

const { Text } = Typography; // 解构出 Text 组件


const { TextArea } = Input;

const placeholderText =
  `使用提示
1：ctrl + z 撤回
2：ctrl + f 文本查找
3：ctrl + a 全选
4：格式化是4缩进，转JSON是2缩进
5：联系作者 oraen1998@gmail.com
`;

const TextUtil: React.FC = () => {
  // 使用 Redux 管理文本内容，实现跨页面持久化
  const { inputText, setText } = useTextUtil();

  const editorRef = useRef<any>(null); // 用于获取 TextArea 的 DOM 元素
  const [hintText, setHintText] = useState('');
  const [formatType, setFormatType] = useState('json');
  const [editorLoading, setEditorLoading] = useState(true); // 编辑器加载状态
  const [editorError, setEditorError] = useState(false); // 编辑器加载错误状态
  const initialTimeoutRef = useRef<NodeJS.Timeout | null>(null); // 初始加载超时计时器
  const statusCheckIntervalRef = useRef<NodeJS.Timeout | null>(null); // 状态检查定时器
  const retryCountRef = useRef(0); // 重试次数
  const editorInstanceRef = useRef<any>(null); // Monaco Editor 实例的引用

  const [isModalVisible, setIsModalVisible] = useState(false); // 控制弹窗显示
  const [wrapString, setWrapString] = useState(''); // 用户输入的换行字符串


  //文本替换
  const [isReplaceModalVisible, setIsReplaceModalVisible] = useState(false); // 控制文本替换弹窗显示
  const [sourceString, setSourceString] = useState(''); // 源字符串
  const [targetString, setTargetString] = useState(''); // 目标字符串
  const handleReplaceModalOk = () => {
    if (!sourceString) {
      message.warning('请输入源字符串');
      return;
    }

    // 处理目标字符串中的 \r\n 和 \n，将其转换为实际的换行符
    let finalTargetString = targetString;
    if (targetString === '\\r\\n') {
      finalTargetString = '\r\n'; // 替换为 Windows 换行符
    } else if (targetString === '\\n') {
      finalTargetString = '\n'; // 替换为 Unix 换行符
    }

    // 使用正则表达式全局替换
    const regex = new RegExp(sourceString, 'g');
    const newText = inputText.replace(regex, finalTargetString);

    // 更新文本
    updateText(newText);

    // 关闭弹窗并清空输入
    setIsReplaceModalVisible(false);
    setSourceString('');
    setTargetString('');
  };

// 文本替换弹窗取消按钮
  const handleReplaceModalCancel = () => {
    setIsReplaceModalVisible(false);
    setSourceString('');
    setTargetString('');
  };



  //文本统计
  const [isStatisticsModalVisible, setIsStatisticsModalVisible] = useState(false); // 控制文本统计
  // 文本统计函数
  const getTextStatistics = () => {
    const text = inputText;
    const charCount = text.length; // 字符数
    const lineCount = text.split('\n').length; // 行数
    const spaceCount = (text.match(/ /g) || []).length; // 空格数
    const chineseCharCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length; // 中文字符数
    const englishCharCount = (text.match(/[a-zA-Z]/g) || []).length; // 英文字符数
    const numberCount = (text.match(/\d/g) || []).length; // 数字字符数
    const specialCharCount = charCount - spaceCount - chineseCharCount - englishCharCount - numberCount; // 特殊字符数

    return {
      charCount,
      lineCount,
      spaceCount,
      chineseCharCount,
      englishCharCount,
      numberCount,
      specialCharCount,
    };
  };

  //正则匹配
  const [isRegexModalVisible, setIsRegexModalVisible] = useState(false); // 控制正则匹配弹窗显示
  const [regexInput, setRegexInput] = useState(''); // 用户输入的正则表达式
  const [regexMatchResult, setRegexMatchResult] = useState(''); // 正则匹配结果提示
  const handleRegexModalOk = () => {
    if (!regexInput) {
      message.warning('请输入正则表达式');
      return;
    }

    try {
      const regex = new RegExp(regexInput);
      const isMatch = regex.test(inputText);
      setRegexMatchResult(isMatch ? '匹配成功' : '匹配失败');
    } catch (e) {
      setRegexMatchResult('正则表达式无效');
    }
  };

// 正则匹配弹窗取消按钮
  const handleRegexModalCancel = () => {
    setIsRegexModalVisible(false);
    setRegexInput('');
    setRegexMatchResult('');
  };



  // 弹窗确认按钮
  const handleModalOk = () => {
    if (!wrapString) {
      message.warning('请输入要换行的字符串');
      return;
    }

    // 使用正则表达式匹配用户输入的字符串，并在其后插入换行符
    const regex = new RegExp(`(${wrapString})(?![\\r\\n])`, 'g');
    const newText = inputText.replace(regex, `$1\n`);
    updateText(newText);

    setIsModalVisible(false); // 关闭弹窗
    setWrapString(''); // 清空输入框
  };

  // 弹窗取消按钮
  const handleModalCancel = () => {
    setIsModalVisible(false); // 关闭弹窗
    setWrapString(''); // 清空输入框
  };

  // 模拟用户输入，保留撤销栈（同时支持编辑器和文本框）
  const updateText = (newText: string) => {
    if (editorRef.current && !editorError) {
      // Monaco Editor 模式
      const editor = editorRef.current;
      const model = editor.getModel(); // 获取编辑器的模型
      if (model) {
        const fullRange = model.getFullModelRange(); // 获取整个文本的范围

        // 使用 executeEdits 更新内容，保留撤销栈
        editor.executeEdits('update-text', [
          {
            range: fullRange, // 替换整个文本
            text: newText, // 新内容
            forceMoveMarkers: true, // 强制移动光标
          },
        ]);

        // 将光标移动到文本末尾
        editor.setPosition({
          lineNumber: model.getLineCount(),
          column: model.getLineMaxColumn(model.getLineCount()),
        });
      }
    }
    // 无论哪种模式，都更新状态（备用文本框会直接使用这个状态）
    setText(newText);
  };

  // 获取 Editor 实例
  const handleEditorMount = (editor: any) => {
    editorRef.current = editor; // 保存 Editor 实例
    editorInstanceRef.current = editor; // 保存到另一个引用
    setEditorLoading(false); // 编辑器加载完成
    setEditorError(false); // 确保错误状态被清除
    retryCountRef.current = 0; // 重置重试次数

    // 清除所有定时器
    if (initialTimeoutRef.current) {
      clearTimeout(initialTimeoutRef.current);
      initialTimeoutRef.current = null;
    }
    if (statusCheckIntervalRef.current) {
      clearInterval(statusCheckIntervalRef.current);
      statusCheckIntervalRef.current = null;
    }

    console.log('✅ 编辑器加载成功');
  };

  // 检查编辑器加载状态
  const checkEditorStatus = () => {
    // 检查 Monaco Editor 是否在 DOM 中且可用
    const monacoExists = document.querySelector('.monaco-editor') !== null;
    const hasError = document.querySelector('.monaco-editor.error') !== null;

    if (hasError || (!monacoExists && !editorRef.current)) {
      // 检测到真正的错误,进行重新加载
      console.log('❌ 检测到编辑器加载失败,尝试重新加载...');
      retryCountRef.current += 1;

      // 强制重新加载编辑器
      setEditorLoading(true);
      setEditorError(false);

      // 给一点时间让组件重新渲染
      setTimeout(() => {
        if (!editorRef.current) {
          setEditorLoading(false);
          setEditorError(true);
        }
      }, 2000);
    } else if (monacoExists || editorRef.current) {
      // 编辑器存在,继续等待加载完成
      console.log('⏳ 编辑器加载中,继续等待...');
    }
  };

  // 启动状态检查(每10秒检查一次)
  const startStatusCheck = () => {
    statusCheckIntervalRef.current = setInterval(() => {
      checkEditorStatus();
    }, 10000); // 每10秒检查一次
  };

  // 监听编辑器初始加载
  useEffect(() => {
    // 预加载 Monaco chunks (后台异步加载，不阻塞主线程)
    preloadMonaco().catch(err => {
      console.warn('Monaco preload failed:', err);
      // 预加载失败不影响页面，编辑器会使用原始加载方式
    });

    // 给编辑器 15 秒的初始加载时间
    initialTimeoutRef.current = setTimeout(() => {
      if (!editorRef.current) {
        console.log('⏰ 初始加载超时,切换到备用模式,开始状态监测');
        setEditorLoading(false);
        setEditorError(true);
        // 开始定期检查编辑器状态
        startStatusCheck();
      }
    }, 1500);

    return () => {
      if (initialTimeoutRef.current) {
        clearTimeout(initialTimeoutRef.current);
      }
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
      }
    };
  }, []);

  // 转大写
  const handleUpperCase = () => {
    updateText(inputText.toUpperCase());
  };

  // 转小写
  const handleLowerCase = () => {
    updateText(inputText.toLowerCase());
  };

  // 去除空格
  const handleRemoveSpaces = () => {
    updateText(inputText.replace(/ /g, ''));
  };

  // 去除换行符
  const removeNewlines = () => {
    const textWithoutNewlines = inputText.replace(/[\r\n]+/g, '');
    updateText(textWithoutNewlines);
  };

  // 压缩文本（去掉所有空白字符）
  const handleCompress = () => {
    try {
      // 如果是 JSON 格式，使用 JSON.stringify 和 JSON.parse 去除多余空白
      const isJSONStr = isJson(inputText.trim()); // 简单判断是否为 JSON
      if (isJSONStr) {
        const parsedJson = JSON.parse(inputText); // 解析 JSON
        const compressedJson = JSON.stringify(parsedJson); // 重新生成 JSON，去除多余空白
        updateText(compressedJson);
      } else {


        // 如果不是 JSON，直接去除所有空白字符
        updateText(inputText.replace(/\s+/g, ''));
      }
    } catch (e) {
      // 如果 JSON 解析失败，按普通文本处理
      updateText(inputText.replace(/\s+/g, ''));
    }
  };

  // 去除反斜杠
  const handleRemoveBackslashes = () => {
    updateText(inputText.replace(/\\/g, ''));
  };

  // 格式化（待实现）
  const handleFormat = () => {
    const text = inputText.trim();

    // 快速判断格式
    const detectFormat = (str: string): string | null => {
      const firstChar = str[0];
      const firstFewChars = str.slice(0, 10).trim(); // 取前 10 个字符

      if (firstChar === '{' || firstChar === '[') {
        return 'json';
      } else if (firstFewChars.startsWith('<')) {
        return 'xml';
      } else if (firstFewChars.match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i)) {
        return 'sql';
      } else if (firstFewChars.includes(',')) {
        return 'csv';
      } else {
        return "other"
      }
    };

    const format = detectFormat(text);

    if (format === 'json') {
      let re = formatJson(text);
      if(re.isSucceed){
        updateText(re.result)
      }else{
        setHintText(re.errorMsg)
        return
      }
    } else if (format === 'xml') {
      let re = formatXml(text);
      if(re.isSucceed){
        updateText(re.result)
      }else{
        setHintText(re.errorMsg)
        return
      }

    } else if (format === 'sql') {
      try {
        updateText(formatSql(text));
      } catch (e) {
        message.error('SQL 解析失败，请输入有效的 SQL 语句');
      }
    } else if (format === 'csv') {
      try {
        updateText(formatCsv(text));
      } catch (e) {
        message.error('CSV 解析失败，请输入有效的 CSV 格式');
      }
    } else {
      message.error('无效的字符格式');
    }

    setHintText('')
  };

  // 规则换行（待实现）
  const handleWrapLines = () => {
    setIsModalVisible(true); // 显示弹窗
  };

  // URL 编码
  const handleUrlEncode = () => {
    updateText(encodeURIComponent(inputText));
  };

  // URL 解码
  const handleUrlDecode = () => {
    try {
      updateText(decodeURIComponent(inputText));
    } catch (e) {
      message.error('URL 解码失败，请输入有效的 URL 编码字符串');
    }
  };

  // Unicode 编码
  const handleUnicodeEncode = () => {
    const encodedText = inputText.split('').map(char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
    updateText(encodedText);
  };

  // Unicode 解码
  const handleUnicodeDecode = () => {
    try {
      const decodedText = inputText.replace(/\\u[\dA-Fa-f]{4}/g, match => String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16)));
      updateText(decodedText);
    } catch (e) {
      message.error('Unicode 解码失败，请输入有效的 Unicode 编码字符串');
    }
  };

  // Base64 编码
  const handleBase64Encode = () => {
    updateText(btoa(inputText));
  };

  // Base64 解码
  const handleBase64Decode = () => {
    try {
      updateText(atob(inputText));
    } catch (e) {
      message.error('Base64 解码失败，请输入有效的 Base64 编码字符串');
    }
  };

// HEX 编码
  const handleHexEncode = () => {
    const encodedText = inputText
      .split('')
      .map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')) // 补全到两位
      .join('');
    updateText(encodedText);
  };

// HEX 解码
  const handleHexDecode = () => {
    try {
      // 检查输入是否为有效的 HEX 字符串
      if (!/^[0-9a-fA-F]+$/.test(inputText) || inputText.length % 2 !== 0) {
        throw new Error('无效的 HEX 编码字符串');
      }

      const decodedText = inputText
        .match(/.{2}/g) // 每两个字符为一组
        ?.map((hex) => String.fromCharCode(parseInt(hex, 16))) // 转换为字符
        .join('') || '';

      updateText(decodedText);
    } catch (e) {
      message.error('HEX 解码失败，请输入有效的 HEX 编码字符串');
    }
  };

  // UTF8 编码
  const handleUtf8Encode = () => {
    try {
      // 将字符串编码为 UTF8 字节序列，使用 escape 和 String.fromCharCode 的反向操作
      const encoded = unescape(encodeURIComponent(inputText));
      // 转换为十六进制表示
      const hexString = encoded
        .split('')
        .map((char) => '\\x' + char.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('');
      updateText(hexString);
    } catch (e) {
      message.error('UTF8 编码失败，请检查输入内容');
    }
  };

  // UTF8 解码
  const handleUtf8Decode = () => {
    try {
      // 检查输入是否为有效的 UTF8 十六进制格式（\xXX）
      if (!/^(?:\\x[0-9a-fA-F]{2})+$/.test(inputText)) {
        throw new Error('无效的 UTF8 编码格式，应为 \\xXX 格式');
      }

      // 从十六进制转换回字符
      const decodedText = inputText
        .split('\\x')
        .filter(hex => hex.length > 0)
        .map((hex) => String.fromCharCode(parseInt(hex, 16)))
        .join('');
      
      // 从 UTF8 字节序列解码回字符
      const utf8Decoded = decodeURIComponent(escape(decodedText));
      updateText(utf8Decoded);
    } catch (e) {
      message.error('UTF8 解码失败，请输入有效的 UTF8 编码字符串');
    }
  };

  // ASCII（2）编码
  const handleAsciiBinaryEncode = () => {
    const encodedText = inputText.split('').map(char => char.charCodeAt(0).toString(2)).join(' ');
    updateText(encodedText);
  };

  // ASCII（10）编码
  const handleAsciiDecimalEncode = () => {
    const encodedText = inputText.split('').map(char => char.charCodeAt(0).toString(10)).join(' ');
    updateText(encodedText);
  };

  // ASCII（16）编码
  const handleAsciiHexEncode = () => {
    const encodedText = inputText.split('').map(char => char.charCodeAt(0).toString(16)).join(' ');
    updateText(encodedText);
  };

  // ASCII（2）解码
  const handleAsciiBinaryDecode = () => {
    try {
      const decodedText = inputText.split(' ').map(binary => String.fromCharCode(parseInt(binary, 2))).join('');
      updateText(decodedText);
    } catch (e) {
      message.error('ASCII（2）解码失败，请输入有效的二进制字符串');
    }
  };

  // ASCII（10）解码
  const handleAsciiDecimalDecode = () => {
    try {
      const decodedText = inputText.split(' ').map(decimal => String.fromCharCode(parseInt(decimal, 10))).join('');
      updateText(decodedText);
    } catch (e) {
      message.error('ASCII（10）解码失败，请输入有效的十进制字符串');
    }
  };

  // ASCII（16）解码
  const handleAsciiHexDecode = () => {
    try {
      const decodedText = inputText.split(' ').map(hex => String.fromCharCode(parseInt(hex, 16))).join('');
      updateText(decodedText);
    } catch (e) {
      message.error('ASCII（16）解码失败，请输入有效的十六进制字符串');
    }
  };

  // JSON 转 XML
  const jsonToXml = (json: any): string => {
    const convert = (obj: any): string => {
      return Object.keys(obj).map(key => {
        const value = obj[key];
        if (typeof value === 'object' && !Array.isArray(value)) {
          return `<${key}>${convert(value)}</${key}>`;
        } else if (Array.isArray(value)) {
          return value.map(item => `<${key}>${convert(item)}</${key}>`).join('');
        } else {
          return `<${key}>${value}</${key}>`;
        }
      }).join('');
    };

    return `<root>${convert(json)}</root>`;
  };

// JSON 转 CSV
  const jsonToCsv = (json: any): string => {
    const flatten = (obj: any, prefix = ''): Record<string, any> => {
      return Object.keys(obj).reduce((acc: Record<string, any>, key) => {
        const value = obj[key];
        if (typeof value === 'object' && !Array.isArray(value)) {
          Object.assign(acc, flatten(value, `${prefix}${key}.`));
        } else {
          acc[`${prefix}${key}`] = value;
        }
        return acc;
      }, {});
    };

    const flattened = json.map((item: any) => flatten(item));
    const headers = Array.from(new Set(flattened.flatMap(Object.keys)));

    // 显式定义 item 的类型为 Record<string, any>
    const rows = flattened.map((item: Record<string, any>) =>
      // @ts-ignore
      headers.map(header => item[header] || '') // 确保 header 是 item 的合法键
    );

    return [headers.join(','), ...rows.map((row: string[]) => row.join(','))].join('\n');
  };

// XML 转 JSON
  const xmlToJson = (xml: string): any => {
    const parse = (node: any): any => {
      const obj: any = {};
      if (node.children.length === 0) {
        return node.textContent;
      }
      Array.from(node.children).forEach((child: any) => {
        const key = child.nodeName;
        const value = parse(child);
        if (obj[key]) {
          if (Array.isArray(obj[key])) {
            obj[key].push(value);
          } else {
            obj[key] = [obj[key], value];
          }
        } else {
          obj[key] = value;
        }
      });
      return obj;
    };

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    return parse(doc.documentElement);
  };

// CSV 转 JSON
  const csvToJson = (csv: string): any => {
    const lines = csv.split('\n').filter(line => line.trim() !== ''); // 去除空行
    const headers = lines[0].split(',').map(header => header.trim()); // 去除表头的空白字符

    return lines.slice(1).map(line => {
      const values = line.split(',').map(value => value.trim()); // 去除每个字段的空白字符
      return headers.reduce((obj: Record<string, any>, header, index) => {
        obj[header] = values[index] || ''; // 如果字段为空，使用空字符串
        return obj;
      }, {});
    });
  };

// CSV 转 XML
  const csvToXml = (csv: string): string => {
    const json = csvToJson(csv);
    return jsonToXml(json);
  };

// XML 转 CSV
  const xmlToCsv = (xml: string): string => {
    const json = xmlToJson(xml);
    return jsonToCsv(json);
  };

// 转 JSON
  const handleToJson = () => {
    const text = inputText.trim();

    if (isJson(text)) {
      let json = JSON.parse(text);
      updateText(JSON.stringify(json, null, 2));
      return;
    }

    try {
      let json: any;
      if (isXml(text)) {
        json = xmlToJson(text);
      } else if (isCsv(text)) {
        json = csvToJson(text);
      } else {
        message.error('文本格式无效，请输入有效的 XML 或 CSV 格式');
        return;
      }
      updateText(JSON.stringify(json, null, 2));
    } catch (e) {
      message.error('转换失败，请输入有效的 XML 或 CSV 格式');
    }
  };

// 转 XML
  const handleToXml = () => {
    const text = inputText.trim();

    if (isXml(text)) {
      message.info('文本已经是 XML 格式');
      return;
    }

    try {
      let xml: string;
      if (isJson(text)) {
        const json = JSON.parse(text);
        xml = jsonToXml(json);
      } else if (isCsv(text)) {
        xml = csvToXml(text);
      } else {
        message.error('文本格式无效，请输入有效的 JSON 或 CSV 格式');
        return;
      }
      updateText(xml);
    } catch (e) {
      message.error('转换失败，请输入有效的 JSON 或 CSV 格式');
    }
  };

// 转 CSV
  const handleToCsv = () => {
    const text = inputText.trim();

    if (isCsv(text)) {
      message.info('文本已经是 CSV 格式');
      return;
    }

    try {
      let csv: string;
      if (isJson(text)) {
        const json = JSON.parse(text);
        csv = jsonToCsv(json);
      } else if (isXml(text)) {
        csv = xmlToCsv(text);
      } else {
        message.error('文本格式无效，请输入有效的 JSON 或 XML 格式');
        return;
      }
      updateText(csv);
    } catch (e) {
      message.error('转换失败，请输入有效的 JSON 或 XML 格式');
    }
  };

  // 转驼峰（待实现）
  const handleToCamelCase = () => {
    const text = inputText.trim();

    if (!isJson(text) && !isXml(text) && !isCsv(text)) {
      message.error('文本格式无效，请输入有效的 JSON、XML 或 CSV 格式');
      return;
    }

    try {
      let json: any;
      if (isJson(text)) {
        json = JSON.parse(text);
      } else if (isXml(text)) {
        json = xmlToJson(text);
      } else if (isCsv(text)) {
        json = csvToJson(text);
      }

      const convertKeysToCamelCase = (obj: any): any => {
        if (Array.isArray(obj)) {
          return obj.map(item => convertKeysToCamelCase(item));
        } else if (typeof obj === 'object' && obj !== null) {
          const newObj: any = {};
          for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
              const newKey = key.replace(/_(\w)/g, (_, letter) => letter.toUpperCase());
              newObj[newKey] = convertKeysToCamelCase(obj[key]);
            }
          }
          return newObj;
        }
        return obj;
      };

      const camelCaseJson = convertKeysToCamelCase(json);
      updateText(JSON.stringify(camelCaseJson, null, 2));
    } catch (e) {
      message.error('转换失败，请输入有效的 JSON、XML 或 CSV 格式');
    }
  };

  // 转下划线（待实现）
  const handleToSnakeCase = () => {
    const text = inputText.trim();

    if (!isJson(text) && !isXml(text) && !isCsv(text)) {
      message.error('文本格式无效，请输入有效的 JSON、XML 或 CSV 格式');
      return;
    }

    try {
      let json: any;
      if (isJson(text)) {
        json = JSON.parse(text);
      } else if (isXml(text)) {
        json = xmlToJson(text);
      } else if (isCsv(text)) {
        json = csvToJson(text);
      }

      const convertKeysToSnakeCase = (obj: any): any => {
        if (Array.isArray(obj)) {
          return obj.map(item => convertKeysToSnakeCase(item));
        } else if (typeof obj === 'object' && obj !== null) {
          const newObj: any = {};
          for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
              const newKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
              newObj[newKey] = convertKeysToSnakeCase(obj[key]);
            }
          }
          return newObj;
        }
        return obj;
      };

      const snakeCaseJson = convertKeysToSnakeCase(json);
      updateText(JSON.stringify(snakeCaseJson, null, 2));
    } catch (e) {
      message.error('转换失败，请输入有效的 JSON、XML 或 CSV 格式');
    }
  };


  // 复制内容
  const handleCopyToClipboard = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(inputText)
        .then(() => {
          message.success('复制成功！');
        })
        .catch(() => {
          message.error('复制失败，请手动复制');
        });
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = inputText;
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

  // 清空内容
  const handleClearText = () => {
    updateText('');
  };

  const onChangeText = (newStr: string) => {
    setText(newStr);
    let trim = newStr.trim()
    if(trim != null && trim.length > 0){
      const firstChar = trim[0];
      const firstFewChars = trim.slice(0, 10).trim(); // 取前 10 个字符

      if (firstChar === '{' || firstChar === '[') {
        setFormatType('json');
      } else if (firstFewChars.startsWith('<')) {
        setFormatType('xml');
      } else if (firstFewChars.match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/i)) {
        setFormatType('sql');
      }  else {
        setFormatType('json');
      }
    }
  };


  return (
    <div style={{ padding: '24px' }}>
      <Card title="文本处理工具" bordered={false}>
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <Space>
                <Button type="primary" style={{backgroundColor: '#1890ff'}}
                        onClick={handleCopyToClipboard}>复制内容</Button>
                <Button type="primary" style={{backgroundColor: '#ff4d4f'}} onClick={handleClearText}>清空内容</Button>
              </Space>
              <Text strong style={{fontWeight: 'bold'}}>字符数量：{inputText.length}</Text> {/* 靠右对齐并加粗 */}
            </div>
          </Col>

          <Col span={24} style={{height: '50vh', position: 'relative'}}>
            {!editorError ? (
              <>
                <Editor
                  key={`editor-${retryCountRef.current}`} // 添加 key 强制重新挂载
                  height="100%"
                  language={formatType}
                  value={inputText}
                  onChange={(newValue) => onChangeText(newValue == null ? '' : newValue)}
                  theme="vs-light"
                  loading={<div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%'}}>编辑器加载中...</div>}
                  options={{
                    fontSize: 14,
                    minimap: {enabled: false},
                    wordWrap: 'on',
                  }}
                  onMount={handleEditorMount}
                />
                {!inputText && !editorLoading && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 15,
                      left: 30,
                      color: '#bfbfbf',
                      pointerEvents: 'none',
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {placeholderText}
                  </div>
                )}
              </>
            ) : (
              // 备用文本框（当编辑器加载失败时显示）
              <div style={{position: 'relative', height: '100%'}}>
                <TextArea
                  ref={(ref) => {
                    // 将备用文本框的引用也保存，方便操作
                    if (ref) {
                      editorRef.current = {
                        getValue: () => inputText,
                        setValue: (value: string) => setText(value),
                      };
                    }
                  }}
                  rows={20}
                  value={inputText}
                  onChange={(e) => onChangeText(e.target.value)}
                  placeholder={placeholderText}
                  style={{
                    fontSize: 14,
                    fontFamily: 'Consolas, Monaco, monospace',
                    height: '100%',
                    resize: 'none'
                  }}
                />
                <div style={{
                  position: 'absolute',
                  bottom: 10,
                  right: 10,
                  fontSize: 12,
                  color: '#999',
                  background: '#fff',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid #d9d9d9'
                }}>
                  {retryCountRef.current > 0
                    ? `后台监测中... (已重试 ${retryCountRef.current} 次)`
                    : '编辑器加载中，暂用备用模式...'}
                </div>
              </div>
            )}
          </Col>

          <Col  span={24}>
            <TextArea
              rows={4} // 固定为 5 行
              value={hintText} // 设置提示词内容
              readOnly // 只读，允许选中和复制
              style={{ resize: 'none', backgroundColor: '#f5f5f5' }} // 禁止调整大小，设置背景色
            />
          </Col>

          <Col span={24}>
            <Space>
              <Button type="primary" style={{backgroundColor: '#52c41a'}} onClick={handleUpperCase}>转大写</Button>
              <Button type="primary" style={{backgroundColor: '#faad14'}} onClick={handleLowerCase}>转小写</Button>
              <Button type="primary" style={{backgroundColor: '#13c2c2'}} onClick={handleRemoveSpaces}>去除空格</Button>
              <Button type="primary" style={{backgroundColor: '#13c2c2'}} onClick={removeNewlines}>去除换行</Button>
              <Button type="primary" style={{backgroundColor: '#722ed1'}} onClick={handleCompress}>压缩文本</Button>
              <Button type="primary" style={{backgroundColor: '#eb2f96'}} onClick={handleRemoveBackslashes}>去除
                \</Button>
              <Button type="primary" style={{backgroundColor: '#f5222d'}} onClick={handleFormat}>格式化</Button>
              <Button type="primary" style={{backgroundColor: '#fa8c16'}} onClick={handleWrapLines}>规则换行</Button>
              <div style={{padding: '24px'}}>
                {/* 其他代码保持不变... */}

                {/* 规则换行弹窗 */}
                <Modal
                  title="规则换行"
                  visible={isModalVisible}
                  onOk={handleModalOk}
                  onCancel={handleModalCancel}
                  okText="确定" // 修改确定按钮的文本
                  cancelText="取消" // 修改取消按钮的文本
                >
                  <Input
                    placeholder="在这个字符串后面插入换行符"
                    value={wrapString}
                    onChange={(e) => setWrapString(e.target.value)}
                  />
                </Modal>
              </div>

            </Space>
          </Col>

          <Col span={24}>
            <Space>
              <Button type="primary" style={{backgroundColor: '#2f54eb'}} onClick={handleUrlEncode}>URL编码</Button>
              <Button type="primary" style={{backgroundColor: '#096dd9'}}
                      onClick={handleUnicodeEncode}>UNICODE编码</Button>
              <Button type="primary" style={{backgroundColor: '#1d39c4'}} onClick={handleBase64Encode}>Base64编码</Button>
              <Button type="primary" style={{ backgroundColor: '#10239e' }} onClick={handleHexEncode}>HEX编码</Button>
              <Button type="primary" style={{ backgroundColor: '#061178' }} onClick={handleUtf8Encode}>UTF8编码</Button>
              <Button type="primary" style={{ backgroundColor: '#391085' }} onClick={handleAsciiBinaryEncode}>ASCII（2）编码</Button>
              <Button type="primary" style={{ backgroundColor: '#531dab' }} onClick={handleAsciiDecimalEncode}>ASCII（10）编码</Button>
              <Button type="primary" style={{ backgroundColor: '#722ed1' }} onClick={handleAsciiHexEncode}>ASCII（16）编码</Button>
            </Space>
          </Col>

          <Col span={24}>
            <Space>
              <Button type="primary" style={{ backgroundColor: '#2f54eb' }} onClick={handleUrlDecode}>URL解码</Button>
              <Button type="primary" style={{ backgroundColor: '#096dd9' }} onClick={handleUnicodeDecode}>UNICODE解码</Button>
              <Button type="primary" style={{ backgroundColor: '#1d39c4' }} onClick={handleBase64Decode}>Base64解码</Button>
              <Button type="primary" style={{ backgroundColor: '#10239e' }} onClick={handleHexDecode}>HEX解码</Button>
              <Button type="primary" style={{ backgroundColor: '#061178' }} onClick={handleUtf8Decode}>UTF8解码</Button>
              <Button type="primary" style={{ backgroundColor: '#391085' }} onClick={handleAsciiBinaryDecode}>ASCII（2）解码</Button>
              <Button type="primary" style={{ backgroundColor: '#531dab' }} onClick={handleAsciiDecimalDecode}>ASCII（10）解码</Button>
              <Button type="primary" style={{ backgroundColor: '#722ed1' }} onClick={handleAsciiHexDecode}>ASCII（16）解码</Button>
            </Space>
          </Col>

          <Col span={24}>
            <Space>
              <Button type="primary" style={{ backgroundColor: '#13c2c2' }} onClick={handleToJson}>转JSON</Button>
              <Button type="primary" style={{ backgroundColor: '#08979c' }} onClick={handleToXml}>转XML</Button>
              <Button type="primary" style={{ backgroundColor: '#006d75' }} onClick={handleToCsv}>转CSV</Button>
              <Button type="primary" style={{ backgroundColor: '#00474f' }} onClick={handleToCamelCase}>转驼峰</Button>
              <Button type="primary" style={{ backgroundColor: '#002329' }} onClick={handleToSnakeCase}>转下划线</Button>
            </Space>
          </Col>

          <Col span={24}>
            <Space>
              <Button type="primary" style={{ backgroundColor: '#f5222d' }} onClick={() => setIsRegexModalVisible(true)}>
                正则匹配
              </Button>
              <Modal
                title="正则匹配"
                visible={isRegexModalVisible}
                onOk={handleRegexModalOk}
                onCancel={handleRegexModalCancel}
                okText="确认"
                cancelText="取消"
                width={800} // 设定宽度，比如 800px
              >
                <Input
                  placeholder="请输入正则表达式"
                  value={regexInput}
                  onChange={(e) => setRegexInput(e.target.value)}
                />
                <div style={{ marginTop: '10px', color: regexMatchResult.includes('成功') ? '#52c41a' : '#f5222d' }}>
                  {regexMatchResult}
                </div>

                <div style={{ marginTop: '15px', padding: '10px', background: '#f5f5f5', borderRadius: '5px' }}>
                  <h4>常见正则表达式示例：</h4>
                  <ul style={{ paddingLeft: '20px' }}>
                    <li><strong>匹配邮箱：</strong> <code>{"^[\\w.-]+@[a-zA-Z\\d.-]+\\.[a-zA-Z]{2,}$"}</code></li>
                    <li><strong>匹配中国手机号：</strong> <code>{"^1[3-9]\\d{9}$"}</code></li>
                    <li><strong>匹配座机电话：</strong> <code>{"^(\\d{3,4}-)?\\d{7,8}$"}</code></li>
                    <li><strong>匹配身份证号（15或18位）：</strong> <code>{"^\\d{15}(\\d{2}[0-9Xx])?$"}</code></li>
                    <li><strong>匹配网址（URL）：</strong> <code>{"^https?://[^\\s/$.?#].[^\\s]*$"}</code></li>
                    <li><strong>匹配IPv4地址：</strong> <code>{"^(25[0-5]|2[0-4]\\d|1\\d{2}|\\d{1,2})\\.(25[0-5]|2[0-4]\\d|1\\d{2}|\\d{1,2})\\.(25[0-5]|2[0-4]\\d|1\\d{2}|\\d{1,2})\\.(25[0-5]|2[0-4]\\d|1\\d{2}|\\d{1,2})$"}</code></li>
                    <li><strong>匹配日期（YYYY-MM-DD）：</strong> <code>{"^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$"}</code></li>
                    <li><strong>匹配整数：</strong> <code>{"^-?\\d+$"}</code></li>
                    <li><strong>匹配浮点数：</strong> <code>{"^-?\\d+(\\.\\d+)?$"}</code></li>
                    <li><strong>匹配中文字符：</strong> <code>{"^[\\u4e00-\\u9fa5]+$"}</code></li>
                  </ul>
                </div>
              </Modal>





              <Button type="primary" style={{ backgroundColor: '#ff4d4f' }} onClick={() => setIsStatisticsModalVisible(true)}>
                文本统计
              </Button>
              <Modal
                title="文本统计"
                visible={isStatisticsModalVisible}
                onOk={() => setIsStatisticsModalVisible(false)}
                onCancel={() => setIsStatisticsModalVisible(false)}
                okText="确认"
                cancelText="取消"
              >
                <div style={{ lineHeight: '2' }}>
                  <div>字符数：{getTextStatistics().charCount}</div>
                  <div>行数：{getTextStatistics().lineCount}</div>
                  <div>空格数：{getTextStatistics().spaceCount}</div>
                  <div>中文字符数：{getTextStatistics().chineseCharCount}</div>
                  <div>英文字符数：{getTextStatistics().englishCharCount}</div>
                  <div>数字字符数：{getTextStatistics().numberCount}</div>
                  <div>特殊字符数：{getTextStatistics().specialCharCount}</div>
                </div>
              </Modal>


              <Button type="primary" style={{ backgroundColor: '#cf1322' }} onClick={() => setIsReplaceModalVisible(true)}>
                文本替换
              </Button>
              <Modal
                title="文本替换"
                visible={isReplaceModalVisible}
                onOk={handleReplaceModalOk}
                onCancel={handleReplaceModalCancel}
                okText="确认"
                cancelText="取消"
              >
                <Input
                  placeholder="请输入源字符串"
                  value={sourceString}
                  onChange={(e) => setSourceString(e.target.value)}
                  style={{ marginBottom: '10px' }}
                />
                <Input
                  placeholder="请输入目标字符串"
                  value={targetString}
                  onChange={(e) => setTargetString(e.target.value)}
                />
                <div style={{ marginTop: '10px', color: '#888', fontSize: '12px' }}>
                  提示：可以使用 <code>\r\n</code> 或 <code>\n</code> 表示换行，特殊字符比如<code>\</code>前面需再加一个<code>\</code>。
                </div>
              </Modal>
            </Space>
          </Col>

        </Row>
      </Card>
    </div>
  );
};

export default TextUtil;
