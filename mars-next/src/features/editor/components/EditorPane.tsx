import React, { useMemo } from "react";
import { BreakpointSpec, WatchSpec } from "../../breakpoints";
import { EditorView } from "./EditorView";

interface EditorPaneProps {
  source: string;
  status: string;
  onChange: (value: string) => void;
  breakpoints: number[];
  managedBreakpoints: BreakpointSpec[];
  watches: WatchSpec[];
  watchValues: Record<string, number | undefined>;
  symbols?: Record<string, number>;
  activeLine?: number | null;
  activeFile?: string | null;
  onToggleBreakpoint?: (line: number) => void;
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

function renderWatchIdentifier(spec: WatchSpec, symbols?: Record<string, number>): string {
  if (spec.kind === "register" || spec.kind === "expression") return spec.identifier;
  if (symbols && spec.identifier in symbols) return `${spec.identifier} (0x${symbols[spec.identifier].toString(16)})`;
  return spec.identifier;
}

export function EditorPane({
  source,
  status,
  onChange,
  breakpoints,
  managedBreakpoints,
  watches,
  watchValues,
  symbols,
  activeLine,
  activeFile,
  onToggleBreakpoint,
}: EditorPaneProps): React.JSX.Element {
  const resolvedBreakpoints = useMemo(
    () =>
      managedBreakpoints.map((entry) => ({
        ...entry,
        address: resolveAddress(entry.spec, symbols),
      })),
    [managedBreakpoints, symbols],
  );

  const renderedWatches = useMemo(
    () =>
      watches.map((watch) => ({
        ...watch,
        key: `${watch.kind}:${watch.identifier}`,
        display: renderWatchIdentifier(watch, symbols),
        value: watchValues[`${watch.kind}:${watch.identifier}`],
      })),
    [symbols, watchValues, watches],
  );

  return (
    <div
      style={{
        border: "1px solid #1f2937",
        borderRadius: "0.75rem",
        backgroundColor: "#0f172a",
        overflow: "hidden",
        boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.65rem 1rem",
          borderBottom: "1px solid #1f2937",
          background: "linear-gradient(90deg, #111827, #0b1220)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <div style={{ color: "#e2e8f0", fontWeight: 700 }}>Editor Pane</div>
          <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>{status}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "#cbd5e1", fontSize: "0.9rem" }}>
          <span style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: "999px", backgroundColor: "#22c55e" }} />
            Breakpoints: {breakpoints.length + resolvedBreakpoints.length}
          </span>
          <span style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: "999px", backgroundColor: "#38bdf8" }} />
            Watches: {watches.length}
          </span>
          {activeLine !== null && activeLine !== undefined && (
            <span style={{ color: "#a5b4fc" }}>
              {activeFile ?? "<input>"}:{activeLine}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(320px, 1fr)", gap: "1px" }}>
        <div style={{ padding: "1rem" }}>
          <EditorView
            value={source}
            onChange={onChange}
            breakpoints={breakpoints}
            onToggleBreakpoint={onToggleBreakpoint}
            activeLine={activeLine ?? undefined}
          />
        </div>

        <aside
          style={{
            borderLeft: "1px solid #1f2937",
            backgroundColor: "#0b1220",
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <div style={{ color: "#e2e8f0", fontWeight: 700 }}>Breakpoint Manager</div>
            <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
              Legacy-inspired list combining editor and address breakpoints.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {breakpoints.map((line) => (
                <span key={`editor:${line}`} style={{ color: "#38bdf8", fontSize: "0.9rem" }}>
                  Source line {line + 1}
                </span>
              ))}
              {resolvedBreakpoints.map((entry) => (
                <span key={entry.id} style={{ color: entry.address !== null ? "#f8fafc" : "#fca5a5", fontSize: "0.9rem" }}>
                  {entry.spec} → {entry.address !== null ? `0x${entry.address.toString(16)}` : "Unresolved"}
                </span>
              ))}
              {breakpoints.length === 0 && resolvedBreakpoints.length === 0 && (
                <span style={{ color: "#64748b", fontSize: "0.9rem" }}>No breakpoints configured.</span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <div style={{ color: "#e2e8f0", fontWeight: 700 }}>Watch window</div>
            <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
              Expressions resolve against registers, labels, and live memory.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {renderedWatches.map((watch) => (
                <div
                  key={watch.key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.35rem 0.6rem",
                    border: "1px solid #1f2937",
                    borderRadius: "0.4rem",
                    backgroundColor: "#0f172a",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                    <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{watch.display}</span>
                    <span style={{ color: "#38bdf8", fontSize: "0.9rem" }}>
                      {watch.value !== undefined ? watch.value : "No data yet"}
                    </span>
                  </div>
                  <span
                    style={{
                      color: "#94a3b8",
                      fontSize: "0.85rem",
                      textTransform: "capitalize",
                    }}
                  >
                    {watch.kind}
                  </span>
                </div>
              ))}
              {renderedWatches.length === 0 && (
                <span style={{ color: "#64748b", fontSize: "0.9rem" }}>No watches configured.</span>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
