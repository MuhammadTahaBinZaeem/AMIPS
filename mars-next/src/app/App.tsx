import React, { useCallback, useMemo, useState } from "react";
import { MemoryTable } from "../features/memory-view";
import { RegisterTable } from "../features/register-view";
import { RunToolbar } from "../features/run-control";
import { EditorView } from "../features/editor";
import { BreakpointList, BreakpointManagerPanel, WatchManagerPanel, seedBreakpoints, toggleBreakpoint, type WatchSpec } from "../features/breakpoints";
import { BreakpointEngine, MachineState, type BinaryImage, assembleAndLoad, type ProgramLayout } from "../core";

const SAMPLE_PROGRAM = `# Simple hello-style program
.data
msg: .asciiz "Hello, MARS Next!"

.text
main:
  li $v0, 4       # print string syscall
  li $a0, msg
  syscall

  li $v0, 10      # exit
  syscall`;

export function App(): React.JSX.Element {
  const [source, setSource] = useState(SAMPLE_PROGRAM);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [registers, setRegisters] = useState<number[]>(() => Array(MachineState.REGISTER_COUNT).fill(0));
  const [hi, setHi] = useState(0);
  const [lo, setLo] = useState(0);
  const [pc, setPc] = useState(0);
  const [memoryEntries, setMemoryEntries] = useState<Array<{ address: number; value: number }>>([]);
  const [breakpoints, setBreakpoints] = useState<number[]>([]);
  const [program, setProgram] = useState<BinaryImage | null>(null);
  const [layout, setLayout] = useState<ProgramLayout | null>(null);
  const [symbolTable, setSymbolTable] = useState<Record<string, number>>({});
  const [watches, setWatches] = useState<WatchSpec[]>([]);
  const [watchValues, setWatchValues] = useState<Record<string, number | undefined>>({});
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const breakpointEngine = useMemo(() => new BreakpointEngine(), []);

  const editor = useMemo(
    () => (
      <EditorView
        value={source}
        onChange={setSource}
        breakpoints={breakpoints}
        activeLine={activeLine}
        onToggleBreakpoint={(line) =>
          setBreakpoints((current) =>
            toggleBreakpoint(line, current, breakpointEngine, layout?.sourceMap ?? program?.sourceMap),
          )
        }
      />
    ),
    [source, breakpoints, breakpointEngine, layout, program, activeLine],
  );

  const resolveInstructionIndex = useCallback(
    (line: number): number =>
      layout?.sourceMap.find((entry) => entry.segment === "text" && entry.line === line)?.segmentIndex ?? line - 1,
    [layout],
  );

  const handleRemoveBreakpoint = useCallback((line: number) => {
    setBreakpoints((current) => current.filter((point) => point !== line));
    const index = resolveInstructionIndex(line);
    breakpointEngine.removeInstructionBreakpoint(index);
  }, [breakpointEngine, resolveInstructionIndex]);

  const handleRun = (): void => {
    setError(null);
    setActiveLine(null);
    setActiveFile(null);
    try {
      setStatus("Assembling...");
      breakpointEngine.clearHit();
      breakpointEngine.clearAll();

      const { engine, image, layout: assembledLayout } = assembleAndLoad(source, { breakpointEngine });
      setProgram({ ...image, sourceMap: assembledLayout.sourceMap });
      setLayout(assembledLayout);
      setSymbolTable(assembledLayout.symbols);

      seedBreakpoints(breakpoints, breakpointEngine, assembledLayout.sourceMap);

      setStatus("Running...");
      engine.run(2_000);

      const state = engine.getState();
      setRegisters(Array.from({ length: MachineState.REGISTER_COUNT }, (_, index) => state.getRegister(index)));
      setHi(state.getHi());
      setLo(state.getLo());
      setPc(state.getProgramCounter());
      setMemoryEntries(engine.getMemory().entries());

      const currentLocation = assembledLayout.sourceMap.find((entry) => entry.address === state.getProgramCounter());
      setActiveLine(currentLocation?.line ?? null);
      setActiveFile(currentLocation?.file ?? null);

      const { breakpoints: engineBreakpoints, watchEngine } = engine.getDebuggerEngines();
      if (watchEngine) {
        const snapshot: Record<string, number | undefined> = {};
        watchEngine.getWatchValues().forEach((entry) => {
          snapshot[entry.key] = entry.value;
        });
        setWatchValues(snapshot);
      }

      if (engineBreakpoints?.getHitBreakpoint() !== null) {
        const hitIndex = engineBreakpoints.getHitBreakpoint();
        const location = assembledLayout.sourceMap.find(
          (entry) => entry.segment === "text" && entry.segmentIndex === hitIndex,
        );
        setStatus(location ? `Paused at ${location.file}:${location.line}` : "Paused on breakpoint");
        return;
      }

      const breakpointHit = breakpointEngine.getHitBreakpoint();
      if (breakpointHit !== null) {
        const location = assembledLayout.sourceMap.find(
          (entry) => entry.segment === "text" && entry.segmentIndex === breakpointHit,
        );
        if (location) {
          setStatus(`Hit breakpoint at ${location.file}:${location.line}`);
        } else {
          setStatus(`Hit breakpoint at instruction #${breakpointHit + 1}`);
        }
      } else if (state.isTerminated()) {
        setStatus("Program terminated");
      } else {
        setStatus("Execution halted");
      }
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError);
      setError(message);
      setStatus("Encountered an error");
    }
  };

  return (
    <main
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        padding: "2rem",
        background: "#0b1220",
        minHeight: "100vh",
        color: "#e5e7eb",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>MARS Next – Prototype</h1>
        <span style={{ color: "#9ca3af" }}>Dark mode by default</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <RunToolbar onRun={handleRun} status={status} />
        {activeLine !== null && (
          <div style={{ color: "#a5b4fc", fontWeight: 600 }}>
            Current instruction: {activeFile ?? "<input>"}:{activeLine}
          </div>
        )}
        {error && (
          <div
            style={{
              backgroundColor: "#2b0f1c",
              color: "#fca5a5",
              border: "1px solid #7f1d1d",
              borderRadius: "0.5rem",
              padding: "0.75rem 1rem",
            }}
          >
            {error}
          </div>
        )}

        {editor}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
          <BreakpointManagerPanel
            breakpoints={breakpoints}
            symbols={symbolTable}
            onAdd={(spec) => {
              const parsed = Number(spec);
              if (!Number.isFinite(parsed)) return;
              setBreakpoints((previous) => (previous.includes(parsed) ? previous : [...previous, parsed]));
            }}
            onRemove={(spec) => {
              const parsed = typeof spec === "number" ? spec : Number(spec);
              if (!Number.isFinite(parsed)) return;
              setBreakpoints((previous) => previous.filter((entry) => entry !== parsed));
              breakpointEngine.removeInstructionBreakpoint(resolveInstructionIndex(parsed));
            }}
          />
          <WatchManagerPanel
            watches={watches}
            symbols={symbolTable}
            values={watchValues}
            onAdd={(spec) =>
              setWatches((previous) =>
                previous.find((entry) => entry.kind === spec.kind && entry.identifier === spec.identifier)
                  ? previous
                  : [...previous, spec],
              )
            }
            onRemove={(spec) =>
              setWatches((previous) =>
                previous.filter((entry) => !(entry.kind === spec.kind && entry.identifier === spec.identifier)),
              )
            }
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <h2 style={{ margin: 0, color: "#e5e7eb", fontSize: "1rem" }}>Breakpoints</h2>
            <BreakpointList breakpoints={breakpoints} program={program} onRemove={handleRemoveBreakpoint} />
          </div>
          <RegisterTable registers={registers} hi={hi} lo={lo} pc={pc} />
          <MemoryTable entries={memoryEntries} />
        </div>
      </div>
    </main>
  );
}
