import React from "react";

export interface StatusBarProps {
  activeFile?: string | null;
  workingDirectory?: string | null;
  dirty?: boolean;
  connection?: { label: string; ok: boolean };
}

export function StatusBar({ activeFile, workingDirectory, dirty, connection }: StatusBarProps): React.JSX.Element {
  const fileLabel = activeFile ?? "<untitled>";
  const location = workingDirectory ? `${workingDirectory}` : "No workspace";
  const indicatorColor = connection?.ok ? "#22c55e" : "#f87171";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.5rem 0.75rem",
        background: "#0b1220",
        borderTop: "1px solid #1f2937",
        color: "#cbd5e1",
        fontSize: "0.9rem",
      }}
    >
      <span style={{ display: "flex", gap: "0.9rem", alignItems: "center" }}>
        <span>
          {dirty ? "● " : ""}
          {fileLabel}
        </span>
        {connection && (
          <span style={{ color: connection.ok ? "#a5f3fc" : "#fca5a5", display: "inline-flex", gap: "0.4rem" }}>
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: "0.55rem",
                height: "0.55rem",
                borderRadius: "999px",
                background: indicatorColor,
                boxShadow: connection.ok ? "0 0 10px rgba(34,197,94,0.35)" : "0 0 10px rgba(248,113,113,0.45)",
              }}
            />
            {connection.label}
          </span>
        )}
      </span>
      <span style={{ color: "#94a3b8" }}>{location}</span>
    </div>
  );
}
