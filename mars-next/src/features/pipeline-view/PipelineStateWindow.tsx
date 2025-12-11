import React, { useEffect, useMemo, useRef, useState } from "react";
import { disassembleInstruction } from "../../core/debugger/Disassembler";
import {
  getLatestPipelineSnapshot,
  subscribeToPipelineSnapshots,
  type HazardType,
  type PipelineRegisterView,
  type PipelineSnapshot,
  type RuntimeController,
} from "../../core";
import type { MarsTool, MarsToolComponentProps } from "../../core";
import { StagePanel } from "./StagePanel";

const stageOrder = [
  { key: "ifId", label: "IF/ID" },
  { key: "idEx", label: "ID/EX" },
  { key: "exMem", label: "EX/MEM" },
  { key: "memWb", label: "MEM/WB" },
] as const;

type StageKey = (typeof stageOrder)[number]["key"];

type HazardFilterState = Record<HazardType, boolean>;

function describeInstruction(instruction: number | null, pc: number | null): string {
  if (instruction === null || pc === null) return "<no instruction>";
  const disassembled = disassembleInstruction(instruction, pc)?.assembly;
  return disassembled ?? `0x${(instruction >>> 0).toString(16).padStart(8, "0")}`;
}

function formatStageText(stage: PipelineSnapshot["registers"][StageKey]): string {
  if (stage.bubble) return "Bubble (NOP)";
  if (stage.flushed) return "Flushed";
  return describeInstruction(stage.instruction, stage.pc);
}

function PipelineRegisterPanel({
  label,
  view,
  stage,
}: {
  label: string;
  view: PipelineRegisterView;
  stage: PipelineSnapshot["registers"][StageKey];
}): React.JSX.Element {
  return (
    <div style={registerPanelStyle}>
      <StagePanel title={label} stage={stage} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.5rem" }}>
        <div style={registerSectionStyle}>
          <div style={sectionLabel}>Control signals</div>
          <div style={signalRow}>Bubble: {view.controlSignals.bubble ? "yes" : "no"}</div>
          <div style={signalRow}>Stalled: {view.controlSignals.stalled ? "yes" : "no"}</div>
          <div style={signalRow}>Flushed: {view.controlSignals.flushed ? "yes" : "no"}</div>
        </div>
        <div style={registerSectionStyle}>
          <div style={sectionLabel}>Operands</div>
          {view.dataValues.operands.length === 0 && <div style={signalRow}>—</div>}
          {view.dataValues.operands.map((operand) => (
            <div key={`${label}-${operand.register}`} style={signalRow}>
              r{operand.register}: {operand.value === null ? "—" : operand.value}
            </div>
          ))}
        </div>
        <div style={registerSectionStyle}>
          <div style={sectionLabel}>Results</div>
          <div style={signalRow}>Destination: {view.dataValues.destination ?? "—"}</div>
          <div style={signalRow}>ALU result: {view.dataValues.aluResult ?? "—"}</div>
          <div style={signalRow}>Memory addr: {view.dataValues.memoryAddress ?? "—"}</div>
        </div>
      </div>
    </div>
  );
}

