import React from "react";

export interface SettingsDialogProps {
  enablePseudoInstructions: boolean;
  onTogglePseudoInstructions: (enabled: boolean) => void;
}

export function SettingsDialog({
  enablePseudoInstructions,
  onTogglePseudoInstructions,
}: SettingsDialogProps): React.JSX.Element {
  return (
    <div
      style={{
        padding: "0.75rem 1rem",
        border: "1px solid #1f2937",
        borderRadius: "0.5rem",
        backgroundColor: "#0f172a",
        color: "#e5e7eb",
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "space-between" }}>
        <strong style={{ color: "#e2e8f0" }}>Settings</strong>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.95rem" }}>
          <input
            type="checkbox"
            checked={enablePseudoInstructions}
            onChange={(event) => onTogglePseudoInstructions(event.target.checked)}
          />
          <span style={{ color: "#e5e7eb" }}>Allow pseudo-instructions</span>
        </label>
      </div>
      <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
        Disable this to mirror MARS&apos;s &ldquo;allow pseudo-instructions&rdquo; checkbox and surface errors instead of automatic
        expansion.
      </span>
    </div>
  );
}
