import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

interface MarkdownNode {
  type: string;
  value?: string;
  alt?: string;
  depth?: number;
  tagName?: string;
  children?: MarkdownNode[];
  data?: { hProperties?: Record<string, unknown> };
  properties?: Record<string, unknown>;
}
export interface Heading {
  id: string;
  slug: string;
  text: string;
  level: number;
}
export const plainText = (node: MarkdownNode): string =>
  node.value || node.alt || (node.children || []).map(plainText).join("");

// Share one AST-based algorithm between the outline and the rendered headings.
// Fenced code, escaped hashes, inline formatting and Setext headings are handled by Markdown's parser.
function assignHeadings(tree: MarkdownNode): Heading[] {
  const used = new Set<string>();
  const headings: Heading[] = [];
  const visit = (node: MarkdownNode) => {
    if (node.type === "heading") {
      const text = plainText(node).trim();
      const base =
        text
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, "")
          .replace(/\s/g, "-") || "section";
      let slug = base;
      let suffix = 0;
      while (used.has(slug)) slug = `${base}-${++suffix}`;
      used.add(slug);
      const id = `md-heading-${slug}`;
      node.data = {
        ...node.data,
        hProperties: { ...node.data?.hProperties, id },
      };
      headings.push({
        id,
        slug,
        text: text || "未命名章节",
        level: node.depth || 1,
      });
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  return headings;
}

export const headingPlugin = () => (tree: MarkdownNode) => {
  assignHeadings(tree);
};
const parser = unified().use(remarkParse).use(remarkGfm);
export function getHeadings(content: string): Heading[] {
  return assignHeadings(parser.parse(content) as MarkdownNode);
}

export function searchPlugin({ query }: { query: string }) {
  return (tree: MarkdownNode) => {
    if (!query.trim()) return;
    const needle = query.trim().toLowerCase();
    let index = 0;
    const visit = (node: MarkdownNode) => {
      if (!node.children || ["code", "pre"].includes(node.tagName || ""))
        return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text" || !child.value) {
          visit(child);
          return [child];
        }
        const value = child.value;
        const lower = value.toLowerCase();
        const result: MarkdownNode[] = [];
        let start = 0;
        let match = lower.indexOf(needle);
        while (match >= 0) {
          if (match > start)
            result.push({ type: "text", value: value.slice(start, match) });
          result.push({
            type: "element",
            tagName: "mark",
            properties: { "data-search-index": index++ },
            children: [
              {
                type: "text",
                value: value.slice(match, match + needle.length),
              },
            ],
          });
          start = match + needle.length;
          match = lower.indexOf(needle, start);
        }
        if (start < value.length)
          result.push({ type: "text", value: value.slice(start) });
        return result.length ? result : [child];
      });
    };
    visit(tree);
  };
}

export async function readMarkdownFile(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024)
    throw new Error(`${file.name} 超过 5 MB，请拆分后导入`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : "utf-8";
  try {
    return new TextDecoder(encoding, { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/, "");
  } catch {
    throw new Error(`${file.name} 编码无法识别，请另存为 UTF-8 后重新导入`);
  }
}

export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* HTTP/file contexts may need the fallback. */
    }
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  const focused = document.activeElement as HTMLElement | null;
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  focused?.focus();
  if (!copied) throw new Error("复制失败，请手动选择复制");
}
