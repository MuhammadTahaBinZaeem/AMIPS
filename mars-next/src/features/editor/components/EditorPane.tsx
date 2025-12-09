import React, { useEffect, useMemo } from "react";
import { BreakpointSpec, WatchSpec } from "../../breakpoints";
import { getWatchKey } from "../../breakpoints/services/watchKey";
import { EditorView } from "./EditorView";
import { UndoManager } from "../undoRedo/UndoManager";

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
  const undoManager = useMemo(() => new UndoManager(), []);

  useEffect(() => {
    if (undoManager.peek() !== source) {
      undoManager.registerChange(source);
    }
  }, [source, undoManager]);

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
        key: getWatchKey(watch, symbols),
        display: renderWatchIdentifier(watch, symbols),
        value: watchValues[getWatchKey(watch, symbols)],
      })),
    [symbols, watchValues, watches],
  );

  return (
    <div className="amips-card">
      <div className="amips-card__header">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <div className="amips-card__title">Editor Pane</div>
          <div className="amips-card__meta">{status}</div>
        </div>
        <div className="amips-toolbar" style={{ color: "var(--color-text)", fontSize: "0.9rem" }}>
          <span className="amips-badge">
            <span style={{ width: 8, height: 8, borderRadius: "999px", backgroundColor: "var(--color-success)" }} />
            Breakpoints: {breakpoints.length + resolvedBreakpoints.length}
          </span>
          <span className="amips-badge">
            <span style={{ width: 8, height: 8, borderRadius: "999px", backgroundColor: "var(--color-highlight)" }} />
            Watches: {watches.length}
          </span>
          {activeLine !== null && activeLine !== undefined && (
            <span className="amips-badge" style={{ color: "var(--color-accent)" }}>
              {activeFile ?? "<input>"}:{activeLine}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(320px, 1fr)", gap: "1px" }}>
        <div style={{ padding: "1rem", background: "var(--color-surface)" }}>
          <EditorView
            value={source}
            onChange={onChange}
            undoManager={undoManager}
            breakpoints={breakpoints}
            onToggleBreakpoint={onToggleBreakpoint}
            activeLine={activeLine ?? undefined}
          />
        </div>

        <aside className="amips-side-panel">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <div className="amips-card__title">Breakpoint Manager</div>
            <div className="amips-card__meta">Legacy-inspired list combining editor and address breakpoints.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {breakpoints.map((line) => (
                <span key={`editor:${line}`} className="amips-card__meta" style={{ color: "var(--color-highlight)" }}>
                  Source line {line}
                </span>
              ))}
              {resolvedBreakpoints.map((entry) => (
                <span
                  key={entry.id}
                  className="amips-card__meta"
                  style={{ color: entry.address !== null ? "var(--color-text)" : "var(--color-danger)" }}
                >
                  {entry.spec} → {entry.address !== null ? `0x${entry.address.toString(16)}` : "Unresolved"}
                </span>
              ))}
              {breakpoints.length === 0 && resolvedBreakpoints.length === 0 && (
                <span className="amips-card__meta">No breakpoints configured.</span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <div className="amips-card__title">Watch window</div>
            <div className="amips-card__meta">Expressions resolve against registers, labels, and live memory.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {renderedWatches.map((watch) => (
                <div key={watch.key} className="amips-list-tile">
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                    <span className="amips-card__title" style={{ fontSize: "0.95rem" }}>
                      {watch.display}
                    </span>
                    <span style={{ color: "var(--color-highlight)", fontSize: "0.9rem" }}>
                      {watch.value !== undefined ? watch.value : "No data yet"}
                    </span>
                  </div>
                  <span className="amips-card__meta" style={{ textTransform: "capitalize" }}>
                    {watch.kind}
                  </span>
                </div>
              ))}
              {renderedWatches.length === 0 && <span className="amips-card__meta">No watches configured.</span>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
