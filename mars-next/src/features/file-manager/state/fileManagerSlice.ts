import fs from "fs";
import path from "path";
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
  recentFiles: string[];
}

const RECENT_FILES_KEY = "mars-next.recentFiles";
const RECENT_FILES_MAX = 10;
const RECENT_FILES_FALLBACK = path.resolve(process.cwd(), "mars-next/config/recent-files.json");

function loadRecentFromDisk(): string[] {
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as string[];
      } catch (error) {
        console.warn("Failed to parse persisted recent files", error);
      }
    }
  }

  try {
    if (fs.existsSync(RECENT_FILES_FALLBACK)) {
      const contents = fs.readFileSync(RECENT_FILES_FALLBACK, "utf8");
      return JSON.parse(contents) as string[];
    }
  } catch (error) {
    console.warn("Failed to load recent files from disk", error);
  }

  return [];
}

function persistRecentFiles(entries: string[]): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(entries));
    return;
  }

  try {
    fs.mkdirSync(path.dirname(RECENT_FILES_FALLBACK), { recursive: true });
    fs.writeFileSync(RECENT_FILES_FALLBACK, JSON.stringify(entries, null, 2));
  } catch (error) {
    console.warn("Failed to persist recent files", error);
  }
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

  const nextState: FileManagerState = {
    ...state,
    openFiles: open,
    activeFile: markActive ? filePath : state.activeFile,
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
  const activeFile = state.activeFile === filePath ? Object.keys(remaining)[0] ?? null : state.activeFile;

  return {
    ...state,
    openFiles: remaining,
    activeFile,
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

export function initializeFileManagerState(): FileManagerState {
  return {
    workingDirectory: getWorkingDirectory(),
    fileTree: [],
    openFiles: {},
    activeFile: null,
    recentFiles: loadRecentFromDisk(),
  };
}
