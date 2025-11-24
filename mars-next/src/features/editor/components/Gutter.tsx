import React, { useMemo } from "react";
import { BreakpointMarker } from "../../breakpoints";

export interface GutterProps {
  lineCount: number;
  breakpoints?: number[];
  onToggleBreakpoint?: (line: number) => void;
}

export function Gutter({ lineCount, breakpoints, onToggleBreakpoint }: GutterProps): React.JSX.Element {
  const breakpointSet = useMemo(() => new Set(breakpoints ?? []), [breakpoints]);

  return (
    <div
      style={{
        backgroundColor: "#0b1020",
        border: "1px solid #1f2937",
        borderRadius: "0.5rem",
        padding: "0.75rem 0.5rem",
        color: "#6b7280",
        width: "5rem",
        userSelect: "none",
      }}
      aria-label="Editor gutter"
    >
      {Array.from({ length: lineCount }, (_, index) => {
        const lineNumber = index + 1;
        const hasBreakpoint = breakpointSet.has(lineNumber);
        return (
          <div
            key={lineNumber}
            style={{
              display: "grid",
              gridTemplateColumns: "1.5rem 1fr",
              alignItems: "center",
              gap: "0.25rem",
              lineHeight: 1.5,
            }}
          >
            <BreakpointMarker
              lineNumber={lineNumber}
              active={hasBreakpoint}
              onToggle={onToggleBreakpoint}
            />
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{lineNumber}</span>
          </div>
        );
      })}
    </div>
  );
}