function HazardList({ hazards }: { hazards: PipelineSnapshot["hazards"] }): React.JSX.Element {
  if (hazards.length === 0) {
    return <div style={{ color: "#9ca3af" }}>No hazards detected in this cycle.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {hazards.map((hazard, index) => (
        <div key={`${hazard.type}-${index}`} style={hazardCardStyle(hazard)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700 }}>{hazard.type.toUpperCase()}</span>
            <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>{hazard.resolution}</span>
          </div>
          <div style={{ color: "#e5e7eb", marginTop: "0.15rem" }}>{hazard.description}</div>
          <div style={{ color: "#9ca3af", fontSize: "0.85rem", marginTop: "0.2rem" }}>
            Stages: {hazard.stages.join(", ")}
            {hazard.registers?.destination !== undefined && hazard.registers?.destination !== null
              ? ` · dest r${hazard.registers.destination}`
              : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PipelineStateWindow({
  appContext,
  onClose,
  presentation = "window",
}: MarsToolComponentProps): React.JSX.Element {
  const runtime = (appContext.runtime as RuntimeController | null | undefined) ?? null;
  const [timeline, setTimeline] = useState<PipelineSnapshot[]>(() => [getLatestPipelineSnapshot()]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(350);
  const [zoom, setZoom] = useState(1);
  const [instructionFilter, setInstructionFilter] = useState("");
  const [hazardFilters, setHazardFilters] = useState<HazardFilterState>({ data: true, structural: true, control: true });
  const playRef = useRef(false);

  useEffect(() => {
    playRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const unsubscribe = subscribeToPipelineSnapshots((nextSnapshot) => {
      setTimeline((previous) => {
        const last = previous[previous.length - 1];
        const updated = last && last.cycle === nextSnapshot.cycle ? [...previous.slice(0, -1), nextSnapshot] : [...previous, nextSnapshot];
        setActiveIndex((current) => {
          const followTail = playRef.current || current === previous.length - 1 || updated.length === 1;
          return followTail ? updated.length - 1 : Math.min(current, updated.length - 1);
        });
        return updated;
      });
    });
    return () => unsubscribe();
  }, []);

  const snapshot = timeline[activeIndex] ?? timeline[timeline.length - 1];
  const engineUnavailable = !runtime;

  const hazardSummary = useMemo(() => {
    return [
      snapshot.loadUseHazard ? "Load-use hazard" : null,
      snapshot.structuralHazard ? "Structural hazard" : null,
      snapshot.branchRegistered ? "Branch registered" : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [snapshot]);

  const filteredHazards = useMemo(
    () => snapshot.hazards.filter((hazard) => hazardFilters[hazard.type]),
    [hazardFilters, snapshot.hazards],
  );

  const stats = snapshot.statistics;
  const cpi = stats.instructionCount === 0 ? "—" : stats.cpi.toFixed(2);
  const bubblePct = stats.bubbleRate === 0 ? "0%" : `${(stats.bubbleRate * 100).toFixed(1)}%`;
  const cellWidth = Math.round(160 * zoom);

  const handleRun = (): void => {
    if (!runtime) return;
    runtime.resume();
    setIsPlaying(true);
  };

  const handlePause = (): void => {
    if (!runtime) return;
    runtime.halt();
    setIsPlaying(false);
  };

  const handleStep = (): void => {
    setIsPlaying(false);
    handleNext();
  };

  const handleNext = (): void => {
    if (activeIndex < timeline.length - 1) {
      setActiveIndex((index) => Math.min(index + 1, timeline.length - 1));
      return;
    }
    if (!runtime) return;
    runtime.resume();
    const status = runtime.step();
    if (status !== "running") {
      setIsPlaying(false);
    }
  };

  const handlePrevious = (): void => {
    setIsPlaying(false);
    setActiveIndex((index) => Math.max(0, index - 1));
  };

  const toggleForwarding = (): void => {
    if (!runtime?.setForwardingEnabled || !runtime.getForwardingEnabled) return;
    runtime.setForwardingEnabled(!runtime.getForwardingEnabled());
  };

  const toggleHazardDetection = (): void => {
    if (!runtime?.setHazardDetectionEnabled || !runtime.getHazardDetectionEnabled) return;
    runtime.setHazardDetectionEnabled(!runtime.getHazardDetectionEnabled());
  };

  const toggleHazardFilter = (type: HazardType): void => {
    setHazardFilters((current) => ({ ...current, [type]: !current[type] }));
  };

  useEffect(() => {
    if (!isPlaying || !runtime) return undefined;

    const interval = window.setInterval(() => {
      handleNext();
    }, playSpeed);

    return () => window.clearInterval(interval);
  }, [isPlaying, runtime, playSpeed, activeIndex, timeline.length]);

  const containerStyle = presentation === "panel" ? panelContainerStyle : overlayStyle;
  const surfaceStyle = presentation === "panel" ? panelWindowStyle : windowStyle;

  return (
    <div style={containerStyle}>
      <div style={surfaceStyle}>
        <header style={headerStyle}>
          <div>
            <h2 style={{ margin: 0 }}>Pipeline Viewer</h2>
            <div style={{ color: "#9ca3af", marginTop: "0.15rem" }}>
              Cycle {snapshot.cycle} {hazardSummary ? `• ${hazardSummary}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button style={secondaryButton} onClick={onClose}>Close</button>
          </div>
        </header>

        <div style={controlsRow}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button style={primaryButton} onClick={handlePrevious} disabled={activeIndex === 0}>
              Previous
            </button>
            <button style={primaryButton} onClick={handleStep} disabled={engineUnavailable}>
              Next cycle
            </button>
            <button style={primaryButton} onClick={handleRun} disabled={engineUnavailable || isPlaying}>
              Play
            </button>
            <button style={secondaryButton} onClick={handlePause} disabled={engineUnavailable || !isPlaying}>
              Pause
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
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
              <span>Hazard detection</span>
            </label>
            <label style={toggleLabel}>
              Speed
              <input
                type="range"
                min={120}
                max={1200}
                value={playSpeed}
                onChange={(event) => setPlaySpeed(parseInt(event.target.value))}
              />
            </label>
            <label style={toggleLabel}>
              Zoom
              <input
                type="range"
                min={0.75}
                max={1.6}
                step={0.05}
                value={zoom}
                onChange={(event) => setZoom(parseFloat(event.target.value))}
              />
            </label>
          </div>
        </div>

        <div style={controlsRow}>
          <input
            style={searchInput}
            placeholder="Highlight instruction (text or hex)"
            value={instructionFilter}
            onChange={(event) => setInstructionFilter(event.target.value)}
          />
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {(["data", "structural", "control"] as HazardType[]).map((type) => (
              <label key={type} style={pillToggle(hazardFilters[type])}>
                <input
                  type="checkbox"
                  checked={hazardFilters[type]}
                  onChange={() => toggleHazardFilter(type)}
                  style={{ display: "none" }}
                />
                {type}
              </label>
            ))}
          </div>
        </div>

        <div style={gridStyle}>
          <StatCard
            title="Cycles"
            value={stats.cycleCount.toLocaleString()}
            description="Total cycles executed by the pipeline"
          />
          <StatCard title="Retired" value={stats.instructionCount.toLocaleString()} description="Instructions completed" />
          <StatCard title="CPI" value={cpi} description="Cycles per instruction" />
          <StatCard
            title="Stalls"
            value={stats.stallCount.toLocaleString()}
            description={`${stats.loadUseStalls} load-use · ${stats.structuralStalls} structural`}
          />
          <StatCard title="Bubbles" value={stats.bubbleCount.toLocaleString()} description={`Average ${bubblePct} idle slots`} />
          <StatCard
            title="Flushes"
            value={stats.flushCount.toLocaleString()}
            description="Pipeline clears from interrupts or halts"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(320px, 1fr)", gap: "1rem" }}>
          <div style={{ ...panelStyle, overflowX: "auto" }}>
            <div style={timelineHeaderRow(cellWidth, timeline.length)}>
              <div style={{ ...stageLabelCell, minWidth: 90 }}>Stage</div>
              {timeline.map((entry) => (
                <div key={`cycle-${entry.cycle}`} style={{ ...cycleHeaderCell, minWidth: cellWidth }}>
                  Cycle {entry.cycle}
                </div>
              ))}
            </div>
            {stageOrder.map((stage) => (
              <div key={stage.key} style={timelineRow(cellWidth, timeline.length)}>
                <div style={{ ...stageLabelCell, minWidth: 90 }}>{stage.label}</div>
                {timeline.map((entry, index) => {
                  const stageState = entry.registers[stage.key];
                  const cellHazards = entry.hazards.filter((hazard) => hazard.stages.includes(stage.key));
                  const hazardMatched = cellHazards.some((hazard) => hazardFilters[hazard.type]);
                  const matchesFilter = instructionFilter
                    ? formatStageText(stageState).toLowerCase().includes(instructionFilter.toLowerCase())
                    : true;
                  const emphasis = hazardMatched || matchesFilter;

                  let background = stageState.bubble ? "#111827" : "#0f172a";
                  if (stageState.hazards.includes("control")) background = "#312e81";
                  if (stageState.hazards.includes("structural")) background = "#4b5563";
                  if (stageState.hazards.includes("data")) background = "#1f2937";
                  if (stageState.resolution === "stall") background = "#92400e";
                  if (stageState.resolution === "forward") background = "#064e3b";
                  if (stageState.flushed) background = "#7f1d1d";

                  return (
                    <div
                      key={`${stage.key}-${entry.cycle}-${index}`}
                      style={{
                        ...timelineCell,
                        minWidth: cellWidth,
                        backgroundColor: background,
                        opacity: emphasis ? 1 : 0.35,
                        borderColor: stageState.resolution === "stall" ? "#fbbf24" : "#1f2937",
                      }}
                      title={stageState.note ?? formatStageText(stageState)}
                    >
                      <div style={{ fontWeight: 700, color: "#e5e7eb" }}>{formatStageText(stageState)}</div>
                      <div style={{ color: "#d1d5db", fontSize: "0.85rem", marginTop: "0.2rem" }}>
                        {stageState.note ?? ""}
                        {stageState.bubble && !stageState.note ? "Bubble inserted (stall)" : ""}
                      </div>
                      {cellHazards.some((hazard) => hazard.resolution === "forward") && (
                        <div style={forwardBadge}>Forwarded</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div style={panelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <h3 style={{ margin: 0 }}>Hazards</h3>
              <span style={{ color: "#9ca3af", fontSize: "0.85rem" }}>
                Filtering: {Object.entries(hazardFilters)
                  .filter(([, enabled]) => enabled)
                  .map(([key]) => key)
                  .join(", ") || "none"}
              </span>
            </div>
            <HazardList hazards={filteredHazards} />
          </div>
        </div>

        <div style={{ ...gridStyle, marginTop: "-0.25rem" }}>
          {stageOrder.map((entry) => (
            <PipelineRegisterPanel
              key={entry.key}
              label={entry.label}
              view={snapshot.pipelineRegisters[entry.key]}
              stage={snapshot.registers[entry.key]}
            />
          ))}
        </div>

        <div style={panelStyle}>
          <h3 style={{ marginTop: 0 }}>Register file snapshot</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: "0.4rem" }}>
            {snapshot.registerFile.general.map((value, index) => (
              <div key={`reg-${index}`} style={registerValueTile}>
                <div style={{ color: "#9ca3af", fontSize: "0.8rem" }}>${index}</div>
                <div style={{ fontWeight: 700 }}>{value}</div>
              </div>
            ))}
            <div style={registerValueTile}>
              <div style={{ color: "#9ca3af", fontSize: "0.8rem" }}>HI</div>
              <div style={{ fontWeight: 700 }}>{snapshot.registerFile.hi}</div>
            </div>
            <div style={registerValueTile}>
              <div style={{ color: "#9ca3af", fontSize: "0.8rem" }}>LO</div>
              <div style={{ fontWeight: 700 }}>{snapshot.registerFile.lo}</div>
            </div>
          </div>
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

export const PipelineStateTool: MarsTool = {
  id: "pipeline-viewer",
  name: "Pipeline Viewer",
  description: "Inspect per-cycle pipeline snapshots, hazards, and stalls.",
  category: "Execution",
  icon: "pipeline",
  shortcut: "Ctrl+Alt+P",
  Component: PipelineStateWindow,
  isAvailable: (context) => Boolean(context.runtime),
  run: () => {
    // Rendering handled by host application.
  },
};

export default PipelineStateTool;

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
  width: "min(1200px, 96vw)",
  boxShadow: "0 15px 45px rgba(0,0,0,0.35)",
  color: "#e5e7eb",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  maxHeight: "95vh",
  overflowY: "auto",
};

const panelContainerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  backgroundColor: "#0b1220",
  borderRadius: "0.9rem",
  border: "1px solid #1f2937",
  overflow: "hidden",
};

const panelWindowStyle: React.CSSProperties = {
  backgroundColor: "#0b1220",
  borderRadius: "0.9rem",
  padding: "1rem",
  boxShadow: "0 15px 45px rgba(0,0,0,0.35)",
  color: "#e5e7eb",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  height: "100%",
  overflow: "hidden",
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

const searchInput: React.CSSProperties = {
  flex: 1,
  minWidth: "320px",
  backgroundColor: "#0f172a",
  border: "1px solid #1f2937",
  color: "#e5e7eb",
  borderRadius: "0.45rem",
  padding: "0.55rem 0.75rem",
};

const panelStyle: React.CSSProperties = {
  backgroundColor: "#0f172a",
  border: "1px solid #1f2937",
  borderRadius: "0.7rem",
  padding: "0.75rem",
  boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
};

const timelineHeaderRow = (cellWidth: number, count: number): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: `90px repeat(${count}, minmax(${cellWidth}px, ${cellWidth}px))`,
  gap: "0.35rem",
  marginBottom: "0.35rem",
});

const cycleHeaderCell: React.CSSProperties = {
  backgroundColor: "#111827",
  padding: "0.4rem 0.5rem",
  borderRadius: "0.35rem",
  textAlign: "center",
  fontWeight: 700,
};

const stageLabelCell: React.CSSProperties = {
  backgroundColor: "#111827",
  padding: "0.5rem 0.6rem",
  borderRadius: "0.35rem",
  fontWeight: 700,
  color: "#e5e7eb",
};

const timelineRow = (cellWidth: number, count: number): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: `90px repeat(${count}, minmax(${cellWidth}px, ${cellWidth}px))`,
  gap: "0.35rem",
  alignItems: "stretch",
});

const timelineCell: React.CSSProperties = {
  backgroundColor: "#0f172a",
  border: "1px solid #1f2937",
  borderRadius: "0.5rem",
  padding: "0.5rem",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  gap: "0.2rem",
};

const forwardBadge: React.CSSProperties = {
  alignSelf: "flex-start",
  backgroundColor: "#16a34a",
  color: "#052e16",
  borderRadius: "999px",
  padding: "0.15rem 0.5rem",
  fontSize: "0.75rem",
  fontWeight: 800,
};

const hazardCardStyle = (hazard: PipelineSnapshot["hazards"][number]): React.CSSProperties => ({
  backgroundColor:
    hazard.type === "data" ? "#0b3b2c" : hazard.type === "structural" ? "#3f2d0c" : "#312e81",
  border: "1px solid #1f2937",
  borderRadius: "0.55rem",
  padding: "0.6rem 0.75rem",
  boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
});

const registerPanelStyle: React.CSSProperties = {
  backgroundColor: "#0f172a",
  border: "1px solid #1f2937",
  borderRadius: "0.65rem",
  padding: "0.6rem",
  boxShadow: "0 6px 15px rgba(0,0,0,0.22)",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const registerSectionStyle: React.CSSProperties = {
  backgroundColor: "#0b1220",
  border: "1px solid #1f2937",
  borderRadius: "0.5rem",
  padding: "0.5rem",
};

const sectionLabel: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "0.85rem",
  fontWeight: 700,
  marginBottom: "0.2rem",
};

const signalRow: React.CSSProperties = {
  fontSize: "0.95rem",
  color: "#e5e7eb",
};

const registerValueTile: React.CSSProperties = {
  backgroundColor: "#111827",
  borderRadius: "0.4rem",
  padding: "0.35rem 0.5rem",
  border: "1px solid #1f2937",
};

const pillToggle = (active: boolean): React.CSSProperties => ({
  padding: "0.35rem 0.7rem",
  borderRadius: "999px",
  border: `1px solid ${active ? "#22c55e" : "#374151"}`,
  backgroundColor: active ? "#22c55e22" : "#111827",
  color: "#e5e7eb",
  cursor: "pointer",
  userSelect: "none",
});

