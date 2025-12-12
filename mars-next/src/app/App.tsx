import React, { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExecutePane } from "../features/execute-pane";
import { RunToolbar, setActiveSource } from "../features/run-control";
import { EditorPane, StatusBar } from "../features/editor";
import { BreakpointManagerPanel, BreakpointList, BreakpointSpec, WatchManagerPanel, WatchSpec } from "../features/breakpoints";
import { resolveInstructionIndex, toggleBreakpoint } from "../features/breakpoints/services/breakpointService";
import { SettingsDialog, loadSettings, saveSettings } from "../features/settings";
import { MemoryConfiguration } from "../features/tools/data-viewer";
import { LazyRegistersWindow } from "../features/tools/register-viewer";
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
  updateFileContent as setOpenFileContent,
  writeFile as writeWorkspaceFile,
} from "../features/file-manager";
import { setWorkingDirectory as setFileManagerWorkingDirectory } from "../features/file-manager/state/fileManagerSlice";
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
import { renderToolIcon } from "../ui/icons/ToolIcons";

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

type OpenToolInstance = {
  id: string;
  mode: "docked" | "detached";
};

function mapKeyboardEventToBytes(event: KeyboardEvent): number[] {
  if (event.key.length === 1) {
    return [event.key.codePointAt(0) ?? 0];
  }

  return EXTENDED_SCANCODES[event.key] ?? [];
}

