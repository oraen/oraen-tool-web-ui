import { Layout } from "antd";
import logo from "@/assets/images/xn.png";
import { useStyle } from "./style"
import {useState} from "react";
interface LayoutHeaderProps {
  children: JSX.Element | null
}

const { Header } = Layout;


const LayoutHeader = ({ children }: LayoutHeaderProps) => {
  const { styles } = useStyle()
  const [isHovered, setIsHovered] = useState(false);
  return (
    <Header className={styles.header}>
      <div
        className="logo"
        onClick={() => window.open("https://oraen.com", "_blank")}
        style={{
          cursor: "pointer",
          color: isHovered ? "#FFC107" : "inherit", // 悬停时琥珀黄
          transition: "color 0.3s ease",
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <img src={logo} alt="logo"/>
        <span>牙膏盒 | oraen.com</span>
      </div>
    </Header>
  );
};
export default LayoutHeader;
