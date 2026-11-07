import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { message } from "antd";
import { getHeadings } from "./markdown";

interface ReaderPreferences {
  fontSize: number;
  width: "comfortable" | "wide";
  serif: boolean;
}
const defaults: ReaderPreferences = {
  fontSize: 16,
  width: "comfortable",
  serif: false,
};
function loadPreferences(): ReaderPreferences {
  try {
    const saved = JSON.parse(
      localStorage.getItem("oraen:markdown:preferences") || "null",
    );
    return saved
      ? {
          fontSize: Math.max(14, Math.min(22, Number(saved.fontSize) || 16)),
          width: saved.width === "wide" ? "wide" : "comfortable",
          serif: saved.serif === true,
        }
      : defaults;
  } catch {
    return defaults;
  }
}

function loadPositions(): Map<string, number> {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem("oraen:markdown:positions") || "[]",
    );
    if (!Array.isArray(saved)) return new Map();
    return new Map(
      saved.filter(
        (entry): entry is [string, number] =>
          Array.isArray(entry) &&
          typeof entry[0] === "string" &&
          typeof entry[1] === "number" &&
          Number.isFinite(entry[1]) &&
          entry[1] >= 0,
      ),
    );
  } catch {
    return new Map();
  }
}

export default function useReader(
  id: string,
  content: string,
  editing: boolean,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headings = useMemo(() => getHeadings(content), [content]);
  const [currentHeading, setCurrentHeading] = useState("");
  const [progress, setProgress] = useState(0);
  const [preferences, setPreferences] = useState(loadPreferences);
  const [focus, setFocus] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [matchIndex, setMatchIndex] = useState(0);
  const [positions] = useState(loadPositions);

  useEffect(() => {
    try {
      localStorage.setItem(
        "oraen:markdown:preferences",
        JSON.stringify(preferences),
      );
    } catch {
      /* Reading works without preferences storage. */
    }
  }, [preferences]);
  useEffect(() => {
    setQuery("");
    setFindOpen(false);
    setMatchIndex(0);
  }, [id]);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = positions.get(id) || 0;
  }, [id]);

  const jumpTo = useCallback((anchor: string) => {
    const container = scrollRef.current;
    if (!container) return;
    let decoded = anchor;
    try {
      decoded = decodeURIComponent(anchor);
    } catch {
      /* Treat malformed encoded anchors literally. */
    }
    const target = Array.from(
      container.querySelectorAll<HTMLElement>("[id]"),
    ).find(
      (element) =>
        element.id === decoded ||
        element.id === `md-heading-${decoded.replace(/^user-content-/, "")}`,
    );
    if (!target) {
      message.info("未找到对应章节，标题可能已更改");
      return;
    }
    container.scrollTo({
      top:
        target.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop -
        24,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    setCurrentHeading(target.id);
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const nodes = Array.from(
      container.querySelectorAll<HTMLElement>(
        "h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]",
      ),
    );
    let frame = 0;
    let saveTimer: ReturnType<typeof setTimeout>;
    const savePosition = () => {
      try {
        localStorage.setItem(
          "oraen:markdown:positions",
          JSON.stringify(Array.from(positions.entries()).slice(-100)),
        );
      } catch {
        /* Reading remains available when preferences storage is full. */
      }
    };
    const update = () => {
      const max = container.scrollHeight - container.clientHeight;
      setProgress(
        max > 1
          ? Math.min(100, Math.round((container.scrollTop / max) * 100))
          : 100,
      );
      const top = container.getBoundingClientRect().top;
      let active = nodes[0]?.id || "";
      for (const node of nodes) {
        if (node.getBoundingClientRect().top - top <= 72) active = node.id;
        else break;
      }
      if (max > 1 && container.scrollTop >= max - 2)
        active = nodes[nodes.length - 1]?.id || "";
      setCurrentHeading(active);
      positions.delete(id);
      positions.set(id, container.scrollTop);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(savePosition, 400);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", savePosition);
    const observer = new ResizeObserver(onScroll);
    observer.observe(container);
    if (container.firstElementChild)
      observer.observe(container.firstElementChild);
    update();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(saveTimer);
      savePosition();
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", savePosition);
      observer.disconnect();
    };
  }, [id, content, editing, preferences]);

  const selectMatch = useCallback((index: number) => {
    const container = scrollRef.current;
    const marks = container?.querySelectorAll<HTMLElement>(
      "mark[data-search-index]",
    );
    if (!container || !marks?.length) return;
    const normalized = ((index % marks.length) + marks.length) % marks.length;
    marks.forEach((mark, i) =>
      mark.classList.toggle("is-current", i === normalized),
    );
    setMatchIndex(normalized);
    const target = marks[normalized];
    container.scrollTo({
      top:
        target.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop -
        container.clientHeight / 3,
    });
  }, []);

  useEffect(() => {
    const count =
      scrollRef.current?.querySelectorAll("mark[data-search-index]").length ||
      0;
    setMatchCount(count);
    setMatchIndex(0);
    if (count) selectMatch(0);
  }, [query, content, findOpen, selectMatch]);

  useEffect(() => {
    if (!focus) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [focus]);

  return {
    scrollRef,
    headings,
    currentHeading,
    progress,
    preferences,
    setPreferences,
    focus,
    setFocus,
    findOpen,
    setFindOpen,
    query,
    setQuery,
    matchCount,
    matchIndex,
    selectMatch,
    jumpTo,
  };
}
