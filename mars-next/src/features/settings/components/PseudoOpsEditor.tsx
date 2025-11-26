import React, { useEffect, useState } from "react";

import { reloadPseudoOpTable, validatePseudoOpsText } from "../../core";
import { loadPseudoOpsFile, savePseudoOpsFile } from "../services/pseudoOpsFiles";

interface PseudoOpsEditorProps {
  onSaved?: () => void;
}

export function PseudoOpsEditor({ onSaved }: PseudoOpsEditorProps): React.JSX.Element {
  const [contents, setContents] = useState("");
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [savePath, setSavePath] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const snapshot = loadPseudoOpsFile();
      setContents(snapshot.contents);
      setSourcePath(snapshot.sourcePath);
      setSavePath(snapshot.savePath);
      setStatus(`Loaded from ${snapshot.sourcePath}`);
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setError(message);
      setStatus("Failed to load PseudoOps.txt");
    }
  }, []);

  const handleReloadFromDisk = (): void => {
    try {
      const snapshot = loadPseudoOpsFile();
      setContents(snapshot.contents);
      setSourcePath(snapshot.sourcePath);
      setSavePath(snapshot.savePath);
      setStatus(`Reloaded from ${snapshot.sourcePath}`);
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      setError(message);
      setStatus("Failed to reload PseudoOps.txt");
    }
  };

  const handleSave = (): void => {
    if (!savePath) return;

    try {
      setStatus("Validating pseudo-ops...");
      validatePseudoOpsText(contents);

      const destination = savePseudoOpsFile(contents, savePath);
      setSavePath(destination);
      reloadPseudoOpTable();
      setStatus(`Saved to ${destination}`);
      setError(null);
      onSaved?.();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(message);
      setStatus("Validation or save failed");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <strong style={{ color: "#e2e8f0" }}>Pseudo-op definitions</strong>
        <span style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
          Edit the active <code>PseudoOps.txt</code> file. User overrides are saved to the working directory or
          <code>config/PseudoOps.txt</code>.
        </span>
        {sourcePath && (
          <span style={{ color: "#9ca3af", fontSize: "0.85rem" }}>Currently loaded from: {sourcePath}</span>
        )}
      </div>

      <textarea
        value={contents}
        onChange={(event) => setContents(event.target.value)}
        style={{
          width: "100%",
          minHeight: "240px",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
          fontSize: "0.95rem",
          backgroundColor: "#0b1220",
          color: "#e5e7eb",
          border: "1px solid #1f2937",
          borderRadius: "0.5rem",
          padding: "0.75rem",
          resize: "vertical",
        }}
      />

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button
          onClick={handleReloadFromDisk}
          style={{
            background: "transparent",
            color: "#e2e8f0",
            border: "1px solid #1f2937",
            borderRadius: "0.375rem",
            padding: "0.45rem 0.9rem",
            cursor: "pointer",
          }}
        >
          Reload from disk
        </button>
        <button
          onClick={handleSave}
          style={{
            background: "linear-gradient(135deg, #38bdf8, #0ea5e9)",
            color: "#0b1726",
            border: "none",
            borderRadius: "0.375rem",
            padding: "0.45rem 0.9rem",
            fontWeight: 700,
            cursor: "pointer",
          }}
          disabled={!savePath}
        >
          Validate &amp; Save
        </button>
      </div>

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

      {status && !error && <span style={{ color: "#a5b4fc", fontSize: "0.9rem" }}>{status}</span>}
    </div>
  );
}
