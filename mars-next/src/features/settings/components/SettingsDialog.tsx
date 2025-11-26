import React, { useState } from "react";
import { PseudoOpsEditor } from "./PseudoOpsEditor";

export interface SettingsDialogProps {
  enablePseudoInstructions: boolean;
  onTogglePseudoInstructions: (enabled: boolean) => void;
  onReloadPseudoOps: () => void;
}

export function SettingsDialog({
  enablePseudoInstructions,
  onTogglePseudoInstructions,
  onReloadPseudoOps,
}: SettingsDialogProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<"general" | "pseudoOps">("general");

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
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", justifyContent: "space-between" }}>
        <strong style={{ color: "#e2e8f0" }}>Settings</strong>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => setActiveTab("general")}
            style={{
              background: activeTab === "general" ? "#111827" : "transparent",
              color: "#e5e7eb",
              border: "1px solid #1f2937",
              borderRadius: "0.375rem",
              padding: "0.35rem 0.75rem",
              cursor: "pointer",
            }}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab("pseudoOps")}
            style={{
              background: activeTab === "pseudoOps" ? "#111827" : "transparent",
              color: "#e5e7eb",
              border: "1px solid #1f2937",
              borderRadius: "0.375rem",
              padding: "0.35rem 0.75rem",
              cursor: "pointer",
            }}
          >
            Pseudo-ops
          </button>
        </div>
      </div>

      {activeTab === "general" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.95rem" }}>
            <input
              type="checkbox"
              checked={enablePseudoInstructions}
              onChange={(event) => onTogglePseudoInstructions(event.target.checked)}
            />
            <span style={{ color: "#e5e7eb" }}>Allow pseudo-instructions</span>
          </label>
          <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            Disable this to mirror MARS&apos;s &ldquo;allow pseudo-instructions&rdquo; checkbox and surface errors instead of
            automatic expansion.
          </span>
          <button
            onClick={onReloadPseudoOps}
            style={{
              alignSelf: "flex-start",
              background: "linear-gradient(135deg, #38bdf8, #0ea5e9)",
              color: "#0b1726",
              border: "none",
              borderRadius: "0.375rem",
              padding: "0.45rem 0.9rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload Pseudo-Ops
          </button>
          <span style={{ color: "#9ca3af", fontSize: "0.9rem" }}>
            Re-read PseudoOps.txt or PseudoOps.json overrides without restarting MARS Next.
          </span>
        </div>
      )}

      {activeTab === "pseudoOps" && <PseudoOpsEditor onSaved={onReloadPseudoOps} />}
    </div>
  );
}
