import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ExecutePane } from "../features/execute-pane";
import { RunToolbar, setActiveSource } from "../features/run-control";
import { EditorPane, StatusBar } from "../features/editor";
import { BreakpointManagerPanel, BreakpointList, BreakpointSpec, WatchManagerPanel, WatchSpec } from "../features/breakpoints";
import { resolveInstructionIndex, toggleBreakpoint } from "../features/breakpoints/services/breakpointService";
import { SettingsDialog, loadSettings, saveSettings } from "../features/settings";
import { MemoryConfiguration, RegistersWindow } from "../features/tools";
import { publishCpuState } from "../features/tools/register-viewer";
import {
  FileExplorer,
  RecentFilesList,
  getWorkingDirectory,
  initializeFileManagerState,
  markFileSaved,
  moveOpenFile,
  openFile as trackOpenFile,
  closeFile,
  setActiveFile as setActiveFileRecord,
  setWorkingDirectory as setFileManagerWorkingDirectory,
  updateFileContent as setOpenFileContent,
  writeFile as writeWorkspaceFile,
} from "../features/file-manager";
import {
  Assembler,
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
  type ExecutionMode,
  getLatestPipelineSnapshot,
  getLatestRuntimeSnapshot,
  type WatchEvent,
  type WatchValue,
  reloadPseudoOpTable,
  subscribeToPipelineSnapshots,
  subscribeToRuntimeSnapshots,
  TerminalDevice,
} from "../core";
import { UnifiedTerminal, type TerminalLine, type TerminalSource } from "../features/console-io";
import { BitmapDisplayState, type AppContext, type MarsTool } from "../core/tools/MarsTool";
import { ToolLoader } from "../core/tools/ToolLoader";
import { HelpSidebar } from "../features/help/components/HelpSidebar";
import { helpReducer, initialHelpState } from "../features/help";

const initialSettings = loadSettings();

const DISPLAY_START = 0xffff0000;
const DISPLAY_SIZE = 0x8;
const KEYBOARD_DOWN_START = 0xffff0010;
const KEYBOARD_UP_START = 0xffff0020;
const KEYBOARD_QUEUE_SIZE = 0x10;
const BITMAP_START = 0xffff1000;
const BITMAP_SIZE = 0x1000;
const BITMAP_END = BITMAP_START + BITMAP_SIZE - 1;
const REAL_TIME_CLOCK_START = 0xffff0030;
const REAL_TIME_CLOCK_SIZE = 0x8;
const SEVEN_SEGMENT_START = 0xffff0038;
const SEVEN_SEGMENT_SIZE = 0x2;
const AUDIO_START = 0xffff0040;
const AUDIO_SIZE = 0x10;

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

const EXTENDED_SCANCODES: Record<string, number[]> = {
  ArrowUp: [0xe0, 0x75],
  ArrowDown: [0xe0, 0x72],
  ArrowLeft: [0xe0, 0x6b],
  ArrowRight: [0xe0, 0x74],
  Enter: [0x0d],
  Escape: [0x1b],
};

