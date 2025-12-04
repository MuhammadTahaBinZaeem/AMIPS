import React, { useEffect, useMemo, useState } from "react";
import { KeyboardDevice } from "../../../core";
import { MarsTool, type MarsToolComponentProps } from "../../../core/tools/MarsTool";

interface QueueSnapshot {
  down: number[];
  up: number[];
}

const TEST_KEYS: Array<{ label: string; value: number }> = [
  { label: "A", value: "A".codePointAt(0) ?? 0x41 },
  { label: "B", value: "B".codePointAt(0) ?? 0x42 },
  { label: "0", value: "0".codePointAt(0) ?? 0x30 },
  { label: "1", value: "1".codePointAt(0) ?? 0x31 },
  { label: "Space", value: " ".codePointAt(0) ?? 0x20 },
  { label: "Enter", value: "\n".codePointAt(0) ?? 0x0a },
  { label: "Backspace", value: "\b".codePointAt(0) ?? 0x08 },
];

function formatKeycode(value: number): string {
  return `0x${(value & 0xff).toString(16).padStart(2, "0")}`;
}

export function KeyboardWindow({ appContext, onClose }: MarsToolComponentProps): React.JSX.Element {
  const device = (appContext.keyboardDevice as KeyboardDevice | null | undefined) ?? null;
  const [snapshot, setSnapshot] = useState<QueueSnapshot>({ down: [], up: [] });

  useEffect(() => {
    if (!device) return undefined;

    const updateSnapshot = (): void => {
      setSnapshot(device.getQueueState());
    };

    updateSnapshot();
    const handle = setInterval(updateSnapshot, 250);
    return () => clearInterval(handle);
  }, [device]);

  const renderQueue = useMemo(
    () =>
      (label: string, values: number[]) => (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{label}</strong>
            <span style={{ color: "#9ca3af", fontSize: "0.9rem" }}>
              {values.length} byte{values.length === 1 ? "" : "s"} buffered
            </span>
          </div>
          {values.length === 0 ? (
            <div style={emptyStateStyle}>Queue is empty.</div>
          ) : (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {values.map((value, index) => (
                <span
                  key={`${label}-${index}-${value}`}
                  style={{
                    padding: "0.35rem 0.65rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #1f2937",
                    backgroundColor: "#0f172a",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 600,
                  }}
                >
                  {formatKeycode(value)}
                </span>
              ))}
            </div>
          )}
        </div>
      ),
    [],
  );

  return (
    <div style={overlayStyle}>
      <div style={windowStyle}>
        <header style={headerStyle}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <h2 style={{ margin: 0 }}>Keyboard Input</h2>
            <span style={{ color: "#9ca3af", fontSize: "0.9rem" }}>
              View pending 2-byte keycodes and simulate input
            </span>
          </div>
          <button style={closeButtonStyle} onClick={onClose} aria-label="Close keyboard viewer">
            Close
          </button>
        </header>

        {device ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <section style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                <strong>Pending keycodes</strong>
              </div>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {renderQueue("Key-down queue", snapshot.down)}
                {renderQueue("Key-up queue", snapshot.up)}
              </div>
            </section>

            <section style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                <strong>Simulate key presses</strong>
                <span style={{ color: "#9ca3af", fontSize: "0.9rem" }}>
                  Queue characters without using the terminal
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {TEST_KEYS.map((key) => (
                  <button
                    key={key.label}
                    style={simulateButtonStyle}
                    onClick={() => device.queueInput(key.value)}
                  >
                    {key.label}
                    <span style={{ display: "block", color: "#9ca3af", fontSize: "0.8rem" }}>
                      {formatKeycode(key.value)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div style={emptyStateStyle}>Keyboard device is not available. Run a program to initialize it.</div>
        )}
      </div>
    </div>
  );
}

export const KeyboardTool: MarsTool = {
  id: "keyboard-viewer",
  name: "Keyboard Input",
  description: "Inspect and simulate keyboard device input.",
  Component: KeyboardWindow,
  isAvailable: (context) => Boolean(context.keyboardDevice),
  run: () => {
    // Rendering handled externally.
  },
};

export default KeyboardTool;

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
  zIndex: 20,
};

const windowStyle: React.CSSProperties = {
  backgroundColor: "#0f172a",
  border: "1px solid #1f2937",
  borderRadius: "0.75rem",
  padding: "1rem",
  minWidth: "380px",
  maxWidth: "min(90vw, 720px)",
  boxShadow: "0 25px 60px rgba(0, 0, 0, 0.4)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderBottom: "1px solid #1f2937",
  paddingBottom: "0.75rem",
  marginBottom: "0.75rem",
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const emptyStateStyle: React.CSSProperties = {
  border: "1px dashed #1f2937",
  borderRadius: "0.5rem",
  padding: "0.75rem 1rem",
  color: "#9ca3af",
};

const closeButtonStyle: React.CSSProperties = {
  border: "1px solid #374151",
  backgroundColor: "#1f2937",
  color: "#e5e7eb",
  borderRadius: "0.5rem",
  padding: "0.35rem 0.75rem",
  cursor: "pointer",
};

const simulateButtonStyle: React.CSSProperties = {
  backgroundColor: "#111827",
  color: "#e5e7eb",
  border: "1px solid #1f2937",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  cursor: "pointer",
  minWidth: "90px",
  textAlign: "left",
};
