import React, { useMemo } from "react";
import { Gutter } from "./Gutter";

export interface EditorViewProps {
  value: string;
  onChange: (value: string) => void;
  breakpoints?: number[];
  onToggleBreakpoint?: (line: number) => void;
}

export function EditorView({ value, onChange, breakpoints, onToggleBreakpoint }: EditorViewProps): React.JSX.Element {
  const lines = useMemo(() => value.split(/\r?\n/), [value]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <label style={{ color: "#cfd1d4", fontWeight: 600 }}>MIPS Source</label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "0.75rem",
          alignItems: "stretch",
        }}
      >
        <Gutter lineCount={lines.length} breakpoints={breakpoints} onToggleBreakpoint={onToggleBreakpoint} />
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          style={{
            width: "100%",
            minHeight: "16rem",
            backgroundColor: "#0f172a",
            color: "#e2e8f0",
            border: "1px solid #1f2937",
            borderRadius: "0.5rem",
            padding: "1rem",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: "0.95rem",
            lineHeight: 1.5,
            resize: "vertical",
          }}
        />
      </div>
    </div>
  );
}
