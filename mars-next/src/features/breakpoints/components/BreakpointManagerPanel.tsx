import React, { useMemo, useState } from "react";
import { BreakpointSpec, NewBreakpointSpec } from "../types";

export interface BreakpointManagerPanelProps {
  breakpoints: BreakpointSpec[];
  symbols?: Record<string, number>;
  onAdd: (spec: NewBreakpointSpec) => void;
  onRemove: (id: string) => void;
}

function resolveAddress(spec: string | number, symbols?: Record<string, number>): number | null {
  const normalized = typeof spec === "number" ? spec.toString() : spec;
  const trimmed = normalized.trim();
  if (!trimmed) return null;

  if (/^0x[0-9a-f]+$/i.test(trimmed)) return Number.parseInt(trimmed, 16) | 0;
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10) | 0;

  if (symbols && trimmed in symbols) return symbols[trimmed] | 0;

  return null;
}

export function BreakpointManagerPanel({ breakpoints, symbols, onAdd, onRemove }: BreakpointManagerPanelProps): React.JSX.Element {
  const [input, setInput] = useState("");
  const [conditionRegister, setConditionRegister] = useState("");
  const [conditionValue, setConditionValue] = useState("");
  const [oneShot, setOneShot] = useState(false);

  const resolvedBreakpoints = useMemo(
    () =>
      breakpoints.map((entry) => ({
        ...entry,
        address: resolveAddress(entry.spec, symbols),
      })),
    [breakpoints, symbols],
  );

  const handleAdd = (): void => {
    if (!input.trim()) return;

    const hasCondition = conditionRegister.trim() && conditionValue.trim();
    const parsedValue = Number.parseInt(conditionValue, 10);
    const condition =
      hasCondition && !Number.isNaN(parsedValue)
        ? { kind: "registerEquals" as const, register: conditionRegister.trim(), value: parsedValue }
        : null;

    onAdd({
      spec: input.trim(),
      condition: condition ?? undefined,
      oneShot,
    });

    setInput("");
    setConditionRegister("");
    setConditionValue("");
    setOneShot(false);
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
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
          <strong style={{ color: "#e2e8f0" }}>Breakpoint Manager</strong>
          <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            Add addresses or labels; optional conditions mirror the legacy Venus Breakpoint Manager.
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
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
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <input
              value={conditionRegister}
              onChange={(event) => setConditionRegister(event.target.value)}
              placeholder="$t0"
              style={{
                backgroundColor: "#0b1220",
                color: "#e2e8f0",
                border: "1px solid #334155",
                borderRadius: "0.35rem",
                padding: "0.4rem 0.6rem",
                width: "6.5rem",
              }}
            />
            <span style={{ color: "#94a3b8" }}>=</span>
            <input
              type="number"
              value={conditionValue}
              onChange={(event) => setConditionValue(event.target.value)}
              placeholder="0"
              style={{
                backgroundColor: "#0b1220",
                color: "#e2e8f0",
                border: "1px solid #334155",
                borderRadius: "0.35rem",
                padding: "0.4rem 0.6rem",
                width: "6.5rem",
              }}
            />
            <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Optional condition</span>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#e2e8f0" }}>
            <input type="checkbox" checked={oneShot} onChange={(event) => setOneShot(event.target.checked)} />
            One-shot
          </label>

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
        {resolvedBreakpoints.map((breakpoint) => (
          <div
            key={breakpoint.id}
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
              <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{breakpoint.spec}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                <span style={{ color: breakpoint.address !== null ? "#38bdf8" : "#fca5a5", fontSize: "0.9rem" }}>
                  {breakpoint.address !== null ? `0x${breakpoint.address.toString(16)}` : "Unresolved"}
                </span>
                {breakpoint.condition && (
                <span style={{ color: "#facc15", fontSize: "0.9rem" }}>
                  {`Condition: $${breakpoint.condition.register} == ${breakpoint.condition.value}`}
                </span>
              )}
                {breakpoint.oneShot && (
                  <span
                    style={{
                      color: "#22c55e",
                      backgroundColor: "#052e16",
                      border: "1px solid #14532d",
                      borderRadius: "999px",
                      padding: "0.1rem 0.65rem",
                      fontSize: "0.8rem",
                    }}
                  >
                    One-shot
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRemove(breakpoint.id)}
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
