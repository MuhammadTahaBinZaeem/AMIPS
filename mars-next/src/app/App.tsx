import React, { useMemo, useState } from "react";
import { MemoryTable } from "../features/memory-view";
import { RegisterTable } from "../features/register-view";
import { RunToolbar } from "../features/run-control";
import { EditorView } from "../features/editor";
import { BreakpointManagerPanel, WatchManagerPanel, WatchSpec } from "../features/breakpoints";
import { CoreEngine, MachineState, assembleAndLoad } from "../core";

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
  const [symbolTable, setSymbolTable] = useState<Record<string, number>>({});
  const [breakpoints, setBreakpoints] = useState<string[]>([]);
  const [watches, setWatches] = useState<WatchSpec[]>([]);
  const [watchValues, setWatchValues] = useState<Record<string, number | undefined>>({});
  const [, setEngine] = useState<CoreEngine | null>(null);

  const editor = useMemo(
    () => (
      <EditorView
        value={source}
        onChange={setSource}
      />
    ),
    [source],
  );

  const applyBreakpoints = (
    targetEngine: CoreEngine,
    specs: string[],
    symbols: Record<string, number> = symbolTable,
  ): void => {
    const { breakpoints: engineBreakpoints } = targetEngine.getDebuggerEngines();
    if (!engineBreakpoints) return;

    engineBreakpoints.clearAll();
    engineBreakpoints.setSymbolTable(symbols);

    specs.forEach((spec) => {
      const trimmed = spec.trim();
      if (!trimmed) return;

      if (/^0x[0-9a-f]+$/i.test(trimmed)) {
        engineBreakpoints.setBreakpoint(Number.parseInt(trimmed, 16));
        return;
      }

      if (/^\d+$/.test(trimmed)) {
        engineBreakpoints.setBreakpoint(Number.parseInt(trimmed, 10));
        return;
      }

      try {
        engineBreakpoints.setBreakpointByLabel(trimmed);
      } catch (resolutionError) {
        console.warn(resolutionError);
      }
    });
  };

  const applyWatches = (
    targetEngine: CoreEngine,
    specs: WatchSpec[],
    symbols: Record<string, number> = symbolTable,
  ): void => {
    const { watchEngine } = targetEngine.getDebuggerEngines();
    if (!watchEngine) return;

    watchEngine.clear();
    watchEngine.setSymbolTable(symbols);

    specs.forEach((spec) => {
      try {
        watchEngine.addWatch(spec.kind, spec.identifier);
      } catch (watchError) {
        console.warn(watchError);
      }
    });

    const snapshot: Record<string, number | undefined> = {};
    watchEngine.getWatchValues().forEach((entry) => {
      snapshot[entry.key] = entry.value;
    });
    setWatchValues(snapshot);
  };

  const handleRun = (): void => {
    setError(null);
    setActiveLine(null);
    setActiveFile(null);
    try {
      setStatus("Assembling...");
      const { engine: loadedEngine, layout } = assembleAndLoad(source);
      setEngine(loadedEngine);
      setSymbolTable(layout.symbols);

      applyBreakpoints(loadedEngine, breakpoints, layout.symbols);
      applyWatches(loadedEngine, watches, layout.symbols);

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

      setStatus(state.isTerminated() ? "Program terminated" : "Execution halted");
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
            onAdd={(spec) => setBreakpoints((previous) => (previous.includes(spec) ? previous : [...previous, spec]))}
            onRemove={(spec) => setBreakpoints((previous) => previous.filter((entry) => entry !== spec))}
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
          <RegisterTable registers={registers} hi={hi} lo={lo} pc={pc} />
          <MemoryTable entries={memoryEntries} />
        </div>
      </div>
    </main>
  );
}
