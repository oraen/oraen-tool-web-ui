import { useEffect, useState } from "react";
import { Modal, Select, message, FormInstance } from "antd";
import MyForm, { FormItemData } from "@/components/form";

export type UserID = null | number;
interface UserProps {
  user_id: UserID;
  isShow: boolean;
  onCancel: (id: UserID, s: boolean) => void;
  onOk: () => void;
}
const { Option } = Select;

const paswdRule = [{ required: true, message: "请填写登录密码" }];
const initFormItems: FormItemData[] = [
  {
    itemType: "input",
    itemProps: {
      name: "username",
      rules: [{ required: true, message: "请填写用户名" }],
      label: "用户名",
    },
    childProps: {
      placeholder: "用户名",
    },
  },
  {
    itemType: "input",
    itemProps: {
      name: "account",
      rules: [{ required: true, message: "请填写登录账号" }],
      label: "登录账号",
    },
    childProps: {
      placeholder: "登录账号",
    },
  },
  {
    itemType: "input",
    itemProps: {
      name: "pswd",
      label: "登录密码",
    },
    childProps: {
      placeholder: "登录密码,若填写则表示修改",
      type: "password",
    },
  },
  {
    itemType: "select",
    itemProps: {
      rules: [{ required: true, message: "请选择菜单权限" }],
      name: "type_id",
      label: "菜单权限",
    },
    childProps: {
      placeholder: "菜单权限",
    },
  },
];

export default function UserModal({
  user_id,
  isShow,
  onCancel,
  onOk,
}: UserProps) {
  const [form, setForm] = useState<FormInstance | null>(null);
  const [formItems, setItems] = useState<FormItemData[]>([]);
  useEffect(() => {
    if (isShow) {
      const res = {
        status: 0,
        data: [
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
        ],
        mapKey: [
          { title: "权限id", dataIndex: "type_id", key: "type_id" },
          { title: "权限简称", dataIndex: "name", key: "name" },
          { title: "显示菜单列表id", dataIndex: "menu_id", key: "menu_id" },
        ],
        menu: [],
      };
      const { data, status } = res;
      if (status === 0) {
        let items = initFormItems.map((i) => ({ ...i }));
        items.forEach((i) => {
          if (i.itemProps.name === "type_id") {
            i.childProps = { ...i.childProps };
            i.childProps.children = data.map((power) => (
              <Option value={power.type_id} key={power.type_id}>
                {power.name}
              </Option>
            ));
          }
        });
        setItems(items);
      }
    }
  }, [isShow]);

  useEffect(() => {
    if (user_id && form) {
      form.setFieldsValue({});
      let items = initFormItems.map((i) => ({ ...i }));
      items.forEach((i) => {
        if (i.itemProps.name === "pswd") {
          i.itemProps.rules = undefined;
        }
      });
      setItems(items);
    } else if (!user_id) {
      // set formItem
      let items = initFormItems.map((i) => ({ ...i }));
      items.forEach((i) => {
        if (i.itemProps.name === "pswd") {
          i.itemProps.rules = paswdRule;
        }
      });
      setItems(items);
    }
  }, [user_id, form]);

  const submit = () => {
    form &&
      form.validateFields().then((values) => {
        let modify = Boolean(user_id);
        if (modify) {
          values.user_id = user_id;
        }
        message.success("成功");
        close();
        onOk();
      });
  };
  const close = () => {
    form && form.resetFields();
    onCancel(null, false);
  };
  return (
    <Modal
      maskClosable={false}
      title={user_id ? "修改信息" : "添加账户"}
      open={isShow}
      okText="确认"
      cancelText="取消"
      onCancel={close}
      onOk={submit}
    >
      <MyForm handleInstance={setForm} items={formItems} />
    </Modal>
  );
}
