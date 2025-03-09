import { useState } from "react";
import { Button, Row, Col } from "antd";
import MyPagination, { PageInfo } from "@/components/pagination";
import UserModal, { UserID } from "@/components/modal/user";
import "./index.less";
import MyTable from "@/components/table";

export default function User() {
  const [tableData, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [showModal, setShow] = useState(false);
  const [chooseId, setId] = useState<UserID>(null);
  const [pageData, setPage] = useState<PageInfo>({ page: 1 });
  // 显示弹窗
  const showInfoModal = (id: UserID, type: boolean) => {
    if (id) {
      setId(id);
    } else {
      setId(null);
    }
    setShow(type);
  };

  const renderTitle = () => (
    <Row justify="space-between" gutter={80}>
      <Col style={{ lineHeight: "32px" }}>用户信息列表</Col>
      <Col>
        <Button type="primary" onClick={() => showInfoModal(null, true)}>
          添加用户
        </Button>
      </Col>
    </Row>
  );
  const getUserData = (data: any) => {
    setPage(data);
    const { _data, status, total } = {
      _data: {
        list: [],
        mapKey: [
          {
            dataIndex: "active",
            key: "active",
            title: "操作",
            align: "center",
            render: (text: string, record: any) => (
              <Button
                type="link"
                onClick={() => showInfoModal(record.user_id, true)}
              >
                编辑
              </Button>
            ),
          },
        ],
      },
      status: 0,
      total: 0,
    };
    if (status === 0 && _data) {
      const { mapKey, list } = _data;
      setTotal(total);
      setData(list);
    }
  };
  const updateUserData = () => {
    getUserData(pageData);
  };

  return (
    <div className="user-container">
      <MyTable
        title={renderTitle}
        dataSource={tableData}
        rowKey="user_id"
        columns={[
          {
            dataIndex: "active",
            key: "active",
            title: "操作",
            align: "center",
            render: (text: string, record: any) => (
              <Button
                type="link"
                onClick={() => showInfoModal(record.user_id, true)}
              >
                编辑
              </Button>
            ),
          },
        ]}
        pagination={false}
      />
      <MyPagination
        page={pageData.page}
        total={total}
        immediately={getUserData}
        change={getUserData}
      />
      <UserModal
        isShow={showModal}
        user_id={chooseId}
        onCancel={showInfoModal}
        onOk={updateUserData}
      />
    </div>
  );
}

User.route = { [MENU_PATH]: "/power/user" };
