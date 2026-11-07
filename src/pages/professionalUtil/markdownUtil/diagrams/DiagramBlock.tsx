import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Image, Spin, Tabs, message } from "antd";
import { CopyOutlined, DownloadOutlined } from "@ant-design/icons";
import { copyText } from "../markdown";
import { downloadBlob } from "../../../fileUtil/shared/files";
import { cachedDiagram, renderDiagram, svgDataUrl } from "./render";
import { DiagramKind, diagramNames } from "./types";
import "./index.less";

export default function DiagramBlock({
  kind,
  source,
}: {
  kind: DiagramKind;
  source: string;
}) {
  const host = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState("image");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({
    kind,
    source: "",
    svg: "",
    error: "",
  });
  const svg =
    (result.kind === kind && result.source === source ? result.svg : "") ||
    cachedDiagram(kind, source) ||
    "";
  const error =
    result.kind === kind && result.source === source ? result.error : "";
  const imageUrl = useMemo(() => (svg ? svgDataUrl(svg) : ""), [svg]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || tab !== "image") return;
    const controller = new AbortController();
    setResult({ kind, source, svg: "", error: "" });
    const timer = setTimeout(() => {
      renderDiagram(kind, source, {
        signal: controller.signal,
      })
        .then((svg) => {
          if (!controller.signal.aborted)
            setResult({ kind, source, svg, error: "" });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setResult({
              kind,
              source,
              svg: "",
              error: error instanceof Error ? error.message : "图表绘制失败",
            });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [kind, source, visible, tab, attempt]);

  const picture = svg ? (
    <div className="md-diagram-picture">
      <Image
        src={imageUrl}
        alt={`${diagramNames[kind]} 图表`}
        preview={{ mask: "放大查看", rootClassName: "md-diagram-lightbox" }}
      />
    </div>
  ) : error ? (
    <div className="md-diagram-notice" role="alert">
      <strong>图表暂时无法绘制</strong>
      <p>{error.slice(0, 800)}</p>
      <Button onClick={() => setTab("source")}>查看源码</Button>
      <Button type="text" onClick={() => setAttempt((value) => value + 1)}>
        重试
      </Button>
    </div>
  ) : (
    <div className="md-diagram-loading" role="status">
      <Spin size="small" /> 正在绘制图表…
    </div>
  );

  return (
    <section
      ref={host}
      className="md-diagram-block"
      data-diagram-kind={kind}
      aria-label={`${diagramNames[kind]} 图表块`}
    >
      <Tabs
        size="small"
        activeKey={tab}
        onChange={setTab}
        tabBarExtraContent={
          <div className="md-diagram-actions">
            <span>{diagramNames[kind]}</span>
            <Button
              size="small"
              type="text"
              icon={<CopyOutlined />}
              aria-label="复制图表源码"
              title="复制图表源码"
              onClick={async () => {
                try {
                  await copyText(source);
                  message.success("源码已复制");
                } catch {
                  message.error("复制失败");
                }
              }}
            />
            <Button
              size="small"
              type="text"
              icon={<DownloadOutlined />}
              aria-label="下载图表 SVG"
              title="下载图表 SVG"
              disabled={!svg}
              onClick={() =>
                downloadBlob(
                  new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
                  `${kind}-diagram.svg`,
                )
              }
            />
          </div>
        }
        items={[
          { key: "image", label: "图片", children: picture },
          {
            key: "source",
            label: "源码",
            children: (
              <pre className="md-diagram-source">
                <code>{source}</code>
              </pre>
            ),
          },
        ]}
      />
    </section>
  );
}
