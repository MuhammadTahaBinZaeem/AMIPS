import React from "react";
import { disassembleInstruction } from "../../../core/debugger/Disassembler";
import { BinaryImage, DEFAULT_TEXT_BASE } from "../../../core";

export interface BreakpointListProps {
  breakpoints: number[];
  program?: BinaryImage | null;
  onRemove?: (line: number) => void;
}

export function BreakpointList({ breakpoints, program, onRemove }: BreakpointListProps): React.JSX.Element {
  if (breakpoints.length === 0) {
    return (
      <div
        style={{
          border: "1px dashed #374151",
          padding: "0.75rem",
          borderRadius: "0.5rem",
          color: "#9ca3af",
        }}
      >
        No breakpoints set. Click the gutter to add one.
      </div>
    );
  }

  const entries = breakpoints.map((lineNumber) => {
    const location = program?.sourceMap.find(
      (entry) => entry.segment === "text" && entry.line === lineNumber,
    );
    const instructionIndex = location?.segmentIndex ?? lineNumber - 1;
    const machineWord = program?.text?.[instructionIndex];
    const programCounter = location?.address ?? (program?.textBase ?? DEFAULT_TEXT_BASE) + instructionIndex * 4;
    const disassembled =
      machineWord !== undefined ? disassembleInstruction(machineWord, programCounter) : null;

    return {
      lineNumber,
      instructionIndex,
      machineWord,
      programCounter,
      disassembled,
      file: location?.file ?? "<input>",
    };
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      {entries.map(({ lineNumber, machineWord, programCounter, disassembled, file }) => (
        <div
          key={lineNumber}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "center",
            padding: "0.75rem 1rem",
            backgroundColor: "#0f172a",
            border: "1px solid #1f2937",
            borderRadius: "0.5rem",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, color: "#e5e7eb" }}>
              Line {lineNumber}
              <span style={{ color: "#94a3b8", marginLeft: "0.5rem", fontWeight: 500 }}>({file})</span>
            </div>
            {machineWord !== undefined ? (
              <div style={{ color: "#9ca3af", marginTop: "0.25rem" }}>
                <code style={{ color: "#c084fc" }}>0x{programCounter.toString(16).padStart(8, "0")}</code>
                {" · "}
                <code style={{ color: "#fcd34d" }}>0x{machineWord.toString(16).padStart(8, "0")}</code>
                {disassembled && (
                  <>
                    {" · "}
                    <span style={{ color: "#34d399" }}>{disassembled.assembly}</span>
                  </>
                )}
              </div>
            ) : (
              <div style={{ color: "#9ca3af", marginTop: "0.25rem" }}>No assembled instruction for this line.</div>
            )}
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(lineNumber)}
              style={{
                backgroundColor: "#1f2937",
                color: "#e5e7eb",
                border: "1px solid #374151",
                borderRadius: "0.375rem",
                padding: "0.35rem 0.75rem",
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
