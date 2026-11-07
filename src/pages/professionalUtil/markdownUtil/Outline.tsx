import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Empty, Input } from "antd";
import { DownOutlined, RightOutlined, SearchOutlined } from "@ant-design/icons";
import { Heading } from "./markdown";

interface Props {
  headings: Heading[];
  current: string;
  onSelect: (id: string) => void;
  documentId: string;
}
export default function Outline({
  headings,
  current,
  onSelect,
  documentId,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    setCollapsed(new Set());
    setQuery("");
  }, [documentId]);
  const minLevel = headings.length
    ? Math.min(...headings.map((heading) => heading.level))
    : 1;
  const entries = useMemo(() => {
    // Include the parents of search matches, so every matching branch can still be folded.
    const matches = new Set<string>();
    const parents: Heading[] = [];
    const term = query.trim().toLowerCase();
    for (const heading of headings) {
      while (parents.length && parents[parents.length - 1].level >= heading.level) parents.pop();
      if (!term || heading.text.toLowerCase().includes(term)) {
        matches.add(heading.id);
        parents.forEach((parent) => matches.add(parent.id));
      }
      parents.push(heading);
    }
    let hiddenBelow = 7;
    return headings.map((heading, index) => {
      if (heading.level <= hiddenBelow) hiddenBelow = 7;
      const hidden = heading.level > hiddenBelow;
      if (!hidden && collapsed.has(heading.id)) hiddenBelow = heading.level;
      return {
        ...heading,
        hidden,
        matches: matches.has(heading.id),
        hasChildren: (headings[index + 1]?.level || 0) > heading.level,
      };
    });
  }, [headings, collapsed, query]);
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!nav || !active) return;
    const box = active.getBoundingClientRect();
    const parent = nav.getBoundingClientRect();
    if (box.top < parent.top || box.bottom > parent.bottom)
      nav.scrollTop += box.top - parent.top - nav.clientHeight / 2;
  }, [current]);

  return (
    <div className="md-outline">
      <div className="md-outline-heading">
        <span>{headings.length} 个章节</span>
        <Button
          type="text"
          size="small"
          disabled={!entries.some((item) => item.hasChildren)}
          onClick={() =>
            setCollapsed(
              collapsed.size
                ? new Set()
                : new Set(
                    entries
                      .filter((item) => item.hasChildren)
                      .map((item) => item.id),
                  ),
            )
          }
        >
          {collapsed.size ? "全部展开" : "折叠目录"}
        </Button>
      </div>
      {headings.length > 8 && (
        <Input
          size="small"
          prefix={<SearchOutlined />}
          aria-label="筛选章节"
          placeholder="筛选章节"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCollapsed(new Set());
          }}
          allowClear
        />
      )}
      <nav ref={navRef} className="md-outline-list" aria-label="文档目录">
        {entries
          .filter((item) => !item.hidden && item.matches)
          .map((item) => (
            <div
              className={`md-outline-item ${current === item.id ? "is-current" : ""}`}
              key={item.id}
              style={{
                paddingLeft: 8 + Math.max(0, item.level - minLevel) * 14,
              }}
            >
              {item.hasChildren ? (
                <button
                  className="md-outline-toggle"
                  aria-label={`${collapsed.has(item.id) ? "展开" : "折叠"}${item.text}`}
                  aria-expanded={!collapsed.has(item.id)}
                  onClick={() =>
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      next.has(item.id)
                        ? next.delete(item.id)
                        : next.add(item.id);
                      return next;
                    })
                  }
                >
                  {collapsed.has(item.id) ? (
                    <RightOutlined />
                  ) : (
                    <DownOutlined />
                  )}
                </button>
              ) : (
                <span className="md-outline-dot" />
              )}
              <button
                className="md-outline-link"
                title={item.text}
                aria-current={current === item.id ? "location" : undefined}
                onClick={() => onSelect(item.id)}
              >
                {item.text}
              </button>
            </div>
          ))}
        {!headings.length && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                这篇文档还没有目录
                <br />
                <small>使用 #、## 等标题即可生成</small>
              </span>
            }
          />
        )}
        {!!headings.length && !entries.some((item) => item.matches) && (
          <p className="md-outline-empty">没有匹配的章节</p>
        )}
      </nav>
    </div>
  );
}
