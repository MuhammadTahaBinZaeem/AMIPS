import Editor, { OnMount } from "@monaco-editor/react";
import type * as monacoEditor from "monaco-editor";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RedoAction } from "../undoRedo/RedoAction";
import { UndoAction } from "../undoRedo/UndoAction";
import { UndoManager } from "../undoRedo/UndoManager";

export interface EditorViewProps {
  value: string;
  onChange: (value: string) => void;
  undoManager: UndoManager;
  breakpoints?: number[];
  onToggleBreakpoint?: (line: number) => void;
  activeLine?: number | null;
}

interface Palette {
  surface: string;
  text: string;
  muted: string;
  border: string;
  highlight: string;
}

export function EditorView({ value, onChange, undoManager, breakpoints, onToggleBreakpoint, activeLine }: EditorViewProps): React.JSX.Element {
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monacoEditor | null>(null);
  const decorations = useRef<string[]>([]);
  const [fontSize, setFontSize] = useState(14);

  const toolbarIcons = useMemo(
    () => ({
      zoomIn: (
        <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" width={28} height={28}>
          <circle cx="13" cy="13" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
          <path d="M13 9v8M9 13h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M18.5 18.5 26 26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
      zoomOut: (
        <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" width={28} height={28}>
          <circle cx="13" cy="13" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
          <path d="M9 13h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M18.5 18.5 26 26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
      find: (
        <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" width={28} height={28}>
          <circle cx="14" cy="14" r="7" stroke="currentColor" strokeWidth="2" fill="none" />
          <path d="M18.5 18.5 25 25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M11 14h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
      replace: (
        <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" width={28} height={28}>
          <path
            d="M8 12h11l-3-3m3 3-3 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M24 20H13l3-3m-3 3 3 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="24" cy="12" r="2" fill="currentColor" />
        </svg>
      ),
      undo: (
        <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" width={28} height={28}>
          <path
            d="M12 10 7 15l5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M24 22a8 8 0 0 0-8-8h-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
      redo: (
        <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" width={28} height={28}>
          <path
            d="M20 10.02 25 15l-5 4.98"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M8 22a8 8 0 0 1 8-8h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    }),
    [],
  );

  const palette = useMemo<Palette>(() => {
    const resolveVar = (name: string, fallback: string): string => {
      if (typeof window === "undefined") return fallback;
      const value = getComputedStyle(document.documentElement).getPropertyValue(name);
      return value.trim() || fallback;
    };

    return {
      surface: resolveVar("--color-surface", "#0f172a"),
      text: resolveVar("--color-text", "#e5e7eb"),
      muted: resolveVar("--color-muted", "#94a3b8"),
      border: resolveVar("--color-border", "#1f2937"),
      highlight: resolveVar("--color-highlight", "#38bdf8"),
    };
  }, []);

  const defineTheme = useCallback(() => {
    if (!monacoRef.current) return;
    monacoRef.current.editor.defineTheme("amips-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "8093aa" },
        { token: "keyword", foreground: "a78bfa" },
        { token: "string", foreground: "7dd3fc" },
        { token: "number", foreground: "fcd34d" },
      ],
      colors: {
        "editor.background": palette.surface,
        "editor.foreground": palette.text,
        "editorLineNumber.foreground": palette.muted,
        "editorLineNumber.activeForeground": palette.highlight,
        "editorGutter.background": palette.surface,
        "editorWidget.background": palette.surface,
        "editor.selectionBackground": "#1f2937",
        "editor.lineHighlightBackground": "rgba(56, 189, 248, 0.08)",
        "editorCursor.foreground": palette.highlight,
        "editorIndentGuide.background": "#1f2937",
        "editorIndentGuide.activeBackground": "#334155",
        "editor.selectionHighlightBackground": "rgba(99, 102, 241, 0.25)",
        "editorOverviewRuler.border": palette.border,
        "editorGutter.addedBackground": palette.border,
      },
    });
    monacoRef.current.editor.setTheme("amips-dark");
  }, [palette]);

  useEffect(() => {
    defineTheme();
  }, [defineTheme]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    defineTheme();

    editor.updateOptions({ fontSize });
    editor.focus();

    editor.onMouseDown((event) => {
      if (event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const line = event.target.position?.lineNumber;
        if (line && onToggleBreakpoint) {
          onToggleBreakpoint(line);
        }
      }
    });
  };

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const monaco = monacoRef.current;

    const breakpointDecorations = (breakpoints ?? []).map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        glyphMarginClassName: "amips-breakpoint-glyph",
        glyphMarginHoverMessage: { value: `Breakpoint at line ${line}` },
      },
    }));

    const activeLineDecoration = activeLine
      ? [
          {
            range: new monaco.Range(activeLine, 1, activeLine, 1),
            options: {
              isWholeLine: true,
              className: "amips-active-line",
              marginClassName: "amips-active-line",
            },
          },
        ]
      : [];

    decorations.current = editorRef.current.deltaDecorations(decorations.current, [
      ...breakpointDecorations,
      ...activeLineDecoration,
    ]);
  }, [activeLine, breakpoints, value]);

  const handleUndo = (): void => {
    const result = new UndoAction(undoManager).trigger();
    if (result !== null) onChange(result);
  };

  const handleRedo = (): void => {
    const result = new RedoAction(undoManager).trigger();
    if (result !== null) onChange(result);
  };

  const triggerEditorAction = (actionId: string): void => {
    void editorRef.current?.getAction(actionId)?.run();
  };

  const handleZoom = (delta: number): void => {
    const next = Math.min(Math.max(fontSize + delta, 12), 26);
    setFontSize(next);
    editorRef.current?.updateOptions({ fontSize: next });
  };

  const handleChange = (newContent: string): void => {
    undoManager.registerChange(newContent);
    onChange(newContent);
  };

  const renderToolbarButton = (
    id: string,
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    disabled = false,
  ): React.JSX.Element => (
    <div className="amips-icon-button-wrapper" key={id}>
      <button
        type="button"
        className="amips-icon-button"
        onClick={onClick}
        aria-label={label}
        aria-describedby={`${id}-tooltip`}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.currentTarget.blur();
        }}
        disabled={disabled}
      >
        {icon}
      </button>
      <span id={`${id}-tooltip`} className="amips-tooltip" role="tooltip">
        {label}
      </span>
    </div>
  );

  const editorOptions = useMemo<monacoEditor.editor.IStandaloneEditorConstructionOptions>(
    () => ({
      fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      minimap: { enabled: true },
      smoothScrolling: true,
      glyphMargin: true,
      folding: true,
      scrollBeyondLastLine: false,
      renderLineHighlight: "none",
      automaticLayout: true,
      lineDecorationsWidth: 14,
      padding: { top: 12, bottom: 12 },
    }),
    [fontSize],
  );

  return (
    <div className="amips-editor-container">
      <div className="amips-editor-toolbar">
        <div className="amips-toolbar">
          <span className="amips-card__title">MIPS Source</span>
          <span className="amips-pill" aria-live="polite">
            Font {fontSize}px
          </span>
        </div>
        <div className="amips-toolbar amips-toolbar--compact" aria-label="Editor toolbar">
          <div className="amips-toolbar__group" aria-label="Zoom controls">
            {renderToolbarButton("zoom-in", "Zoom in the editor", toolbarIcons.zoomIn, () => handleZoom(1))}
            {renderToolbarButton("zoom-out", "Zoom out the editor", toolbarIcons.zoomOut, () => handleZoom(-1))}
          </div>
          <div className="amips-toolbar__separator" role="separator" aria-hidden="true" />
          <div className="amips-toolbar__group" aria-label="Search controls">
            {renderToolbarButton("find", "Find in the file", toolbarIcons.find, () => triggerEditorAction("actions.find"))}
            {renderToolbarButton(
              "replace",
              "Find and replace in the file",
              toolbarIcons.replace,
              () => triggerEditorAction("editor.action.startFindReplaceAction"),
            )}
          </div>
          <div className="amips-toolbar__separator" role="separator" aria-hidden="true" />
          <div className="amips-toolbar__group" aria-label="History controls">
            {renderToolbarButton("undo", "Undo last change", toolbarIcons.undo, handleUndo, !undoManager.canUndo)}
            {renderToolbarButton("redo", "Redo last change", toolbarIcons.redo, handleRedo, !undoManager.canRedo)}
          </div>
        </div>
      </div>
      <div className="amips-editor-surface">
        <Editor
          height="100%"
          defaultLanguage="asm"
          value={value}
          theme="amips-dark"
          onMount={handleEditorDidMount}
          options={editorOptions}
          onChange={(newValue) => handleChange(newValue ?? "")}
        />
      </div>
    </div>
  );
}
