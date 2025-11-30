import React from "react";

export interface PipelineSettingsProps {
  forwardingEnabled: boolean;
  hazardDetectionEnabled: boolean;
  onToggleForwarding: (enabled: boolean) => void;
  onToggleHazardDetection: (enabled: boolean) => void;
}

export function PipelineSettings({
  forwardingEnabled,
  hazardDetectionEnabled,
  onToggleForwarding,
  onToggleHazardDetection,
}: PipelineSettingsProps): React.JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
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
