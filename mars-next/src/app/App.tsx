import React, { useCallback, useState } from "react";
import { MemoryTable } from "../features/memory-view";
import { RunToolbar } from "../features/run-control";
import { EditorPane } from "../features/editor";
import { BreakpointManagerPanel, BreakpointList, BreakpointSpec, WatchManagerPanel, WatchSpec } from "../features/breakpoints";
import { resolveInstructionIndex, toggleBreakpoint } from "../features/breakpoints/services/breakpointService";
import { SettingsDialog } from "../features/settings";
import {
  BitmapDisplayWindow,
  DataSegmentWindow,
  KeyboardWindow,
  MemoryConfiguration,
  RegistersWindow,
  TextSegmentWindow,
} from "../features/tools";
import { publishCpuState } from "../features/tools/register-viewer";
import {
  AudioDevice,
  BinaryImage,
  BitmapDisplayDevice,
  CoreEngine,
  DisplayDevice,
  KeyboardDevice,
  MachineState,
  Memory,
  MemoryMap,
  RealTimeClockDevice,
  SevenSegmentDisplayDevice,
  SourceMapEntry,
  assembleAndLoad,
  reloadPseudoOpTable,
  type DirtyRegion,
} from "../core";

const KEYBOARD_START = 0xffff0000;
const KEYBOARD_SIZE = 0x8;
const DISPLAY_START = KEYBOARD_START + KEYBOARD_SIZE;
const DISPLAY_SIZE = 0x8;
const BITMAP_START = 0xffff0100;
const BITMAP_END = 0xffff01ff;
const REAL_TIME_CLOCK_START = 0xffff0010;
const REAL_TIME_CLOCK_SIZE = 0x8;
const SEVEN_SEGMENT_START = 0xffff0018;
const SEVEN_SEGMENT_SIZE = 0x2;
const AUDIO_START = 0xffff0020;
const AUDIO_SIZE = 0x10;

