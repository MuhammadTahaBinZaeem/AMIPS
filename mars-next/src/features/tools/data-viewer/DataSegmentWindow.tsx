import React, { useEffect, useMemo, useState } from "react";
import { MarsTool, type MarsToolComponentProps } from "../../../core/tools/MarsTool";
import { MemoryConfiguration, type MemorySegmentDescriptor } from "./MemoryConfiguration";

const VALUES_PER_ROW = 8;
const NUMBER_OF_ROWS = 16;
const BYTES_PER_VALUE = 4;
const BYTES_PER_ROW = VALUES_PER_ROW * BYTES_PER_VALUE;
const MEMORY_CHUNK_SIZE = NUMBER_OF_ROWS * BYTES_PER_ROW;
const PREV_NEXT_CHUNK_SIZE = MEMORY_CHUNK_SIZE / 2;

function formatAddress(address: number): string {
  return `0x${(address >>> 0).toString(16).padStart(8, "0")}`;
}

function formatWord(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeRange(segment: MemorySegmentDescriptor): { start: number; end: number } {
  return {
    start: Math.min(segment.start >>> 0, segment.end >>> 0),
    end: Math.max(segment.start >>> 0, segment.end >>> 0),
  };
}

function clampChunkStart(base: number, segment: MemorySegmentDescriptor): number {
  const { start, end } = normalizeRange(segment);
  const maxStart = Math.max(start, end - MEMORY_CHUNK_SIZE + BYTES_PER_ROW);
  return Math.min(Math.max(base, start), maxStart);
}

function readWord(map: Map<number, number>, address: number): number {
  let value = 0;
  for (let index = 0; index < BYTES_PER_VALUE; index++) {
    const byte = map.get((address + index) >>> 0) ?? 0;
    value = (value << 8) | byte;
  }
  return value >>> 0;
}

function buildByteMap(entries: Array<{ address: number; value: number }>): Map<number, number> {
  const map = new Map<number, number>();
  entries.forEach((entry) => map.set(entry.address >>> 0, entry.value & 0xff));
  return map;
}

function selectInitialAddress(
  entries: Array<{ address: number; value: number }>,
  segment: MemorySegmentDescriptor,
): number {
  const { start, end } = normalizeRange(segment);
  const firstEntry = entries.find((entry) => entry.address >= start && entry.address <= end);
  const preferred = clampChunkStart(firstEntry ? firstEntry.address : start, segment);
  return preferred - (preferred % BYTES_PER_ROW);
}

export function DataSegmentWindow({ appContext, onClose }: MarsToolComponentProps): React.JSX.Element {
  const entries = appContext.memoryEntries ?? [];
  const configuration = (appContext.memoryConfiguration as MemoryConfiguration | null | undefined) ?? null;
  const [selectedSegment, setSelectedSegment] = useState<string>("data");
  const [chunkStart, setChunkStart] = useState<number>(0);
  const byteMap = useMemo(() => buildByteMap(entries), [entries]);
  const resolvedConfig = configuration ?? MemoryConfiguration.createDefault();
  const segments = useMemo(() => resolvedConfig.describeSegments(), [resolvedConfig]);

  const activeSegment = useMemo(() => segments.find((segment) => segment.key === selectedSegment), [
    segments,
    selectedSegment,
  ]);

  useEffect(() => {
    if (!activeSegment && segments.length > 0) {
      setSelectedSegment(segments[0].key);
    }
  }, [activeSegment, segments]);

  useEffect(() => {
    if (segments.length === 0) return;
    const segmentToUse = activeSegment ?? segments[0];
    setChunkStart(selectInitialAddress(entries, segmentToUse));
  }, [entries, activeSegment, segments]);

  if (!activeSegment) {
    return (
      <div style={overlayStyle}>
        <div style={windowStyle}>
          <header style={headerStyle}>
            <h2 style={{ margin: 0 }}>Data Segment Viewer</h2>
            <button style={closeButtonStyle} onClick={onClose}>
              Close
            </button>
          </header>
          <div style={{ padding: "0.5rem 0" }}>Unable to determine memory layout.</div>
        </div>
      </div>
    );
  }

  const visibleRows = Array.from({ length: NUMBER_OF_ROWS }, (_, row) => {
    const rowAddress = chunkStart + row * BYTES_PER_ROW;
    const values = Array.from({ length: VALUES_PER_ROW }, (_, column) => {
      const base = rowAddress + column * BYTES_PER_VALUE;
      return readWord(byteMap, base);
    });
    return { address: rowAddress, values };
  });

  const activeRange = normalizeRange(activeSegment);

  return (
    <div style={overlayStyle}>
      <div style={windowStyle}>
        <header style={headerStyle}>
          <h2 style={{ margin: 0 }}>Data Segment Viewer</h2>
          <button style={closeButtonStyle} onClick={onClose}>
            Close
          </button>
        </header>

        <div style={controlsRowStyle}>
          <label style={labelStyle}>
            Segment
            <select
              style={selectStyle}
              value={activeSegment.key}
              onChange={(event) => setSelectedSegment(event.target.value)}
            >
              {segments.map((segment) => (
                <option key={segment.key} value={segment.key}>
                  {segment.label}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              style={buttonStyle}
              onClick={() => setChunkStart((current) => clampChunkStart(current - PREV_NEXT_CHUNK_SIZE, activeSegment))}
            >
              Previous
            </button>
            <button
              style={buttonStyle}
              onClick={() => setChunkStart((current) => clampChunkStart(current + PREV_NEXT_CHUNK_SIZE, activeSegment))}
            >
              Next
            </button>
          </div>

          <div style={{ color: "#9ca3af", fontSize: "0.9rem" }}>
            Showing {formatAddress(chunkStart)} – {formatAddress(chunkStart + MEMORY_CHUNK_SIZE - BYTES_PER_ROW)}
          </div>
        </div>

        <div style={{ marginBottom: "0.5rem", color: "#9ca3af", fontSize: "0.9rem" }}>
          {activeSegment.label}: {formatAddress(activeRange.start)} – {formatAddress(activeRange.end)}
        </div>

        <div style={{ overflow: "auto", border: "1px solid #1f2937", borderRadius: "0.5rem" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={headerCellStyle}>Address</th>
                {Array.from({ length: VALUES_PER_ROW }, (_, index) => (
                  <th key={index} style={headerCellStyle}>
                    +{index * BYTES_PER_VALUE}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.address}>
                  <td style={addressCellStyle}>{formatAddress(row.address)}</td>
                  {row.values.map((value, column) => (
                    <td key={column} style={valueCellStyle}>
                      {formatWord(value)}
                    </td>
                  ))}
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td style={emptyCellStyle} colSpan={VALUES_PER_ROW + 1}>
                    No data available for this segment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export const DataSegmentTool: MarsTool = {
  id: "data-segment-viewer",
  name: "Data Segment Viewer",
  description: "Inspect the contents of the MIPS data segment in memory.",
  Component: DataSegmentWindow,
  isAvailable: (context) => (context.memoryEntries?.length ?? 0) > 0,
  run: () => {
    // UI rendering is handled by the host; no additional wiring needed.
  },
};

export default DataSegmentTool;

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const windowStyle: React.CSSProperties = {
  width: "960px",
  maxWidth: "95vw",
  backgroundColor: "#0f172a",
  color: "#e5e7eb",
  border: "1px solid #1f2937",
  borderRadius: "0.75rem",
  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)",
  padding: "1rem",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "0.75rem",
};

const controlsRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
  alignItems: "center",
  marginBottom: "0.25rem",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  fontWeight: 600,
  color: "#cbd5e1",
};

const selectStyle: React.CSSProperties = {
  backgroundColor: "#111827",
  color: "#e5e7eb",
  border: "1px solid #1f2937",
  borderRadius: "0.5rem",
  padding: "0.35rem 0.75rem",
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: "#1d4ed8",
  color: "#e5e7eb",
  border: "none",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.85rem",
  cursor: "pointer",
};

const closeButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  backgroundColor: "#ef4444",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontFamily: "'JetBrains Mono', monospace",
};

const headerCellStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "0.5rem",
  borderBottom: "1px solid #1f2937",
  color: "#cbd5e1",
  backgroundColor: "#111827",
};

const addressCellStyle: React.CSSProperties = {
  padding: "0.4rem 0.5rem",
  borderBottom: "1px solid #1f2937",
  color: "#a5b4fc",
  whiteSpace: "nowrap",
};

const valueCellStyle: React.CSSProperties = {
  padding: "0.4rem 0.5rem",
  borderBottom: "1px solid #1f2937",
  textAlign: "right",
  color: "#e5e7eb",
};

const emptyCellStyle: React.CSSProperties = {
  ...addressCellStyle,
  textAlign: "center",
};
