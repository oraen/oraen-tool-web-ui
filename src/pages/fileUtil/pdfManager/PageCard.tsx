import React, { useEffect, useRef, useState } from "react";
import { Button, Checkbox, Space, Spin, Tooltip } from "antd";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  DeleteOutlined,
  HolderOutlined,
  RotateRightOutlined,
} from "@ant-design/icons";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { normalizeRotation, PdfPage, PdfSource } from "./pdf";
interface Props {
  page: PdfPage;
  source: PdfSource;
  order: number;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onRotate: () => void;
  onDelete: () => void;
  onMove: (direction: number) => void;
  last: boolean;
}
export default function PageCard({
  page,
  source,
  order,
  selected,
  disabled,
  onSelect,
  onRotate,
  onDelete,
  onMove,
  last,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id, disabled });
  const card = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    if (card.current) observer.observe(card.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let stopped = false;
    let task:
      | ReturnType<Awaited<ReturnType<typeof source.preview.getPage>>["render"]>
      | undefined;
    setRendering(true);
    setError("");
    source.preview
      .getPage(page.index + 1)
      .then(async (documentPage) => {
        if (stopped || !canvas.current) return;
        const rotation = normalizeRotation(documentPage.rotate + page.rotation);
        const natural = documentPage.getViewport({ scale: 1, rotation });
        const viewport = documentPage.getViewport({
          scale: Math.min(1.5, 280 / Math.max(natural.width, natural.height)),
          rotation,
        });
        const target = canvas.current;
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        task = documentPage.render({
          canvasContext: target.getContext("2d")!,
          viewport,
          background: "#ffffff",
        });
        await task.promise;
      })
      .catch((cause) => {
        if (!stopped)
          setError(
            cause instanceof Error
              ? "该页预览失败，仍可尝试导出原页面"
              : "预览失败",
          );
      })
      .finally(() => {
        if (!stopped) setRendering(false);
      });
    return () => {
      stopped = true;
      task?.cancel();
    };
  }, [visible, source, page.index, page.rotation]);
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 2 : undefined,
        opacity: isDragging ? 0.6 : 1,
      }}
      className={`tool-file-card pdf-page-card ${selected ? "is-selected" : ""}`}
      data-page-order={order}
    >
      <div ref={card} className="pdf-page-preview">
        <canvas ref={canvas} aria-label={`第 ${order} 页预览`} />
        {rendering && (
          <div className="pdf-preview-loading">
            <Spin size="small" />
          </div>
        )}
        {error && <span className="tool-error">{error}</span>}
      </div>
      <div className="tool-file-info">
        <Checkbox disabled={disabled} checked={selected} onChange={onSelect}>
          第 {order} 页
        </Checkbox>
        <small title={source.name}>
          {source.name} · 原第 {page.index + 1} 页
          {page.rotation ? ` · 旋转 ${page.rotation}°` : ""}
        </small>
        <Space size={0} wrap>
          <Tooltip title="拖动排序">
            <Button
              size="small"
              type="text"
              aria-label={`拖动第 ${order} 页`}
              disabled={disabled}
              {...attributes}
              {...listeners}
              icon={<HolderOutlined />}
            />
          </Tooltip>
          <Button
            size="small"
            type="text"
            aria-label={`前移第 ${order} 页`}
            disabled={disabled || order === 1}
            icon={<ArrowLeftOutlined />}
            onClick={() => onMove(-1)}
          />
          <Button
            size="small"
            type="text"
            aria-label={`后移第 ${order} 页`}
            disabled={disabled || last}
            icon={<ArrowRightOutlined />}
            onClick={() => onMove(1)}
          />
          <Button
            size="small"
            type="text"
            aria-label={`旋转第 ${order} 页`}
            disabled={disabled}
            icon={<RotateRightOutlined />}
            onClick={onRotate}
          />
          <Button
            size="small"
            type="text"
            danger
            aria-label={`删除第 ${order} 页`}
            disabled={disabled}
            icon={<DeleteOutlined />}
            onClick={onDelete}
          />
        </Space>
      </div>
    </div>
  );
}