interface BitmapDisplayState {
  width: number;
  height: number;
  buffer: Uint8Array;
  dirtyRegions: DirtyRegion[];
}

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
  const [memoryEntries, setMemoryEntries] = useState<Array<{ address: number; value: number }>>([]);
  const [memoryConfiguration, setMemoryConfiguration] = useState<MemoryConfiguration | null>(null);
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
  const [isDataViewerOpen, setIsDataViewerOpen] = useState(false);
  const [isTextViewerOpen, setIsTextViewerOpen] = useState(false);
  const [isBitmapDisplayOpen, setIsBitmapDisplayOpen] = useState(false);
  const [isKeyboardWindowOpen, setIsKeyboardWindowOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [bitmapDisplay, setBitmapDisplay] = useState<BitmapDisplayState | null>(null);
  const [keyboardDevice, setKeyboardDevice] = useState<KeyboardDevice | null>(null);

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

  const handleReloadPseudoOps = (): void => {
    setError(null);
    try {
      setStatus("Reloading pseudo-ops...");
      reloadPseudoOpTable();
      setStatus("Pseudo-ops reloaded");
    } catch (reloadError) {
      const message = reloadError instanceof Error ? reloadError.message : String(reloadError);
      setError(`Failed to reload pseudo-ops: ${message}`);
      setStatus("Failed to reload pseudo-ops");
    }
  };

  const handleRun = (): void => {
    setError(null);
    setActiveLine(null);
    setActiveFile(null);
    setKeyboardDevice(null);
    try {
      setStatus("Assembling...");
      const bitmapDevice = new BitmapDisplayDevice({
        onFlush: (regions, buffer) => {
          setBitmapDisplay({
            width: bitmapDevice.width,
            height: bitmapDevice.height,
            buffer: new Uint8Array(buffer),
            dirtyRegions: regions.map((region) => ({ ...region })),
          });
        },
      });

      const keyboardDeviceInstance = new KeyboardDevice();

      const customMemory = new Memory({
        map: new MemoryMap({
          devices: [
            { start: KEYBOARD_START, end: KEYBOARD_START + KEYBOARD_SIZE - 1, device: keyboardDeviceInstance },
            { start: DISPLAY_START, end: DISPLAY_START + DISPLAY_SIZE - 1, device: new DisplayDevice() },
            { start: BITMAP_START, end: BITMAP_END, device: bitmapDevice },
            {
              start: REAL_TIME_CLOCK_START,
              end: REAL_TIME_CLOCK_START + REAL_TIME_CLOCK_SIZE - 1,
              device: new RealTimeClockDevice(),
            },
            {
              start: SEVEN_SEGMENT_START,
              end: SEVEN_SEGMENT_START + SEVEN_SEGMENT_SIZE - 1,
              device: new SevenSegmentDisplayDevice(),
            },
            { start: AUDIO_START, end: AUDIO_START + AUDIO_SIZE - 1, device: new AudioDevice() },
          ],
        }),
      });

      setBitmapDisplay({
        width: bitmapDevice.width,
        height: bitmapDevice.height,
        buffer: new Uint8Array(bitmapDevice.getBuffer()),
        dirtyRegions: [
          {
            x: 0,
            y: 0,
            width: bitmapDevice.width,
            height: bitmapDevice.height,
          },
        ],
      });

      const { engine: loadedEngine, layout, image } = assembleAndLoad(source, {
        assemblerOptions: { enablePseudoInstructions },
        memory: customMemory,
      });
      setKeyboardDevice(keyboardDeviceInstance);
      setEngine(loadedEngine);
      setSymbolTable(layout.symbols);
      setProgram(image);
      setSourceMap(layout.sourceMap);

      applyBreakpoints(loadedEngine, breakpoints, layout.symbols, layout.sourceMap, editorBreakpoints, activeFile);
      applyWatches(loadedEngine, watches, layout.symbols);

      setStatus("Running...");
      loadedEngine.run(2_000);

      const state = loadedEngine.getState();
      const memory = loadedEngine.getMemory();
      publishCpuState({
        registers: Array.from({ length: MachineState.REGISTER_COUNT }, (_, index) => state.getRegister(index)),
        hi: state.getHi(),
        lo: state.getLo(),
        pc: state.getProgramCounter(),
      });
      setMemoryEntries(memory.entries());
      setMemoryConfiguration(MemoryConfiguration.fromMemoryMap(memory.getMemoryMap()));

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

  const toolsButtonStyle: React.CSSProperties = {
    backgroundColor: "#1f2937",
    color: "#e5e7eb",
    border: "1px solid #374151",
    borderRadius: "0.5rem",
    padding: "0.4rem 0.75rem",
    cursor: "pointer",
  };

  const toolsMenuStyle: React.CSSProperties = {
    position: "absolute",
    right: 0,
    top: "100%",
    marginTop: "0.25rem",
    backgroundColor: "#0f172a",
    border: "1px solid #1f2937",
    borderRadius: "0.5rem",
    boxShadow: "0 10px 25px rgba(0, 0, 0, 0.35)",
    padding: "0.25rem",
    minWidth: "200px",
    zIndex: 10,
  };

  const toolsMenuItemStyle: React.CSSProperties = {
    width: "100%",
    textAlign: "left",
    backgroundColor: "transparent",
    color: "#e5e7eb",
    border: "none",
    padding: "0.5rem 0.75rem",
    borderRadius: "0.4rem",
    cursor: "pointer",
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", position: "relative" }}>
          <div style={{ position: "relative" }}>
            <button style={toolsButtonStyle} onClick={() => setToolsMenuOpen((open) => !open)}>
              Tools ▾
            </button>
            {toolsMenuOpen && (
              <div style={toolsMenuStyle}>
                <button
                  style={toolsMenuItemStyle}
                  onClick={() => {
                    setIsDataViewerOpen(true);
                    setToolsMenuOpen(false);
                  }}
                >
                  Data Segment Viewer
                </button>
                <button
                  style={toolsMenuItemStyle}
                  onClick={() => {
                    setIsTextViewerOpen(true);
                    setToolsMenuOpen(false);
                  }}
                >
                  Text Segment Viewer
                </button>
                <button
                  style={toolsMenuItemStyle}
                  onClick={() => {
                    setIsBitmapDisplayOpen(true);
                    setToolsMenuOpen(false);
                  }}
                >
                  Bitmap Display
                </button>
                <button
                  style={toolsMenuItemStyle}
                  onClick={() => {
                    setIsKeyboardWindowOpen(true);
                    setToolsMenuOpen(false);
                  }}
                >
                  Keyboard Input
                </button>
              </div>
            )}
          </div>
          <span style={{ color: "#9ca3af" }}>Dark mode by default</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <SettingsDialog
          enablePseudoInstructions={enablePseudoInstructions}
          onTogglePseudoInstructions={setEnablePseudoInstructions}
          onReloadPseudoOps={handleReloadPseudoOps}
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
          <RegistersWindow />
          <MemoryTable entries={memoryEntries} />
        </div>
      </div>
      {isDataViewerOpen && (
        <DataSegmentWindow
          entries={memoryEntries}
          configuration={memoryConfiguration}
          onClose={() => setIsDataViewerOpen(false)}
        />
      )}
      {isTextViewerOpen && (
        <TextSegmentWindow program={program} sourceMap={sourceMap} onClose={() => setIsTextViewerOpen(false)} />
      )}
      {isKeyboardWindowOpen && <KeyboardWindow device={keyboardDevice} onClose={() => setIsKeyboardWindowOpen(false)} />}
      {isBitmapDisplayOpen && bitmapDisplay && (
        <BitmapDisplayWindow
          width={bitmapDisplay.width}
          height={bitmapDisplay.height}
          buffer={bitmapDisplay.buffer}
          dirtyRegions={bitmapDisplay.dirtyRegions}
          onClose={() => setIsBitmapDisplayOpen(false)}
        />
      )}
    </main>
  );
}
