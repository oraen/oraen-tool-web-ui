import React, { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Input,
  Popconfirm,
  Popover,
  Segmented,
  Slider,
  Spin,
  Switch,
  Tooltip,
  theme,
  message,
} from "antd";
import type { InputRef } from "antd";
import {
  AlignLeftOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileMarkdownOutlined,
  FolderOpenOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  ReadOutlined,
  SearchOutlined,
  SettingOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { MarkdownFile, readFiles, writeFiles } from "./db";
import MarkdownPreview from "./MarkdownPreview";
import Outline from "./Outline";
import useReader from "./useReader";
import { readMarkdownFile } from "./markdown";
import ExportDialog from "./export/ExportDialog";
import "./index.less";

const dateLabel = (date: number) =>
  new Date(date).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const MarkdownUtil: React.FC = () => {
  const { token } = theme.useToken();
  const [files, setFiles] = useState<MarkdownFile[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editPane, setEditPane] = useState("source");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [exportTarget, setExportTarget] = useState<MarkdownFile | null>(null);
  const [compactReader, setCompactReader] = useState(false);
  const [narrowWorkspace, setNarrowWorkspace] = useState(false);
  const [outlineVisible, setOutlineVisible] = useState(true);
  const [outlineDrawer, setOutlineDrawer] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const ownsFullscreen = useRef(false);
  const findRef = useRef<InputRef>(null);
  const saveVersion = useRef(0);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const active = files.find((file) => file.id === selectedId);
  const deferredDraft = useDeferredValue(draft);
  const previewContent = editing ? deferredDraft : active?.content || "";
  const draftChanged = editing && draft !== active?.content;
  const reader = useReader(selectedId, previewContent, editing);
  const filtered = files.filter((file) =>
    file.name.toLowerCase().includes(query.toLowerCase()),
  );
  const outlineIsDrawer = compactReader || editing;
  const outlineExpanded = outlineIsDrawer ? outlineDrawer : outlineVisible;

  // Fit the actual space below the app navigation, including custom layout modes.
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (page.classList.contains("is-focused")) return;
        const top = page.getBoundingClientRect().top + window.scrollY;
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        page.style.setProperty("--md-page-height", `${Math.max(0, viewportHeight - top - 8)}px`);
      });
    };
    const observer = new ResizeObserver(measure);
    for (let parent = page.parentElement; parent; parent = parent.parentElement) {
      observer.observe(parent);
    }
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [reader.focus]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const observer = new ResizeObserver(() => {
      setCompactReader(main.clientWidth < 800);
      setNarrowWorkspace((pageRef.current?.clientWidth ?? window.innerWidth) <= 760);
    });
    observer.observe(main);
    if (pageRef.current) observer.observe(pageRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setOutlineDrawer(false);
  }, [selectedId, editing, compactReader]);

  async function toggleReadingMode() {
    if (reader.focus) {
      reader.setFocus(false);
      return;
    }
    reader.setFocus(true);
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        // Keep body portals (settings, menus and export dialogs) visible in fullscreen.
        await document.documentElement.requestFullscreen();
        ownsFullscreen.current = true;
        if (!pageRef.current?.classList.contains("is-focused")) {
          await document.exitFullscreen();
        }
      }
    } catch {
      // Embedded browsers may deny native fullscreen; the viewport still fills with the reader.
    }
  }

  useEffect(() => {
    const onFullscreenChange = () => {
      if (ownsFullscreen.current && !document.fullscreenElement) {
        ownsFullscreen.current = false;
        reader.setFocus(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (ownsFullscreen.current && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!reader.focus && ownsFullscreen.current && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [reader.focus]);

  function loadLibrary() {
    setLoading(true);
    readFiles()
      .then((records) => {
        let lastId = "";
        try {
          lastId = localStorage.getItem("oraen:markdown:last-file") || "";
        } catch {
          /* Storage preferences are optional. */
        }
        setFiles(records);
        setSelectedId(
          records.find((file) => file.id === lastId)?.id ||
            records[0]?.id ||
            "",
        );
      })
      .then(() => {
        setLoadError(false);
        setError("");
      })
      .catch(() => {
        setLoadError(true);
        setError("无法读取本地文档，请检查浏览器存储权限并重试。");
      })
      .finally(() => setLoading(false));
  }
  useEffect(loadLibrary, []);
  useEffect(() => {
    if (selectedId) {
      try {
        localStorage.setItem("oraen:markdown:last-file", selectedId);
      } catch {
        /* The document itself is saved in IndexedDB. */
      }
    }
  }, [selectedId]);

  useEffect(() => {
    if (reader.findOpen) findRef.current?.focus();
  }, [reader.findOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (exportTarget) return;
      if (event.key === "Escape") {
        if (mobileNav) setMobileNav(false);
        else if (outlineDrawer) setOutlineDrawer(false);
        else if (reader.findOpen) {
          reader.setFindOpen(false);
          reader.setQuery("");
        } else reader.setFocus(false);
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "f" &&
        active &&
        pageRef.current?.contains(event.target as Node)
      ) {
        event.preventDefault();
        reader.setFindOpen(true);
        findRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reader.findOpen, active?.id, mobileNav, outlineDrawer, exportTarget]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saving || error || draftChanged) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving, error, draftChanged]);

  async function persist(file: MarkdownFile) {
    const version = ++saveVersion.current;
    setSaving(true);
    try {
      const task = saveQueue.current
        .catch(() => undefined)
        .then(() => writeFiles([file]));
      saveQueue.current = task;
      await task;
      if (version === saveVersion.current) setError("");
      return true;
    } catch {
      if (version === saveVersion.current)
        setError("本地保存失败，请重试或导出文档，以免丢失修改。");
      return false;
    } finally {
      if (version === saveVersion.current) setSaving(false);
    }
  }

  async function saveEdit() {
    if (!active || busy || importing) return;
    if (!draftChanged) {
      setError("");
      setEditing(false);
      return;
    }
    setBusy(true);
    const updated = { ...active, content: draft, updatedAt: Date.now() };
    try {
      if (!(await persist(updated))) return;
      setFiles((previous) => previous.map((file) => file.id === updated.id ? updated : file));
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  function cancelEdit() {
    if (busy || importing) return;
    setDraft(active?.content || "");
    setEditing(false);
    setError("");
  }

  async function selectFile(id: string) {
    if (busy || importing) return;
    if (id === selectedId) {
      setMobileNav(false);
      return;
    }
    setBusy(true);
    try {
      if (draftChanged) {
        message.info("请先保存或取消当前编辑，再切换文档");
        return;
      }
      if (error && active && !(await persist(active))) return;
      setSelectedId(id);
      setEditing(false);
      setMobileNav(false);
    } finally {
      setBusy(false);
    }
  }

  async function importFiles(selected: File[]) {
    if (!selected.length || importing || busy || loadError) return;
    const valid = selected.filter((file) =>
      /\.(md|markdown)$/i.test(file.name),
    );
    if (valid.length !== selected.length)
      message.warning("仅支持 .md 和 .markdown 文件");
    if (!valid.length) return;
    setImporting(true);
    try {
      const now = Date.now();
      const records = await Promise.all(
        valid.map(
          async (file, index): Promise<MarkdownFile> => ({
            id: `md-${now}-${index}-${Math.random().toString(36).slice(2)}`,
            name: file.name,
            content: await readMarkdownFile(file),
            importedAt: now + index,
            updatedAt: now,
          }),
        ),
      );
      await writeFiles(records);
      records.reverse();
      setFiles((previous) => [...records, ...previous]);
      // Import adds to the library without interrupting an open editor or losing its draft.
      if (!editing) setSelectedId(records[0].id);
      setMobileNav(false);
      setQuery("");
      if (!editing) setError("");
      message.success(`已导入 ${records.length} 个 Markdown 文件`);
    } catch (cause) {
      message.error(
        cause instanceof Error
          ? cause.message
          : "导入失败，请检查文件是否可读取及本地存储空间",
      );
    } finally {
      setImporting(false);
    }
  }

  async function exportFile(file: MarkdownFile) {
    const electron = (
      window as Window & {
        electron?: {
          saveTextFile?: (options: {
            title: string;
            defaultPath: string;
            content: string;
            filters: { name: string; extensions: string[] }[];
          }) => Promise<{ canceled?: boolean; error?: string }>;
        };
      }
    ).electron;
    if (typeof electron?.saveTextFile === "function") {
      try {
        const result = await electron.saveTextFile({
          title: "导出 Markdown 文档",
          defaultPath: file.name,
          content: file.content,
          filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
        });
        if (result.error) throw new Error(result.error);
        if (!result.canceled) message.success("文档已导出");
      } catch {
        message.error("导出失败，请检查保存位置的写入权限");
      }
      return;
    }
    const url = URL.createObjectURL(
      new Blob([file.content], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function removeFile(file: MarkdownFile) {
    setBusy(true);
    try {
      await saveQueue.current.catch(() => undefined);
      await writeFiles([], file.id);
      setFiles((previous) => previous.filter((item) => item.id !== file.id));
      if (file.id === selectedId) {
        setSelectedId(files.find((item) => item.id !== file.id)?.id || "");
        setEditing(false);
        setError("");
      }
      message.success("已从列表移除，原文件不受影响");
    } catch {
      message.error("移除失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  const variables = {
    "--md-bg": token.colorBgContainer,
    "--md-fill": token.colorFillAlter,
    "--md-border": token.colorBorderSecondary,
    "--md-text": token.colorText,
    "--md-muted": token.colorTextSecondary,
    "--md-accent": token.colorPrimary,
    "--md-selected": token.colorPrimaryBg,
    "--md-font-size": `${reader.preferences.fontSize}px`,
    "--md-reading-width":
      reader.preferences.width === "wide" ? "1120px" : "820px",
    "--md-reading-font": reader.preferences.serif
      ? 'Georgia, "Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif'
      : 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
  } as React.CSSProperties;

  const toolbar = (
    <div className="md-toolbar">
      <div className="md-tool-stack">
        <Button
          className="md-mobile-nav-button"
          type="text"
          aria-label="打开文档库"
          title="打开文档库"
          icon={<FolderOpenOutlined />}
          onClick={() => {
            setMobileNav(true);
            setOutlineDrawer(false);
          }}
        />
        <Tooltip
          title={outlineExpanded ? "收起文档目录" : "展开文档目录"}
        >
          <Button
            className="md-outline-trigger"
            type="text"
            aria-label="文档目录"
            aria-expanded={outlineExpanded}
            aria-controls="md-document-outline"
            icon={<AlignLeftOutlined />}
            onClick={() => {
              setMobileNav(false);
              if (outlineIsDrawer) setOutlineDrawer((open) => !open);
              else setOutlineVisible((open) => !open);
            }}
          >
            目录
          </Button>
        </Tooltip>
        <Tooltip title="查找正文（Ctrl / ⌘ + F）">
          <Button
            type="text"
            aria-label="查找正文"
            icon={<SearchOutlined />}
            onClick={() => reader.setFindOpen(!reader.findOpen)}
          />
        </Tooltip>
        <span className="md-tool-divider" aria-hidden="true" />
        <Popover
          trigger="click"
          placement="bottomRight"
          title="阅读设置"
          content={
            <div className="md-reader-settings">
              <label>
                字号 <strong>{reader.preferences.fontSize}px</strong>
              </label>
              <Slider
                min={14}
                max={22}
                value={reader.preferences.fontSize}
                onChange={(fontSize) =>
                  reader.setPreferences({
                    ...reader.preferences,
                    fontSize,
                  })
                }
              />
              <label>版心宽度</label>
              <Segmented
                options={[
                  { label: "舒适", value: "comfortable" },
                  { label: "宽屏", value: "wide" },
                ]}
                value={reader.preferences.width}
                onChange={(width) =>
                  reader.setPreferences({
                    ...reader.preferences,
                    width: width as "comfortable" | "wide",
                  })
                }
              />
              <label>
                衬线字体{" "}
                <Switch
                  checked={reader.preferences.serif}
                  onChange={(serif) =>
                    reader.setPreferences({
                      ...reader.preferences,
                      serif,
                    })
                  }
                />
              </label>
              <Button
                size="small"
                onClick={() =>
                  reader.setPreferences({
                    fontSize: 16,
                    width: "comfortable",
                    serif: false,
                  })
                }
              >
                恢复默认
              </Button>
            </div>
          }
        >
          <Tooltip title="阅读设置">
            <Button
              type="text"
              aria-label="阅读设置"
              icon={<SettingOutlined />}
            />
          </Tooltip>
        </Popover>
        <Tooltip
          title={reader.focus ? "退出阅读模式（Esc）" : "全屏阅读"}
        >
          <Button
            type="text"
            aria-label={reader.focus ? "退出阅读模式" : "阅读模式"}
            aria-pressed={reader.focus}
            icon={
              reader.focus ? (
                <FullscreenExitOutlined />
              ) : (
                <FullscreenOutlined />
              )
            }
            onClick={toggleReadingMode}
          >
            {reader.focus ? "退出阅读" : "阅读模式"}
          </Button>
        </Tooltip>
        <Button
          title="导出文档"
          aria-label="导出"
          icon={<DownloadOutlined />}
          onClick={() => active && setExportTarget(editing ? { ...active, content: draft } : active)}
        >
          导出
        </Button>
        {!editing && (
          <Button
            title="编辑文档"
            aria-label="编辑"
            type="primary"
            disabled={busy || importing}
            icon={<EditOutlined />}
            onClick={() => {
              setDraft(active?.content || "");
              setEditPane("source");
              setEditing(true);
            }}
          >编辑</Button>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={pageRef}
      className={`markdown-page ${reader.focus ? "is-focused" : ""} ${narrowWorkspace ? "is-narrow" : ""}`}
      style={variables}
      tabIndex={-1}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void importFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {!active && (
        <header className="md-heading">
          <div>
            <h2>
              <FileMarkdownOutlined /> Markdown <span>阅读工作台</span>
            </h2>
            <p>从目录抵达章节，让每一次阅读都更从容。</p>
          </div>
          <span className="md-local-note">
            <span className="md-status-dot" />
            本地文档库
          </span>
        </header>
      )}
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            loadError ? (
              <Button size="small" onClick={loadLibrary} loading={loading}>
                重新加载
              </Button>
            ) : (
              active && (
                <Button
                  size="small"
                  onClick={() => editing ? saveEdit() : persist(active)}
                  loading={saving}
                >
                  重试保存
                </Button>
              )
            )
          }
        />
      )}
      {dragging && (
        <div className="md-drop-overlay">
          <UploadOutlined />
          <strong>松开以导入 Markdown 文件</strong>
          <span>支持多个 .md / .markdown 文件，每个不超过 5 MB</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".md,.markdown"
        multiple
        hidden
        onChange={(event) => {
          void importFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      {exportTarget && (
        <ExportDialog
          file={exportTarget}
          onClose={() => setExportTarget(null)}
          onMarkdown={() => exportFile(exportTarget)}
        />
      )}
      <div className={`md-workspace ${mobileNav ? "is-nav-open" : ""}`}>
        {mobileNav && (
          <button
            className="md-mobile-backdrop"
            aria-label="关闭文档库"
            onClick={() => setMobileNav(false)}
          />
        )}
        <aside className="md-sidebar">
          <div className="md-library-title">
            <strong>
              <FolderOpenOutlined /> 文档库
            </strong>
            <span>{files.length} 篇文档</span>
            <Button
              className="md-mobile-nav-button"
              type="text"
              size="small"
              aria-label="收起文档库"
              icon={<CloseOutlined />}
              onClick={() => setMobileNav(false)}
            />
          </div>
          <Button
            block
            aria-label="导入 MD 文件"
            icon={<UploadOutlined />}
            loading={importing}
            disabled={loading || busy || loadError}
            onClick={() => inputRef.current?.click()}
          >
            导入 MD 文件
          </Button>
          <section className="md-sidebar-panel" aria-label="文档库列表">
            <Input
              aria-label="搜索文档"
              placeholder="搜索文件名"
              prefix={<SearchOutlined />}
              value={query}
              allowClear
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="md-list-label">最近导入</div>
            <div className="md-file-list">
              {loading ? (
                <Spin />
              ) : filtered.length ? (
                filtered.map((file) => (
                  <div
                    className={`md-file ${file.id === selectedId ? "is-active" : ""}`}
                    key={file.id}
                  >
                    <button
                      className="md-file-select"
                      disabled={busy || importing}
                      onClick={() => void selectFile(file.id)}
                      aria-pressed={file.id === selectedId}
                    >
                      <FileMarkdownOutlined />
                      <span>
                        <strong title={file.name}>{file.name}</strong>
                        <small>{dateLabel(file.importedAt)} 导入</small>
                      </span>
                    </button>
                    <div className="md-file-actions">
                      <Tooltip title="导出 MD">
                        <Button
                          type="text"
                          size="small"
                          aria-label={`导出 ${file.name}`}
                          icon={<DownloadOutlined />}
                          onClick={() => exportFile(file)}
                        />
                      </Tooltip>
                      <Popconfirm
                        title="从列表移除这篇文档？"
                        description="只移除本地副本，不会删除原始文件。"
                        okText="移除"
                        cancelText="取消"
                        onConfirm={() => removeFile(file)}
                      >
                        <Button
                          type="text"
                          danger
                          size="small"
                          disabled={saving || busy || importing || (editing && file.id === selectedId)}
                          aria-label={`移除 ${file.name}`}
                          icon={<DeleteOutlined />}
                        />
                      </Popconfirm>
                    </div>
                  </div>
                ))
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={query ? "没有匹配的文档" : "还没有导入文档"}
                />
              )}
            </div>
          </section>
          <p className="md-sidebar-note">
            文档保存在当前浏览器中。
            <br />
            编辑不会覆盖原文件，可随时导出。
          </p>
        </aside>
        <main className="md-main" ref={mainRef}>
          {active ? (
            <>
              <div className="md-main-body">
                <div className="md-reading-area">
                  {editing && (
                    <div className="md-editor-actions">
                      <span>{draftChanged ? "有未保存的修改" : "编辑文档"}</span>
                      <Button aria-label="取消编辑" disabled={busy || importing} onClick={cancelEdit}>取消</Button>
                      <Button aria-label="保存" type="primary" icon={<CheckOutlined />}
                        disabled={importing} loading={busy} onClick={saveEdit}>保存</Button>
                    </div>
                  )}
                  {reader.findOpen && (
                    <div className="md-find-bar">
                      <Input
                        ref={findRef}
                        aria-label="查找正文内容"
                        placeholder="查找正文（不含代码块）"
                        prefix={<SearchOutlined />}
                        value={reader.query}
                        onChange={(event) => reader.setQuery(event.target.value)}
                        onPressEnter={(event) =>
                          reader.selectMatch(
                            reader.matchIndex + (event.shiftKey ? -1 : 1),
                          )
                        }
                        allowClear
                      />
                      <span aria-live="polite">
                        {reader.matchCount
                          ? `${reader.matchIndex + 1} / ${reader.matchCount}`
                          : reader.query
                            ? "无匹配"
                            : "输入关键词"}
                      </span>
                      <Button
                        type="text"
                        aria-label="上一个匹配"
                        disabled={!reader.matchCount}
                        icon={<ArrowUpOutlined />}
                        onClick={() => reader.selectMatch(reader.matchIndex - 1)}
                      />
                      <Button
                        type="text"
                        aria-label="下一个匹配"
                        disabled={!reader.matchCount}
                        icon={<ArrowDownOutlined />}
                        onClick={() => reader.selectMatch(reader.matchIndex + 1)}
                      />
                      <Button
                        type="text"
                        aria-label="关闭查找"
                        icon={<CloseOutlined />}
                        onClick={() => {
                          reader.setFindOpen(false);
                          reader.setQuery("");
                        }}
                      />
                    </div>
                  )}
                  {editing && (
                    <div className="md-edit-switch" role="group" aria-label="编辑视图">
                      <Button type={editPane === "source" ? "primary" : "text"}
                        aria-pressed={editPane === "source"} onClick={() => setEditPane("source")}>
                        源码
                      </Button>
                      <Button type={editPane === "preview" ? "primary" : "text"}
                        aria-pressed={editPane === "preview"} onClick={() => setEditPane("preview")}>
                        预览
                      </Button>
                    </div>
                  )}
                  <div
                    data-edit-pane={editPane}
                    className={`md-panels ${editing ? "is-editing" : ""} ${!outlineIsDrawer && outlineVisible ? "has-outline" : ""} ${outlineIsDrawer && outlineDrawer ? "is-outline-open" : ""}`}
                  >
                    {editing && (
                      <section className="md-source">
                        <div className="md-panel-label">
                          Markdown{" "}
                          <span>
                            源代码 · {draft.split("\n").length} 行
                          </span>
                        </div>
                        <textarea
                          aria-label="Markdown 源代码"
                          spellCheck={false}
                          disabled={busy || importing}
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                        />
                      </section>
                    )}
                    <section className="md-preview">
                      {editing && (
                        <div className="md-panel-label">
                          预览{" "}
                          <span>
                            <i />
                            实时预览
                          </span>
                        </div>
                      )}
                      <div
                        className="md-reading-scroll"
                        ref={reader.scrollRef}
                        key={active.id}
                        tabIndex={0}
                        aria-label="Markdown 阅读区"
                      >
                        <MarkdownPreview
                          content={previewContent}
                          query={reader.findOpen ? reader.query : ""}
                          onAnchor={reader.jumpTo}
                        />
                      </div>
                    </section>
                    {outlineIsDrawer && outlineDrawer && (
                      <button
                        className="md-outline-backdrop"
                        aria-label="关闭文档目录"
                        onClick={() => setOutlineDrawer(false)}
                      />
                    )}
                    <aside
                      id="md-document-outline"
                      aria-label="本页目录"
                      className={`md-document-outline ${outlineIsDrawer ? "is-drawer" : ""}`}
                      hidden={!outlineExpanded}
                    >
                      <div className="md-outline-title">
                        <div>
                          <strong>本页目录</strong>
                        </div>
                        <Tooltip title="收起目录">
                          <Button
                            size="small"
                            type="text"
                            aria-label="收起文档目录"
                            icon={<CloseOutlined />}
                            onClick={() => {
                              if (outlineIsDrawer) setOutlineDrawer(false);
                              else setOutlineVisible(false);
                            }}
                          />
                        </Tooltip>
                      </div>
                      <Outline
                        headings={reader.headings}
                        current={reader.currentHeading}
                        onSelect={(id) => {
                          if (editing && narrowWorkspace && editPane === "source") {
                            setEditPane("preview");
                            requestAnimationFrame(() => reader.jumpTo(id));
                          } else reader.jumpTo(id);
                          setOutlineDrawer(false);
                        }}
                        documentId={active.id}
                      />
                    </aside>
                  </div>
                </div>
                <aside className="md-action-rail" aria-label="文档工具">
                  {toolbar}
                </aside>
              </div>
              <footer className="md-reader-footer">
                <div className="md-progress-track">
                  <span style={{ width: `${reader.progress}%` }} />
                </div>
                <span className="md-current-section">
                  {reader.headings.find(
                    (heading) => heading.id === reader.currentHeading,
                  )?.text || "正文"}
                </span>
                <span>{(editing ? draft : active.content).length.toLocaleString()} 字符</span>
                <span>已读 {reader.progress}%</span>
                <Tooltip title="回到顶部">
                  <Button
                    type="text"
                    size="small"
                    aria-label="回到顶部"
                    icon={<ArrowUpOutlined />}
                    onClick={() =>
                      reader.scrollRef.current?.scrollTo({
                        top: 0,
                        behavior: window.matchMedia(
                          "(prefers-reduced-motion: reduce)",
                        ).matches
                          ? "auto"
                          : "smooth",
                      })
                    }
                  />
                </Tooltip>
              </footer>
            </>
          ) : (
            <div className="md-welcome">
              <div className="md-welcome-icon">
                <ReadOutlined />
              </div>
              <span className="md-welcome-eyebrow">YOUR READING SPACE</span>
              <h2>一篇好文档，值得认真阅读</h2>
              <p>
                导入 Markdown 文件，自动生成章节目录。
                <br />
                专注阅读、快速定位，也能随时编辑你的想法。
              </p>
              <Button
                className="md-mobile-nav-button"
                type="primary"
                size="large"
                icon={<FolderOpenOutlined />}
                aria-label="打开文档库"
                onClick={() => setMobileNav(true)}
              >
                打开文档库
              </Button>
              <small>支持拖拽导入 .md / .markdown，每个文件不超过 5 MB</small>
              <div className="md-welcome-features">
                <span>
                  <AlignLeftOutlined /> 章节导航
                </span>
                <span>
                  <SearchOutlined /> 文内查找
                </span>
                <span>
                  <EditOutlined /> 实时编辑
                </span>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default MarkdownUtil;
