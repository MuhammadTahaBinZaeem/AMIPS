import React, { useEffect, useMemo, useRef, useState } from "react";
import { MachineState } from "../../../core";
import { MarsTool, type MarsToolComponentProps } from "../../../core/tools/MarsTool";
import { getLatestCpuState, subscribeToCpuState, type CpuStateSnapshot } from "./registerEvents";

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

const HIGHLIGHT_DURATION_MS = 1200;

export interface RegistersWindowProps {
  title?: string;
  onClose?: () => void;
}

function formatHex(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function createDefaultSnapshot(): CpuStateSnapshot {
  const state = new MachineState();
  return {
    registers: Array.from({ length: MachineState.REGISTER_COUNT }, (_, index) => state.getRegister(index)),
    hi: state.getHi(),
    lo: state.getLo(),
    pc: state.getProgramCounter(),
  };
}

export function RegistersWindow({ title = "Registers", onClose }: RegistersWindowProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<CpuStateSnapshot>(() => getLatestCpuState() ?? createDefaultSnapshot());
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToCpuState((nextState) => {
      setSnapshot((previous) => {
        const nextRegisters = Array.from({ length: MachineState.REGISTER_COUNT }, (_, index) => nextState.registers[index] ?? 0);
        const changes = new Set<string>();

        nextRegisters.forEach((value, index) => {
          if (value !== (previous.registers[index] ?? 0)) {
            changes.add(`r${index}`);
          }
        });

        if (nextState.hi !== previous.hi) changes.add("hi");
        if (nextState.lo !== previous.lo) changes.add("lo");
        if (nextState.pc !== previous.pc) changes.add("pc");

        setHighlighted((current) => {
          if (clearTimeoutRef.current) {
            clearTimeout(clearTimeoutRef.current);
          }

          if (changes.size === 0) {
            return current.size > 0 ? new Set<string>() : current;
          }

          clearTimeoutRef.current = setTimeout(() => setHighlighted(new Set()), HIGHLIGHT_DURATION_MS);
          return changes;
        });

        return {
          registers: nextRegisters,
          hi: nextState.hi,
          lo: nextState.lo,
          pc: nextState.pc,
        };
      });
    });

    return () => {
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
      }
      unsubscribe();
    };
  }, []);

  const registerRows = useMemo(
    () =>
      REGISTER_NAMES.map((name, index) => {
        const key = `r${index}`;
        return {
          key,
          name,
          number: index,
          value: snapshot.registers[index] ?? 0,
          highlighted: highlighted.has(key),
        };
      }),
    [highlighted, snapshot.registers],
  );

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>{title}</h2>
        {onClose ? (
          <button style={closeButtonStyle} onClick={onClose} aria-label="Close register viewer">
            Close
          </button>
        ) : null}
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.35rem 0.6rem" }}>
        {registerRows.map((row) => (
          <div key={row.key} style={{ ...cellStyle, ...(row.highlighted ? highlightedCellStyle : {}) }}>
            <div style={{ color: "#9ca3af", fontSize: "0.85rem" }}>
              {row.name}
              <span style={{ color: "#6b7280", marginLeft: "0.3rem" }}>({row.number})</span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{formatHex(row.value)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.5rem", marginTop: "0.75rem" }}>
        <LabeledValue label="HI" value={snapshot.hi} highlighted={highlighted.has("hi")} />
        <LabeledValue label="LO" value={snapshot.lo} highlighted={highlighted.has("lo")} />
        <LabeledValue label="PC" value={snapshot.pc} highlighted={highlighted.has("pc")} />
      </div>
    </div>
  );
}

export function RegistersToolWindow({ onClose }: MarsToolComponentProps): React.JSX.Element {
  return <RegistersWindow onClose={onClose} />;
}

export const RegistersTool: MarsTool = {
  id: "registers-viewer",
  name: "Registers Viewer",
  description: "Watch general purpose registers update in real time.",
  Component: RegistersToolWindow,
  run: () => {
    // Rendering handled by the host application.
  },
};

export default RegistersTool;

function LabeledValue({
  label,
  value,
  highlighted,
}: {
  label: string;
  value: number;
  highlighted: boolean;
}): React.JSX.Element {
  return (
    <div style={{ ...cellStyle, ...(highlighted ? highlightedCellStyle : {}) }}>
      <span style={{ color: "#9ca3af", fontSize: "0.85rem" }}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{formatHex(value)}</span>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  backgroundColor: "#0b1220",
  border: "1px solid #1f2937",
  borderRadius: "0.75rem",
  padding: "1rem",
  color: "#e5e7eb",
  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "0.75rem",
};

const cellStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0.55rem 0.65rem",
  backgroundColor: "#111827",
  borderRadius: "0.4rem",
  border: "1px solid #1f2937",
  transition: "background-color 150ms ease, border-color 150ms ease",
};

const highlightedCellStyle: React.CSSProperties = {
  backgroundColor: "#1f2937",
  borderColor: "#22c55e",
  boxShadow: "0 0 0 1px #22c55e inset",
};

const closeButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #374151",
  color: "#9ca3af",
  borderRadius: "0.375rem",
  padding: "0.35rem 0.6rem",
  cursor: "pointer",
};

