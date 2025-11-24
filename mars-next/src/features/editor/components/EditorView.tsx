import React from "react";

export interface EditorViewProps {
  value: string;
  onChange: (value: string) => void;
  breakpoints: string[];
  onToggleBreakpoint: (label: string) => void;
  symbols?: Record<string, number>;
}

export function EditorView({ value, onChange, breakpoints, onToggleBreakpoint, symbols }: EditorViewProps): React.JSX.Element {
  const labelMatches = React.useMemo(() => {
    const seen = new Set<string>();
    return value
      .split(/\r?\n/)
      .map((line, index) => ({ line: index + 1, label: line.match(/^\s*([A-Za-z_]\w*):/)?.[1] ?? null }))
      .filter((entry) => entry.label && !seen.has(entry.label))
      .map((entry) => {
        seen.add(entry.label as string);
        return entry as { line: number; label: string };
      });
  }, [value]);

  const breakpointSet = React.useMemo(() => new Set(breakpoints), [breakpoints]);

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

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          border: "1px solid #1f2937",
          borderRadius: "0.5rem",
          padding: "0.75rem 1rem",
          backgroundColor: "#0f172a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#cbd5e1" }}>
          <strong>Label Breakpoints</strong>
          <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
            Toggle breakpoints on labels detected in this source (mirrors the legacy EditorPane gutter).
          </span>
        </div>

        {labelMatches.length === 0 && (
          <p style={{ color: "#94a3b8", margin: 0 }}>Add a label ending with ":" to enable label breakpoints.</p>
        )}

        {labelMatches.map(({ label, line }) => {
          const active = breakpointSet.has(label);
          const address = symbols?.[label];
          return (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.35rem 0.5rem",
                backgroundColor: active ? "#122332" : "transparent",
                borderRadius: "0.35rem",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{label}</span>
                <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Line {line}</span>
                {address !== undefined && (
                  <span style={{ color: "#38bdf8", fontSize: "0.85rem" }}>Address: 0x{address.toString(16)}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onToggleBreakpoint(label)}
                style={{
                  background: active ? "linear-gradient(135deg, #f97316, #fb923c)" : "#1f2937",
                  color: active ? "#0b1726" : "#e2e8f0",
                  border: "1px solid #334155",
                  borderRadius: "0.35rem",
                  padding: "0.35rem 0.75rem",
                  cursor: "pointer",
                }}
              >
                {active ? "Remove" : "Set"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
