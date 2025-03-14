import { Layout } from "antd";
const { Footer } = Layout;

export default function BottomFooter() {
  return (
    <Footer className="footer">
      <p>
        版权归个人所有
      </p>
      <p>
        <a
          href="https://beian.miit.gov.cn/#/Integrated/index"
          target="_blank"
          rel="noreferrer"
        >
          备案/许可证编号：粤ICP备19133064号
        </a>
      </p>
      <p>oraen.com（牙膏盒） ©2020 Created by Corki Tse</p>
    </Footer>
  );
}
