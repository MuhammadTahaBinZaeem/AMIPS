import React from "react";
import { disassembleInstruction } from "../../core/debugger/Disassembler";
import type { PipelineStageState } from "../../core";

export interface StagePanelProps {
  title: string;
  stage: PipelineStageState;
}

function formatHex(value: number | null): string {
  if (value === null) return "—";
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function describeInstruction(stage: PipelineStageState): string {
  if (stage.bubble) return "Bubble (no instruction)";
  if (stage.flushed) return "Flushed";

  const disassembled =
    stage.instruction !== null && stage.pc !== null
      ? disassembleInstruction(stage.instruction, stage.pc)?.assembly
      : null;

  if (disassembled) return disassembled;
  if (stage.instruction !== null) return `0x${(stage.instruction >>> 0).toString(16).padStart(8, "0")}`;
  return "<no instruction>";
}

export function StagePanel({ title, stage }: StagePanelProps): React.JSX.Element {
  const badges: Array<{ label: string; color: string }> = [];
  if (stage.stalled) badges.push({ label: "Stall", color: "#f59e0b" });
  if (stage.bubble) badges.push({ label: "Bubble", color: "#6b7280" });
  if (stage.flushed) badges.push({ label: "Flushed", color: "#ef4444" });
  if (stage.resolution === "forward") badges.push({ label: "Forwarded", color: "#22c55e" });

  return (
    <div style={containerStyle(stage)}>
      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>{title}</h3>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {badges.map((badge) => (
              <span key={badge.label} style={{ ...badgeStyle, backgroundColor: badge.color }}>
                {badge.label}
              </span>
            ))}
          </div>
        </div>
        <span style={{ color: "#9ca3af", fontSize: "0.85rem" }}>PC: {formatHex(stage.pc)}</span>
      </div>

      <div style={{ marginTop: "0.25rem", color: "#d1d5db", fontFamily: "'JetBrains Mono', monospace" }}>
        {describeInstruction(stage)}
      </div>
      {stage.note && (
        <div style={{ marginTop: "0.35rem", color: "#9ca3af", fontSize: "0.85rem", lineHeight: 1.3 }}>
          {stage.note}
        </div>
      )}
    </div>
  );
}

const containerStyle = (stage: PipelineStageState): React.CSSProperties => ({
  backgroundColor: stage.flushed ? "#1f2937" : "#0f172a",
  border: `1px solid ${stage.flushed ? "#b91c1c" : stage.stalled ? "#f59e0b" : "#1f2937"}`,
  borderRadius: "0.65rem",
  padding: "0.75rem 0.9rem",
  minHeight: "5rem",
  boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
});

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "0.4rem",
};

const badgeStyle: React.CSSProperties = {
  color: "#0b1220",
  borderRadius: "9999px",
  padding: "0.2rem 0.55rem",
  fontSize: "0.75rem",
  fontWeight: 700,
};

