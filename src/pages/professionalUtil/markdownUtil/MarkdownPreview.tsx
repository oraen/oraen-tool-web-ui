import React, { useMemo, useState } from "react";
import { Button, Empty, message } from "antd";
import { CopyOutlined, LinkOutlined, PictureOutlined } from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { copyText, headingPlugin, searchPlugin } from "./markdown";
import DiagramBlock from "./diagrams/DiagramBlock";
import { diagramKind } from "./diagrams/types";
// Prism escapes source text before producing highlighting markup. Markdown HTML remains disabled.
import Prism from "prismjs";
import "prismjs/components/prism-json";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-yaml";

function CodeBlock({ source, language }: { source: string; language: string }) {
  const [wrap, setWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const html = useMemo(() => {
    const aliases: Record<string, string> = {
      js: "javascript",
      ts: "typescript",
      sh: "bash",
      shell: "bash",
      py: "python",
      yml: "yaml",
      html: "markup",
      xml: "markup",
    };
    const grammar = Prism.languages[aliases[language] || language];
    // Keep very large code fences responsive; unknown languages render as escaped plain text.
    return grammar && source.length < 50000
      ? Prism.highlight(source, grammar, language)
      : null;
  }, [source, language]);
  return (
    <div className={`md-code-block ${wrap ? "is-wrapped" : ""}`}>
      <div className="md-code-tools">
        <span>{language || "纯文本"}</span>
        <div>
          <Button
            size="small"
            type="text"
            aria-pressed={wrap}
            onClick={() => setWrap(!wrap)}
          >
            换行
          </Button>
          <Button
            size="small"
            type="text"
            icon={<CopyOutlined />}
            onClick={async () => {
              try {
                await copyText(source);
                setCopied(true);
              } catch {
                message.error("复制失败，请手动选择复制");
              }
            }}
          >
            {copied ? "已复制" : "复制"}
          </Button>
        </div>
      </div>
      <pre>
        {html ? (
          <code dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code>{source}</code>
        )}
      </pre>
    </div>
  );
}

function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const local = !src || !/^(https?:|data:image\/|blob:)/i.test(src);
  if (failed || local)
    return (
      <span
        className="md-image-fallback"
        role="img"
        aria-label={alt || "图片无法显示"}
      >
        <PictureOutlined />
        <span>
          {alt || "图片无法显示"}
          <small>
            {local
              ? "相对路径图片需要原文档的资源文件"
              : "图片加载失败，请检查链接或网络"}
          </small>
        </span>
      </span>
    );
  return (
    <img
      src={src}
      alt={alt || "文档图片"}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

interface Props {
  content: string;
  query: string;
  onAnchor: (anchor: string) => void;
}
const MarkdownPreview = React.memo(({ content, query, onAnchor }: Props) => {
  const components = useMemo<Components>(() => {
    const Heading = ({
      level,
      id,
      children,
    }: {
      level: number;
      id?: string;
      children?: React.ReactNode;
    }) =>
      React.createElement(
        `h${level}`,
        { id },
        children,
        <button
          className="md-heading-link"
          aria-label="复制章节链接"
          title="复制章节链接"
          onClick={async () => {
            try {
              await copyText(`#${id?.replace(/^md-heading-/, "") || ""}`);
              message.success("已复制文内锚点，可用于 Markdown 链接");
            } catch {
              message.error("复制失败");
            }
          }}
        >
          <LinkOutlined />
        </button>,
      );
    return {
      h1: (props) => <Heading {...props} level={1} />,
      h2: (props) => <Heading {...props} level={2} />,
      h3: (props) => <Heading {...props} level={3} />,
      h4: (props) => <Heading {...props} level={4} />,
      h5: (props) => <Heading {...props} level={5} />,
      h6: (props) => <Heading {...props} level={6} />,
      a: ({ node, href, children, ...props }) => (
        <a
          {...props}
          href={href}
          target={href?.startsWith("#") ? undefined : "_blank"}
          rel="noopener noreferrer"
          onClick={(event) => {
            if (href?.startsWith("#")) {
              event.preventDefault();
              onAnchor(href.slice(1));
            } else if (href && !/^(https?:|mailto:|tel:)/i.test(href)) {
              event.preventDefault();
              message.info(
                "相对路径链接需要原文档所在目录，请从文档库打开对应文件",
              );
            }
          }}
        >
          {children}
        </a>
      ),
      img: ({ src, alt }) => <MarkdownImage key={src} src={src} alt={alt} />,
      pre: ({ children }) => <>{children}</>,
      code: ({ inline, className, children }) => {
        const language = /language-([^\s]+)/.exec(className || "")?.[1] || "";
        const source = String(children).replace(/\n$/, "");
        const kind = diagramKind(language);
        return inline ? (
          <code className={className}>{children}</code>
        ) : kind ? (
          <DiagramBlock kind={kind} source={source} />
        ) : (
          <CodeBlock
            key={String(children)}
            source={source}
            language={language}
          />
        );
      },
    };
  }, [onAnchor]);
  return (
    <article className="md-article">
      {content.trim() ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, headingPlugin]}
          rehypePlugins={[[searchPlugin, { query }]]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="文档还是空白，点击编辑开始书写"
        />
      )}
    </article>
  );
});
export default MarkdownPreview;
