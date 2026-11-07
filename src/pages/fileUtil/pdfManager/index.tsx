import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Input,
  Popconfirm,
  Progress,
  Select,
  Space,
  message,
} from "antd";
import {
  DeleteOutlined,
  DownloadOutlined,
  FilePdfOutlined,
  RotateRightOutlined,
  UndoOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import ToolPage from "../shared/ToolPage";
import {
  checkAbort,
  downloadBlob,
  errorLabel,
  isAbort,
  MB,
  safeName,
  stem,
} from "../shared/files";
import { generateZip } from "../shared/zip";
import {
  exportPages,
  loadPdf,
  normalizeRotation,
  parsePageRange,
  PdfPage,
  PdfSource,
} from "./pdf";
import PageCard from "./PageCard";
import "./index.less";
const PdfManager: React.FC = () => {
  const [pages, setPages] = useState<PdfPage[]>([]);
  const [selection, setSelection] = useState(new Set<string>());
  const [history, setHistory] = useState<PdfPage[][]>([]);
  const [range, setRange] = useState("");
  const [name, setName] = useState("整理后的文档");
  const [paper, setPaper] = useState<"original" | "a4">("a4");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const sources = useRef(new Map<string, PdfSource>());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  useEffect(
    () => () => {
      operation.current?.abort();
      sources.current.forEach((source) => {
        void source.preview.destroy();
      });
      sources.current.clear();
    },
    [],
  );
  const selected = pages.filter((page) => selection.has(page.id));
  function commit(next: PdfPage[]) {
    setHistory((previous) => [...previous.slice(-19), pages]);
    setPages(next);
    setSelection(
      (previous) =>
        new Set(
          [...previous].filter((id) => next.some((page) => page.id === id)),
        ),
    );
  }
  async function addFiles(files: File[]) {
    if (operation.current || !files.length) return;
    if (
      files.reduce(
        (sum, file) => sum + file.size,
        [...sources.current.values()].reduce(
          (sum, source) => sum + source.bytes.length,
          0,
        ),
      ) >
      150 * MB
    ) {
      message.warning("本次工作区文件总计不能超过 150 MB");
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setPhase("读取文档");
    setProgress(0);
    const added: PdfPage[] = [];
    const addedSources: PdfSource[] = [];
    try {
      for (const [index, file] of files.entries()) {
        checkAbort(controller.signal);
        try {
          const loaded = await loadPdf(file, paper, controller.signal);
          if (
            [
              ...sources.current.values(),
              ...addedSources,
              loaded.source,
            ].reduce((sum, source) => sum + source.bytes.length, 0) >
            150 * MB
          ) {
            await loaded.source.preview.destroy();
            throw new Error("转换后的工作区文档超过 150 MB，请分批处理");
          }
          if (pages.length + added.length + loaded.pages.length > 300) {
            await loaded.source.preview.destroy();
            throw new Error("工作区最多支持 300 页");
          }
          addedSources.push(loaded.source);
          added.push(...loaded.pages);
        } catch (error) {
          if (isAbort(error)) throw error;
          message.error(`${file.name}：${errorLabel(error)}`);
        }
        setProgress(Math.round(((index + 1) / files.length) * 100));
      }
      checkAbort(controller.signal);
      addedSources.forEach((source) => sources.current.set(source.id, source));
      if (added.length) {
        commit([...pages, ...added]);
        if (!pages.length) setName(stem(files[0].name));
      }
    } catch (error) {
      await Promise.all(addedSources.map((source) => source.preview.destroy()));
      if (!isAbort(error)) message.error(errorLabel(error));
    } finally {
      operation.current = null;
      setBusy(false);
      setPhase("");
    }
  }
  async function save(kind: "all" | "selected" | "split") {
    if (operation.current) return;
    const output =
      kind === "selected"
        ? selected
        : kind === "split" && selected.length
          ? selected
          : pages;
    if (!output.length) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setPhase(kind === "split" ? "逐页拆分" : "导出 PDF");
    setProgress(0);
    try {
      if (kind === "split") {
        const zip = new JSZip();
        const cache = new Map<string, PDFDocument>();
        for (const [index, page] of output.entries()) {
          checkAbort(controller.signal);
          zip.file(
            `第${String(pages.indexOf(page) + 1).padStart(3, "0")}页.pdf`,
            await exportPages(
              [page],
              sources.current,
              controller.signal,
              () => undefined,
              cache,
            ),
          );
          setProgress(Math.round(((index + 1) / output.length) * 90));
        }
        const blob = await generateZip(zip, controller.signal, (percent) =>
          setProgress(90 + Math.round(percent / 10)),
        );
        checkAbort(controller.signal);
        downloadBlob(
          blob,
          `${safeName(name).replace(/\.pdf$/i, "")}-逐页拆分.zip`,
        );
      } else {
        const blob = await exportPages(
          output,
          sources.current,
          controller.signal,
          setProgress,
        );
        checkAbort(controller.signal);
        downloadBlob(
          blob,
          `${safeName(name).replace(/\.pdf$/i, "")}${kind === "selected" ? "-提取" : ""}.pdf`,
        );
      }
    } catch (error) {
      if (!isAbort(error)) message.error(errorLabel(error));
    } finally {
      operation.current = null;
      setBusy(false);
      setPhase("");
    }
  }
  function clear() {
    sources.current.forEach((source) => {
      void source.preview.destroy();
    });
    sources.current.clear();
    setPages([]);
    setSelection(new Set());
    setHistory([]);
    setRange("");
  }
  return (
    <ToolPage
      title="PDF 页面管理"
      description="用缩略图整理页面顺序，提取、旋转、拆分，也可以把图片整理成 PDF。"
      icon={<FilePdfOutlined />}
    >
      <input
        ref={input}
        id="pdf-manager-input"
        hidden
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        onChange={(event) => {
          void addFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      <section
        className="tool-panel pdf-manager"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <div className="tool-toolbar">
          <Space wrap>
            <Button
              type="primary"
              icon={<UploadOutlined />}
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              添加 PDF / 图片
            </Button>
            <Select
              aria-label="图片转PDF纸张"
              value={paper}
              disabled={busy}
              onChange={setPaper}
              options={[
                { value: "a4", label: "图片导入：A4 纸张" },
                { value: "original", label: "图片导入：原始尺寸" },
              ]}
            />
            <Button
              icon={<UndoOutlined />}
              aria-label="撤销页面操作"
              disabled={busy || !history.length}
              onClick={() => {
                setPages(history[history.length - 1]);
                setHistory((previous) => previous.slice(0, -1));
                setSelection(new Set());
              }}
            >
              撤销
            </Button>
          </Space>
          <Space>
            <span>
              {pages.length} 页 · 已选 {selected.length} 页
            </span>
            <Popconfirm
              title="清空当前工作区？"
              description="原文件不会被修改。"
              onConfirm={clear}
              okText="清空"
              cancelText="取消"
            >
              <Button disabled={busy || !pages.length}>清空</Button>
            </Popconfirm>
          </Space>
        </div>
        {!!pages.length && (
          <>
            <div className="pdf-selection-bar">
              <Space wrap>
                <Button
                  aria-label={
                    selected.length === pages.length ? "取消全选" : "全选"
                  }
                  disabled={busy}
                  onClick={() =>
                    setSelection(
                      selected.length === pages.length
                        ? new Set()
                        : new Set(pages.map((page) => page.id)),
                    )
                  }
                >
                  {selected.length === pages.length ? "取消全选" : "全选"}
                </Button>
                <Input
                  aria-label="页码范围"
                  placeholder="例如 1-3, 5（按当前顺序）"
                  style={{ width: 230 }}
                  disabled={busy}
                  value={range}
                  onChange={(event) => setRange(event.target.value)}
                  onPressEnter={() => {
                    try {
                      setSelection(
                        new Set(
                          [...parsePageRange(range, pages.length)].map(
                            (index) => pages[index].id,
                          ),
                        ),
                      );
                    } catch (error) {
                      message.error(errorLabel(error));
                    }
                  }}
                />
                <Button
                  disabled={busy}
                  onClick={() => {
                    try {
                      setSelection(
                        new Set(
                          [...parsePageRange(range, pages.length)].map(
                            (index) => pages[index].id,
                          ),
                        ),
                      );
                    } catch (error) {
                      message.error(errorLabel(error));
                    }
                  }}
                >
                  按页码选择
                </Button>
                <Button
                  disabled={busy || !selected.length}
                  icon={<RotateRightOutlined />}
                  onClick={() =>
                    commit(
                      pages.map((page) =>
                        selection.has(page.id)
                          ? {
                              ...page,
                              rotation: normalizeRotation(page.rotation + 90),
                            }
                          : page,
                      ),
                    )
                  }
                >
                  旋转选中
                </Button>
                <Button
                  disabled={busy || !selected.length}
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    commit(pages.filter((page) => !selection.has(page.id)))
                  }
                >
                  删除选中
                </Button>
              </Space>
            </div>
            <div className="pdf-export-bar">
              <Input
                aria-label="PDF导出文件名"
                value={name}
                maxLength={100}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                style={{ maxWidth: 240 }}
                addonAfter=".pdf"
              />
              <Space wrap>
                <Button
                  aria-label="导出全部PDF"
                  icon={<DownloadOutlined />}
                  disabled={busy}
                  type="primary"
                  onClick={() => save("all")}
                >
                  导出全部页面
                </Button>
                <Button
                  aria-label="提取选中PDF"
                  disabled={busy || !selected.length}
                  onClick={() => save("selected")}
                >
                  提取选中页面
                </Button>
                <Button
                  aria-label="逐页拆分ZIP"
                  disabled={busy}
                  onClick={() => save("split")}
                >
                  {selected.length ? "拆分选中页面" : "逐页拆分 ZIP"}
                </Button>
                {busy && (
                  <Button
                    aria-label="取消处理"
                    onClick={() => operation.current?.abort()}
                  >
                    取消
                  </Button>
                )}
              </Space>
            </div>
          </>
        )}
        {busy && (
          <div className="tool-progress">
            <span>{phase}</span>
            <Progress percent={progress} />
            {!pages.length && (
              <Button
                aria-label="取消处理"
                onClick={() => operation.current?.abort()}
              >
                取消
              </Button>
            )}
          </div>
        )}
        {pages.length ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => {
              const from = pages.findIndex(
                (page) => page.id === event.active.id,
              );
              const to = pages.findIndex((page) => page.id === event.over?.id);
              if (!busy && from >= 0 && to >= 0 && from !== to)
                commit(arrayMove(pages, from, to));
            }}
          >
            <SortableContext
              items={pages.map((page) => page.id)}
              strategy={rectSortingStrategy}
            >
              <div className="tool-grid pdf-page-grid">
                {pages.map((page, index) => (
                  <PageCard
                    key={page.id}
                    page={page}
                    source={sources.current.get(page.sourceId)!}
                    order={index + 1}
                    selected={selection.has(page.id)}
                    disabled={busy}
                    last={index === pages.length - 1}
                    onSelect={() =>
                      setSelection((previous) => {
                        const next = new Set(previous);
                        next.has(page.id)
                          ? next.delete(page.id)
                          : next.add(page.id);
                        return next;
                      })
                    }
                    onRotate={() =>
                      commit(
                        pages.map((item) =>
                          item.id === page.id
                            ? {
                                ...item,
                                rotation: normalizeRotation(item.rotation + 90),
                              }
                            : item,
                        ),
                      )
                    }
                    onDelete={() =>
                      commit(pages.filter((item) => item.id !== page.id))
                    }
                    onMove={(direction) =>
                      commit(arrayMove(pages, index, index + direction))
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="tool-empty">
            <Empty description="添加 PDF 或图片，开始整理页面" />
            <Button disabled={busy} onClick={() => input.current?.click()}>
              选择文件
            </Button>
          </div>
        )}
        <Alert
          style={{ marginTop: 18 }}
          type="info"
          showIcon
          message="拖动页面的手柄，或使用左右箭头调整顺序；所有页面操作均可撤销。"
          description="最多 300 页，总计 150 MB。带密码 PDF 请先解密。重新导出会重建文档，原有数字签名不再有效。"
        />
      </section>
    </ToolPage>
  );
};
export default PdfManager;
