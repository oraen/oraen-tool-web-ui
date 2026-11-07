import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Progress,
  Select,
  Space,
  Table,
  Tabs,
  Tree,
  message,
} from "antd";
import type { DataNode } from "antd/es/tree";
import {
  DownloadOutlined,
  FileZipOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import JSZip from "jszip";
import ToolPage from "../shared/ToolPage";
import {
  bytesLabel,
  checkAbort,
  downloadBlob,
  errorLabel,
  isAbort,
  MB,
  safeName,
  stem,
  uniqueName,
} from "../shared/files";
import { generateZip } from "../shared/zip";
import {
  cleanPath,
  extractEntry,
  OpenArchive,
  openArchive,
  ZipEntryInfo,
  ZIP_LIMITS,
} from "./archive";
import "./index.less";
interface CreateFile {
  path: string;
  file: File;
}
const TEXT_EXTENSIONS =
  /\.(txt|md|json|csv|xml|ya?ml|ini|log|js|ts|tsx|jsx|css|html|sql|py|java|sh|toml|conf|srt|vtt)$/i;
const ZipTool: React.FC = () => {
  const [tab, setTab] = useState("open");
  const [files, setFiles] = useState<CreateFile[]>([]);
  const [archive, setArchive] = useState<OpenArchive | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [folder, setFolder] = useState("");
  const [search, setSearch] = useState("");
  const [encoding, setEncoding] = useState<"utf-8" | "gb18030">("utf-8");
  const [compression, setCompression] = useState<"STORE" | "DEFLATE">(
    "DEFLATE",
  );
  const [name, setName] = useState("我的压缩包");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<{ path: string; text: string } | null>(
    null,
  );
  const operation = useRef<AbortController | null>(null);
  const archiveInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const entries = archive?.entries.filter((entry) => !entry.directory) || [];
  const shown = entries.filter(
    (entry) =>
      (!folder || entry.path.startsWith(folder + "/")) &&
      entry.path.toLowerCase().includes(search.toLowerCase()),
  );
  const tree = useMemo(() => {
    const root: DataNode = {
      key: "",
      title: "全部文件",
      children: [],
      icon: <FolderOpenOutlined />,
    };
    const byPath = new Map<string, DataNode>([["", root]]);
    for (const entry of archive?.entries || []) {
      const parts = entry.path.split("/");
      if (!entry.directory) parts.pop();
      let parent = root,
        path = "";
      for (const part of parts) {
        path = path ? `${path}/${part}` : part;
        if (!byPath.has(path)) {
          const node: DataNode = {
            key: path,
            title: part,
            children: [],
            icon: <FolderOpenOutlined />,
          };
          byPath.set(path, node);
          parent.children!.push(node);
        }
        parent = byPath.get(path)!;
      }
    }
    return [root];
  }, [archive]);
  function addFiles(input: File[]) {
    if (operation.current || !input.length) return;
    if (
      files.length + input.length > ZIP_LIMITS.entries ||
      input.reduce(
        (sum, file) => sum + file.size,
        files.reduce((sum, record) => sum + record.file.size, 0),
      ) >
        90 * MB
    ) {
      message.warning("创建 ZIP 最多 2000 个文件，总计不能超过 90 MB");
      return;
    }
    if (input.some((file) => file.size > ZIP_LIMITS.file)) {
      message.warning("单个文件不能超过 50 MB");
      return;
    }
    const used = new Set(files.map((record) => record.path.toLowerCase()));
    try {
      const additions = input.map((file) => {
        const original = file.webkitRelativePath || file.name;
        const path = cleanPath(original).split("/").map(safeName).join("/");
        return { path: uniqueName(path, used), file };
      });
      setFiles((previous) => [...previous, ...additions]);
    } catch (error) {
      message.error(errorLabel(error));
    }
  }
  async function open(file?: File) {
    if (!file || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setPhase("读取压缩包目录");
    setProgress(0);
    try {
      const result = await openArchive(file, encoding, controller.signal);
      checkAbort(controller.signal);
      setArchive(result);
      setSelected([]);
      setFolder("");
      setSearch("");
      setPreview(null);
      setProgress(100);
    } catch (error) {
      if (!isAbort(error)) message.error(errorLabel(error));
    } finally {
      operation.current = null;
      setBusy(false);
      setPhase("");
    }
  }
  async function create() {
    if (operation.current || !files.length) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setPhase("创建压缩包");
    setProgress(0);
    try {
      const zip = new JSZip();
      files.forEach((record) => zip.file(record.path, record.file));
      const blob = await generateZip(
        zip,
        controller.signal,
        setProgress,
        compression,
      );
      checkAbort(controller.signal);
      downloadBlob(blob, `${safeName(name).replace(/\.zip$/i, "")}.zip`);
    } catch (error) {
      if (!isAbort(error)) message.error(errorLabel(error));
    } finally {
      operation.current = null;
      setBusy(false);
      setPhase("");
    }
  }
  async function extract(
    target: ZipEntryInfo[] = entries.filter((entry) =>
      selected.includes(entry.path),
    ),
    single = false,
  ) {
    if (!archive || operation.current || !target.length) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setPhase("提取并校验文件");
    setProgress(0);
    try {
      const zip = new JSZip();
      for (const [index, entry] of target.entries()) {
        const blob = await extractEntry(archive, entry, controller.signal);
        checkAbort(controller.signal);
        if (single) {
          downloadBlob(blob, entry.path.split("/").pop()!);
          return;
        }
        zip.file(entry.path, blob);
        setProgress(Math.round(((index + 1) / target.length) * 85));
      }
      const blob = await generateZip(zip, controller.signal, (percent) =>
        setProgress(85 + Math.round(percent * 0.15)),
      );
      checkAbort(controller.signal);
      downloadBlob(blob, `${stem(archive.name)}-提取.zip`);
    } catch (error) {
      if (!isAbort(error)) message.error(errorLabel(error));
    } finally {
      operation.current = null;
      setBusy(false);
      setPhase("");
    }
  }
  async function previewEntry(entry: ZipEntryInfo) {
    if (!archive || operation.current) return;
    if (!TEXT_EXTENSIONS.test(entry.path) || entry.size > MB) {
      message.info("支持预览 1 MB 以内的文本和代码文件，其他文件请下载查看");
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setPhase("读取文本");
    try {
      const blob = await extractEntry(archive, entry, controller.signal);
      checkAbort(controller.signal);
      const data = new Uint8Array(await blob.arrayBuffer());
      const codec =
        data[0] === 0xff && data[1] === 0xfe
          ? "utf-16le"
          : data[0] === 0xfe && data[1] === 0xff
            ? "utf-16be"
            : encoding;
      const text = new TextDecoder(codec).decode(data);
      if (text.includes("\0"))
        throw new Error("该文件看起来是二进制数据，请下载查看");
      setPreview({ path: entry.path, text });
    } catch (error) {
      if (!isAbort(error)) message.error(errorLabel(error));
    } finally {
      operation.current = null;
      setBusy(false);
      setPhase("");
    }
  }
  return (
    <ToolPage
      title="ZIP 压缩包"
      description="浏览压缩包目录、预览文本、选择性提取，也可以将本地文件和文件夹打包。"
      icon={<FileZipOutlined />}
    >
      <input
        ref={archiveInput}
        id="zip-open-input"
        type="file"
        accept=".zip"
        hidden
        onChange={(event) => {
          void open(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={fileInput}
        id="zip-create-input"
        type="file"
        multiple
        hidden
        onChange={(event) => {
          addFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      <input
        ref={(element) => {
          folderInput.current = element;
          element?.setAttribute("webkitdirectory", "");
        }}
        id="zip-folder-input"
        type="file"
        multiple
        hidden
        onChange={(event) => {
          addFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      <section className="tool-panel zip-tool">
        <Tabs
          activeKey={tab}
          onChange={(key) => {
            if (!busy) setTab(key);
          }}
          items={[
            {
              key: "open",
              label: "打开 / 提取 ZIP",
              disabled: busy && tab !== "open",
            },
            {
              key: "create",
              label: "创建 ZIP",
              disabled: busy && tab !== "create",
            },
          ]}
        />
        {busy && (
          <div className="tool-progress">
            <div className="tool-toolbar">
              <span>{phase}</span>
              <Button
                aria-label="取消处理"
                onClick={() => operation.current?.abort()}
              >
                取消
              </Button>
            </div>
            <Progress percent={progress} />
          </div>
        )}
        {tab === "open" ? (
          <>
            <div className="tool-toolbar">
              <Space wrap>
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  disabled={busy}
                  onClick={() => archiveInput.current?.click()}
                >
                  打开 ZIP 文件
                </Button>
                <Select
                  aria-label="ZIP文件名和预览编码"
                  disabled={busy}
                  value={encoding}
                  onChange={(value) => {
                    setEncoding(value);
                    if (archive)
                      message.info("已切换编码，请重新打开 ZIP 以更新文件名");
                  }}
                  options={[
                    { value: "utf-8", label: "编码：UTF-8" },
                    { value: "gb18030", label: "编码：GBK / GB18030" },
                  ]}
                />
              </Space>
              {archive && (
                <Space wrap>
                  <Button
                    disabled={busy || !entries.length}
                    onClick={() =>
                      setSelected(
                        selected.length === entries.length
                          ? []
                          : entries.map((entry) => entry.path),
                      )
                    }
                  >
                    {selected.length === entries.length
                      ? "取消全选"
                      : "选择全部文件"}
                  </Button>
                  <Button
                    icon={<DownloadOutlined />}
                    disabled={busy || !selected.length}
                    onClick={() => extract()}
                  >
                    导出选中文件（ZIP）
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setArchive(null);
                      setSelected([]);
                      setPreview(null);
                    }}
                  >
                    关闭压缩包
                  </Button>
                </Space>
              )}
            </div>
            {archive ? (
              <>
                <div className="zip-summary">
                  <strong>{archive.name}</strong>
                  <span>
                    {entries.length} 个文件 · 展开后 {bytesLabel(archive.size)}{" "}
                    · 已选择 {selected.length} 个
                  </span>
                </div>
                <div className="zip-workspace">
                  <aside>
                    <Tree
                      key={archive.name}
                      showIcon
                      blockNode
                      defaultExpandAll
                      treeData={tree}
                      selectedKeys={[folder]}
                      onSelect={(keys) => setFolder(String(keys[0] ?? ""))}
                    />
                  </aside>
                  <div className="zip-entries">
                    <Input
                      aria-label="搜索压缩包文件"
                      prefix={<FolderOpenOutlined />}
                      value={search}
                      allowClear
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="搜索文件路径，包含子文件夹"
                      style={{ marginBottom: 12 }}
                    />
                    <Table<ZipEntryInfo>
                      size="small"
                      rowKey="path"
                      dataSource={shown}
                      pagination={{
                        pageSize: 20,
                        showSizeChanger: false,
                        showTotal: (total) => `共 ${total} 个文件`,
                      }}
                      rowSelection={{
                        selectedRowKeys: selected,
                        preserveSelectedRowKeys: true,
                        onChange: (keys) => setSelected(keys.map(String)),
                        getCheckboxProps: () => ({ disabled: busy }),
                      }}
                      columns={[
                        {
                          title: "文件路径",
                          dataIndex: "path",
                          render: (path, entry) => (
                            <button
                              className="zip-file-link"
                              title={path}
                              disabled={busy}
                              onClick={() => previewEntry(entry)}
                            >
                              {path}
                            </button>
                          ),
                        },
                        {
                          title: "大小",
                          width: 100,
                          render: (_, entry) => bytesLabel(entry.size),
                        },
                        {
                          title: "操作",
                          width: 80,
                          render: (_, entry) => (
                            <Button
                              size="small"
                              type="link"
                              disabled={busy}
                              aria-label={`提取 ${entry.path}`}
                              onClick={() => extract([entry], true)}
                            >
                              下载
                            </Button>
                          ),
                        },
                      ]}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div
                className="tool-empty"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void open(event.dataTransfer.files[0]);
                }}
              >
                <Empty description="选择或拖入一个 ZIP 文件" />
                <p className="tool-note">
                  目录读取不会立即解压整个文件，选中后再提取。
                </p>
              </div>
            )}
            <p className="tool-note">
              支持普通 ZIP 的 STORE / DEFLATE
              格式；暂不支持密码、分卷、ZIP64。压缩包不超过 100 MB，展开后不超过
              200 MB，单文件不超过 50 MB。
            </p>
          </>
        ) : (
          <>
            <div className="tool-toolbar">
              <Space wrap>
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                >
                  添加文件
                </Button>
                <Button
                  icon={<FolderAddOutlined />}
                  disabled={busy}
                  onClick={() => folderInput.current?.click()}
                >
                  添加文件夹
                </Button>
                <Button
                  disabled={busy || !files.length}
                  onClick={() => setFiles([])}
                >
                  清空列表
                </Button>
              </Space>
              <span>
                {files.length} 个文件 ·{" "}
                {bytesLabel(
                  files.reduce((sum, record) => sum + record.file.size, 0),
                )}
              </span>
            </div>
            <div className="zip-create-options">
              <Input
                aria-label="ZIP导出文件名"
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
                addonAfter=".zip"
              />
              <Select
                aria-label="ZIP压缩方式"
                value={compression}
                disabled={busy}
                onChange={setCompression}
                options={[
                  { value: "DEFLATE", label: "标准压缩 · 文本更小" },
                  { value: "STORE", label: "仅打包 · 图片视频更快" },
                ]}
              />
              <Button
                aria-label="创建并下载ZIP"
                type="primary"
                icon={<DownloadOutlined />}
                disabled={busy || !files.length}
                onClick={create}
              >
                创建并下载 ZIP
              </Button>
            </div>
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                addFiles(Array.from(event.dataTransfer.files));
              }}
            >
              {files.length ? (
                <Table<CreateFile>
                  size="small"
                  rowKey="path"
                  dataSource={files}
                  pagination={{ pageSize: 20, showSizeChanger: false }}
                  columns={[
                    { title: "包内路径", dataIndex: "path" },
                    {
                      title: "大小",
                      width: 110,
                      render: (_, record) => bytesLabel(record.file.size),
                    },
                    {
                      title: "操作",
                      width: 80,
                      render: (_, record) => (
                        <Button
                          type="link"
                          danger
                          disabled={busy}
                          onClick={() =>
                            setFiles((previous) =>
                              previous.filter(
                                (item) => item.path !== record.path,
                              ),
                            )
                          }
                        >
                          移除
                        </Button>
                      ),
                    },
                  ]}
                />
              ) : (
                <div className="tool-empty">
                  <Empty description="添加文件或文件夹，也可以将文件拖到这里" />
                </div>
              )}
            </div>
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 16 }}
              message="原文件不会被移动或修改；重名文件自动添加序号，文件夹结构会保留。"
              description="最多 2000 个文件、总计 90 MB；单文件不超过 50 MB。空文件夹无法通过浏览器文件选择器导入。"
            />
          </>
        )}
      </section>
      <Modal
        open={!!preview}
        title={preview?.path}
        width={850}
        footer={
          <Button aria-label="关闭" onClick={() => setPreview(null)}>
            关闭
          </Button>
        }
        onCancel={() => setPreview(null)}
      >
        <pre className="zip-text-preview">{preview?.text || "（空文件）"}</pre>
      </Modal>
    </ToolPage>
  );
};
export default ZipTool;
