import React from "react";

export interface RegisterTableProps {
  registers: number[];
  hi: number;
  lo: number;
  pc: number;
}

const REGISTER_NAMES = [
  "$zero",
  "$at",
  "$v0",
  "$v1",
  "$a0",
  "$a1",
  "$a2",
  "$a3",
  "$t0",
  "$t1",
  "$t2",
  "$t3",
  "$t4",
  "$t5",
  "$t6",
  "$t7",
  "$s0",
  "$s1",
  "$s2",
  "$s3",
  "$s4",
  "$s5",
  "$s6",
  "$s7",
  "$t8",
  "$t9",
  "$k0",
  "$k1",
  "$gp",
  "$sp",
  "$fp",
  "$ra",
];

function formatHex(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

export function RegisterTable({ registers, hi, lo, pc }: RegisterTableProps): React.JSX.Element {
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
      <h2 style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "1rem" }}>Registers</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem 1rem" }}>
        {REGISTER_NAMES.map((name, index) => (
          <div
            key={name}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "0.4rem 0.5rem",
              backgroundColor: "#111827",
              borderRadius: "0.375rem",
              border: "1px solid #1f2937",
            }}
          >
            <span style={{ color: "#9ca3af" }}>{name}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatHex(registers[index] ?? 0)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.5rem", marginTop: "0.75rem" }}>
        <LabeledValue label="HI" value={hi} />
        <LabeledValue label="LO" value={lo} />
        <LabeledValue label="PC" value={pc} />
      </div>
    </div>
  );
}

function LabeledValue({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "0.5rem 0.6rem",
        backgroundColor: "#111827",
        borderRadius: "0.375rem",
        border: "1px solid #1f2937",
      }}
    >
      <span style={{ color: "#9ca3af" }}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatHex(value)}</span>
    </div>
  );
}
