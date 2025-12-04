import React from "react";
import { ShortcutHelp } from "../state/helpSlice";

interface ShortcutCheatsheetProps {
  shortcuts: ShortcutHelp[];
  focus?: ShortcutHelp;
}

export function ShortcutCheatsheet({ shortcuts, focus }: ShortcutCheatsheetProps): React.JSX.Element {
  const current = focus ?? shortcuts[0];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <p style={{ margin: 0, color: "#cbd5e1" }}>
        Keyboard shortcuts speed up editing and execution. Click a shortcut on the left to jump here, or keep this
        list handy while you work.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.action}
            style={{
              padding: "0.5rem 0.75rem",
              border: `1px solid ${current?.action === shortcut.action ? "#6366f1" : "#1f2937"}`,
              borderRadius: "0.5rem",
              backgroundColor: current?.action === shortcut.action ? "#111827" : "#0f172a",
            }}
          >
            <div style={{ fontWeight: 600, color: "#e2e8f0" }}>{shortcut.action}</div>
            <div style={{ color: "#cbd5e1" }}>{shortcut.keys}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
