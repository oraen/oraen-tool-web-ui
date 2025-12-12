import React, { useState } from 'react';
import { Card, Upload, Input, Button, Space, Typography, message, Tabs, Row, Col } from 'antd';
import { UploadOutlined, LockOutlined, UnlockOutlined, DownloadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import CryptoJS from 'crypto-js';

const { Text, Title } = Typography;
const { TabPane } = Tabs;

const FileEncryption: React.FC = () => {
  // 加密状态
  const [encryptFile, setEncryptFile] = useState<File | null>(null);
  const [encryptPassword, setEncryptPassword] = useState('');
  const [encryptLoading, setEncryptLoading] = useState(false);

  // 解密状态
  const [decryptFile, setDecryptFile] = useState<File | null>(null);
  const [decryptPassword, setDecryptPassword] = useState('');
  const [decryptLoading, setDecryptLoading] = useState(false);

  // 读取文件为ArrayBuffer
  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  // AES 加密文件
  const handleEncrypt = async () => {
    if (!encryptFile) {
      message.warning('请先上传文件');
      return;
    }
    if (!encryptPassword) {
      message.warning('请输入密码');
      return;
    }

    setEncryptLoading(true);
    try {
      // 读取文件内容
      const arrayBuffer = await readFileAsArrayBuffer(encryptFile);
      const originalWordArray = CryptoJS.lib.WordArray.create(arrayBuffer as any);
      
      // 创建校验字符串
      const validator = 'ORAEN_VALID_' + Date.now();
      const validatorWordArray = CryptoJS.enc.Utf8.parse(validator);
      
      // 新建标头：校验字符串 + 原文件数据
      const headerAndData = {
        validator: validator,
        size: originalWordArray.words.length,
        data: CryptoJS.enc.Base64.stringify(originalWordArray)
      };
      const headerAndDataJson = JSON.stringify(headerAndData);
      const headerAndDataWordArray = CryptoJS.enc.Utf8.parse(headerAndDataJson);
      
      // 使用 AES 加密（校验字符串 + 原文件数据）
      const encrypted = CryptoJS.AES.encrypt(headerAndDataWordArray, encryptPassword).toString();
      
      // 创建最终的文件结构
      const fileStructure = {
        oraen_magic: 'CORKI_TSE',
        data: encrypted
      };
      const fileContent = JSON.stringify(fileStructure);
      
      // 创建加密后的文件
      const blob = new Blob([fileContent], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      // 下载文件
      const link = document.createElement('a');
      link.href = url;
      link.download = `${encryptFile.name}.olock`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      message.success('文件加密成功！');
      setEncryptFile(null);
      setEncryptPassword('');
    } catch (error) {
      console.error('加密失败:', error);
      message.error('文件加密失败，请重试');
    } finally {
      setEncryptLoading(false);
    }
  };

  // AES 解密文件
  const handleDecrypt = async () => {
    if (!decryptFile) {
      message.warning('请先上传加密文件');
      return;
    }
    if (!decryptPassword) {
      message.warning('请输入密码');
      return;
    }
    if (!decryptFile.name.endsWith('.olock')) {
      message.warning('请上传 .olock 格式的加密文件');
      return;
    }

    setDecryptLoading(true);
    try {
      // 读取加密文件内容
      const text = await decryptFile.text();
      
      // 解析 JSON 文件头
      let fileStructure;
      let encryptedData;
      try {
        fileStructure = JSON.parse(text);
        encryptedData = fileStructure.data;
        
        // 验证文件头
        if (fileStructure.oraen_magic !== 'CORKI_TSE') {
          message.error('文件格式错误或文件已损坏');
          setDecryptLoading(false);
          return;
        }
      } catch (e) {
        message.error('文件格式错误，请确认这是正确的加密文件');
        setDecryptLoading(false);
        return;
      }
      
      // 使用 AES 解密
      const decrypted = CryptoJS.AES.decrypt(encryptedData, decryptPassword);
      
      // 解析解密器输出的 UTF-8 字符串
      let headerAndDataJson: string;
      try {
        headerAndDataJson = CryptoJS.enc.Utf8.stringify(decrypted);
      } catch (e) {
        message.error('密码错误，无法解密文件');
        setDecryptLoading(false);
        return;
      }
      
      // 检查解密不成功（乱码）
      if (!headerAndDataJson || headerAndDataJson.length === 0) {
        message.error('密码错误，无法解密文件');
        setDecryptLoading(false);
        return;
      }
      
      // 解析校验数据
      let headerAndData;
      try {
        headerAndData = JSON.parse(headerAndDataJson);
      } catch (e) {
        message.error('密码错误，无法解密文件');
        setDecryptLoading(false);
        return;
      }
      
      // 检查校验字符串是否存在（校验密码是否正确）
      if (!headerAndData.validator || !headerAndData.validator.startsWith('ORAEN_VALID_')) {
        message.error('密码错误，无法解密文件');
        setDecryptLoading(false);
        return;
      }
      
      // 从 Base64 恢复原文件数据（验证字符串和大小信息已经执行完，仅需还原原始文件）
      const originalWordArray = CryptoJS.enc.Base64.parse(headerAndData.data);
      const arrayBuffer = new ArrayBuffer(originalWordArray.words.length * 4);
      const uint8Array = new Uint8Array(arrayBuffer);
      
      for (let i = 0; i < originalWordArray.words.length; i++) {
        const word = originalWordArray.words[i];
        uint8Array[i * 4] = (word >> 24) & 0xff;
        uint8Array[i * 4 + 1] = (word >> 16) & 0xff;
        uint8Array[i * 4 + 2] = (word >> 8) & 0xff;
        uint8Array[i * 4 + 3] = word & 0xff;
      }
      
      // 创建解密后的文件
      const blob = new Blob([uint8Array], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      
      // 下载文件（去掉 .olock 后缀）
      const originalName = decryptFile.name.replace('.olock', '');
      const link = document.createElement('a');
      link.href = url;
      link.download = originalName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      message.success('文件解密成功！');
      setDecryptFile(null);
      setDecryptPassword('');
    } catch (error) {
      console.error('解密失败:', error);
      message.error('文件解密失败，请检查密码是否正确');
    } finally {
      setDecryptLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px', minHeight: '100vh', backgroundColor: '#f0f2f5' }}>
      <Card bordered={false}>
        <Title level={3} style={{ marginBottom: 24 }}>
          <LockOutlined /> 文件加密工具
        </Title>

        <Tabs defaultActiveKey="encrypt" size="large">
          {/* 加密标签页 */}
          <TabPane tab={<span><LockOutlined />文件加密</span>} key="encrypt">
            <Row gutter={[24, 24]}>
              <Col span={24} md={12}>
                <Card title="上传文件" bordered={false} style={{ height: '100%' }}>
                  <Space direction="vertical" style={{ width: '100%' }} size="large">
                    <Upload
                      maxCount={1}
                      beforeUpload={(file) => {
                        setEncryptFile(file);
                        return false;
                      }}
                      onRemove={() => setEncryptFile(null)}
                      fileList={encryptFile ? [{
                        uid: '-1',
                        name: encryptFile.name,
                        status: 'done',
                      }] as UploadFile[] : []}
                    >
                      <Button icon={<UploadOutlined />} block size="large">
                        选择文件
                      </Button>
                    </Upload>

                    <Input.Password
                      size="large"
                      placeholder="请输入加密密码"
                      value={encryptPassword}
                      onChange={(e) => setEncryptPassword(e.target.value)}
                      prefix={<LockOutlined />}
                    />

                    <Button
                      type="primary"
                      size="large"
                      block
                      icon={<LockOutlined />}
                      loading={encryptLoading}
                      onClick={handleEncrypt}
                      disabled={!encryptFile || !encryptPassword}
                    >
                      加密并下载
                    </Button>
                  </Space>
                </Card>
              </Col>

              <Col span={24} md={12}>
                <Card title="使用说明" bordered={false} style={{ height: '100%' }}>
                  <Space direction="vertical" size="small">
                    <Text>• 选择需要加密的文件</Text>
                    <Text>• 输入一个强密码（建议使用字母+数字+符号）</Text>
                    <Text>• 点击"加密并下载"按钮</Text>
                    <Text>• 加密后的文件将自动下载，文件名后缀为 .olock</Text>
                    <Text type="warning">• 请务必记住密码，密码丢失将无法解密！</Text>
                    <Text type="secondary" style={{ fontSize: 12, marginTop: 16 }}>
                      有问题可以在概括页留言
                    </Text>
                  </Space>
                </Card>
              </Col>
            </Row>
          </TabPane>

          {/* 解密标签页 */}
          <TabPane tab={<span><UnlockOutlined />文件解密</span>} key="decrypt">
            <Row gutter={[24, 24]}>
              <Col span={24} md={12}>
                <Card title="上传加密文件" bordered={false} style={{ height: '100%' }}>
                  <Space direction="vertical" style={{ width: '100%' }} size="large">
                    <Upload
                      maxCount={1}
                      accept=".olock"
                      beforeUpload={(file) => {
                        setDecryptFile(file);
                        return false;
                      }}
                      onRemove={() => setDecryptFile(null)}
                      fileList={decryptFile ? [{
                        uid: '-1',
                        name: decryptFile.name,
                        status: 'done',
                      }] as UploadFile[] : []}
                    >
                      <Button icon={<UploadOutlined />} block size="large">
                        选择 .olock 文件
                      </Button>
                    </Upload>

                    <Input.Password
                      size="large"
                      placeholder="请输入解密密码"
                      value={decryptPassword}
                      onChange={(e) => setDecryptPassword(e.target.value)}
                      prefix={<UnlockOutlined />}
                    />

                    <Button
                      type="primary"
                      size="large"
                      block
                      icon={<UnlockOutlined />}
                      loading={decryptLoading}
                      onClick={handleDecrypt}
                      disabled={!decryptFile || !decryptPassword}
                      style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                    >
                      解密并下载
                    </Button>
                  </Space>
                </Card>
              </Col>

              <Col span={24} md={12}>
                <Card title="使用说明" bordered={false} style={{ height: '100%' }}>
                  <Space direction="vertical" size="small">
                    <Text>• 选择加密后的 .olock 文件</Text>
                    <Text>• 输入加密时使用的密码</Text>
                    <Text>• 点击"解密并下载"按钮</Text>
                    <Text>• 解密后的原始文件将自动下载</Text>
                    <Text type="warning">• 密码错误将无法解密，请确认密码正确</Text>
                    <Text type="secondary" style={{ fontSize: 12, marginTop: 16 }}>
                      支持解密所有通过本工具加密的文件
                    </Text>
                  </Space>
                </Card>
              </Col>
            </Row>
          </TabPane>
        </Tabs>
      </Card>

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

export default FileEncryption;