function DetachedToolWindow({
  tool,
  appContext,
  onClose,
}: {
  tool: MarsTool;
  appContext: AppContext;
  onClose: () => void;
}): React.JSX.Element | null {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const windowRef = useRef<Window | null>(null);

  useEffect(() => {
    const newWindow = window.open("", tool.id, "width=1100,height=720");
    if (!newWindow) return undefined;
    windowRef.current = newWindow;
    newWindow.document.title = `${tool.name} – Tools`;
    newWindow.document.body.style.margin = "0";
    const mountPoint = newWindow.document.createElement("div");
    newWindow.document.body.appendChild(mountPoint);
    const handleUnload = (): void => onClose();
    newWindow.addEventListener("beforeunload", handleUnload);
    setContainer(mountPoint);
    return () => {
      newWindow.removeEventListener("beforeunload", handleUnload);
      newWindow.close();
    };
  }, [onClose, tool.id, tool.name]);

  useEffect(() => () => windowRef.current?.close(), []);

  if (!container || !tool.Component) return null;
  const ToolComponent = tool.Component;
  return createPortal(
    <ToolComponent appContext={appContext} onClose={onClose} presentation="window" />,
    container,
  );
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
  const [openTools, setOpenTools] = useState<OpenToolInstance[]>([]);
  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);
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
  const dockedTools = useMemo(() => openTools.filter((tool) => tool.mode === "docked"), [openTools]);
  const detachedTools = useMemo(() => openTools.filter((tool) => tool.mode === "detached"), [openTools]);

  useEffect(() => {
    setActiveSource(source);
  }, [source]);

  useEffect(() => {
    if (!toolsMenuOpen) return undefined;

    const handleDismiss = (event: MouseEvent | KeyboardEvent): void => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") {
          setToolsMenuOpen(false);
        }
        return;
      }

      if (toolsMenuRef.current) {
        const target = event.target as Node | null;
        if (target && !toolsMenuRef.current.contains(target)) {
          setToolsMenuOpen(false);
        }
      }
    };

    window.addEventListener("pointerdown", handleDismiss);
    window.addEventListener("keydown", handleDismiss);
    return () => {
      window.removeEventListener("pointerdown", handleDismiss);
      window.removeEventListener("keydown", handleDismiss);
    };
  }, [toolsMenuOpen]);

  useEffect(() => {
    if (activeToolId && visibleDockedTools.some((tool) => tool.id === activeToolId)) {
      return;
    }
    const nextActive = visibleDockedTools[0]?.id ?? null;
    setActiveToolId(nextActive);
  }, [activeToolId, visibleDockedTools]);

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

  useEffect(() => {
    const normalizeShortcut = (shortcut: string): string => shortcut.toLowerCase().replace(/\s+/g, "");
    const shortcutMap = new Map<string, MarsTool>();
    availableTools.forEach((tool) => {
      if (tool.shortcut) {
        shortcutMap.set(normalizeShortcut(tool.shortcut), tool);
      }
    });

    const handleToolShortcut = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA" || target?.isContentEditable) return;

      const parts: string[] = [];
      if (event.ctrlKey || event.metaKey) parts.push("ctrl");
      if (event.altKey) parts.push("alt");
      if (event.shiftKey) parts.push("shift");
      parts.push(event.key.toLowerCase());
      const key = parts.join("+");
      const tool = shortcutMap.get(key);
      if (tool && (!tool.isAvailable || tool.isAvailable(toolContext))) {
        event.preventDefault();
        openTool(tool);
      }
    };

    window.addEventListener("keydown", handleToolShortcut);
    return () => window.removeEventListener("keydown", handleToolShortcut);
  }, [availableTools, openTool, toolContext]);

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

  const visibleDockedTools = useMemo(
    () =>
      dockedTools.filter((entry) => {
        const tool = availableTools.find((item) => item.id === entry.id);
        if (!tool || !tool.Component) return false;
        if (tool.isAvailable && !tool.isAvailable(toolContext)) return false;
        return true;
      }),
    [availableTools, dockedTools, toolContext],
  );

  const hasDockedTools = visibleDockedTools.length > 0;
  const gridRows = ["1fr", hasDockedTools ? "360px" : null, isBottomPanelOpen ? "320px" : null]
    .filter(Boolean)
    .join(" ");

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
        setOpenTools((current) => {
          if (current.some((entry) => entry.id === tool.id)) {
            return current.map((entry) => (entry.id === tool.id ? { ...entry, mode: "docked" } : entry));
          }
          return [...current, { id: tool.id, mode: "docked" }];
        });
        setActiveToolId(tool.id);
      }
    },
    [toolContext],
  );

  const closeTool = useCallback((toolId: string): void => {
    setOpenTools((current) => current.filter((entry) => entry.id !== toolId));
    setActiveToolId((current) => (current === toolId ? null : current));
  }, []);

  const detachTool = useCallback((toolId: string): void => {
    setOpenTools((current) =>
      current.map((entry) => (entry.id === toolId ? { ...entry, mode: "detached" } : entry)),
    );
    setActiveToolId((current) => (current === toolId ? null : current));
  }, []);

  const dockTool = useCallback((toolId: string): void => {
    setOpenTools((current) =>
      current.map((entry) => (entry.id === toolId ? { ...entry, mode: "docked" } : entry)),
    );
    setActiveToolId(toolId);
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

  const toolsMenuHeaderStyle: React.CSSProperties = {
    padding: "0.25rem 0.65rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontSize: "0.75rem",
    color: "#94a3b8",
  };

  const toolsShortcutStyle: React.CSSProperties = {
    backgroundColor: "#0f172a",
    border: "1px solid #1f2937",
    color: "#cbd5e1",
    borderRadius: "0.35rem",
    padding: "0.15rem 0.4rem",
    fontSize: "0.8rem",
  };

  const orderedOpenFiles = useMemo(() => {
    const known = new Set(Object.keys(fileManager.openFiles));
    const ordered = fileManager.openFileOrder.filter((entry) => known.has(entry));
    const remainder = Array.from(known).filter((entry) => !fileManager.openFileOrder.includes(entry));
    return [...ordered, ...remainder];
  }, [fileManager.openFileOrder, fileManager.openFiles]);

  const groupedTools = useMemo(() => {
    const groups = new Map<string, MarsTool[]>();
    availableTools.forEach((tool) => {
      const category = tool.category ?? "General";
      const current = groups.get(category) ?? [];
      current.push(tool);
      groups.set(category, current);
    });

    return Array.from(groups.entries()).map(([category, tools]) => {
      const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
      const chunks: MarsTool[][] = [];
      sorted.forEach((tool) => {
        const activeChunk = chunks[chunks.length - 1];
        if (!activeChunk || activeChunk.length >= 4) {
          chunks.push([tool]);
        } else {
          activeChunk.push(tool);
        }
      });

      return { category, chunks };
    });
  }, [availableTools]);

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
    <main className="app-shell modern-shell">
      <header className="shell-header">
        <div className="shell-header__brand">
          <div className="brand-mark">MARS Next</div>
          <div className="brand-subtitle">Next-generation simulator workspace</div>
        </div>
        <div className="shell-header__actions">
          <div className="header-chips">
            <span className="chip">{workingDirectory}</span>
            <span className="chip chip--status">{status}</span>
            {activeFile ? <span className="chip">{tabLabel(activeFile)}{isDirty ? " •" : ""}</span> : null}
          </div>
          <div className="header-buttons">
            <button style={toolsButtonStyle} onClick={handleNewFile} title="Create a new file">🆕</button>
            <button style={toolsButtonStyle} onClick={() => void handleOpenFilePicker()} title="Open a file">📂</button>
            <button
              style={{ ...toolsButtonStyle, opacity: activeFile ? 1 : 0.6 }}
              disabled={!activeFile}
              onClick={() => void handleSave()}
              title="Save current file"
            >
              💾
            </button>
            <button style={toolsButtonStyle} onClick={() => void handleSaveAs()} title="Save the file as">📁</button>
            <button style={toolsButtonStyle} onClick={toggleRegisterSidebar} title="Toggle register viewer">
              🧮
              <span className="chip chip--inline" aria-hidden>
                {isRegisterSidebarOpen ? "Visible" : "Hidden"}
              </span>
            </button>
            <button style={toolsButtonStyle} onClick={() => openHelp()}>❓</button>
            <div style={{ position: "relative" }} ref={toolsMenuRef}>
              <button
                style={toolsButtonStyle}
                onClick={() => setToolsMenuOpen((open) => !open)}
                title="Open tools menu"
                aria-haspopup="true"
                aria-expanded={toolsMenuOpen}
                aria-label="Open tools menu"
              >
                {renderToolIcon("tools")}
              </button>
              {toolsMenuOpen && (
                <div style={toolsMenuStyle} role="menu" aria-label="Tools">
                  {groupedTools.map((group, groupIndex) => (
                    <div key={group.category} style={{ padding: "0.1rem 0" }}>
                      <div style={toolsMenuHeaderStyle}>{group.category}</div>
                      {group.chunks.map((chunk, chunkIndex) => (
                        <div
                          key={`${group.category}-${chunkIndex}`}
                          style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}
                        >
                          {chunk.map((tool) => {
                            const toolId = tool.id;
                            const isEnabled = tool.isAvailable ? tool.isAvailable(toolContext) : true;
                            const menuItemStyle: React.CSSProperties = {
                              ...toolsMenuItemStyle,
                              ...(isEnabled ? {} : { opacity: 0.6, cursor: "not-allowed" }),
                            };
                            const title = `${tool.name}${tool.shortcut ? ` (${tool.shortcut})` : ""}. ${tool.description}`;

                            return (
                              <button
                                key={toolId}
                                style={menuItemStyle}
                                role="menuitem"
                                aria-label={`${tool.name}${tool.shortcut ? ` (${tool.shortcut})` : ""}`}
                                disabled={!isEnabled}
                                onClick={() => {
                                  if (!isEnabled) return;
                                  openTool(tool);
                                  setToolsMenuOpen(false);
                                }}
                                title={title}
                              >
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", width: "100%" }}>
                                  <span aria-hidden>{renderToolIcon(tool.icon)}</span>
                                  <span style={{ flex: 1 }}>{tool.name}</span>
                                  {tool.shortcut && <span style={toolsShortcutStyle}>{tool.shortcut}</span>}
                                </span>
                              </button>
                            );
                          })}
                          {chunkIndex < group.chunks.length - 1 && (
                            <hr style={{ borderColor: "#1f2937", margin: "0.35rem 0" }} />
                          )}
                        </div>
                      ))}
                      {groupIndex < groupedTools.length - 1 && (
                        <hr style={{ borderColor: "#1f2937", margin: "0.35rem 0" }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="shell-grid">
        <aside className="panel panel--sidebar">
          <div className="panel__header">
            <div className="panel__title">Navigation</div>
            <div className="segmented">
              <button
                className={activeSidebarView === "explorer" ? "segmented__item segmented__item--active" : "segmented__item"}
                onClick={() => setActiveSidebarView("explorer")}
              >
                Explorer
              </button>
              <button
                className={activeSidebarView === "settings" ? "segmented__item segmented__item--active" : "segmented__item"}
                onClick={() => setActiveSidebarView("settings")}
              >
                Settings
              </button>
              <button
                className={activeSidebarView === "tools" ? "segmented__item segmented__item--active" : "segmented__item"}
                onClick={() => setActiveSidebarView("tools")}
              >
                Tools
              </button>
            </div>
          </div>
          <div className="panel__body">{renderSidebarContent()}</div>
        </aside>

        <section className="panel panel--primary">
          <div className="panel surface run-panel">
            <div className="panel__header">
              <div className="panel__title">Assembler &amp; Execution</div>
              <StatusBar activeFile={activeFile} workingDirectory={workingDirectory} dirty={isDirty} />
            </div>
            <div className="run-panel__content">
              <RunToolbar
                onRun={handleRun}
                status={status}
                onFlushInstructionCache={handleFlushInstructionCache}
                flushEnabled={engine !== null}
              />
              {error && (
                <div className="error-banner">
                  <div>{error}</div>
                  <button style={toolsButtonStyle} onClick={() => openHelp(error)}>
                    View related help
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="panel surface editors-panel">
            <div className="panel__header">
              <div className="editor-controls">
                <button style={toolsButtonStyle} onClick={() => setSplitMode("single")} title="Single editor">
                  ▢
                </button>
                <button style={toolsButtonStyle} onClick={() => setSplitMode("vertical")} title="Split vertically">
                  ⇄
                </button>
                <button style={toolsButtonStyle} onClick={() => setSplitMode("horizontal")} title="Split horizontally">
                  ⇅
                </button>
                <span className="muted">{activeFile ? `Editing ${tabLabel(activeFile)}` : "Scratch buffer"}</span>
              </div>
              <div className="pill">{status}</div>
            </div>

            <div className="tab-strip">
              {orderedOpenFiles.map((filePath, index) => {
                const isActive = filePath === activeFile;
                const record = fileManager.openFiles[filePath];
                return (
                  <div
                    key={filePath}
                    className={isActive ? "tab tab--active" : "tab"}
                  >
                    <button onClick={() => handleActivateTab(filePath)} className="tab__label">
                      {tabLabel(filePath)}
                      {record?.isDirty ? " •" : ""}
                    </button>
                    <div className="tab__actions">
                      <button
                        style={toolsButtonStyle}
                        onClick={() => setFileManager((current) => moveOpenFile(current, filePath, -1))}
                        title="Move left"
                        disabled={index === 0}
                      >
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

            <div className={`editor-grid editor-grid--${splitMode}`}>
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
          </div>

          {hasDockedTools && (
            <div className="panel surface">
              <div className="panel__header">
                <div className="panel__title">Open tools</div>
                {detachedTools.length > 0 && (
                  <div className="muted">Detached: {detachedTools.map((entry) => entry.id).join(", ")}</div>
                )}
              </div>
              <div className="tool-tabs">
                {visibleDockedTools.map((toolRef) => {
                  const tool = availableTools.find((entry) => entry.id === toolRef.id);
                  if (!tool || !tool.Component || (tool.isAvailable && !tool.isAvailable(toolContext))) return null;
                  const isActive = activeToolId === tool.id;

                  return (
                    <div key={tool.id} className={isActive ? "tool-tab tool-tab--active" : "tool-tab"}>
                      <button className="tab__label" onClick={() => setActiveToolId(tool.id)}>
                        <span aria-hidden>{renderToolIcon(tool.icon)}</span>
                        <span>{tool.name}</span>
                      </button>
                      <div className="tab__actions">
                        <button style={toolsButtonStyle} onClick={() => detachTool(tool.id)} title={`Open ${tool.name} in a separate window`}>
                          ↗
                        </button>
                        <button style={toolsButtonStyle} onClick={() => closeTool(tool.id)} title={`Close ${tool.name}`}>
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="tool-panels">
                {visibleDockedTools.map((toolRef) => {
                  const tool = availableTools.find((entry) => entry.id === toolRef.id);
                  if (!tool || !tool.Component) return null;
                  if (tool.isAvailable && !tool.isAvailable(toolContext)) return null;
                  const ToolComponent = tool.Component;
                  const isHidden = activeToolId && activeToolId !== tool.id;

                  return (
                    <div key={tool.id} style={{ display: isHidden ? "none" : "block", height: "100%" }}>
                      <ToolComponent appContext={toolContext} onClose={() => closeTool(tool.id)} presentation="panel" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <aside className="panel panel--inspector">
          <div className="panel surface">
            <div className="panel__header">
              <div className="panel__title">Registers</div>
              <button style={toolsButtonStyle} onClick={toggleRegisterSidebar} title="Toggle register viewer">
                {isRegisterSidebarOpen ? "Hide" : "Show"}
              </button>
            </div>
            {isRegisterSidebarOpen ? (
              <Suspense fallback={<div className="muted">Loading registers...</div>}>
                <LazyRegistersWindow
                  onHighlightChange={setHasRegisterUpdate}
                  onClose={() => setRegisterSidebarOpen(false)}
                  presentation="panel"
                />
              </Suspense>
            ) : (
              <div className="muted">Register viewer hidden</div>
            )}
          </div>

          <div className="panel surface">
            <div className="panel__header">
              <div className="panel__title">Breakpoints</div>
              <button style={toolsButtonStyle} onClick={() => setBottomPanelTab("debug")}>
                Open debugger
              </button>
            </div>
            <BreakpointList
              breakpoints={breakpoints}
              onRemove={(spec) => setBreakpoints((previous) => previous.filter((entry) => entry !== spec))}
            />
          </div>

          <div className="panel surface">
            <div className="panel__header">
              <div className="panel__title">Watches</div>
              <button style={toolsButtonStyle} onClick={() => setBottomPanelTab("debug")}>
                Manage
              </button>
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
        </aside>
      </section>

      <section className="panel surface dock-panel">
        <div className="panel__header">
          <div className="panel__title">Output &amp; Diagnostics</div>
          <div className="segmented">
            {["terminal", "execute", "debug"].map((tab) => (
              <button
                key={tab}
                className={bottomPanelTab === tab ? "segmented__item segmented__item--active" : "segmented__item"}
                onClick={() => setBottomPanelTab(tab as typeof bottomPanelTab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <button style={toolsButtonStyle} onClick={() => setBottomPanelOpen((open) => !open)}>
            {isBottomPanelOpen ? "Collapse" : "Expand"} panel
          </button>
        </div>
        {isBottomPanelOpen ? <div className="dock-panel__content">{renderBottomPanel()}</div> : null}
      </section>

      {detachedTools.map((entry) => {
        const tool = availableTools.find((item) => item.id === entry.id);
        if (!tool || !tool.Component) return null;
        if (tool.isAvailable && !tool.isAvailable(toolContext)) return null;

        return (
          <DetachedToolWindow
            key={tool.id}
            tool={tool}
            appContext={toolContext}
            onClose={() => closeTool(tool.id)}
          />
        );
      })}
      <HelpSidebar state={helpState} dispatch={helpDispatch} isOpen={isHelpOpen} onClose={() => setHelpOpen(false)} />
    </main>
  );
}
