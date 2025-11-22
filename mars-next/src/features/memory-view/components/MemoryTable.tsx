import React from "react";

export interface MemoryTableProps {
  entries: Array<{ address: number; value: number }>;
}

function formatAddress(address: number): string {
  return `0x${(address >>> 0).toString(16).padStart(8, "0")}`;
}

function formatByte(value: number): string {
  return value.toString(16).padStart(2, "0");
}

export function MemoryTable({ entries }: MemoryTableProps): React.JSX.Element {
  const limited = entries.slice(0, 128);

  return (
    <div
      style={{
        backgroundColor: "#0b1220",
        border: "1px solid #1f2937",
        borderRadius: "0.5rem",
        padding: "1rem",
        color: "#e5e7eb",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "1rem" }}>Memory (first {limited.length} bytes)</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr", gap: "0.35rem" }}>
        {limited.map((entry) => (
          <React.Fragment key={entry.address}>
            <span style={{ color: "#9ca3af" }}>{formatAddress(entry.address)}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>0x{formatByte(entry.value)}</span>
          </React.Fragment>
        ))}
        {limited.length === 0 && <span style={{ color: "#9ca3af" }}>No data written yet.</span>}
      </div>
    </div>
  );
}