function mapKeyboardEventToBytes(event: KeyboardEvent): number[] {
  if (event.key.length === 1) {
    return [event.key.codePointAt(0) ?? 0];
  }

  return EXTENDED_SCANCODES[event.key] ?? [];
}

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
  const [activeFile, setActiveFilePath] = useState<string | null>(null);
  const [fileManager, setFileManager] = useState(initializeFileManagerState());
  const [theme] = useState(initialSettings.theme);
  const [enablePseudoInstructions, setEnablePseudoInstructions] = useState(initialSettings.enablePseudoInstructions);
  const [assembleAllFiles, setAssembleAllFiles] = useState(initialSettings.assembleAllFiles);
  const [delayedBranching, setDelayedBranching] = useState(initialSettings.delayedBranching);
  const [compactMemoryMap, setCompactMemoryMap] = useState(initialSettings.compactMemoryMap);
  const [selfModifyingCodeEnabled, setSelfModifyingCodeEnabled] = useState(initialSettings.selfModifyingCodeEnabled);
  const [showPipelineDelays, setShowPipelineDelays] = useState(initialSettings.showPipelineDelays);
  const [forwardingEnabled, setForwardingEnabled] = useState(initialSettings.forwardingEnabled);
  const [hazardDetectionEnabled, setHazardDetectionEnabled] = useState(initialSettings.hazardDetectionEnabled);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(initialSettings.executionMode);
  const [openTools, setOpenTools] = useState<string[]>([]);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [bitmapDisplay, setBitmapDisplay] = useState<BitmapDisplayState | null>(null);
  const [keyboardDevice, setKeyboardDevice] = useState<KeyboardDevice | null>(null);
  const [availableTools, setAvailableTools] = useState<MarsTool[]>([]);
  const [isHelpOpen, setHelpOpen] = useState(false);
  const [helpState, helpDispatch] = useReducer(helpReducer, initialHelpState);
  const [activeSidebarView, setActiveSidebarView] = useState<"explorer" | "settings" | "tools">("explorer");
  const [bottomPanelTab, setBottomPanelTab] = useState<"terminal" | "execute" | "debug">("terminal");
  const [isBottomPanelOpen, setBottomPanelOpen] = useState(true);
  const [splitMode, setSplitMode] = useState<"single" | "vertical" | "horizontal">("single");
  const [secondaryActiveFile, setSecondaryActiveFile] = useState<string | null>(null);
  const [isRegisterSidebarOpen, setRegisterSidebarOpen] = useState(true);
  const [hasRegisterUpdate, setHasRegisterUpdate] = useState(false);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [terminalSearch, setTerminalSearch] = useState("");
  const terminalViewportRef = useRef<HTMLDivElement | null>(null);

  const assembler = useMemo(() => new Assembler(), []);
  const fallbackState = useMemo(() => new MachineState(), []);
  const fallbackMemory = useMemo(() => new Memory(), []);
  const workingDirectory = fileManager.workingDirectory ?? getWorkingDirectory();
  const activeFileRecord = activeFile ? fileManager.openFiles[activeFile] ?? null : null;
  const isDirty = activeFile ? Boolean(activeFileRecord?.isDirty) : source.trim().length > 0;

  useEffect(() => {
    setActiveSource(source);
  }, [source]);

  useEffect(() => {
    if (fileManager.activeFile && fileManager.activeFile !== activeFile) {
      setActiveFilePath(fileManager.activeFile);
    }
  }, [activeFile, fileManager.activeFile]);

  useEffect(() => {
    if (secondaryActiveFile && !(secondaryActiveFile in fileManager.openFiles)) {
      setSecondaryActiveFile(null);
    }
  }, [fileManager.openFiles, secondaryActiveFile]);

  const toggleRegisterSidebar = useCallback((): void => {
    setRegisterSidebarOpen((open) => !open);
  }, []);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        toggleRegisterSidebar();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [toggleRegisterSidebar]);

  const appendTerminalLine = useCallback(
    (source: TerminalSource, message: string): void => {
      setTerminalLines((previous) => [
        ...previous,
        ...message.split(/\r?\n/).map((text, index) => ({
          id: `${Date.now().toString(16)}-${previous.length + index}`,
          source,
          text,
        })),
      ]);
      setBottomPanelTab("terminal");
      setBottomPanelOpen(true);
    },
    [],
  );

  const clearTerminal = useCallback((): void => {
    setTerminalLines([]);
  }, []);

  const scrollTerminalToTop = useCallback((): void => {
    if (terminalViewportRef.current) {
      terminalViewportRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const scrollTerminalToBottom = useCallback((): void => {
    if (terminalViewportRef.current) {
      terminalViewportRef.current.scrollTo({ top: terminalViewportRef.current.scrollHeight, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    if (terminalLines.length > 0) {
      setBottomPanelOpen(true);
      setBottomPanelTab("terminal");
    }
    scrollTerminalToBottom();
  }, [scrollTerminalToBottom, terminalLines.length]);

  const handleTerminalSearchChange = useCallback((value: string): void => {
    setTerminalSearch(value);
  }, []);

  const handleToggleEditorBreakpoint = useCallback(
    (line: number, fileOverride?: string): void => {
      const engineBreakpoints = engine?.getDebuggerEngines().breakpoints ?? undefined;
      const targetFile = fileOverride ?? activeFile ?? undefined;
      setEditorBreakpoints((previous) => toggleBreakpoint(line, previous, engineBreakpoints ?? undefined, sourceMap, targetFile));
    },
    [activeFile, engine, sourceMap],
  );

  const applyBreakpoints = useCallback(
    (
      targetEngine: CoreEngine,
      specs: BreakpointSpec[],
      symbols: Record<string, number>,
      map: SourceMapEntry[] | undefined,
      editorPoints: number[],
      file: string | null,
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
    },
    [],
  );

  const updateWatchState = useCallback((values?: WatchValue[] | null, changes?: WatchEvent[] | null): void => {
    setWatchValues((current) => {
      const next = values ? Object.fromEntries(values.map((entry) => [entry.key, entry.value])) : { ...current };
      (changes ?? []).forEach((event) => {
        const key = `${event.kind}:${event.identifier}`;
        next[key] = event.newValue;
      });
      return next;
    });
  }, []);

  const applyWatches = useCallback((targetEngine: CoreEngine, specs: WatchSpec[], symbols: Record<string, number>): void => {
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

    updateWatchState(watchEngine.getWatchValues(), null);
  }, [updateWatchState]);

  useEffect(() => {
    if (!engine) return;
    applyBreakpoints(engine, breakpoints, symbolTable, sourceMap, editorBreakpoints, activeFile);
  }, [activeFile, applyBreakpoints, breakpoints, editorBreakpoints, engine, sourceMap, symbolTable]);

  useEffect(() => {
    if (!engine) return;
    applyWatches(engine, watches, symbolTable);
  }, [applyWatches, engine, symbolTable, watches]);

  useEffect(() => {
    ToolLoader.loadTools()
      .then(setAvailableTools)
      .catch((error) => console.error("Failed to load tools", error));
  }, []);

  useEffect(() => {
    saveSettings({
      theme,
      enablePseudoInstructions,
      assembleAllFiles,
      delayedBranching,
      compactMemoryMap,
      selfModifyingCodeEnabled,
      showPipelineDelays,
      forwardingEnabled,
      hazardDetectionEnabled,
      executionMode,
    });
  }, [
    assembleAllFiles,
    compactMemoryMap,
    delayedBranching,
    enablePseudoInstructions,
    executionMode,
    forwardingEnabled,
    hazardDetectionEnabled,
    selfModifyingCodeEnabled,
    showPipelineDelays,
    theme,
  ]);

  const toolContext = useMemo<AppContext>(
    () => ({
      machineState: engine?.getState() ?? fallbackState,
      memory: engine?.getMemory() ?? fallbackMemory,
      assembler,
      program,
      sourceMap,
      memoryEntries,
      memoryConfiguration,
      bitmapDisplay,
      keyboardDevice,
      runtime: engine,
      events: {
        runtime: { subscribe: subscribeToRuntimeSnapshots, latest: getLatestRuntimeSnapshot },
        pipeline: { subscribe: subscribeToPipelineSnapshots, latest: getLatestPipelineSnapshot },
      },
    }),
    [
      assembler,
      bitmapDisplay,
      engine,
      fallbackMemory,
      fallbackState,
      keyboardDevice,
      memoryConfiguration,
      memoryEntries,
      program,
      sourceMap,
    ],
  );

  useEffect(() => {
    if (!engine) return undefined;

    const unsubscribe = subscribeToRuntimeSnapshots((snapshot) => {
      if (snapshot.state !== engine.getState()) return;

      const { state, memory, status: runtimeStatus } = snapshot;

      if (memory) {
        setMemoryEntries(memory.entries());
        setMemoryConfiguration(MemoryConfiguration.fromMemoryMap(memory.getMemoryMap()));
      }

      const currentPc = state.getProgramCounter();
      const currentLocation = sourceMap?.find((entry) => entry.address === currentPc);
      setActiveLine(currentLocation?.line ?? null);
      setActiveFilePath(currentLocation?.file ?? null);

      const { breakpoints: engineBreakpoints, watchEngine } = engine.getDebuggerEngines();
      if (snapshot.watchValues || snapshot.watchChanges) {
        updateWatchState(snapshot.watchValues ?? null, snapshot.watchChanges ?? null);
        if (snapshot.watchChanges?.length) {
          watchEngine?.getWatchChanges();
        }
      } else if (watchEngine) {
        updateWatchState(watchEngine.getWatchValues(), watchEngine.getWatchChanges());
      }

      if (runtimeStatus === "terminated") {
        setStatus("Program terminated");
        return;
      }

      if (runtimeStatus === "breakpoint") {
        const hitInfo = engineBreakpoints?.getHitInfo();
        const location = hitInfo
          ? hitInfo.type === "instruction"
            ? sourceMap?.find((entry) => entry.segment === "text" && entry.segmentIndex === hitInfo.value)
            : sourceMap?.find((entry) => entry.address === hitInfo.value)
          : currentLocation;

        setStatus(location ? `Paused at ${location.file}:${location.line}` : "Paused on breakpoint");
        return;
      }

      if (runtimeStatus === "halted") {
        setStatus("Execution halted");
        return;
      }

      setStatus("Running...");
    });

    return () => unsubscribe();
  }, [engine, sourceMap, updateWatchState]);

  const openTool = useCallback(
    (tool: MarsTool): void => {
      tool.run(toolContext);
      if (tool.Component) {
        setOpenTools((current) => (current.includes(tool.id) ? current : [...current, tool.id]));
      }
    },
    [toolContext],
  );

  const closeTool = useCallback((toolId: string): void => {
    setOpenTools((current) => current.filter((id) => id !== toolId));
  }, []);

  const handleToggleForwarding = (enabled: boolean): void => {
    setForwardingEnabled(enabled);
    engine?.setForwardingEnabled?.(enabled);
  };

  const handleToggleHazardDetection = (enabled: boolean): void => {
    setHazardDetectionEnabled(enabled);
    engine?.setHazardDetectionEnabled?.(enabled);
  };

  const handleChangeExecutionMode = (mode: ExecutionMode): void => {
    setExecutionMode(mode);
    engine?.setExecutionMode?.(mode);
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

  const activateFile = useCallback(
    (filePath: string | null, fallbackContent?: string): void => {
      const content = filePath
        ? fileManager.openFiles[filePath]?.content ?? fallbackContent ?? ""
        : fallbackContent ?? source;
      setActiveFilePath(filePath);
      setSource(content);
      setFileManager((current) => setActiveFileRecord(current, filePath));
    },
    [fileManager.openFiles, source],
  );

  const handleFileOpen = useCallback(
    (filePath: string, content: string): void => {
      setFileManager((current) => trackOpenFile(current, filePath, content));
      activateFile(filePath, content);
    },
    [activateFile],
  );

  const handleSourceChange = useCallback(
    (value: string, filePath: string | null = activeFile): void => {
      const targetFile = filePath ?? null;
      if (targetFile) {
        setFileManager((current) => setOpenFileContent(current, targetFile, value));
        if (targetFile === activeFile) {
          setSource(value);
        }
      } else {
        setSource(value);
      }
    },
    [activeFile],
  );

  const handleSave = useCallback(async (): Promise<void> => {
    if (!activeFile) return;
    await writeWorkspaceFile(activeFile, source);
    setFileManager((current) => markFileSaved(current, activeFile));
  }, [activeFile, source]);

  const handleSaveAs = useCallback(async (): Promise<void> => {
    const suggested = activeFile ?? `${workingDirectory}/untitled.asm`;
    const target = typeof window !== "undefined" ? window.prompt("Save file as", suggested) : null;
    if (!target) return;
    await writeWorkspaceFile(target, source);
    setActiveFilePath(target);
    setFileManager((current) => markFileSaved(trackOpenFile(current, target, source), target));
  }, [activeFile, source, workingDirectory]);

  const handleNewFile = useCallback((): void => {
    setSource("");
    setActiveFilePath(null);
    setFileManager((current) => ({ ...current, activeFile: null }));
  }, []);

  const handleOpenFilePicker = useCallback(async (): Promise<void> => {
    if (typeof window === "undefined" || typeof window.showOpenFilePicker !== "function") return;
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: "MIPS Assembly", accept: { "text/plain": [".asm", ".s"] } }],
      });
      const file = await handle.getFile();
      const content = await file.text();
      handleFileOpen(handle.name, content);
    } catch (fileError) {
      console.warn("File open cancelled or failed", fileError);
    }
  }, [handleFileOpen]);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (event.ctrlKey && key === "s") {
        event.preventDefault();
        if (event.shiftKey) {
          void handleSaveAs();
        } else {
          void handleSave();
        }
      }

      if (event.ctrlKey && key === "o") {
        event.preventDefault();
        void handleOpenFilePicker();
      }

      if (event.ctrlKey && key === "n") {
        event.preventDefault();
        handleNewFile();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleNewFile, handleOpenFilePicker, handleSave, handleSaveAs]);

  useEffect(() => {
    if (!keyboardDevice) return;

    const shouldCapture = (event: KeyboardEvent): boolean => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditable = Boolean(target?.isContentEditable);
      if (isEditable || tagName === "input" || tagName === "textarea") {
        return false;
      }

      return !event.defaultPrevented;
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!shouldCapture(event)) return;
      const bytes = mapKeyboardEventToBytes(event);
      if (bytes.length === 0) return;
      keyboardDevice.queueFromBytes("down", bytes);
    };

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (!shouldCapture(event)) return;
      const bytes = mapKeyboardEventToBytes(event);
      if (bytes.length === 0) return;
      keyboardDevice.queueFromBytes("up", bytes);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [keyboardDevice]);

  const handleRun = (): void => {
    setError(null);
    setActiveLine(null);
    setKeyboardDevice(null);
    let runStage: TerminalSource = "asm";
    const terminalDevice = new TerminalDevice((message) => appendTerminalLine("run", message));
    appendTerminalLine("asm", "Assembling program...");
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
            {
              start: KEYBOARD_DOWN_START,
              end: KEYBOARD_DOWN_START + KEYBOARD_QUEUE_SIZE - 1,
              device: keyboardDeviceInstance.getQueueDevice("down"),
            },
            {
              start: KEYBOARD_UP_START,
              end: KEYBOARD_UP_START + KEYBOARD_QUEUE_SIZE - 1,
              device: keyboardDeviceInstance.getQueueDevice("up"),
            },
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
        forwardingEnabled,
        hazardDetectionEnabled,
        executionMode,
        devices: { terminal: terminalDevice },
      });
      setKeyboardDevice(keyboardDeviceInstance);
      setEngine(loadedEngine);
      setSymbolTable(layout.symbols);
      setProgram(image);
      setSourceMap(layout.sourceMap);

      applyBreakpoints(loadedEngine, breakpoints, layout.symbols, layout.sourceMap, editorBreakpoints, activeFile);
      applyWatches(loadedEngine, watches, layout.symbols);

      appendTerminalLine("asm", "Assembly complete. Starting execution...");
      runStage = "run";
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
      setActiveFilePath(currentLocation?.file ?? null);

      const { breakpoints: engineBreakpoints, watchEngine } = loadedEngine.getDebuggerEngines();
      if (watchEngine) {
        updateWatchState(watchEngine.getWatchValues(), watchEngine.getWatchChanges());
      }

      const hitInfo = engineBreakpoints?.getHitInfo();
      if (hitInfo) {
        const location =
          hitInfo.type === "instruction"
            ? layout.sourceMap.find((entry) => entry.segment === "text" && entry.segmentIndex === hitInfo.value)
            : layout.sourceMap.find((entry) => entry.address === hitInfo.value);
        setStatus(location ? `Paused at ${location.file}:${location.line}` : "Paused on breakpoint");
        appendTerminalLine("run", location ? `Paused at ${location.file}:${location.line}` : "Paused on breakpoint");
        return;
      }

      const statusMessage = state.isTerminated() ? "Program terminated" : "Execution halted";
      setStatus(statusMessage);
      appendTerminalLine("run", statusMessage);
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : String(runError);
      appendTerminalLine(runStage, message);
      setError(message);
      setStatus("Encountered an error");
    }
  };

  const handleFlushInstructionCache = (): void => {
    if (!engine) return;

    const memory = engine.getMemory();
    memory.flushCaches();
    setMemoryEntries(memory.entries());
    setStatus("Instruction cache flushed");
  };

  const toolsButtonStyle: React.CSSProperties = {
    backgroundColor: "var(--color-elevated)",
    color: "var(--color-text)",
    border: "1px solid var(--color-border)",
    borderRadius: "0.5rem",
    padding: "0.4rem 0.75rem",
    cursor: "pointer",
  };

  const toolsMenuStyle: React.CSSProperties = {
    position: "absolute",
    right: 0,
    top: "100%",
    marginTop: "0.25rem",
    backgroundColor: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "0.5rem",
    boxShadow: "var(--shadow-strong)",
    padding: "0.25rem",
    minWidth: "200px",
    zIndex: 10,
  };

  const openHelp = useCallback(
    (query?: string): void => {
      if (query) {
        helpDispatch({ type: "search", query });
      }
      setHelpOpen(true);
    },
    [],
  );

  const toolsMenuItemStyle: React.CSSProperties = {
    width: "100%",
    textAlign: "left",
    backgroundColor: "transparent",
    color: "var(--color-text)",
    border: "none",
    padding: "0.5rem 0.75rem",
    borderRadius: "0.4rem",
    cursor: "pointer",
  };

  const orderedOpenFiles = useMemo(() => {
    const known = new Set(Object.keys(fileManager.openFiles));
    const ordered = fileManager.openFileOrder.filter((entry) => known.has(entry));
    const remainder = Array.from(known).filter((entry) => !fileManager.openFileOrder.includes(entry));
    return [...ordered, ...remainder];
  }, [fileManager.openFileOrder, fileManager.openFiles]);

  useEffect(() => {
    if (splitMode === "single") {
      setSecondaryActiveFile(null);
      return;
    }

    if (!secondaryActiveFile) {
      const candidate = orderedOpenFiles.find((entry) => entry !== activeFile) ?? activeFile ?? null;
      setSecondaryActiveFile(candidate);
    }
  }, [activeFile, orderedOpenFiles, secondaryActiveFile, splitMode]);

  const tabLabel = (filePath: string): string => filePath.split(/[/\\]/).pop() ?? filePath;
  const primarySource = activeFile ? fileManager.openFiles[activeFile]?.content ?? "" : source;
  const secondarySource = secondaryActiveFile
    ? fileManager.openFiles[secondaryActiveFile]?.content ?? ""
    : primarySource;

  const handleCloseTab = useCallback((filePath: string): void => {
    setFileManager((current) => {
      const next = closeFile(current, filePath);
      if (next.activeFile !== current.activeFile) {
        const content = next.activeFile ? next.openFiles[next.activeFile]?.content ?? "" : "";
        setActiveFilePath(next.activeFile);
        setSource(content);
      }
      return next;
    });
  }, []);

  const handleActivateTab = useCallback(
    (filePath: string): void => {
      const content = fileManager.openFiles[filePath]?.content ?? "";
      activateFile(filePath, content);
    },
    [activateFile, fileManager.openFiles],
  );

  const renderSidebarContent = (): React.ReactNode => {
    if (activeSidebarView === "explorer") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, color: "#e2e8f0" }}>Workspace</span>
            <button style={toolsButtonStyle} onClick={() => void handleOpenFilePicker()}>
              ⬆️ Open
            </button>
          </div>
          <FileExplorer
            workingDirectory={workingDirectory}
            onFileOpen={handleFileOpen}
            onWorkspaceChange={(directory) =>
              setFileManager((current) => setFileManagerWorkingDirectory(current, directory))
            }
          />
          <RecentFilesList files={fileManager.recentFiles} onOpenFile={handleFileOpen} />
        </div>
      );
    }

    if (activeSidebarView === "settings") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <SettingsDialog
            enablePseudoInstructions={enablePseudoInstructions}
            assembleAllFiles={assembleAllFiles}
            delayedBranching={delayedBranching}
            compactMemoryMap={compactMemoryMap}
            selfModifyingCodeEnabled={selfModifyingCodeEnabled}
            showPipelineDelays={showPipelineDelays}
            forwardingEnabled={forwardingEnabled}
            hazardDetectionEnabled={hazardDetectionEnabled}
            executionMode={executionMode}
            onTogglePseudoInstructions={setEnablePseudoInstructions}
            onToggleAssembleAllFiles={setAssembleAllFiles}
            onToggleDelayedBranching={setDelayedBranching}
            onToggleCompactMemoryMap={setCompactMemoryMap}
            onToggleSelfModifyingCode={setSelfModifyingCodeEnabled}
            onToggleShowPipelineDelays={setShowPipelineDelays}
            onToggleForwarding={handleToggleForwarding}
            onToggleHazardDetection={handleToggleHazardDetection}
            onChangeExecutionMode={handleChangeExecutionMode}
            onReloadPseudoOps={handleReloadPseudoOps}
          />
          <MemoryConfiguration
            onChange={(configuration) => setMemoryConfiguration(configuration)}
            configuration={memoryConfiguration}
          />
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <span style={{ fontWeight: 700, color: "#e2e8f0" }}>Tools</span>
        {availableTools.map((tool) => {
          const toolId = tool.id;
          const isEnabled = tool.isAvailable ? tool.isAvailable(toolContext) : true;
          return (
            <button
              key={toolId}
              style={{
                ...toolsButtonStyle,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                opacity: isEnabled ? 1 : 0.6,
              }}
              disabled={!isEnabled}
              onClick={() => openTool(tool)}
            >
              <span>{tool.name}</span>
              <span style={{ color: "#9ca3af" }}>↗</span>
            </button>
          );
        })}
        <button style={toolsButtonStyle} onClick={() => openHelp()}>
          Help & Docs
        </button>
      </div>
    );
  };

  const renderBottomPanel = (): React.ReactNode => {
    if (bottomPanelTab === "terminal") {
      return (
        <div style={{ display: "grid", gridTemplateRows: "auto auto 1fr", gap: "0.65rem", height: "100%", minHeight: 0 }}>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "#a5b4fc", fontWeight: 700 }}>Status:</span>
            <span>{status}</span>
            {activeLine !== null && <span style={{ color: "#38bdf8" }}>Line {activeLine}</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.5rem", alignItems: "start" }}>
            <RunToolbar
              onRun={handleRun}
              status={status}
              onFlushInstructionCache={handleFlushInstructionCache}
              flushEnabled={engine !== null}
            />
            {error && (
              <div
                style={{
                  padding: "0.75rem",
                  borderRadius: "0.5rem",
                  backgroundColor: "#2b0f1c",
                  border: "1px solid #7f1d1d",
                  maxWidth: "320px",
                }}
              >
                <div style={{ color: "#fca5a5" }}>{error}</div>
                <button style={{ ...toolsButtonStyle, marginTop: "0.5rem" }} onClick={() => openHelp(error)}>
                  View related help
                </button>
              </div>
            )}
          </div>
          <div style={{ minHeight: 0 }}>
            <UnifiedTerminal
              lines={terminalLines}
              searchQuery={terminalSearch}
              onSearchChange={handleTerminalSearchChange}
              onClear={clearTerminal}
              onScrollToTop={scrollTerminalToTop}
              onScrollToBottom={scrollTerminalToBottom}
              viewportRef={terminalViewportRef}
            />
          </div>
        </div>
      );
    }

    if (bottomPanelTab === "execute") {
      return <ExecutePane memoryEntries={memoryEntries} />;
    }

    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.75rem" }}>
        <BreakpointManagerPanel
          breakpoints={breakpoints}
          symbols={symbolTable}
          lineBreakpoints={editorBreakpoints}
          sourceMap={sourceMap}
          file={activeFile}
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
          onToggleLine={(line) => handleToggleEditorBreakpoint(line, activeFile ?? undefined)}
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
            onRemove={(line) => handleToggleEditorBreakpoint(line, activeFile ?? undefined)}
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
    );
  };

  return (
    <main className="app-shell">
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--color-border)",
          background: "linear-gradient(90deg, var(--color-elevated), var(--color-surface-strong))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              background: "var(--color-elevated)",
              border: "1px solid var(--color-border)",
              borderRadius: "0.4rem",
              padding: "0.35rem 0.5rem",
              fontWeight: 700,
              letterSpacing: "0.05em",
            }}
          >
            MARS Next
          </div>
          <span style={{ color: "var(--color-muted)" }}>Modern IDE shell</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button style={toolsButtonStyle} onClick={handleNewFile} title="New file">
            🆕
          </button>
          <button style={toolsButtonStyle} onClick={() => void handleOpenFilePicker()} title="Open file">
            📂
          </button>
          <button
            style={{ ...toolsButtonStyle, opacity: activeFile ? 1 : 0.6 }}
            disabled={!activeFile}
            onClick={() => void handleSave()}
            title="Save"
          >
            💾
          </button>
          <button style={toolsButtonStyle} onClick={() => void handleSaveAs()} title="Save as">
            📁
          </button>
          <div style={{ position: "relative" }}>
            <button style={toolsButtonStyle} onClick={() => setToolsMenuOpen((open) => !open)} title="Tool drawer">
              🧰
            </button>
            {toolsMenuOpen && (
              <div style={toolsMenuStyle}>
                {availableTools.map((tool) => {
                  const toolId = tool.id;
                  const isEnabled = tool.isAvailable ? tool.isAvailable(toolContext) : true;
                  const menuItemStyle: React.CSSProperties = {
                    ...toolsMenuItemStyle,
                    ...(isEnabled ? {} : { opacity: 0.6, cursor: "not-allowed" }),
                  };

                  return (
                    <button
                      key={toolId}
                      style={menuItemStyle}
                      disabled={!isEnabled}
                      onClick={() => {
                        if (!isEnabled) return;
                        openTool(tool);
                        setToolsMenuOpen(false);
                      }}
                    >
                      {tool.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button style={toolsButtonStyle} onClick={() => openHelp()} title="Help">
            ❔
          </button>
        </div>
      </header>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "0.75rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateRows: isBottomPanelOpen ? "1fr 320px" : "1fr",
            gap: "0.75rem",
            flex: 1,
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "60px 1fr",
              gap: "0.5rem",
              minHeight: 0,
            }}
          >
            <div
              style={{
                border: "1px solid #111827",
                borderRadius: "0.5rem",
                background: "#0d1628",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "0.5rem 0",
                gap: "0.5rem",
              }}
            >
              {["explorer", "settings", "tools"].map((item) => {
                const isActive = activeSidebarView === item;
                const icon = item === "explorer" ? "📁" : item === "settings" ? "⚙️" : "🛠️";
                return (
                  <button
                    key={item}
                    onClick={() => setActiveSidebarView(item as typeof activeSidebarView)}
                    style={{
                      background: isActive ? "#1e293b" : "transparent",
                      color: isActive ? "#a5b4fc" : "#cbd5e1",
                      border: "none",
                      borderRadius: "0.4rem",
                      width: "80%",
                      padding: "0.5rem 0",
                      cursor: "pointer",
                    }}
                  >
                    {icon}
                  </button>
                );
              })}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: `${isRegisterSidebarOpen ? "320px" : "28px"} 320px 1fr`,
                gap: "0.5rem",
                minHeight: 0,
                transition: "grid-template-columns 200ms ease",
              }}
            >
              <div
                style={{
                  border: isRegisterSidebarOpen ? "1px solid #111827" : "1px solid transparent",
                  borderRadius: "0.5rem",
                  background: isRegisterSidebarOpen ? "#0f172a" : "transparent",
                  display: "flex",
                  minHeight: 0,
                  transition: "background-color 150ms ease, border-color 150ms ease",
                  boxShadow: isRegisterSidebarOpen ? "0 10px 30px rgba(0,0,0,0.35)" : "none",
                }}
              >
                <div
                  style={{
                    flex: isRegisterSidebarOpen ? 1 : 0,
                    padding: isRegisterSidebarOpen ? "0.75rem" : 0,
                    overflow: "hidden",
                    opacity: isRegisterSidebarOpen ? 1 : 0,
                    transition: "flex 180ms ease, padding 180ms ease, opacity 150ms ease",
                    minWidth: 0,
                    pointerEvents: isRegisterSidebarOpen ? "auto" : "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span style={{ fontWeight: 700, color: "#e2e8f0" }}>Registers</span>
                      <span style={{ color: "#64748b", fontSize: "0.85rem" }}>Ctrl+Shift+R</span>
                    </div>
                    <button
                      style={toolsButtonStyle}
                      onClick={toggleRegisterSidebar}
                      title="Collapse registers (Ctrl+Shift+R)"
                    >
                      ◀
                    </button>
                  </div>
                  <RegistersWindow onHighlightChange={setHasRegisterUpdate} />
                </div>
                <button
                  aria-label={isRegisterSidebarOpen ? "Collapse register sidebar" : "Expand register sidebar"}
                  onClick={toggleRegisterSidebar}
                  style={{
                    width: "18px",
                    border: "none",
                    background: "linear-gradient(180deg, #111827, #0f172a)",
                    color: "#cbd5e1",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.35rem",
                    borderRadius: "0 0.5rem 0.5rem 0",
                  }}
                  title={isRegisterSidebarOpen ? "Collapse registers" : "Expand registers"}
                >
                  <span style={{ transform: isRegisterSidebarOpen ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}>
                    ▶
                  </span>
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "9999px",
                      backgroundColor: hasRegisterUpdate ? "#22c55e" : "#475569",
                      boxShadow: hasRegisterUpdate ? "0 0 0 2px rgba(34,197,94,0.35)" : "none",
                    }}
                  />
                </button>
              </div>

              <aside
                style={{
                  border: "1px solid #111827",
                  borderRadius: "0.5rem",
                  padding: "0.75rem",
                  background: "#0f172a",
                  overflow: "auto",
                }}
              >
                {renderSidebarContent()}
              </aside>

              <section
                style={{
                  border: "1px solid #111827",
                  borderRadius: "0.5rem",
                  padding: "0.5rem 0.75rem",
                  background: "#0f172a",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  minHeight: 0,
                }}
              >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  borderBottom: "1px solid #111827",
                  paddingBottom: "0.35rem",
                }}
              >
                <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                  <button style={toolsButtonStyle} onClick={() => setSplitMode("single")} title="Single editor">
                    ▢
                  </button>
                  <button style={toolsButtonStyle} onClick={() => setSplitMode("vertical")} title="Split vertically">
                    ⇄
                  </button>
                  <button style={toolsButtonStyle} onClick={() => setSplitMode("horizontal")} title="Split horizontally">
                    ⇅
                  </button>
                  <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                    {activeFile ? `Editing ${tabLabel(activeFile)}` : "Scratch buffer"}
                  </div>
                </div>
                <StatusBar activeFile={activeFile} workingDirectory={workingDirectory} dirty={isDirty} />
              </div>

              <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", overflowX: "auto" }}>
                {orderedOpenFiles.map((filePath, index) => {
                  const isActive = filePath === activeFile;
                  const record = fileManager.openFiles[filePath];
                  return (
                    <div
                      key={filePath}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "0.4rem",
                        background: isActive ? "#1f2937" : "#111827",
                        border: "1px solid #1f2937",
                        boxShadow: isActive ? "0 10px 25px rgba(0,0,0,0.25)" : undefined,
                      }}
                    >
                      <button onClick={() => handleActivateTab(filePath)} style={{ color: "inherit", background: "transparent", border: "none", cursor: "pointer" }}>
                        {tabLabel(filePath)}{record?.isDirty ? " •" : ""}
                      </button>
                      <div style={{ display: "flex", gap: "0.2rem" }}>
                        <button style={toolsButtonStyle} onClick={() => setFileManager((current) => moveOpenFile(current, filePath, -1))} title="Move left" disabled={index === 0}>
                          ←
                        </button>
                        <button
                          style={toolsButtonStyle}
                          onClick={() => setFileManager((current) => moveOpenFile(current, filePath, 1))}
                          title="Move right"
                          disabled={index === orderedOpenFiles.length - 1}
                        >
                          →
                        </button>
                        <button style={toolsButtonStyle} onClick={() => handleCloseTab(filePath)} title="Close tab">
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  flex: 1,
                  display: "grid",
                  gridTemplateColumns: splitMode === "vertical" ? "1fr 1fr" : "1fr",
                  gridTemplateRows: splitMode === "horizontal" ? "1fr 1fr" : "1fr",
                  gap: "0.5rem",
                  minHeight: 0,
                }}
              >
                <EditorPane
                  source={primarySource}
                  status={status}
                  onChange={(value) => handleSourceChange(value, activeFile)}
                  breakpoints={editorBreakpoints}
                  managedBreakpoints={breakpoints}
                  watches={watches}
                  watchValues={watchValues}
                  symbols={symbolTable}
                  activeLine={activeLine}
                  activeFile={activeFile}
                  onToggleBreakpoint={(line) => handleToggleEditorBreakpoint(line, activeFile ?? undefined)}
                />
                {splitMode !== "single" && (
                  <EditorPane
                    source={secondarySource}
                    status={status}
                    onChange={(value) => handleSourceChange(value, secondaryActiveFile)}
                    breakpoints={editorBreakpoints}
                    managedBreakpoints={breakpoints}
                    watches={watches}
                    watchValues={watchValues}
                    symbols={symbolTable}
                    activeLine={secondaryActiveFile === activeFile ? activeLine : null}
                    activeFile={secondaryActiveFile}
                    onToggleBreakpoint={(line) => handleToggleEditorBreakpoint(line, secondaryActiveFile ?? undefined)}
                  />
                )}
              </div>
            </section>
          </div>

          {isBottomPanelOpen && (
            <section
              style={{
                border: "1px solid #111827",
                borderRadius: "0.5rem",
                padding: "0.5rem 0.75rem",
                background: "#0f172a",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                minHeight: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                  {["terminal", "execute", "debug"].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setBottomPanelTab(tab as typeof bottomPanelTab)}
                      style={{
                        ...toolsButtonStyle,
                        backgroundColor: bottomPanelTab === tab ? "#1f2937" : "#111827",
                        borderColor: "#1f2937",
                      }}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
                <button style={toolsButtonStyle} onClick={() => setBottomPanelOpen(false)} title="Collapse panel">
                  ⤵
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{renderBottomPanel()}</div>
            </section>
          )}
        </div>
      </div>
      {!isBottomPanelOpen && (
        <div style={{ padding: "0.35rem 0.75rem", textAlign: "right" }}>
          <button style={toolsButtonStyle} onClick={() => setBottomPanelOpen(true)}>
            Show Panel
          </button>
        </div>
      )}
      {openTools.map((toolId) => {
        const tool = availableTools.find((entry) => entry.id === toolId);
        if (!tool) return null;
        if (tool.isAvailable && !tool.isAvailable(toolContext)) {
          return null;
        }
        if (!tool.Component) return null;

        const ToolComponent = tool.Component;
        return (
          <React.Fragment key={toolId}>
            <ToolComponent appContext={toolContext} onClose={() => closeTool(toolId)} />
          </React.Fragment>
        );
      })}
      <HelpSidebar state={helpState} dispatch={helpDispatch} isOpen={isHelpOpen} onClose={() => setHelpOpen(false)} />
    </main>
  );
}
