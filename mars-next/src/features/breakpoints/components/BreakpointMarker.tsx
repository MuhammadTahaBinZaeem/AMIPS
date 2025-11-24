import React from "react";

export interface BreakpointMarkerProps {
  lineNumber: number;
  active?: boolean;
  onToggle?: (line: number) => void;
}

export function BreakpointMarker({ lineNumber, active, onToggle }: BreakpointMarkerProps): React.JSX.Element {
  const toggle = (): void => {
    onToggle?.(lineNumber);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={active ? `Remove breakpoint on line ${lineNumber}` : `Add breakpoint on line ${lineNumber}`}
      style={{
        width: "1.25rem",
        height: "1.25rem",
        borderRadius: "9999px",
        border: active ? "2px solid #34d399" : "2px solid #374151",
        backgroundColor: active ? "#065f46" : "transparent",
        cursor: "pointer",
        padding: 0,
      }}
    />
  );
}
