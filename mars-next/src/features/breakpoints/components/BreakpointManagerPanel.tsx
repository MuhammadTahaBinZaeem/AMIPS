import React, { useMemo, useState } from "react";

export interface BreakpointManagerPanelProps {
  breakpoints: string[];
  symbols?: Record<string, number>;
  onAdd: (spec: string) => void;
  onRemove: (spec: string) => void;
}

function resolveAddress(spec: string, symbols?: Record<string, number>): number | null {
  const trimmed = spec.trim();
  if (!trimmed) return null;

  if (/^0x[0-9a-f]+$/i.test(trimmed)) return Number.parseInt(trimmed, 16) | 0;
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10) | 0;

  if (symbols && trimmed in symbols) return symbols[trimmed] | 0;

  return null;
}

export function BreakpointManagerPanel({ breakpoints, symbols, onAdd, onRemove }: BreakpointManagerPanelProps): React.JSX.Element {
  const [input, setInput] = useState("");

  const resolvedBreakpoints = useMemo(
    () =>
      breakpoints.map((spec) => ({
        spec,
        address: resolveAddress(spec, symbols),
      })),
    [breakpoints, symbols],
  );

  const handleAdd = (): void => {
    if (!input.trim()) return;
    onAdd(input.trim());
    setInput("");
  };

  return (
    <div
      style={{
        border: "1px solid #1f2937",
        borderRadius: "0.5rem",
        padding: "0.75rem 1rem",
        backgroundColor: "#0f172a",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
          <strong style={{ color: "#e2e8f0" }}>Breakpoint Manager</strong>
          <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            Add addresses or labels; labels resolve against the assembled symbol table.
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="0x00400000 or main"
            style={{
              backgroundColor: "#0b1220",
              color: "#e2e8f0",
              border: "1px solid #334155",
              borderRadius: "0.35rem",
              padding: "0.4rem 0.6rem",
              minWidth: "14rem",
            }}
          />
          <button
            type="button"
            onClick={handleAdd}
            style={{
              background: "linear-gradient(135deg, #22c55e, #16a34a)",
              color: "#0b1726",
              border: "none",
              borderRadius: "0.35rem",
              padding: "0.45rem 0.9rem",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Add
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {resolvedBreakpoints.length === 0 && <span style={{ color: "#94a3b8" }}>No breakpoints defined.</span>}
        {resolvedBreakpoints.map(({ spec, address }) => (
          <div
            key={spec}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.35rem 0.5rem",
              border: "1px solid #1f2937",
              borderRadius: "0.35rem",
              backgroundColor: "#0b1220",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
              <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{spec}</span>
              <span style={{ color: address !== null ? "#38bdf8" : "#fca5a5", fontSize: "0.9rem" }}>
                {address !== null ? `0x${address.toString(16)}` : "Unresolved"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onRemove(spec)}
              style={{
                backgroundColor: "#1f2937",
                color: "#e2e8f0",
                border: "1px solid #334155",
                borderRadius: "0.35rem",
                padding: "0.3rem 0.75rem",
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
