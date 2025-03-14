import { Layout } from "antd";
import logo from "@/assets/images/xn.png";
import { useStyle } from "./style"
interface LayoutHeaderProps {
  children: JSX.Element | null
}

const { Header } = Layout;


const LayoutHeader = ({ children }: LayoutHeaderProps) => {
  const { styles } = useStyle()
  return (
    <Header className={styles.header}>
      <div className="logo">
        <img src={logo} alt="logo"></img>
        <span>牙膏盒 | oraen.com</span>
      </div>
    </Header>
  );
};
export default LayoutHeader;
