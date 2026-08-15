import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Input,
  List,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tooltip,
  Typography,
  theme,
} from "antd";
import {
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  FileTextOutlined,
  LoadingOutlined,
  LockOutlined,
  PlusOutlined,
  SaveOutlined,
  UnlockOutlined,
  UploadOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { Editor } from "@monaco-editor/react";
import memoDatabase, { MemoRecord } from "./db";
import "./index.less";

const { Text, Title } = Typography;

const FORMAT_OPTIONS = [
  { value: "text", label: "纯文本" },
  { value: "md", label: "Markdown" },
  { value: "json", label: "JSON" },
  { value: "sql", label: "SQL" },
  { value: "csv", label: "CSV（纯文本）" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "yaml", label: "YAML / YML" },
  { value: "toml", label: "TOML" },
  { value: "xml", label: "XML" },
  { value: "shell", label: "Shell" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "csharp", label: "C#" },
  { value: "cpp", label: "C / C++" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "other", label: "其他" },
];

const MONACO_LANGUAGE: Record<string, string> = {
  text: "plaintext",
  md: "markdown",
  yaml: "yaml",
  toml: "ini",
  csv: "plaintext",
  other: "plaintext",
};

const FILE_FORMATS: Record<string, { extension: string; mime: string; label: string }> = {
  text: { extension: "txt", mime: "text/plain", label: "文本文件" },
  md: { extension: "md", mime: "text/markdown", label: "Markdown 文件" },
  json: { extension: "json", mime: "application/json", label: "JSON 文件" },
  sql: { extension: "sql", mime: "application/sql", label: "SQL 文件" },
  csv: { extension: "csv", mime: "text/csv", label: "CSV 文件" },
  html: { extension: "html", mime: "text/html", label: "HTML 文件" },
  css: { extension: "css", mime: "text/css", label: "CSS 文件" },
  javascript: { extension: "js", mime: "text/javascript", label: "JavaScript 文件" },
  typescript: { extension: "ts", mime: "text/plain", label: "TypeScript 文件" },
  yaml: { extension: "yml", mime: "application/yaml", label: "YAML 文件" },
  toml: { extension: "toml", mime: "application/toml", label: "TOML 文件" },
  xml: { extension: "xml", mime: "application/xml", label: "XML 文件" },
  shell: { extension: "sh", mime: "text/x-shellscript", label: "Shell 文件" },
  python: { extension: "py", mime: "text/x-python", label: "Python 文件" },
  java: { extension: "java", mime: "text/x-java-source", label: "Java 文件" },
  csharp: { extension: "cs", mime: "text/plain", label: "C# 文件" },
  cpp: { extension: "cpp", mime: "text/x-c++src", label: "C++ 文件" },
  go: { extension: "go", mime: "text/x-go", label: "Go 文件" },
  rust: { extension: "rs", mime: "text/plain", label: "Rust 文件" },
  other: { extension: "txt", mime: "text/plain", label: "文本文件" },
};

const FORMAT_BY_EXTENSION: Record<string, string> = {
  txt: "text",
  text: "text",
  md: "md",
  markdown: "md",
  json: "json",
  sql: "sql",
  csv: "csv",
  html: "html",
  htm: "html",
  css: "css",
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  sh: "shell",
  bash: "shell",
  py: "python",
  java: "java",
  cs: "csharp",
  c: "cpp",
  h: "cpp",
  cpp: "cpp",
  hpp: "cpp",
  go: "go",
  rs: "rust",
};

const IMPORT_ACCEPT = Object.keys(FORMAT_BY_EXTENSION).map((extension) => `.${extension}`).join(",");

type SaveState = "saved" | "dirty" | "saving" | "error";

const createMemoId = () => `memo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const formatTime = (timestamp: number) => new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
}).format(timestamp);

const MemoUtil: React.FC = () => {
  const { token } = theme.useToken();
  const [memos, setMemos] = useState<MemoRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const memosRef = useRef<MemoRecord[]>([]);
  const dirtyVersionsRef = useRef(new Map<string, number>());
  const activeSaveRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const renameCancelledRef = useRef(false);
  const saveErrorShownRef = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const selectedMemo = useMemo(
    () => memos.find((memo) => memo.id === selectedId) || null,
    [memos, selectedId],
  );

  const markDirty = useCallback((id: string) => {
    const versions = dirtyVersionsRef.current;
    versions.set(id, (versions.get(id) || 0) + 1);
    if (mountedRef.current) setSaveState("dirty");
  }, []);

  const updateMemo = useCallback((id: string, patch: Partial<MemoRecord>) => {
    const nextMemos = memosRef.current.map((memo) => (
      memo.id === id ? { ...memo, ...patch, updatedAt: Date.now() } : memo
    ));
    memosRef.current = nextMemos;
    setMemos(nextMemos);
    markDirty(id);
  }, [markDirty]);

  const flushDirtyMemos = useCallback(async () => {
    if (activeSaveRef.current) {
      try {
        await activeSaveRef.current;
      } catch {
        return;
      }
    }

    const versions = new Map(dirtyVersionsRef.current);
    if (!versions.size) return;

    const records = memosRef.current.filter((memo) => versions.has(memo.id));
    if (!records.length) {
      versions.forEach((_, id) => dirtyVersionsRef.current.delete(id));
      return;
    }

    if (mountedRef.current) setSaveState("saving");
    const saveTask = memoDatabase.saveMany(records);
    activeSaveRef.current = saveTask;

    try {
      await saveTask;
      versions.forEach((version, id) => {
        if (dirtyVersionsRef.current.get(id) === version) {
          dirtyVersionsRef.current.delete(id);
        }
      });
      saveErrorShownRef.current = false;
      if (mountedRef.current) {
        setSaveState(dirtyVersionsRef.current.size ? "dirty" : "saved");
      }
    } catch (error) {
      if (mountedRef.current) setSaveState("error");
      if (!saveErrorShownRef.current) {
        saveErrorShownRef.current = true;
        message.error(error instanceof Error ? error.message : "备忘录自动保存失败");
      }
    } finally {
      if (activeSaveRef.current === saveTask) activeSaveRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const loadMemos = async () => {
      try {
        const records = await memoDatabase.getAll();
        if (!mountedRef.current) return;
        memosRef.current = records;
        setMemos(records);
        setSelectedId(records[0]?.id || null);
      } catch (error) {
        if (!mountedRef.current) return;
        setStorageError(error instanceof Error ? error.message : "无法读取本地备忘录");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };
    void loadMemos();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void flushDirtyMemos(), 3000);
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") void flushDirtyMemos();
    };
    const saveBeforeLeave = () => void flushDirtyMemos();

    document.addEventListener("visibilitychange", saveWhenHidden);
    window.addEventListener("pagehide", saveBeforeLeave);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", saveWhenHidden);
      window.removeEventListener("pagehide", saveBeforeLeave);
      void flushDirtyMemos();
    };
  }, [flushDirtyMemos]);

  const createMemo = async () => {
    setAdding(true);
    const existingTitles = new Set(memosRef.current.map((memo) => memo.title));
    let title = "新备忘录";
    let suffix = 2;
    while (existingTitles.has(title)) title = `新备忘录 ${suffix++}`;

    const now = Date.now();
    const memo: MemoRecord = {
      id: createMemoId(),
      title,
      content: "",
      language: "text",
      locked: false,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await memoDatabase.saveMany([memo]);
      const nextMemos = [memo, ...memosRef.current];
      memosRef.current = nextMemos;
      setMemos(nextMemos);
      setSelectedId(memo.id);
      setStorageError("");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "新建备忘录失败");
    } finally {
      setAdding(false);
    }
  };

  const deleteMemo = async (memo: MemoRecord) => {
    await flushDirtyMemos();
    try {
      await memoDatabase.delete(memo.id);
      dirtyVersionsRef.current.delete(memo.id);
      const oldIndex = memosRef.current.findIndex((item) => item.id === memo.id);
      const nextMemos = memosRef.current.filter((item) => item.id !== memo.id);
      memosRef.current = nextMemos;
      setMemos(nextMemos);
      if (selectedId === memo.id) {
        setSelectedId(nextMemos[Math.min(oldIndex, nextMemos.length - 1)]?.id || null);
      }
      setSaveState(dirtyVersionsRef.current.size ? "dirty" : "saved");
      message.success("备忘录已删除");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除备忘录失败");
    }
  };

  const startRename = (memo: MemoRecord) => {
    renameCancelledRef.current = false;
    setEditingId(memo.id);
    setEditingTitle(memo.title);
  };

  const finishRename = (memo: MemoRecord) => {
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false;
      return;
    }
    const title = editingTitle.trim() || "未命名备忘录";
    if (title !== memo.title) updateMemo(memo.id, { title });
    setEditingId(null);
  };

  const copyMemoContent = async () => {
    if (!selectedMemo) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(selectedMemo.content);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = selectedMemo.content;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (!copied) throw new Error("浏览器拒绝了复制操作");
      }
      message.success("备忘录内容已复制");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "复制失败，请手动复制");
    }
  };

  const saveMemoAsFile = async () => {
    if (!selectedMemo) return;
    const format = FILE_FORMATS[selectedMemo.language] || FILE_FORMATS.other;
    const safeTitle = (selectedMemo.title || "备忘录")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/g, "") || "备忘录";
    const suffix = `.${format.extension}`;
    const suggestedName = safeTitle.toLowerCase().endsWith(suffix) ? safeTitle : `${safeTitle}${suffix}`;

    try {
      const electron = (window as any).electron;
      if (typeof electron?.saveTextFile === "function") {
        const result = await electron.saveTextFile({
          content: selectedMemo.content,
          defaultPath: suggestedName,
          filters: [{ name: format.label, extensions: [format.extension] }],
        });
        if (result?.canceled) return;
        if (result?.error) throw new Error(result.error);
        message.success("备忘录文件保存成功");
        return;
      }

      const showSaveFilePicker = (window as any).showSaveFilePicker;
      if (typeof showSaveFilePicker === "function") {
        const fileHandle = await showSaveFilePicker({
          suggestedName,
          types: [{
            description: format.label,
            accept: { [format.mime]: [suffix] },
          }],
        });
        const writable = await fileHandle.createWritable();
        await writable.write(selectedMemo.content);
        await writable.close();
        message.success("备忘录文件保存成功");
        return;
      }

      const blob = new Blob([selectedMemo.content], { type: `${format.mime};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = suggestedName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      message.success("文件已开始下载");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      message.error(error instanceof Error ? error.message : "保存文件失败");
    }
  };

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedId) return;

    const targetMemo = memosRef.current.find((memo) => memo.id === selectedId);
    if (!targetMemo) return;
    if (targetMemo.locked) {
      message.warning("请先解锁当前备忘录再导入文件");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      message.error("文件超过 20 MB，为避免编辑器卡顿，本次未导入");
      return;
    }

    try {
      const content = await file.text();
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      const language = FORMAT_BY_EXTENSION[extension] || targetMemo.language;
      const applyImport = () => {
        const latestMemo = memosRef.current.find((memo) => memo.id === targetMemo.id);
        if (!latestMemo || latestMemo.locked) {
          message.warning("当前备忘录已被锁定，文件没有导入");
          return;
        }
        updateMemo(targetMemo.id, { content, language });
        message.success(`已导入 ${file.name}`);
      };

      if (targetMemo.content) {
        Modal.confirm({
          title: "导入文件将覆盖当前内容",
          content: `确定使用“${file.name}”替换当前备忘录的全部文本吗？`,
          okText: "导入并覆盖",
          cancelText: "取消",
          okButtonProps: { danger: true },
          onOk: applyImport,
        });
      } else {
        applyImport();
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "读取文件失败");
    }
  };

  const saveStatus = {
    saved: { icon: <CheckCircleOutlined />, text: "已保存到本地", color: token.colorSuccess },
    dirty: { icon: <FileTextOutlined />, text: "等待自动保存", color: token.colorWarning },
    saving: { icon: <LoadingOutlined spin />, text: "正在保存", color: token.colorPrimary },
    error: { icon: <WarningOutlined />, text: "保存失败，稍后重试", color: token.colorError },
  }[saveState];

  if (loading) {
    return <div className="memo-loading"><Spin tip="正在读取本地备忘录..." /></div>;
  }

  return (
    <div className="memo-page">
      <div className="memo-heading">
        <div>
          <Title level={3}>备忘录</Title>
          <Text type="secondary">内容保存在当前设备的本地数据库中，每 3 秒自动保存一次。</Text>
        </div>
        <Space style={{ color: saveStatus.color }}>
          {saveStatus.icon}
          <span>{saveStatus.text}</span>
        </Space>
      </div>

      {storageError && (
        <Alert
          showIcon
          type="error"
          message="本地数据库不可用"
          description={storageError}
          style={{ marginBottom: 16 }}
        />
      )}

      <div className="memo-workspace" style={{ borderColor: token.colorBorderSecondary }}>
        <aside className="memo-sidebar" style={{ borderColor: token.colorBorderSecondary }}>
          <Button
            block
            type="primary"
            icon={<PlusOutlined />}
            loading={adding}
            disabled={Boolean(storageError)}
            onClick={createMemo}
          >
            新增备忘录
          </Button>

          <List
            className="memo-list"
            locale={{ emptyText: "还没有备忘录" }}
            dataSource={memos}
            renderItem={(memo) => {
              const selected = memo.id === selectedId;
              const dirty = dirtyVersionsRef.current.has(memo.id);
              return (
                <List.Item
                  className={`memo-list-item${selected ? " selected" : ""}`}
                  style={{
                    background: selected ? token.colorPrimaryBg : undefined,
                    borderColor: token.colorBorderSecondary,
                  }}
                  onClick={() => setSelectedId(memo.id)}
                >
                  <div className="memo-list-content">
                    <div className="memo-title-row">
                      {editingId === memo.id ? (
                        <Input
                          autoFocus
                          size="small"
                          value={editingTitle}
                          maxLength={80}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          onBlur={() => finishRename(memo)}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                            if (event.key === "Escape") {
                              renameCancelledRef.current = true;
                              setEditingId(null);
                              event.currentTarget.blur();
                            }
                          }}
                        />
                      ) : (
                        <Tooltip title="双击重命名" mouseEnterDelay={0.6}>
                          <Text
                            ellipsis
                            strong={selected}
                            className="memo-title"
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              startRename(memo);
                            }}
                          >
                            {memo.title}
                          </Text>
                        </Tooltip>
                      )}
                      <Popconfirm
                        title="删除这个备忘录？"
                        description="删除后无法恢复。"
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => deleteMemo(memo)}
                      >
                        <Button
                          danger
                          type="text"
                          size="small"
                          icon={<DeleteOutlined />}
                          aria-label={`删除${memo.title}`}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </Popconfirm>
                    </div>
                    <Text type="secondary" className="memo-meta">
                      {dirty ? "未保存 · " : ""}{formatTime(memo.updatedAt)}
                    </Text>
                  </div>
                </List.Item>
              );
            }}
          />
        </aside>

        <main className="memo-editor-panel">
          {selectedMemo ? (
            <>
              <div className="memo-editor-toolbar" style={{ borderColor: token.colorBorderSecondary }}>
                <Space wrap>
                  <Select
                    value={selectedMemo.language}
                    options={FORMAT_OPTIONS}
                    style={{ width: 180 }}
                    onChange={(language) => updateMemo(selectedMemo.id, { language })}
                    aria-label="文本格式"
                  />
                  <Button icon={<CopyOutlined />} onClick={copyMemoContent}>
                    一键复制
                  </Button>
                  <Button
                    type={selectedMemo.locked ? "primary" : "default"}
                    icon={selectedMemo.locked ? <UnlockOutlined /> : <LockOutlined />}
                    onClick={() => updateMemo(selectedMemo.id, { locked: !selectedMemo.locked })}
                  >
                    {selectedMemo.locked ? "解锁" : "锁定"}
                  </Button>
                  <Button icon={<SaveOutlined />} onClick={saveMemoAsFile}>
                    保存
                  </Button>
                  <Button
                    icon={<UploadOutlined />}
                    disabled={selectedMemo.locked}
                    onClick={() => importInputRef.current?.click()}
                  >
                    导入
                  </Button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept={IMPORT_ACCEPT}
                    style={{ display: "none" }}
                    onChange={importFile}
                  />
                </Space>
                <Text type="secondary">
                  {selectedMemo.content.length.toLocaleString()} 个字符
                </Text>
              </div>
              <div className="memo-editor">
                <Editor
                  path={`memo-${selectedMemo.id}`}
                  height="100%"
                  language={MONACO_LANGUAGE[selectedMemo.language] || selectedMemo.language}
                  value={selectedMemo.content}
                  onChange={(content) => {
                    if (!selectedMemo.locked) updateMemo(selectedMemo.id, { content: content || "" });
                  }}
                  theme="vs-light"
                  loading={<div className="memo-editor-loading"><Spin tip="编辑器加载中..." /></div>}
                  options={{
                    automaticLayout: true,
                    readOnly: selectedMemo.locked,
                    fontSize: 14,
                    lineHeight: 22,
                    minimap: { enabled: false },
                    wordWrap: "on",
                    formatOnPaste: true,
                    padding: { top: 12, bottom: 12 },
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>
            </>
          ) : (
            <Empty
              className="memo-empty"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="选择一个备忘录，或新建后开始记录"
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={createMemo} disabled={Boolean(storageError)}>
                新增备忘录
              </Button>
            </Empty>
          )}
        </main>
      </div>
    </div>
  );
};

export default MemoUtil;
