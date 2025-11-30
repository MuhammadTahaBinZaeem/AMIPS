import React from "react";

export interface PipelineSettingsProps {
  forwardingEnabled: boolean;
  hazardDetectionEnabled: boolean;
  executionMode: "pipeline" | "sequential";
  onToggleForwarding: (enabled: boolean) => void;
  onToggleHazardDetection: (enabled: boolean) => void;
  onChangeExecutionMode: (mode: "pipeline" | "sequential") => void;
}

export function PipelineSettings({
  forwardingEnabled,
  hazardDetectionEnabled,
  executionMode,
  onToggleForwarding,
  onToggleHazardDetection,
  onChangeExecutionMode,
}: PipelineSettingsProps): React.JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.95rem" }}>
        <span style={{ color: "#e5e7eb" }}>Execution mode</span>
        <select
          value={executionMode}
          onChange={(event) => onChangeExecutionMode(event.target.value as "pipeline" | "sequential")}
          style={{
            backgroundColor: "#0b1220",
            color: "#e5e7eb",
            border: "1px solid #374151",
            borderRadius: "0.375rem",
            padding: "0.35rem 0.5rem",
          }}
        >
          <option value="pipeline">Pipelined (multi-cycle)</option>
          <option value="sequential">Sequential (single-cycle)</option>
        </select>
      </label>
      <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
        Choose between the pipelined simulator and the single-cycle CPU. Both modes share the same memory and registers so you
        can switch without losing state.
      </span>

      <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.95rem" }}>
        <input type="checkbox" checked={forwardingEnabled} onChange={(event) => onToggleForwarding(event.target.checked)} />
        <span style={{ color: "#e5e7eb" }}>Enable forwarding</span>
      </label>
      <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
        When enabled, pipeline hazards will be minimized using bypass paths; disable to model architectures without forwarding
        and insert stalls on any data dependency.
      </span>

      <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.95rem" }}>
        <input
          type="checkbox"
          checked={hazardDetectionEnabled}
          onChange={(event) => onToggleHazardDetection(event.target.checked)}
        />
        <span style={{ color: "#e5e7eb" }}>Automatic hazard detection</span>
      </label>
      <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
        Disable this option to mirror MARS&apos;s manual stall mode. The simulator will not automatically pause on hazards when this
        is off.
      </span>
    </div>
  );
}
