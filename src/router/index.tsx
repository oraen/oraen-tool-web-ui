import { useEffect, useMemo, useState } from "react";
import { Routes, Route } from "react-router-dom";
import routerList, { RouterInfo } from "./list";
import Intercept from "./intercept";
import { formatMenu, reduceMenuList } from "@/utils";
import { MenuList } from "@/types"
import { useDispatchMenu } from "@/store/hooks";
import { routerConfig } from "./config";


const Router = () => {
  const { stateSetMenuList } = useDispatchMenu()
  // 使用 useMemo 提前计算路由合并结果，避免等待 useEffect
  const mergedData = useMemo(() => {
    if (!routerConfig || !routerConfig.length) {
      return null;
    }
    const formatList = formatMenu(routerConfig as MenuList)
    const userMenus = reduceMenuList(formatList);
    // 把请求的数据 和 本地pages页面暴露出的路由列表合并
    const routers = routerList.map((router) => {
      let find = userMenus.find((i) => (i[MENU_PARENTPATH] || "") + i[MENU_PATH] === router[MENU_PATH]);
      if (find) {
        return { ...find, ...router }; // 本地 优先 接口结果
      } else {
        return { ...router, [MENU_KEY]: router[MENU_PATH] };
      }
    });
    return { formatList, userMenus, routers };
  }, []); // 只在初始化时计算一次

  const [mergeRouterList, setMergeList] = useState<RouterInfo[]>(mergedData?.routers || []);// 本地 和 接口返回的路由列表 合并的结果
  const [ajaxUserMenuList, setAjaxUserMenuList] = useState<MenuList>(mergedData?.userMenus || []); // 本地配置的路由列表

  useEffect(() => {
    if (mergedData && stateSetMenuList && typeof stateSetMenuList === "function") {
      stateSetMenuList(mergedData.formatList);
      setAjaxUserMenuList(mergedData.userMenus);
      setMergeList(mergedData.routers);
    }
  }, [mergedData, stateSetMenuList]);


  const routerBody = useMemo(() => {
    // 监听 本地路由列表   同时存在长度大于1时 渲染路由组件
    if (mergeRouterList.length) {
      const data = mergeRouterList.map((item) => {
        let { [MENU_KEY]: key, [MENU_PATH]: path } = item;
        return (
          <Route
            key={key}
            path={path.replace("/", "")}
            element={<Intercept
              {...item}
              menuList={ajaxUserMenuList}
              pageKey={key}
            />}
          />
        );
      });
      return <Routes>{data}</Routes>
    }
    return null
  }, [ajaxUserMenuList, mergeRouterList])

  return routerBody;
};

export default Router;
