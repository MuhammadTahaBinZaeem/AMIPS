import { FileEntry, getWorkingDirectory } from "../services/fileSystemAdapter";

export interface OpenFileRecord {
  path: string;
  content: string;
  isDirty: boolean;
}

export interface FileManagerState {
  workingDirectory: string | null;
  fileTree: FileEntry[];
  openFiles: Record<string, OpenFileRecord>;
  activeFile: string | null;
  openFileOrder: string[];
  recentFiles: string[];
}

const RECENT_FILES_KEY = "mars-next.recentFiles";
const RECENT_FILES_MAX = 10;
function loadRecentFromDisk(): string[] {
  if (typeof localStorage === "undefined") return [];

  const raw = localStorage.getItem(RECENT_FILES_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as string[];
    } catch (error) {
      console.warn("Failed to parse persisted recent files", error);
    }
  }

  return [];
}

function persistRecentFiles(entries: string[]): void {
  if (typeof localStorage === "undefined") return;

  localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(entries));
}

export function recordRecentFile(state: FileManagerState, filePath: string): FileManagerState {
  const recent = [filePath, ...state.recentFiles.filter((entry) => entry !== filePath)].slice(0, RECENT_FILES_MAX);
  persistRecentFiles(recent);
  return { ...state, recentFiles: recent };
}

export function openFile(
  state: FileManagerState,
  filePath: string,
  content: string,
  markActive = true,
): FileManagerState {
  const open = {
    ...state.openFiles,
    [filePath]: { path: filePath, content, isDirty: false },
  } satisfies Record<string, OpenFileRecord>;

  const openFileOrder = state.openFileOrder.includes(filePath)
    ? state.openFileOrder
    : [...state.openFileOrder, filePath];

  const nextState: FileManagerState = {
    ...state,
    openFiles: open,
    activeFile: markActive ? filePath : state.activeFile,
    openFileOrder,
  };

  return recordRecentFile(nextState, filePath);
}

export function updateFileContent(state: FileManagerState, filePath: string, content: string): FileManagerState {
  const existing = state.openFiles[filePath];
  if (!existing) return state;

  return {
    ...state,
    openFiles: {
      ...state.openFiles,
      [filePath]: { ...existing, content, isDirty: true },
    },
  };
}

export function markFileSaved(state: FileManagerState, filePath: string): FileManagerState {
  const existing = state.openFiles[filePath];
  if (!existing) return recordRecentFile(state, filePath);

  return recordRecentFile(
    {
      ...state,
      openFiles: {
        ...state.openFiles,
        [filePath]: { ...existing, isDirty: false },
      },
    },
    filePath,
  );
}

export function closeFile(state: FileManagerState, filePath: string): FileManagerState {
  if (!(filePath in state.openFiles)) return state;

  const { [filePath]: _removed, ...remaining } = state.openFiles;
  const openFileOrder = state.openFileOrder.filter((entry) => entry !== filePath);
  const activeFile = state.activeFile === filePath ? Object.keys(remaining)[0] ?? null : state.activeFile;

  return {
    ...state,
    openFiles: remaining,
    activeFile,
    openFileOrder,
  };
}

export function setFileTree(state: FileManagerState, tree: FileEntry[]): FileManagerState {
  return { ...state, fileTree: tree };
}

export function setWorkingDirectory(state: FileManagerState, directory: string): FileManagerState {
  return { ...state, workingDirectory: directory };
}

export function setActiveFile(state: FileManagerState, filePath: string | null): FileManagerState {
  if (!filePath) return { ...state, activeFile: null };
  if (!(filePath in state.openFiles)) return state;
  return { ...state, activeFile: filePath };
}

export function moveOpenFile(state: FileManagerState, filePath: string, offset: number): FileManagerState {
  if (!state.openFileOrder.includes(filePath) || offset === 0) return state;

  const order = [...state.openFileOrder];
  const index = order.indexOf(filePath);
  const nextIndex = Math.max(0, Math.min(order.length - 1, index + offset));

  order.splice(index, 1);
  order.splice(nextIndex, 0, filePath);

  return { ...state, openFileOrder: order };
}

export function initializeFileManagerState(): FileManagerState {
  return {
    workingDirectory: getWorkingDirectory(),
    fileTree: [],
    openFiles: {},
    activeFile: null,
    openFileOrder: [],
    recentFiles: loadRecentFromDisk(),
  };
}
