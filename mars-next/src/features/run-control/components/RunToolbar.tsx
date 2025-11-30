import React from "react";

export interface RunToolbarProps {
  onRun: () => void;
  status?: string;
  onFlushInstructionCache?: () => void;
  flushEnabled?: boolean;
}

export function RunToolbar({ onRun, status, onFlushInstructionCache, flushEnabled = true }: RunToolbarProps): React.JSX.Element {
  const flushAvailable = Boolean(onFlushInstructionCache);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        padding: "0.75rem 1rem",
        backgroundColor: "#111827",
        border: "1px solid #1f2937",
        borderRadius: "0.5rem",
      }}
    >
      <button
        onClick={onRun}
        style={{
          background: "linear-gradient(135deg, #22c55e, #16a34a)",
          color: "#0b1726",
          border: "none",
          borderRadius: "0.375rem",
          padding: "0.65rem 1.1rem",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Assemble &amp; Run
      </button>
      <button
        onClick={onFlushInstructionCache}
        disabled={!flushAvailable || !flushEnabled}
        style={{
          backgroundColor: "#1f2937",
          color: "#e5e7eb",
          border: "1px solid #374151",
          borderRadius: "0.375rem",
          padding: "0.6rem 0.95rem",
          fontWeight: 600,
          cursor: flushAvailable && flushEnabled ? "pointer" : "not-allowed",
          opacity: flushAvailable && flushEnabled ? 1 : 0.6,
        }}
      >
        Flush Instruction Cache
      </button>
      <span style={{ color: "#9ca3af", fontSize: "0.95rem" }}>{status ?? ""}</span>
    </div>
  );
}
