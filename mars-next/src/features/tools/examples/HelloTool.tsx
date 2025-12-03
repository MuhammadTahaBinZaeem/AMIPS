import React from "react";
import type { MarsTool, MarsToolComponentProps } from "../../../core/tools/MarsTool";

function HelloToolWindow({ onClose }: MarsToolComponentProps): React.JSX.Element {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
      }}
    >
      <div
        style={{
          background: "#0f172a",
          color: "#e5e7eb",
          padding: "1.25rem",
          borderRadius: "0.75rem",
          border: "1px solid #1f2937",
          minWidth: "240px",
          textAlign: "center",
          boxShadow: "0 15px 45px rgba(0,0,0,0.35)",
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Hello from a plug-in tool!</h3>
        <p style={{ marginTop: 0, color: "#cbd5e1" }}>
          This tool was loaded dynamically from the tools folder.
        </p>
        <button
          style={{
            marginTop: "0.5rem",
            background: "#1f2937",
            color: "#e5e7eb",
            border: "1px solid #374151",
            borderRadius: "0.5rem",
            padding: "0.35rem 0.75rem",
            cursor: "pointer",
          }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

const HelloTool: MarsTool = {
  id: "hello-tool",
  name: "Hello Tool",
  description: "A minimal example tool used to verify dynamic loading.",
  Component: HelloToolWindow,
  run: () => {
    // The UI is presented by the host application when Component is set.
  },
};

export default HelloTool;
