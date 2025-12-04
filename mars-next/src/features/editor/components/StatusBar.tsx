import React from "react";

export interface StatusBarProps {
  activeFile?: string | null;
  workingDirectory?: string | null;
  dirty?: boolean;
}

export function StatusBar({ activeFile, workingDirectory, dirty }: StatusBarProps): React.JSX.Element {
  const fileLabel = activeFile ?? "<untitled>";
  const location = workingDirectory ? `${workingDirectory}` : "No workspace";

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
      <span>
        {dirty ? "● " : ""}
        {fileLabel}
      </span>
      <span style={{ color: "#94a3b8" }}>{location}</span>
    </div>
  );
}
