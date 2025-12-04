import React, { useMemo } from "react";
import {
  HelpAction,
  HelpState,
  HelpTopic,
  PseudoInstructionHelp,
  SyscallHelp,
  MacroHelp,
  DirectiveHelp,
  InstructionHelp,
  ShortcutHelp,
  filterEntries,
  findEntry,
  getEntriesByTopic,
} from "../state/helpSlice";
import { ShortcutCheatsheet } from "./ShortcutCheatsheet";

interface HelpSidebarProps {
  state: HelpState;
  dispatch: React.Dispatch<HelpAction>;
  isOpen: boolean;
  onClose: () => void;
}

const topicLabels: Record<HelpTopic, string> = {
  instructions: "Instructions",
  pseudoinstructions: "Pseudoinstructions",
  directives: "Directives",
  syscalls: "Syscalls",
  macros: "Macros",
  shortcuts: "Shortcuts",
};

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const pattern = new RegExp(`(${query.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")})`, "ig");
  const parts = text.split(pattern);
  return parts.map((part, index) =>
    pattern.test(part) ? (
      <mark key={`${part}-${index}`} style={{ backgroundColor: "#fbbf24", color: "#1f2937" }}>
        {part}
      </mark>
    ) : (
      <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
    ),
  );
}

function renderInstruction(entry: InstructionHelp | PseudoInstructionHelp): React.ReactNode {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", color: "#9ca3af" }}>
        <span>Format: {entry.format}</span>
        {entry.operandLayout && <span>Operands: {entry.operandLayout}</span>}
      </div>
      {"templates" in entry && entry.templates.length > 0 && (
        <div style={{ marginTop: "0.25rem" }}>
          <strong>Expands to:</strong>
          <ul style={{ margin: "0.25rem 0 0.25rem 1rem" }}>
            {entry.templates.map((template) => (
              <li key={template} style={{ color: "#cbd5e1" }}>
                <code>{template}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {entry.description && <p style={{ margin: 0, color: "#e2e8f0" }}>{entry.description}</p>}
    </div>
  );
}

function renderSyscall(entry: SyscallHelp): React.ReactNode {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <span style={{ color: "#9ca3af" }}>Code: {entry.code}</span>
        <span style={{ color: "#cbd5e1" }}>Arguments: {entry.arguments}</span>
        <span style={{ color: "#cbd5e1" }}>Result: {entry.result || "—"}</span>
      </div>
    </div>
  );
}

function renderMacro(entry: MacroHelp): React.ReactNode {
  return <p style={{ margin: 0, color: "#e2e8f0" }}>{entry.meaning}</p>;
}

function renderDirective(entry: DirectiveHelp): React.ReactNode {
  return <p style={{ margin: 0, color: "#e2e8f0" }}>{entry.description}</p>;
}

function renderShortcut(entry: ShortcutHelp): React.ReactNode {
  return (
    <div style={{ color: "#e2e8f0" }}>
      <strong>{entry.action}</strong>
      <div style={{ color: "#cbd5e1" }}>{entry.keys}</div>
    </div>
  );
}

export function HelpSidebar({ state, dispatch, isOpen, onClose }: HelpSidebarProps): React.JSX.Element | null {
  const entriesForTopic = useMemo(
    () => filterEntries(getEntriesByTopic(state, state.selected.topic), state.searchQuery),
    [state],
  );

  const selectedEntry = useMemo(() => findEntry(state, state.selected), [state]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.45)",
        zIndex: 50,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          width: "min(920px, 100%)",
          height: "100%",
          backgroundColor: "#0b1220",
          color: "#e5e7eb",
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid #1f2937",
          boxShadow: "-4px 0 12px rgba(0,0,0,0.25)",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.75rem 1rem",
            borderBottom: "1px solid #1f2937",
          }}
        >
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Help &amp; Documentation</h2>
            <input
              type="search"
              placeholder="Search instructions, syscalls, macros..."
              value={state.searchQuery}
              onChange={(event) => dispatch({ type: "search", query: event.target.value })}
              style={{
                backgroundColor: "#111827",
                border: "1px solid #1f2937",
                borderRadius: "0.4rem",
                padding: "0.35rem 0.5rem",
                color: "#e5e7eb",
                minWidth: "260px",
              }}
            />
          </div>
          <button
            onClick={onClose}
            style={{
              backgroundColor: "transparent",
              border: "1px solid #374151",
              color: "#e5e7eb",
              borderRadius: "0.4rem",
              padding: "0.35rem 0.65rem",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", flex: 1, minHeight: 0 }}>
          <aside
            style={{
              borderRight: "1px solid #1f2937",
              padding: "0.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              overflowY: "auto",
            }}
          >
            <nav style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {Object.entries(topicLabels).map(([topic, label]) => {
                const currentTopic = topic as HelpTopic;
                const active = state.selected.topic === currentTopic;
                return (
                  <button
                    key={currentTopic}
                    onClick={() => dispatch({ type: "setTopic", topic: currentTopic })}
                    style={{
                      textAlign: "left",
                      padding: "0.45rem 0.55rem",
                      borderRadius: "0.4rem",
                      border: "1px solid #1f2937",
                      backgroundColor: active ? "#1f2937" : "#0f172a",
                      color: active ? "#e2e8f0" : "#cbd5e1",
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </nav>

            <div style={{ height: 1, backgroundColor: "#1f2937", margin: "0.5rem 0" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              <strong style={{ color: "#e2e8f0" }}>Entries</strong>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                {entriesForTopic.map((entry) => {
                  const name = "symbol" in entry ? (entry as MacroHelp).symbol : (entry as InstructionHelp).name;
                  const isSelected = state.selected.name === name;
                  return (
                    <button
                      key={name}
                      onClick={() => dispatch({ type: "select", topic: state.selected.topic, name })}
                      style={{
                        textAlign: "left",
                        padding: "0.35rem 0.5rem",
                        borderRadius: "0.35rem",
                        border: "1px solid #1f2937",
                        backgroundColor: isSelected ? "#1f2937" : "transparent",
                        color: "#cbd5e1",
                        cursor: "pointer",
                      }}
                    >
                      {highlight(name, state.searchQuery)}
                    </button>
                  );
                })}
                {entriesForTopic.length === 0 && (
                  <span style={{ color: "#9ca3af" }}>No results match this search.</span>
                )}
              </div>
            </div>
          </aside>

          <section style={{ padding: "1rem", overflowY: "auto" }}>
            {!selectedEntry && <p style={{ color: "#94a3b8" }}>Select an entry to see more details.</p>}
            {selectedEntry && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div>
                  <h3 style={{ margin: "0 0 0.35rem" }}>
                    {"symbol" in selectedEntry ? (selectedEntry as MacroHelp).symbol : (selectedEntry as InstructionHelp).name}
                  </h3>
                  {"description" in selectedEntry && (selectedEntry as InstructionHelp).description &&
                    state.selected.topic !== "macros" && state.selected.topic !== "syscalls" &&
                    state.selected.topic !== "shortcuts" && (
                      <p style={{ margin: 0, color: "#cbd5e1" }}>{
                        (selectedEntry as InstructionHelp | PseudoInstructionHelp | DirectiveHelp).description
                      }</p>
                    )}
                </div>

                {state.selected.topic === "instructions" || state.selected.topic === "pseudoinstructions"
                  ? renderInstruction(selectedEntry as InstructionHelp | PseudoInstructionHelp)
                  : null}
                {state.selected.topic === "directives" && renderDirective(selectedEntry as DirectiveHelp)}
                {state.selected.topic === "syscalls" && renderSyscall(selectedEntry as SyscallHelp)}
                {state.selected.topic === "macros" && renderMacro(selectedEntry as MacroHelp)}
                {state.selected.topic === "shortcuts" && (
                  <ShortcutCheatsheet shortcuts={state.shortcuts} focus={selectedEntry as ShortcutHelp} />
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
