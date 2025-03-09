import { useEffect, useState } from "react";
import { Button, Row, Col } from "antd";
import TypeModal, { Info } from "@/components/modal/type";
import MyTable from "@/components/table";
import "./index.less";
import { MenuList } from "@/types";

function formatMenuKey(list: MenuList) {
  return list.map((item) => {
    item.key = item.menu_id;
    if (item.children) {
      item.children = formatMenuKey(item.children);
    }
    return item;
  });
}

function useTypes() {
  const [showModal, setShow] = useState(false);
  const [tableCol, setCol] = useState([]);
  const [choose, setChoose] = useState<Info>(null);
  const [menuList, setMenuList] = useState<MenuList>([]);

  useEffect(() => {
    getTypeData();
    // eslint-disable-next-line
  }, []);
  const modalControl = (info: Info, open: boolean) => {
    setChoose(info);
    setShow(open);
  };
  const renderTitle = () => (
    <Row justify="space-between" gutter={80}>
      <Col style={{ lineHeight: "32px" }}>用户信息列表</Col>
      <Col>
        <Button type="primary" onClick={() => modalControl(null, true)}>
          添加管理权限
        </Button>
      </Col>
    </Row>
  );
  const getTypeData = () => {
    const res = {
      status: 0,
      menu: [],
    };
    if (res.status === 0) {
      setMenuList(formatMenuKey(res.menu));
    }
  };
  return {
    renderTitle,
    showModal,
    choose,
    menuList,
    modalControl,
    getTypeData,
  };
}

export default function Types() {
  const {
    renderTitle,
    showModal,
    choose,
    modalControl,
    menuList,
    getTypeData,
  } = useTypes();
  return (
    <div className="type-container">
      <MyTable
        rowKey="type_id"
        title={renderTitle}
        columns={[
          { title: "权限id", dataIndex: "type_id", key: "type_id" },
          { title: "权限简称", dataIndex: "name", key: "name" },
          { title: "显示菜单列表id", dataIndex: "menu_id", key: "menu_id" },
          {
            dataIndex: "active",
            key: "active",
            title: "操作",
            align: "center",
            render: (text: any, record: any) => (
              <Button type="link" onClick={() => modalControl(record, true)}>
                编辑
              </Button>
            ),
          },
        ]}
        dataSource={[
          {
            type_id: 1,
            name: "超级管理员",
            menu_id: "2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,1",
          },
          {
            type_id: 2,
            name: "用户",
            menu_id: "1,9,10,11,2,7,6,17,18,16,3,4,5,8",
          },
          { type_id: 3, name: "游客", menu_id: "9,1,10,11,2,7,6,17,18,12" },
          { type_id: 4, name: "低权游客", menu_id: "9,10" },
        ]}
      />
      <TypeModal
        isShow={showModal}
        info={choose}
        menuList={menuList}
        onCancel={modalControl}
        onOk={getTypeData}
      />
    </div>
  );
}

Types.route = { [MENU_PATH]: "/power/type" };
