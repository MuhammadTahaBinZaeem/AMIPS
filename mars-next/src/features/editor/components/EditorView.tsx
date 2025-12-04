import React, { useEffect, useMemo, useRef, useState } from "react";
import { Gutter } from "./Gutter";
import { UndoManager } from "../undoRedo/UndoManager";
import { RedoAction } from "../undoRedo/RedoAction";
import { UndoAction } from "../undoRedo/UndoAction";
import { FindReplaceResult, SelectionRange, findNext, replace, replaceAll } from "../undoRedo/FindReplace";

export interface EditorViewProps {
  value: string;
  onChange: (value: string) => void;
  undoManager: UndoManager;
  breakpoints?: number[];
  onToggleBreakpoint?: (line: number) => void;
  activeLine?: number | null;
}

export function EditorView({ value, onChange, undoManager, breakpoints, onToggleBreakpoint, activeLine }: EditorViewProps): React.JSX.Element {
  const lines = useMemo(() => value.split(/\r?\n/), [value]);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findValue, setFindValue] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const pendingSelection = useRef<SelectionRange | null>(null);

  const matches = useMemo(() => {
    if (!findValue) return [] as SelectionRange[];

    const locations: SelectionRange[] = [];
    let cursor = value.indexOf(findValue);
    while (cursor !== -1) {
      locations.push({ start: cursor, end: cursor + findValue.length });
      cursor = value.indexOf(findValue, cursor + Math.max(1, findValue.length));
    }
    return locations;
  }, [findValue, value]);

  useEffect(() => {
    if (pendingSelection.current && textAreaRef.current) {
      const selection = pendingSelection.current;
      pendingSelection.current = null;
      textAreaRef.current.focus();
      textAreaRef.current.setSelectionRange(selection.start, selection.end);
    }
  }, [value]);

  const handleUndo = (): void => {
    const result = new UndoAction(undoManager).trigger();
    if (result !== null) onChange(result);
  };

  const handleRedo = (): void => {
    const result = new RedoAction(undoManager).trigger();
    if (result !== null) onChange(result);
  };

  const handleChange = (newContent: string): void => {
    undoManager.registerChange(newContent);
    onChange(newContent);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    const isModKey = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (isModKey && key === "z") {
      event.preventDefault();
      if (event.shiftKey) handleRedo();
      else handleUndo();
    }

    if (isModKey && key === "y") {
      event.preventDefault();
      handleRedo();
    }
  };

  const captureSelection = (): SelectionRange => {
    const textarea = textAreaRef.current;
    if (!textarea) return { start: 0, end: 0 };
    return { start: textarea.selectionStart, end: textarea.selectionEnd };
  };

  const applySelection = (selection: SelectionRange | null): void => {
    if (!selection) return;
    pendingSelection.current = selection;
  };

  const handleFindNext = (): void => {
    const selection = captureSelection();
    const nextSelection = findNext(value, findValue, selection.end);
    applySelection(nextSelection);
  };

  const handleReplace = (): void => {
    const selection = captureSelection();
    const result: FindReplaceResult = replace(value, selection, findValue, replaceValue);
    applySelection(result.selection);
    onChange(result.content);
  };

  const handleReplaceAll = (): void => {
    const result = replaceAll(value, findValue, replaceValue);
    applySelection(result.selection);
    onChange(result.content);
  };

  const highlightedText = useMemo(() => {
    if (matches.length === 0) return value;

    const segments: Array<string | React.ReactElement> = [];
    let cursor = 0;
    matches.forEach((match, index) => {
      segments.push(value.slice(cursor, match.start));
      segments.push(
        <mark
          key={`match-${index}-${match.start}`}
          style={{ backgroundColor: "rgba(56, 189, 248, 0.35)", color: "transparent" }}
        >
          {value.slice(match.start, match.end)}
        </mark>,
      );
      cursor = match.end;
    });
    segments.push(value.slice(cursor));
    return segments;
  }, [matches, value]);

  const syncHighlightScroll = (): void => {
    if (highlightRef.current && textAreaRef.current) {
      highlightRef.current.scrollTop = textAreaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textAreaRef.current.scrollLeft;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
        <label style={{ color: "#cfd1d4", fontWeight: 600 }}>MIPS Source</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={handleUndo}
            disabled={!undoManager.canUndo}
            style={{
              backgroundColor: "#1f2937",
              color: "#e2e8f0",
              border: "1px solid #334155",
              borderRadius: "0.35rem",
              padding: "0.35rem 0.65rem",
              cursor: undoManager.canUndo ? "pointer" : "not-allowed",
            }}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!undoManager.canRedo}
            style={{
              backgroundColor: "#1f2937",
              color: "#e2e8f0",
              border: "1px solid #334155",
              borderRadius: "0.35rem",
              padding: "0.35rem 0.65rem",
              cursor: undoManager.canRedo ? "pointer" : "not-allowed",
            }}
          >
            Redo
          </button>
          <button
            type="button"
            onClick={() => setShowFindReplace(true)}
            style={{
              backgroundColor: "#1f2937",
              color: "#e2e8f0",
              border: "1px solid #334155",
              borderRadius: "0.35rem",
              padding: "0.35rem 0.65rem",
              cursor: "pointer",
            }}
          >
            Find
          </button>
          <button
            type="button"
            onClick={() => setShowFindReplace(true)}
            style={{
              backgroundColor: "#1f2937",
              color: "#e2e8f0",
              border: "1px solid #334155",
              borderRadius: "0.35rem",
              padding: "0.35rem 0.65rem",
              cursor: "pointer",
            }}
          >
            Replace
          </button>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "0.75rem",
          alignItems: "stretch",
        }}
      >
        <Gutter
          lineCount={lines.length}
          breakpoints={breakpoints}
          onToggleBreakpoint={onToggleBreakpoint}
          activeLine={activeLine}
        />
        <div style={{ position: "relative" }}>
          <div
            ref={highlightRef}
            aria-hidden={true}
            style={{
              position: "absolute",
              inset: 0,
              overflow: "auto",
              pointerEvents: "none",
              whiteSpace: "pre-wrap",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: "0.95rem",
              lineHeight: 1.5,
              padding: "1rem",
              color: "transparent",
              zIndex: 1,
            }}
          >
            {highlightedText}
          </div>
          <textarea
            ref={textAreaRef}
            value={value}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={syncHighlightScroll}
            spellCheck={false}
            style={{
              width: "100%",
              minHeight: "16rem",
              backgroundColor: "rgba(15, 23, 42, 0.85)",
              color: "#e2e8f0",
              border: "1px solid #1f2937",
              borderRadius: "0.5rem",
              padding: "1rem",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: "0.95rem",
              lineHeight: 1.5,
              resize: "vertical",
              position: "relative",
              zIndex: 2,
            }}
          />
        </div>
      </div>

      {showFindReplace && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
          }}
        >
          <div
            style={{
              backgroundColor: "#0f172a",
              border: "1px solid #1f2937",
              borderRadius: "0.75rem",
              padding: "1rem",
              width: "min(500px, 90vw)",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: "#e2e8f0", fontWeight: 700 }}>Find & Replace</div>
                <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                  {matches.length} match{matches.length === 1 ? "" : "es"} highlighted
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFindReplace(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: "1.1rem",
                }}
                aria-label="Close find dialog"
              >
                ✕
              </button>
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", color: "#cbd5e1" }}>
              Find
              <input
                value={findValue}
                onChange={(event) => setFindValue(event.target.value)}
                style={{
                  backgroundColor: "#0b1220",
                  border: "1px solid #1f2937",
                  color: "#e2e8f0",
                  borderRadius: "0.35rem",
                  padding: "0.45rem 0.6rem",
                }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", color: "#cbd5e1" }}>
              Replace with
              <input
                value={replaceValue}
                onChange={(event) => setReplaceValue(event.target.value)}
                style={{
                  backgroundColor: "#0b1220",
                  border: "1px solid #1f2937",
                  color: "#e2e8f0",
                  borderRadius: "0.35rem",
                  padding: "0.45rem 0.6rem",
                }}
              />
            </label>

            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleFindNext}
                style={{
                  backgroundColor: "#1f2937",
                  color: "#e2e8f0",
                  border: "1px solid #334155",
                  borderRadius: "0.35rem",
                  padding: "0.35rem 0.65rem",
                  cursor: "pointer",
                }}
              >
                Find next
              </button>
              <button
                type="button"
                onClick={handleReplace}
                style={{
                  backgroundColor: "#22c55e",
                  color: "#0b1220",
                  border: "1px solid #16a34a",
                  borderRadius: "0.35rem",
                  padding: "0.35rem 0.65rem",
                  cursor: "pointer",
                }}
              >
                Replace
              </button>
              <button
                type="button"
                onClick={handleReplaceAll}
                style={{
                  backgroundColor: "#38bdf8",
                  color: "#0b1220",
                  border: "1px solid #0ea5e9",
                  borderRadius: "0.35rem",
                  padding: "0.35rem 0.65rem",
                  cursor: "pointer",
                }}
              >
                Replace all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
