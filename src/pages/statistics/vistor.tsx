import { useEffect, useState } from "react";
import { Row, Col, Card, Progress } from "antd";
import { Line as LineEchart } from "@/components/echarts";
import MyPagination, { PageInfo } from "@/components/pagination";
import MyTable from "@/components/table";
import "./index.less";

const getOpt = () => ({
  xAxis: {
    type: "category",
    boundaryGap: false,
    show: false,
    data: [],
  },
  yAxis: {
    show: false,
  },
  tooltip: {},
  grid: {
    height: "100%",
    left: "1%",
    right: "1%",
    bottom: "0%",
    top: "0%",
  },
  series: [
    {
      name: "visitor",
      type: "line",
      itemStyle: {
        color: "#975fe4",
      },
      lineStyle: {
        type: "solid",
      },
      data: [],
      smooth: true,
      symbol: "none", //取消折点圆圈
      areaStyle: {
        color: "#975fe4",
      },
    },
  ],
});
const strokeColor = {
  "0%": "#108ee9",
  "100%": "#87d068",
};
function getPercentage(up: number, down: number) {
  if (!down) return 0;
  return Number(((up / down) * 100).toFixed(2));
}

const echartStyle = {
  height: 50,
};
const getTableTitle = () => {
  return (
    <Row justify="space-between" gutter={80}>
      <Col style={{ lineHeight: "32px" }}>访问统计</Col>
    </Row>
  );
};
function useVistor() {
  const [tableData, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [visitorOpt, setVisitor] = useState(getOpt());
  const [dealOpt, setDeal] = useState(getOpt());
  const [sumVisitor, setSumV] = useState(0);
  const [sumDeal, setSumD] = useState(0);
  const [pageInfo, setPage] = useState<PageInfo>({ page: 1 });
  useEffect(() => {
    const { status, data } = {
      status: 1,
      data: { today: { ips: 0, deal: 0 }, ips: [], deal: [] },
    };
    if (status === 0 && data) {
      const vOpt = { ...visitorOpt };
      const dOpt = { ...dealOpt };
      (vOpt.xAxis.data as string[]) = [];
      (vOpt.series[0].data as number[]) = [];
      (dOpt.xAxis.data as string[]) = [];
      (dOpt.series[0].data as number[]) = [];
      setDeal(dOpt);
      setVisitor(vOpt);
      setSumV(data.today.ips);
      setSumD(data.today.deal);
    }
    // eslint-disable-next-line
  }, []);

  const getList = (data: any) => {
    if (data) {
      let list: any = [];
      setData(list);
      setTotal(0);
    }
  };
  return {
    visitorOpt,
    dealOpt,
    sumVisitor,
    sumDeal,
    tableData,
    getList,
    total,
    pageInfo,
  };
}

export default function Vistor() {
  const {
    visitorOpt,
    dealOpt,
    sumVisitor,
    sumDeal,
    tableData,
    getList,
    total,
    pageInfo,
  } = useVistor();
  return (
    <div className="vistor-container">
      <Row gutter={[20, 20]}>
        <Col span={6}>
          <Card className="cards">
            <p className="title">访问量</p>
            <p className="num">
              {visitorOpt.series[0].data.reduce((a, c) => a + c, 0)}
            </p>
            <div className="echart">
              <LineEchart option={visitorOpt} style={echartStyle} />
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="cards">
            <p className="title">处理次数</p>
            <p className="num">
              {dealOpt.series[0].data.reduce((a, c) => a + c, 0)}
            </p>
            <div className="echart">
              <LineEchart option={dealOpt} style={echartStyle} />
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="cards">
            <p className="title">今日访问</p>
            <p className="num">{sumVisitor}</p>
            <div>
              <p>占全部：</p>
              <Progress
                strokeColor={strokeColor}
                percent={getPercentage(
                  sumVisitor,
                  visitorOpt.series[0].data.reduce((a, c) => a + c, 0)
                )}
              />
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card className="cards">
            <p className="title">今日处理</p>
            <p className="num">{sumDeal}</p>
            <div>
              <p>占全部：</p>
              <Progress
                strokeColor={strokeColor}
                percent={getPercentage(
                  sumDeal,
                  dealOpt.series[0].data.reduce((a, c) => a + c, 0)
                )}
              />
            </div>
          </Card>
        </Col>
      </Row>
      <MyTable
        title={getTableTitle}
        dataSource={tableData}
        columns={[
          { title: "消息id", dataIndex: "m_id", key: "m_id" },
          { title: "消息名称", dataIndex: "name", key: "name" },
          { title: "消息描述词", dataIndex: "description", key: "description" },
          { title: "创建人", dataIndex: "creator", key: "creator" },
          { title: "创建时间", dataIndex: "add_time", key: "add_time" },
        ]}
        rowKey="s_id"
        pagination={false}
      />
      <MyPagination
        page={pageInfo.page}
        change={getList}
        immediately={getList}
        total={total}
      />
    </div>
  );
}
Vistor.route = {
  [MENU_PATH]: "/statistics/visitor",
};
