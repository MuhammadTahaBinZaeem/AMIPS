import React, { useState } from "react";
import { PipelineSettings } from "../pipeline";
import { PseudoOpsEditor } from "./PseudoOpsEditor";

export interface SettingsDialogProps {
  enablePseudoInstructions: boolean;
  assembleAllFiles: boolean;
  delayedBranching: boolean;
  compactMemoryMap: boolean;
  selfModifyingCodeEnabled: boolean;
  showPipelineDelays: boolean;
  forwardingEnabled: boolean;
  hazardDetectionEnabled: boolean;
  executionMode: "pipeline" | "sequential";
  onTogglePseudoInstructions: (enabled: boolean) => void;
  onToggleAssembleAllFiles: (enabled: boolean) => void;
  onToggleDelayedBranching: (enabled: boolean) => void;
  onToggleCompactMemoryMap: (enabled: boolean) => void;
  onToggleSelfModifyingCode: (enabled: boolean) => void;
  onToggleShowPipelineDelays: (enabled: boolean) => void;
  onToggleForwarding: (enabled: boolean) => void;
  onToggleHazardDetection: (enabled: boolean) => void;
  onChangeExecutionMode: (mode: "pipeline" | "sequential") => void;
  onReloadPseudoOps: () => void;
}

export function SettingsDialog({
  enablePseudoInstructions,
  assembleAllFiles,
  delayedBranching,
  compactMemoryMap,
  selfModifyingCodeEnabled,
  showPipelineDelays,
  forwardingEnabled,
  hazardDetectionEnabled,
  executionMode,
  onTogglePseudoInstructions,
  onToggleAssembleAllFiles,
  onToggleDelayedBranching,
  onToggleCompactMemoryMap,
  onToggleSelfModifyingCode,
  onToggleShowPipelineDelays,
  onToggleForwarding,
  onToggleHazardDetection,
  onChangeExecutionMode,
  onReloadPseudoOps,
}: SettingsDialogProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<"general" | "pseudoOps" | "pipeline">("general");

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
          <button
            onClick={() => setActiveTab("pipeline")}
            style={{
              background: activeTab === "pipeline" ? "#111827" : "transparent",
              color: "#e5e7eb",
              border: "1px solid #1f2937",
              borderRadius: "0.375rem",
              padding: "0.35rem 0.75rem",
              cursor: "pointer",
            }}
          >
            Pipeline
          </button>
        </div>
      </div>

      {activeTab === "general" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <strong style={{ color: "#e2e8f0" }}>Assembler</strong>
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
          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.95rem" }}>
            <input
              type="checkbox"
              checked={assembleAllFiles}
              onChange={(event) => onToggleAssembleAllFiles(event.target.checked)}
            />
            <span style={{ color: "#e5e7eb" }}>Assemble all files in directory</span>
          </label>
          <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            When enabled, MARS Next will assemble every <code>.asm</code> file alongside the active source.
          </span>

          <strong style={{ color: "#e2e8f0", marginTop: "0.25rem" }}>Runtime</strong>
          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.95rem" }}>
            <input
              type="checkbox"
              checked={delayedBranching}
              onChange={(event) => onToggleDelayedBranching(event.target.checked)}
            />
            <span style={{ color: "#e5e7eb" }}>Use delayed branching</span>
          </label>
          <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            Disable to treat branch delay slots as nops for compatibility testing.
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.95rem" }}>
            <input
              type="checkbox"
              checked={selfModifyingCodeEnabled}
              onChange={(event) => onToggleSelfModifyingCode(event.target.checked)}
            />
            <span style={{ color: "#e5e7eb" }}>Allow self-modifying code</span>
          </label>
          <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            Toggle whether stores to the text segment are permitted and automatically invalidate instruction caches.
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.95rem" }}>
            <input
              type="checkbox"
              checked={showPipelineDelays}
              onChange={(event) => onToggleShowPipelineDelays(event.target.checked)}
            />
            <span style={{ color: "#e5e7eb" }}>Show pipeline delays</span>
          </label>
          <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            When pipelined mode is enabled, highlight hazards and inserted bubbles in the visualizer.
          </span>

          <strong style={{ color: "#e2e8f0", marginTop: "0.25rem" }}>Memory map</strong>
          <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.95rem" }}>
            <input
              type="checkbox"
              checked={compactMemoryMap}
              onChange={(event) => onToggleCompactMemoryMap(event.target.checked)}
            />
            <span style={{ color: "#e5e7eb" }}>Use compact memory map</span>
          </label>
          <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            Switch to a reduced address layout compatible with MARS&apos;s compact configuration.
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

      {activeTab === "pipeline" && (
        <PipelineSettings
          forwardingEnabled={forwardingEnabled}
          hazardDetectionEnabled={hazardDetectionEnabled}
          executionMode={executionMode}
          onToggleForwarding={onToggleForwarding}
          onToggleHazardDetection={onToggleHazardDetection}
          onChangeExecutionMode={onChangeExecutionMode}
        />
      )}
    </div>
  );
}
