import React from "react";

export interface EditorViewProps {
  value: string;
  onChange: (value: string) => void;
}

export function EditorView({ value, onChange }: EditorViewProps): React.JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <label style={{ color: "#cfd1d4", fontWeight: 600 }}>MIPS Source</label>
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
  );
}
