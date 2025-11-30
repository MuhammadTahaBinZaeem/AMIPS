import React, { useEffect, useMemo, useState } from "react";
import {
  getLatestPipelineSnapshot,
  subscribeToPipelineSnapshots,
  type PipelineSnapshot,
  type RuntimeController,
} from "../../core";
import type { MarsTool, MarsToolContext } from "../../core";
import { StagePanel } from "./StagePanel";

export interface PipelineStateWindowProps {
  runtime: RuntimeController | null;
  onClose: () => void;
}

export function PipelineStateWindow({ runtime, onClose }: PipelineStateWindowProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<PipelineSnapshot>(() => getLatestPipelineSnapshot());
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToPipelineSnapshots((nextSnapshot) => setSnapshot(nextSnapshot));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isRunning || !runtime) return undefined;

    const interval = window.setInterval(() => {
      const status = runtime.step();
      if (status !== "running") {
        setIsRunning(false);
      }
    }, 120);

    return () => window.clearInterval(interval);
  }, [isRunning, runtime]);

  const toggleForwarding = (): void => {
    if (!runtime?.setForwardingEnabled || !runtime.getForwardingEnabled) return;
    runtime.setForwardingEnabled(!runtime.getForwardingEnabled());
  };

  const toggleHazardDetection = (): void => {
    if (!runtime?.setHazardDetectionEnabled || !runtime.getHazardDetectionEnabled) return;
    runtime.setHazardDetectionEnabled(!runtime.getHazardDetectionEnabled());
  };

  const handleRun = (): void => {
    if (!runtime) return;
    runtime.resume();
    setIsRunning(true);
  };

  const handlePause = (): void => {
    if (!runtime) return;
    runtime.halt();
    setIsRunning(false);
  };

  const handleStep = (): void => {
    if (!runtime) return;
    runtime.resume();
    const status = runtime.step();
    if (status !== "running") {
      setIsRunning(false);
    }
  };

  const hazardSummary = useMemo(() => {
    const summaries = [] as string[];
    if (snapshot.loadUseHazard) summaries.push("Load-use hazard");
    if (snapshot.structuralHazard) summaries.push("Structural hazard");
    if (snapshot.branchRegistered) summaries.push("Branch registered");
    return summaries;
  }, [snapshot.branchRegistered, snapshot.loadUseHazard, snapshot.structuralHazard]);

  const stats = snapshot.statistics;
  const cpi = stats.instructionCount === 0 ? "—" : stats.cpi.toFixed(2);
  const bubblePct = stats.bubbleRate === 0 ? "0%" : `${(stats.bubbleRate * 100).toFixed(1)}%`;

  const stageOrder = [
    { key: "ifId", label: "IF/ID" },
    { key: "idEx", label: "ID/EX" },
    { key: "exMem", label: "EX/MEM" },
    { key: "memWb", label: "MEM/WB" },
  ] as const;

  const engineUnavailable = !runtime;

  return (
    <div style={overlayStyle}>
      <div style={windowStyle}>
        <header style={headerStyle}>
          <div>
            <h2 style={{ margin: 0 }}>Pipeline Viewer</h2>
            <div style={{ color: "#9ca3af", marginTop: "0.15rem" }}>
              Cycle {snapshot.cycle} {hazardSummary.length > 0 ? `• ${hazardSummary.join(" · ")}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button style={secondaryButton} onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div style={controlsRow}>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button style={primaryButton} onClick={handleStep} disabled={engineUnavailable}>
              Step
            </button>
            <button style={primaryButton} onClick={handleRun} disabled={engineUnavailable || isRunning}>
              Run
            </button>
            <button style={secondaryButton} onClick={handlePause} disabled={engineUnavailable || !isRunning}>
              Pause
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <label style={toggleLabel}>
              <input
                type="checkbox"
                checked={snapshot.forwardingEnabled}
                onChange={toggleForwarding}
                disabled={!runtime?.setForwardingEnabled}
              />
              <span>Forwarding</span>
            </label>
            <label style={toggleLabel}>
              <input
                type="checkbox"
                checked={snapshot.hazardDetectionEnabled}
                onChange={toggleHazardDetection}
                disabled={!runtime?.setHazardDetectionEnabled}
              />
              <span>Hazard Detection</span>
            </label>
          </div>
        </div>

        <div style={gridStyle}>
          <StatCard
            title="Cycles"
            value={stats.cycleCount.toLocaleString()}
            description="Total cycles executed by the pipeline"
          />
          <StatCard
            title="Retired"
            value={stats.instructionCount.toLocaleString()}
            description="Instructions completed"
          />
          <StatCard title="CPI" value={cpi} description="Cycles per instruction" />
          <StatCard
            title="Stalls"
            value={stats.stallCount.toLocaleString()}
            description={`${stats.loadUseStalls} load-use · ${stats.structuralStalls} structural`}
          />
          <StatCard
            title="Bubbles"
            value={stats.bubbleCount.toLocaleString()}
            description={`Average ${bubblePct} idle slots`}
          />
          <StatCard
            title="Flushes"
            value={stats.flushCount.toLocaleString()}
            description="Pipeline clears from interrupts or halts"
          />
        </div>

        <div style={{ ...gridStyle, marginTop: "-0.25rem" }}>
          {stageOrder.map((entry) => (
            <StagePanel key={entry.key} title={entry.label} stage={snapshot.registers[entry.key]} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  description?: string;
}

function StatCard({ title, value, description }: StatCardProps): React.JSX.Element {
  return (
    <div style={statCardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "#9ca3af", fontSize: "0.85rem", fontWeight: 600 }}>{title}</div>
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: 800, marginTop: "0.15rem", letterSpacing: "-0.02em" }}>{value}</div>
      {description && <div style={{ color: "#9ca3af", marginTop: "0.2rem", fontSize: "0.85rem" }}>{description}</div>}
    </div>
  );
}

type PipelineToolContext = MarsToolContext & { runtime?: RuntimeController | null };

export const PipelineStateTool: MarsTool<PipelineToolContext> = {
  getName: () => "Pipeline Viewer",
  getFile: () => "pipeline-view/PipelineStateWindow.tsx",
  isAvailable: (context) => Boolean(context.runtime),
  go: ({ context, onClose }) => <PipelineStateWindow runtime={context.runtime ?? null} onClose={onClose} />,
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const windowStyle: React.CSSProperties = {
  backgroundColor: "#0b1220",
  border: "1px solid #1f2937",
  borderRadius: "0.9rem",
  padding: "1rem",
  width: "min(960px, 95vw)",
  boxShadow: "0 15px 45px rgba(0,0,0,0.35)",
  color: "#e5e7eb",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const statCardStyle: React.CSSProperties = {
  backgroundColor: "#0f172a",
  border: "1px solid #1f2937",
  borderRadius: "0.65rem",
  padding: "0.75rem 0.9rem",
  minHeight: "4.5rem",
  boxShadow: "0 8px 20px rgba(0,0,0,0.18)",
  display: "flex",
  flexDirection: "column",
  gap: "0.1rem",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const controlsRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
  flexWrap: "wrap",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0.75rem",
};

const primaryButton: React.CSSProperties = {
  background: "linear-gradient(135deg, #22c55e, #16a34a)",
  color: "#0b1220",
  border: "none",
  borderRadius: "0.45rem",
  padding: "0.5rem 0.85rem",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  backgroundColor: "#1f2937",
  color: "#e5e7eb",
  border: "1px solid #374151",
  borderRadius: "0.45rem",
  padding: "0.5rem 0.85rem",
  fontWeight: 600,
  cursor: "pointer",
};

const toggleLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  backgroundColor: "#0f172a",
  border: "1px solid #1f2937",
  borderRadius: "0.45rem",
  padding: "0.35rem 0.5rem",
};

