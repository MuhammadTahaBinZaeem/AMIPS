import React, { useCallback, useState } from "react";
import { MemoryTable } from "../features/memory-view";
import { RegisterTable } from "../features/register-view";
import { RunToolbar } from "../features/run-control";
import { EditorPane } from "../features/editor";
import { BreakpointManagerPanel, BreakpointList, BreakpointSpec, WatchManagerPanel, WatchSpec } from "../features/breakpoints";
import { resolveInstructionIndex, toggleBreakpoint } from "../features/breakpoints/services/breakpointService";
import { SettingsDialog } from "../features/settings";
import { BinaryImage, CoreEngine, MachineState, SourceMapEntry, assembleAndLoad } from "../core";

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
  const [breakpoints, setBreakpoints] = useState<BreakpointSpec[]>([]);
  const [watches, setWatches] = useState<WatchSpec[]>([]);
  const [watchValues, setWatchValues] = useState<Record<string, number | undefined>>({});
  const [engine, setEngine] = useState<CoreEngine | null>(null);
  const [program, setProgram] = useState<BinaryImage | null>(null);
  const [sourceMap, setSourceMap] = useState<SourceMapEntry[] | undefined>(undefined);
  const [editorBreakpoints, setEditorBreakpoints] = useState<number[]>([]);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [enablePseudoInstructions, setEnablePseudoInstructions] = useState(true);

  const handleToggleEditorBreakpoint = useCallback(
    (line: number): void => {
      const engineBreakpoints = engine?.getDebuggerEngines().breakpoints ?? undefined;
      setEditorBreakpoints((previous) =>
        toggleBreakpoint(line, previous, engineBreakpoints ?? undefined, sourceMap, activeFile ?? undefined),
      );
    },
    [activeFile, engine, sourceMap],
  );

  const applyBreakpoints = (
    targetEngine: CoreEngine,
    specs: BreakpointSpec[],
    symbols: Record<string, number> = symbolTable,
    map: SourceMapEntry[] | undefined = sourceMap,
    editorPoints: number[] = editorBreakpoints,
    file: string | null = activeFile,
  ): void => {
    const { breakpoints: engineBreakpoints } = targetEngine.getDebuggerEngines();
    if (!engineBreakpoints) return;

    engineBreakpoints.clearAll();
    engineBreakpoints.setSymbolTable(symbols);

    specs.forEach((spec) => {
      const trimmed = spec.spec.trim();
      if (!trimmed) return;

      const options = {
        once: spec.oneShot ?? false,
        condition: spec.condition
          ? { kind: "registerEquals" as const, register: spec.condition.register, value: spec.condition.value }
          : undefined,
      };

      if (/^0x[0-9a-f]+$/i.test(trimmed)) {
        engineBreakpoints.setBreakpoint(Number.parseInt(trimmed, 16), options);
        return;
      }

      if (/^\d+$/.test(trimmed)) {
        engineBreakpoints.setBreakpoint(Number.parseInt(trimmed, 10), options);
        return;
      }

      try {
        engineBreakpoints.setBreakpointByLabel(trimmed, options);
      } catch (resolutionError) {
        console.warn(resolutionError);
      }
    });

    editorPoints.forEach((line) => {
      const index = resolveInstructionIndex(line, map, file ?? undefined);
      if (index !== null) {
        engineBreakpoints.setInstructionBreakpoint(index);
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
      const { engine: loadedEngine, layout, image } = assembleAndLoad(source, {
        assemblerOptions: { enablePseudoInstructions },
      });
      setEngine(loadedEngine);
      setSymbolTable(layout.symbols);
      setProgram(image);
      setSourceMap(layout.sourceMap);

      applyBreakpoints(loadedEngine, breakpoints, layout.symbols, layout.sourceMap, editorBreakpoints, activeFile);
      applyWatches(loadedEngine, watches, layout.symbols);

      setStatus("Running...");
      loadedEngine.run(2_000);

      const state = loadedEngine.getState();
      setRegisters(Array.from({ length: MachineState.REGISTER_COUNT }, (_, index) => state.getRegister(index)));
      setHi(state.getHi());
      setLo(state.getLo());
      setPc(state.getProgramCounter());
      setMemoryEntries(loadedEngine.getMemory().entries());

      const currentLocation = layout.sourceMap.find((entry) => entry.address === state.getProgramCounter());
      setActiveLine(currentLocation?.line ?? null);
      setActiveFile(currentLocation?.file ?? null);

      const { breakpoints: engineBreakpoints, watchEngine } = loadedEngine.getDebuggerEngines();
      if (watchEngine) {
        const snapshot: Record<string, number | undefined> = {};
        watchEngine.getWatchValues().forEach((entry) => {
          snapshot[entry.key] = entry.value;
        });
        setWatchValues(snapshot);
      }

      const hitInfo = engineBreakpoints?.getHitInfo();
      if (hitInfo) {
        const location =
          hitInfo.type === "instruction"
            ? layout.sourceMap.find((entry) => entry.segment === "text" && entry.segmentIndex === hitInfo.value)
            : layout.sourceMap.find((entry) => entry.address === hitInfo.value);
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
        <SettingsDialog
          enablePseudoInstructions={enablePseudoInstructions}
          onTogglePseudoInstructions={setEnablePseudoInstructions}
        />
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

        <EditorPane
          source={source}
          status={status}
          onChange={setSource}
          breakpoints={editorBreakpoints}
          managedBreakpoints={breakpoints}
          watches={watches}
          watchValues={watchValues}
          symbols={symbolTable}
          activeLine={activeLine}
          activeFile={activeFile}
          onToggleBreakpoint={handleToggleEditorBreakpoint}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
          <BreakpointManagerPanel
            breakpoints={breakpoints}
            symbols={symbolTable}
            onAdd={(spec) =>
              setBreakpoints((previous) => {
                const alreadyExists = previous.some(
                  (entry) =>
                    entry.spec === spec.spec &&
                    (entry.oneShot ?? false) === (spec.oneShot ?? false) &&
                    (entry.condition?.kind ?? null) === (spec.condition?.kind ?? null) &&
                    (entry.condition?.register ?? null) === (spec.condition?.register ?? null) &&
                    (entry.condition?.value ?? null) === (spec.condition?.value ?? null),
                );

                if (alreadyExists) return previous;

                return [
                  ...previous,
                  { ...spec, id: `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}` },
                ];
              })
            }
            onRemove={(id) => setBreakpoints((previous) => previous.filter((entry) => entry.id !== id))}
          />
          <div
            style={{
              border: "1px solid #1f2937",
              borderRadius: "0.5rem",
              padding: "0.75rem 1rem",
              backgroundColor: "#0f172a",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <strong style={{ color: "#e2e8f0" }}>Source Breakpoints</strong>
              <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                Click the gutter to toggle instruction breakpoints; remove them here or from the editor.
              </span>
            </div>
            <BreakpointList
              breakpoints={editorBreakpoints}
              program={program ?? undefined}
              onRemove={handleToggleEditorBreakpoint}
            />
          </div>
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
