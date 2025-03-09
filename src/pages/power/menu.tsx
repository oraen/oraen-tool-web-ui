import { useState } from "react";
import { Row, Button, message, Popconfirm } from "antd";
import MenuModal from "@/components/modal/menu";
import MyTable from "@/components/table";
import { MenuList } from "@/types";
import "./index.less";

export type ModalType = "add" | "addChild" | "edit";
export type SelectInfo = {
  [MENU_KEY]?: string;
  isParent?: Boolean;
};

function useMenu() {
  const [menus, setMenu] = useState<MenuList>([]);
  const [tabCol, setCol] = useState([]);
  const [selectInfo, setSelectInfo] = useState<SelectInfo>({});
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<ModalType>("add");

  const menuAction = {
    title: "操作",
    dataIndex: "action",
    key: "action",
    align: "center",
    render: (text: any, record: any) => {
      return (
        <Row>
          <Button type="link" onClick={() => openModal("edit", record)}>
            编辑
          </Button>
          <Button type="link" onClick={() => openModal("addChild", record)}>
            添加子菜单
          </Button>
          <Popconfirm
            onConfirm={() => deleteMenu(record)}
            okText="确认"
            title="删除选中菜单会一同删除其下所有子菜单，确认删除？"
            cancelText="取消"
          >
            <Button type="link" danger>
              删除
            </Button>
          </Popconfirm>
        </Row>
      );
    },
  };

  const openModal = (
    type: ModalType,
    { [MENU_KEY]: key, isParent }: SelectInfo
  ) => {
    setSelectInfo({ [MENU_KEY]: key, isParent: !Boolean(isParent) });
    setModalType(type);
    setShowModal(true);
  };

  const deleteMenu = (info: any) => {
    const { msg, status } = { msg: "操作成功", status: 0 };
    if (status === 0) {
      message.success(msg);
    }
  };
  const addMenu = () => {
    openModal("add", {});
  };
  return {
    selectInfo,
    menus,
    showModal,
    modalType,
    tabCol,
    setShowModal,
    addMenu,
  };
}

export default function Menu() {
  const {
    selectInfo,
    menus,
    showModal,
    modalType,
    tabCol,
    setShowModal,
    addMenu,
  } = useMenu();
  return (
    <div className="powermenu-container">
      <Button type="primary" onClick={addMenu}>
        新增菜单
      </Button>
      <MyTable
        dataSource={menus}
        rowKey={`${MENU_KEY}`}
        columns={tabCol}
        saveKey="MENUTABLE"
      />
      <MenuModal
        menus={menus}
        isShow={showModal}
        info={selectInfo}
        modalType={modalType}
        setShow={setShowModal}
        updateMenu={() => {}}
      />
    </div>
  );
}

Menu.route = {
  [MENU_PATH]: "/power/menu",
};
