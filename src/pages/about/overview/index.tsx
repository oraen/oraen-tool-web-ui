import React from 'react';
import { Layout, Menu, Avatar, Typography, Row, Col, Card, Divider, Space } from 'antd';
import { MailOutlined, QrcodeOutlined, LinkOutlined, GlobalOutlined } from '@ant-design/icons';
import corkiAvatar from '../../../resource/wu537.jpg';
import bearAvatar from '../../../resource/bear2.jpg';
import qrcodeImage from '../../../resource/ewm.jpg';

const { Header, Content, Footer } = Layout;
const { Title, Paragraph } = Typography;

const developers = [
  {
    name: 'Corki Tse',
    motto: '收徒',
    avatar: corkiAvatar,
  },
  {
    name: '熊二',
    motto: '保持好奇，持续学习',
    avatar: bearAvatar,
  },
  // 添加更多开发者信息
];

const App: React.FC = () => {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ backgroundColor: '#001529' }}>
        <div style={{ color: '#fff', fontSize: '24px' }}>oraen.com（牙膏盒）</div>
      </Header>
      <Content style={{ padding: '20px 50px' }}>
        <Row gutter={[16, 16]}>
          {/* 开发者列表 */}
          <Col span={12}>
            <Card title="开发者列表" bordered={false}>
              <Space direction="vertical" size="large">
                {developers.map((dev, index) => (
                  <Card.Meta
                    key={index}
                    avatar={<Avatar src={dev.avatar} />}
                    title={dev.name}
                    description={dev.motto}
                  />
                ))}
              </Space>
            </Card>
          </Col>

          {/* 联系方式 */}
          <Col span={12}>
            <Card title="联系方式" bordered={false}>
              <Space direction="vertical" size="middle">
                <div>
                  <MailOutlined /> 邮箱: oraen1998@gmail.com
                </div>
                <div>
                  <QrcodeOutlined /> 微信公众号: 牙膏盒<div
                  style={{width: '100px', height: '100px', backgroundColor: '#f0f0f0'}}>
                  <img
                    src={qrcodeImage} // 使用二维码图片
                    alt="微信公众号二维码"
                    style={{width: '100px', height: '100px'}}
                  />
                </div>
                </div>
                <div>
                  <LinkOutlined/> CSDN地址:
                  <a
                    href="https://blog.csdn.net/pass_JMC?type=blog"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  我的CSDN主页
                </a>
                </div>
                <div>
                  <GlobalOutlined/> 个人网站: <a href="https://oraen.com" target="_blank"
                                                 rel="noopener noreferrer">oraen.com</a>
                </div>
              </Space>
            </Card>
          </Col>
        </Row>

        <Divider/>

        <Row gutter={[16, 16]}>
          {/* 网站初衷 */}
          <Col span={12}>
            <Card title="网站初衷" bordered={false}>
              <Paragraph>
                网站的设计初衷是为了方便每一个开发者，让开发者们不需要登录，不需要关注，也不需要看广告，就能用上好用快捷的工具，提升工作效率。
              </Paragraph>
            </Card>
          </Col>

          {/* 未来计划 */}
          <Col span={12}>
            <Card title="未来计划" bordered={false}>
              <Paragraph>
                我们会继续完善和扩展工具，欢迎大家报告BUG和提意见和建议，欢迎新同学一起加入我们的开发。
              </Paragraph>
            </Card>
          </Col>
        </Row>
      </Content>
      <Footer style={{ textAlign: 'center' }}>

      </Footer>
    </Layout>
  );
};

export default App;
