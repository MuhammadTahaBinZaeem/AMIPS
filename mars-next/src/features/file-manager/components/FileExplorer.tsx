import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FileEntry, listFiles, readFile, selectWorkspaceDirectory, setWorkingDirectory } from "../services/fileSystemAdapter";
import {
  initializeFileManagerState,
  openFile as recordOpenFile,
  setFileTree as recordFileTree,
  setWorkingDirectory as recordWorkingDirectory,
} from "../state/fileManagerSlice";

export interface FileExplorerProps {
  workingDirectory?: string | null;
  onFileOpen?: (path: string, content: string) => void;
  onWorkspaceChange?: (directory: string) => void;
}

interface TreeState {
  expanded: Set<string>;
}

function flattenFiles(entries: FileEntry[]): FileEntry[] {
  return entries.flatMap((entry) => {
    if (entry.isDirectory && entry.children) {
      return [entry, ...flattenFiles(entry.children)];
    }
    return [entry];
  });
}

export function FileExplorer({ workingDirectory, onFileOpen, onWorkspaceChange }: FileExplorerProps): React.JSX.Element {
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [state, setState] = useState(initializeFileManagerState());
  const [treeState, setTreeState] = useState<TreeState>({ expanded: new Set<string>() });

  const effectiveDirectory = useMemo(() => workingDirectory ?? state.workingDirectory, [state.workingDirectory, workingDirectory]);

  const refreshTree = useCallback(
    async (directory?: string): Promise<void> => {
      const targetDirectory = directory ?? effectiveDirectory ?? undefined;
      if (!targetDirectory) return;
      const entries = await listFiles(targetDirectory);
      setTree(entries);
      setState((current) => recordFileTree(current, entries));
    },
    [effectiveDirectory],
  );

  useEffect(() => {
    void refreshTree();
  }, [refreshTree]);

  useEffect(() => {
    if (workingDirectory) {
      setState((current) => recordWorkingDirectory(current, workingDirectory));
    }
  }, [workingDirectory]);

  const handleToggle = (filePath: string): void => {
    setTreeState((current) => {
      const expanded = new Set(current.expanded);
      if (expanded.has(filePath)) {
        expanded.delete(filePath);
      } else {
        expanded.add(filePath);
      }
      return { expanded };
    });
  };

  const handleOpenFile = useCallback(
    async (entry: FileEntry): Promise<void> => {
      if (entry.isDirectory) {
        handleToggle(entry.path);
        return;
      }

      const content = await readFile(entry.path);
      onFileOpen?.(entry.path, content);
      setState((current) => recordOpenFile(current, entry.path, content));
    },
    [onFileOpen],
  );

  const handleDirectorySelection = useCallback(async (): Promise<void> => {
    const selected = await selectWorkspaceDirectory();
    if (!selected) return;
    setWorkingDirectory(selected);
    setState((current) => recordWorkingDirectory(current, selected));
    onWorkspaceChange?.(selected);
    await refreshTree(selected);
  }, [onWorkspaceChange, refreshTree]);

  const renderEntry = (entry: FileEntry, depth = 0): React.JSX.Element => {
    const isExpanded = treeState.expanded.has(entry.path);
    const indent = depth * 12;

    return (
      <div key={entry.path} style={{ paddingLeft: indent, display: "flex", flexDirection: "column" }}>
        <button
          onClick={() => void handleOpenFile(entry)}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "none",
            border: "none",
            color: "#e5e7eb",
            textAlign: "left",
            padding: "0.35rem 0.5rem",
            cursor: "pointer",
          }}
        >
          <span style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.9rem" }}>{entry.isDirectory ? (isExpanded ? "📂" : "📁") : "📄"}</span>
            {entry.name}
          </span>
          {!entry.isDirectory && <span style={{ color: "#9ca3af", fontSize: "0.8rem" }}>{entry.path}</span>}
        </button>

        {entry.isDirectory && isExpanded && entry.children?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
            {entry.children.map((child) => renderEntry(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  const fileCount = useMemo(() => flattenFiles(tree).filter((entry) => !entry.isDirectory).length, [tree]);

  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #1f2937",
        borderRadius: "0.75rem",
        padding: "0.75rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <strong style={{ color: "#e2e8f0" }}>Project Explorer</strong>
          <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            {effectiveDirectory ?? "No workspace"} • {fileCount} files
          </span>
        </div>
        <button
          onClick={() => void handleDirectorySelection()}
          style={{
            background: "linear-gradient(135deg, #4f46e5, #6366f1)",
            color: "#0f172a",
            border: "none",
            padding: "0.4rem 0.75rem",
            borderRadius: "0.4rem",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          Open Folder
        </button>
      </header>

      <div style={{ borderTop: "1px solid #1f2937", marginTop: "0.35rem", paddingTop: "0.35rem" }}>
        {tree.length === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: "0.95rem" }}>No assembly files found.</div>
        ) : (
          tree.map((entry) => renderEntry(entry))
        )}
      </div>
    </div>
  );
}
