import React, { useEffect, useMemo, useRef } from "react";

export type TerminalSource = "asm" | "run";

export interface TerminalLine {
  id: string;
  source: TerminalSource;
  text: string;
}

interface UnifiedTerminalProps {
  lines: TerminalLine[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onClear: () => void;
  onScrollToTop: () => void;
  onScrollToBottom: () => void;
  viewportRef: React.RefObject<HTMLDivElement>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function UnifiedTerminal({
  lines,
  searchQuery,
  onSearchChange,
  onClear,
  onScrollToTop,
  onScrollToBottom,
  viewportRef,
}: UnifiedTerminalProps): React.JSX.Element {
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) return lines;
    const normalized = searchQuery.trim().toLowerCase();
    return lines.filter((line) => line.text.toLowerCase().includes(normalized));
  }, [lines, searchQuery]);

  useEffect(() => {
    const node = viewportRef.current;
    if (node) {
      node.scrollTo({ top: node.scrollHeight });
    }
  }, [lines, viewportRef]);

  useEffect(() => {
    const handleKeyboardShortcuts = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;

      const key = event.key.toLowerCase();
      if (key === "l") {
        event.preventDefault();
        onClear();
      }

      if (key === "arrowup") {
        event.preventDefault();
        onScrollToTop();
      }

      if (key === "arrowdown") {
        event.preventDefault();
        onScrollToBottom();
      }

      if (key === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyboardShortcuts);
    return () => window.removeEventListener("keydown", handleKeyboardShortcuts);
  }, [onClear, onScrollToBottom, onScrollToTop]);

  const highlightSearch = (text: string): React.ReactNode => {
    if (!searchQuery.trim()) return text;
    const pattern = new RegExp(`(${escapeRegExp(searchQuery.trim())})`, "gi");
    return text.split(pattern).map((segment, index) => {
      if (!segment) return null;
      const isMatch = pattern.test(segment);
      pattern.lastIndex = 0;
      return isMatch ? (
        <mark key={`${segment}-${index}`} style={{ backgroundColor: "#f59e0b33", color: "inherit", padding: "0 2px" }}>
          {segment}
        </mark>
      ) : (
        <React.Fragment key={`${segment}-${index}`}>{segment}</React.Fragment>
      );
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <button
            onClick={onClear}
            style={{
              background: "#111827",
              color: "#e2e8f0",
              border: "1px solid #1f2937",
              borderRadius: "0.35rem",
              padding: "0.35rem 0.65rem",
              cursor: "pointer",
            }}
            title="Clear output (Ctrl/Cmd + Shift + L)"
          >
            Clear
          </button>
          <button
            onClick={onScrollToTop}
            style={{
              background: "#111827",
              color: "#e2e8f0",
              border: "1px solid #1f2937",
              borderRadius: "0.35rem",
              padding: "0.35rem 0.65rem",
              cursor: "pointer",
            }}
            title="Scroll to start (Ctrl/Cmd + Shift + ↑)"
          >
            Top
          </button>
          <button
            onClick={onScrollToBottom}
            style={{
              background: "#111827",
              color: "#e2e8f0",
              border: "1px solid #1f2937",
              borderRadius: "0.35rem",
              padding: "0.35rem 0.65rem",
              cursor: "pointer",
            }}
            title="Scroll to end (Ctrl/Cmd + Shift + ↓)"
          >
            Bottom
          </button>
        </div>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flex: 1 }}>
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search output (Ctrl/Cmd + Shift + F)"
            style={{
              flex: 1,
              minWidth: "180px",
              background: "#0b1221",
              color: "#e2e8f0",
              border: "1px solid #1f2937",
              borderRadius: "0.35rem",
              padding: "0.4rem 0.6rem",
            }}
          />
          <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
            {filteredLines.length} line{filteredLines.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div
        ref={viewportRef}
        style={{
          flex: 1,
          overflow: "auto",
          background: "#0b1221",
          border: "1px solid #1f2937",
          borderRadius: "0.5rem",
          padding: "0.6rem 0.65rem",
          fontFamily: "ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
        }}
      >
        {filteredLines.length === 0 ? (
          <div style={{ color: "#64748b" }}>No output yet. Assemble and run a program to see activity.</div>
        ) : (
          filteredLines.map((line) => (
            <div
              key={line.id}
              style={{
                display: "flex",
                gap: "0.55rem",
                alignItems: "flex-start",
                padding: "0.2rem 0",
                color: "#e2e8f0",
                borderBottom: "1px solid #0f172a",
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  color: line.source === "asm" ? "#fbbf24" : "#34d399",
                  minWidth: "52px",
                  textAlign: "right",
                }}
              >
                [{line.source.toUpperCase()}]
              </span>
              <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{highlightSearch(line.text)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
