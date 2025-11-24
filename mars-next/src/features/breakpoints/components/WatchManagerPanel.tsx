import React, { useMemo, useState } from "react";

export type WatchKind = "register" | "memory";

export interface WatchSpec {
  kind: WatchKind;
  identifier: string;
}

export interface WatchManagerPanelProps {
  watches: WatchSpec[];
  symbols?: Record<string, number>;
  values?: Record<string, number | undefined>;
  onAdd: (spec: WatchSpec) => void;
  onRemove: (spec: WatchSpec) => void;
}

function renderIdentifier(spec: WatchSpec, symbols?: Record<string, number>): string {
  if (spec.kind === "register") return spec.identifier;
  if (symbols && spec.identifier in symbols) {
    return `${spec.identifier} (0x${symbols[spec.identifier].toString(16)})`;
  }
  return spec.identifier;
}

export function WatchManagerPanel({ watches, symbols, values, onAdd, onRemove }: WatchManagerPanelProps): React.JSX.Element {
  const [identifier, setIdentifier] = useState("");
  const [kind, setKind] = useState<WatchKind>("register");

  const valueLookup = useMemo(() => values ?? {}, [values]);

  const handleAdd = (): void => {
    if (!identifier.trim()) return;
    onAdd({ kind, identifier: identifier.trim() });
    setIdentifier("");
  };

  const keyFor = (spec: WatchSpec): string => `${spec.kind}:${spec.identifier}`;

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
          <strong style={{ color: "#e2e8f0" }}>Watch Manager</strong>
          <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            Track registers or memory locations; memory identifiers can be numeric or labels.
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as WatchKind)}
            style={{
              backgroundColor: "#0b1220",
              color: "#e2e8f0",
              border: "1px solid #334155",
              borderRadius: "0.35rem",
              padding: "0.4rem 0.6rem",
            }}
          >
            <option value="register">Register</option>
            <option value="memory">Memory</option>
          </select>
          <input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder={kind === "register" ? "$t0 or 8" : "0x10010000 or msg"}
            style={{
              backgroundColor: "#0b1220",
              color: "#e2e8f0",
              border: "1px solid #334155",
              borderRadius: "0.35rem",
              padding: "0.4rem 0.6rem",
              minWidth: "12rem",
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
        {watches.length === 0 && <span style={{ color: "#94a3b8" }}>No watch expressions defined.</span>}
        {watches.map((spec) => (
          <div
            key={keyFor(spec)}
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
              <span style={{ color: "#e2e8f0", fontWeight: 600 }}>
                {spec.kind === "register" ? "Register" : "Memory"}: {renderIdentifier(spec, symbols)}
              </span>
              <span style={{ color: "#38bdf8", fontSize: "0.9rem" }}>
                {valueLookup[keyFor(spec)] !== undefined ? valueLookup[keyFor(spec)] : "No data yet"}
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
