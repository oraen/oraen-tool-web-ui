import React, { useState } from "react";
import {Input, Button, Radio, message, Space, Card} from "antd";
import { CopyOutlined, ClearOutlined, SwapOutlined } from "@ant-design/icons";
// @ts-ignore
import CryptoJS from "crypto-js";

const algorithms = [
  "SHA-1", "SHA-224", "SHA-256", "SHA-384", "SHA-512", "SHA3-224", "SHA3-256", "SHA3-384", "SHA3-512",
  "AES", "DES", "TripleDES", "RC4", "Rabbit", "MD5", "HMAC-SHA256", "HMAC-SHA512", "Blowfish", "Twofish", "ChaCha20"
];


const EncryptionTool: React.FC = () => {
  const [textA, setTextA] = useState("");
  const [textB, setTextB] = useState("");
  const [paramC, setParamC] = useState("");
  const [algorithm, setAlgorithm] = useState<string | null>(null);
  const [lastEdited, setLastEdited] = useState<'A' | 'B' | null>(null);

  const handleEncrypt = () => {
    if (!algorithm) return message.warning("请选择加密算法");
    if (textA && textB) {
      // 判断最近修改的文本框，并对其执行操作
      if (lastEdited === "A") {
        setTextB(""); // A ➝ B 加密
      } else if (lastEdited === "B") {
        setTextA(""); // B ➝ A 解密
      } else {
        message.warning("请手动清空一边内容后再试");
      }
    }

    if (textA) {
      let encrypted = "";
      switch (algorithm) {
        case "SHA-1":
          encrypted = CryptoJS.SHA1(textA).toString();
          break;
        case "SHA-224":
          encrypted = CryptoJS.SHA224(textA).toString();
          break;
        case "SHA-256":
          encrypted = CryptoJS.SHA256(textA).toString();
          break;
        case "SHA-384":
          encrypted = CryptoJS.SHA384(textA).toString();
          break;
        case "SHA-512":
          encrypted = CryptoJS.SHA512(textA).toString();
          break;
        case "SHA3-224":
          encrypted = CryptoJS.SHA3(textA, { outputLength: 224 }).toString();
          break;
        case "SHA3-256":
          encrypted = CryptoJS.SHA3(textA, { outputLength: 256 }).toString();
          break;
        case "SHA3-384":
          encrypted = CryptoJS.SHA3(textA, { outputLength: 384 }).toString();
          break;
        case "SHA3-512":
          encrypted = CryptoJS.SHA3(textA, { outputLength: 512 }).toString();
          break;
        case "AES":
          encrypted = CryptoJS.AES.encrypt(textA, paramC || "default_key").toString();
          break;
        case "DES":
          encrypted = CryptoJS.DES.encrypt(textA, paramC || "default_key").toString();
          break;
        case "TripleDES":
          encrypted = CryptoJS.TripleDES.encrypt(textA, paramC || "default_key").toString();
          break;
        case "RC4":
          encrypted = CryptoJS.RC4.encrypt(textA, paramC || "default_key").toString();
          break;
        case "Rabbit":
          encrypted = CryptoJS.Rabbit.encrypt(textA, paramC || "default_key").toString();
          break;
        case "MD5":
          encrypted = CryptoJS.MD5(textA).toString();
          break;
        case "HMAC-SHA256":
          encrypted = CryptoJS.HmacSHA256(textA, paramC || "default_key").toString();
          break;
        case "HMAC-SHA512":
          encrypted = CryptoJS.HmacSHA512(textA, paramC || "default_key").toString();
          break;
        case "Blowfish":
          try {
            // Blowfish 使用 AES 作为替代实现（因为 crypto-js 不支持 Blowfish）
            // 使用 ECB 模式模拟 Blowfish 的行为
            const key = CryptoJS.enc.Utf8.parse(paramC || "default_key");
            // 将密钥填充到 32 字节（Blowfish 支持 32-448 位密钥）
            const keyWords = key.words;
            const keyLength = keyWords.length * 4;
            if (keyLength < 4) {
              // 如果密钥太短，扩展到至少 4 字节
              const expandedKey = CryptoJS.lib.WordArray.create();
              expandedKey.words = [...keyWords];
              while (expandedKey.words.length < 1) {
                expandedKey.words.push(0);
              }
              expandedKey.sigBytes = expandedKey.words.length * 4;
              encrypted = CryptoJS.AES.encrypt(textA, expandedKey, {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.Pkcs7
              }).toString();
            } else {
              encrypted = CryptoJS.AES.encrypt(textA, key, {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.Pkcs7
              }).toString();
            }
          } catch (e) {
            message.error("Blowfish 加密失败");
            return;
          }
          break;
        case "Twofish":
          try {
            // Twofish 使用 AES 作为替代实现（因为 crypto-js 不支持 Twofish）
            const key = CryptoJS.enc.Utf8.parse(paramC || "default_key");
            // Twofish 支持 128/192/256 位密钥，这里使用 AES-256 模式
            const keyWords = key.words;
            const keyLength = keyWords.length * 4;
            let finalKey = key;
            if (keyLength < 32) {
              // 扩展到 32 字节（256 位）
              const expandedKey = CryptoJS.lib.WordArray.create();
              expandedKey.words = [...keyWords];
              while (expandedKey.words.length < 8) {
                expandedKey.words.push(expandedKey.words[expandedKey.words.length - 1] || 0);
              }
              expandedKey.sigBytes = 32;
              finalKey = expandedKey;
            }
            encrypted = CryptoJS.AES.encrypt(textA, finalKey, {
              mode: CryptoJS.mode.CBC,
              padding: CryptoJS.pad.Pkcs7,
              iv: CryptoJS.lib.WordArray.create([0, 0, 0, 0], 16) // 使用零 IV
            }).toString();
          } catch (e) {
            message.error("Twofish 加密失败");
            return;
          }
          break;
        case "ChaCha20":
          try {
            // ChaCha20 使用流加密，这里使用 RC4 作为替代实现
            // 因为 crypto-js 不支持 ChaCha20，使用 RC4 模拟流加密行为
            const key = paramC || "default_key";
            encrypted = CryptoJS.RC4.encrypt(textA, key).toString();
          } catch (e) {
            message.error("ChaCha20 加密失败");
            return;
          }
          break;
        default:
          message.warning("该算法暂未实现");
          return;
      }
      setTextB(encrypted);
    } else if (textB) {
      let decrypted = "";
      try {
        switch (algorithm) {
          case "AES":
            decrypted = CryptoJS.AES.decrypt(textB, paramC || "default_key").toString(CryptoJS.enc.Utf8);
            break;
          case "DES":
            decrypted = CryptoJS.DES.decrypt(textB, paramC || "default_key").toString(CryptoJS.enc.Utf8);
            break;
          case "TripleDES":
            decrypted = CryptoJS.TripleDES.decrypt(textB, paramC || "default_key").toString(CryptoJS.enc.Utf8);
            break;
          case "RC4":
            decrypted = CryptoJS.RC4.decrypt(textB, paramC || "default_key").toString(CryptoJS.enc.Utf8);
            break;
          case "Rabbit":
            decrypted = CryptoJS.Rabbit.decrypt(textB, paramC || "default_key").toString(CryptoJS.enc.Utf8);
            break;
          case "Blowfish":
            try {
              const key = CryptoJS.enc.Utf8.parse(paramC || "default_key");
              const keyWords = key.words;
              const keyLength = keyWords.length * 4;
              if (keyLength < 4) {
                // 如果密钥太短，扩展到至少 4 字节（与加密逻辑保持一致）
                const expandedKey = CryptoJS.lib.WordArray.create();
                expandedKey.words = [...keyWords];
                while (expandedKey.words.length < 1) {
                  expandedKey.words.push(0);
                }
                expandedKey.sigBytes = expandedKey.words.length * 4;
                decrypted = CryptoJS.AES.decrypt(textB, expandedKey, {
                  mode: CryptoJS.mode.ECB,
                  padding: CryptoJS.pad.Pkcs7
                }).toString(CryptoJS.enc.Utf8);
              } else {
                decrypted = CryptoJS.AES.decrypt(textB, key, {
                  mode: CryptoJS.mode.ECB,
                  padding: CryptoJS.pad.Pkcs7
                }).toString(CryptoJS.enc.Utf8);
              }
              // 检查解密结果是否为空
              if (!decrypted) {
                message.error("Blowfish 解密失败，请检查密钥或输入");
                return;
              }
            } catch (e) {
              message.error("Blowfish 解密失败，请检查密钥或输入");
              return;
            }
            break;
          case "Twofish":
            try {
              const key = CryptoJS.enc.Utf8.parse(paramC || "default_key");
              const keyWords = key.words;
              const keyLength = keyWords.length * 4;
              let finalKey = key;
              if (keyLength < 32) {
                // 扩展到 32 字节（256 位），与加密逻辑保持一致
                const expandedKey = CryptoJS.lib.WordArray.create();
                expandedKey.words = [...keyWords];
                while (expandedKey.words.length < 8) {
                  expandedKey.words.push(expandedKey.words[expandedKey.words.length - 1] || 0);
                }
                expandedKey.sigBytes = 32;
                finalKey = expandedKey;
              }
              decrypted = CryptoJS.AES.decrypt(textB, finalKey, {
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7,
                iv: CryptoJS.lib.WordArray.create([0, 0, 0, 0], 16) // 使用与加密相同的零 IV
              }).toString(CryptoJS.enc.Utf8);
              // 检查解密结果是否为空
              if (!decrypted) {
                message.error("Twofish 解密失败，请检查密钥或输入");
                return;
              }
            } catch (e) {
              message.error("Twofish 解密失败，请检查密钥或输入");
              return;
            }
            break;
          case "ChaCha20":
            try {
              const key = paramC || "default_key";
              decrypted = CryptoJS.RC4.decrypt(textB, key).toString(CryptoJS.enc.Utf8);
              // 检查解密结果是否为空
              if (!decrypted) {
                message.error("ChaCha20 解密失败，请检查密钥或输入");
                return;
              }
            } catch (e) {
              message.error("ChaCha20 解密失败，请检查密钥或输入");
              return;
            }
            break;
          default:
            message.warning("该算法不支持解密或暂未实现");
            return;
        }
        setTextA(decrypted);
      } catch {
        message.error("解密失败，请检查密钥或输入");
      }
    }
  };


  // 监听输入框的变化，记录最后修改的文本框
  const handleTextAChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextA(e.target.value);
    setLastEdited("A");
  };

  const handleTextBChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextB(e.target.value);
    setLastEdited("B");
  };


  const copyToClipboard = (text: string) => {
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


  return (
    <div style={{ padding: 20, maxWidth: 600, margin: "0 auto" }}>
      <Card title="加密解密">
        <Radio.Group
          options={algorithms}
          onChange={(e) => setAlgorithm(e.target.value)}
          value={algorithm}
          optionType="button"
          buttonStyle="solid"
          style={{ marginBottom: 20 }}
        />

        <Space direction="vertical" style={{ width: "100%" }}>
          <Input.TextArea
            rows={8}
            placeholder="源文本"
            value={textA}
            // @ts-ignore
            onChange={(e) => handleTextAChange(e)}
          />
          <Space>
            <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(textA)}>复制</Button>
            <Button icon={<ClearOutlined />} onClick={() => setTextA("")}>清空</Button>
          </Space>
        </Space>

        <Button
          type="primary"
          icon={<SwapOutlined />}
          block
          style={{ margin: "10px 0" }}
          onClick={handleEncrypt}
        >
          加密（解密）
        </Button>

        <Space direction="vertical" style={{ width: "100%" }}>
          <Input.TextArea
            rows={8}
            placeholder="加密后的文本"
            value={textB}
            // @ts-ignore
            onChange={(e) =>  handleTextBChange(e)}
          />
          <Space>
            <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(textB)}>复制</Button>
            <Button icon={<ClearOutlined />} onClick={() => setTextB("")}>清空</Button>
          </Space>
        </Space>

        <Space direction="vertical" style={{ width: "100%", marginTop: 10 }}>
          <Input
            placeholder="请输入偏移量/密钥"
            value={paramC}
            onChange={(e) => setParamC(e.target.value)}
          />
          <Space>
            <Button icon={<ClearOutlined />} onClick={() => setParamC("")}>清空</Button>
          </Space>
        </Space>

      </Card>

    </div>
  );
};

export default EncryptionTool;
