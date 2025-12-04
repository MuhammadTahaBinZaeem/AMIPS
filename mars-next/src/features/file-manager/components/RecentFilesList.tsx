import React, { useCallback, useMemo, useState } from "react";
import { readFile } from "../services/fileSystemAdapter";
import { initializeFileManagerState, recordRecentFile } from "../state/fileManagerSlice";

export interface RecentFilesListProps {
  files?: string[];
  onOpenFile?: (path: string, content: string) => void;
}

export function RecentFilesList({ files, onOpenFile }: RecentFilesListProps): React.JSX.Element {
  const [state, setState] = useState(initializeFileManagerState());

  const recentFiles = useMemo(() => files ?? state.recentFiles, [files, state.recentFiles]);

  const handleOpen = useCallback(
    async (filePath: string): Promise<void> => {
      const content = await readFile(filePath);
      onOpenFile?.(filePath, content);
      setState((current) => recordRecentFile(current, filePath));
    },
    [onOpenFile],
  );

  if (recentFiles.length === 0) {
    return <div style={{ color: "#9ca3af", fontSize: "0.95rem" }}>No recent files.</div>;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.35rem",
        background: "#0f172a",
        padding: "0.75rem",
        border: "1px solid #1f2937",
        borderRadius: "0.75rem",
      }}
    >
      <strong style={{ color: "#e2e8f0", marginBottom: "0.25rem" }}>Recent Files</strong>
      {recentFiles.map((file) => (
        <button
          key={file}
          onClick={() => void handleOpen(file)}
          style={{
            background: "#0b1220",
            border: "1px solid #1f2937",
            borderRadius: "0.4rem",
            color: "#e5e7eb",
            padding: "0.4rem 0.6rem",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          {file}
        </button>
      ))}
    </div>
  );
}
