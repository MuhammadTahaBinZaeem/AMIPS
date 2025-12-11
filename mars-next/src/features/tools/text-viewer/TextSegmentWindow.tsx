import React, { useEffect, useMemo, useState } from "react";
import { BinaryImage, DEFAULT_TEXT_BASE, SourceMapEntry } from "../../../core";
import { disassembleInstruction } from "../../../core/debugger/Disassembler";
import { MarsTool, type MarsToolComponentProps } from "../../../core/tools/MarsTool";
import { getLatestDataState, subscribeToDataState, type DataStateSnapshot } from "./dataEvents";

type TextSegmentKey = "text" | "ktext";

interface SourceLookup {
  bySegmentIndex: Map<string, SourceMapEntry>;
  byAddress: Map<number, SourceMapEntry>;
}

interface TextSegmentRow {
  segment: string;
  address: number;
  machineWord: number;
  assembly?: string | null;
  source?: SourceMapEntry;
}

function formatAddress(address: number): string {
  return `0x${(address >>> 0).toString(16).padStart(8, "0")}`;
}

function formatMachineWord(word: number): string {
  return `0x${(word >>> 0).toString(16).padStart(8, "0")}`;
}

function buildByteMap(entries: Array<{ address: number; value: number }>): Map<number, number> {
  const map = new Map<number, number>();
  entries.forEach((entry) => map.set(entry.address >>> 0, entry.value & 0xff));
  return map;
}

function readWord(map: Map<number, number>, address: number): number {
  let value = 0;
  for (let index = 0; index < 4; index++) {
    const byte = map.get((address + index) >>> 0);
    if (byte === undefined) return NaN;
    value = (value << 8) | byte;
  }
  return value >>> 0;
}

function buildSourceLookup(entries: SourceMapEntry[] | undefined): SourceLookup {
  const bySegmentIndex = new Map<string, SourceMapEntry>();
  const byAddress = new Map<number, SourceMapEntry>();

  (entries ?? []).forEach((entry) => {
    const key = `${entry.segment}-${entry.segmentIndex}`;
    if (!bySegmentIndex.has(key)) {
      bySegmentIndex.set(key, entry);
    }

    if (!byAddress.has(entry.address >>> 0)) {
      byAddress.set(entry.address >>> 0, entry);
    }
  });

  return { bySegmentIndex, byAddress };
}

function resolveSource(
  segment: TextSegmentKey,
  index: number,
  address: number,
  lookup: SourceLookup,
): SourceMapEntry | undefined {
  const byIndex = lookup.bySegmentIndex.get(`${segment}-${index}`);
  if (byIndex) return byIndex;

  return lookup.byAddress.get(address >>> 0);
}

function buildSegmentRows(
  label: string,
  segmentKey: TextSegmentKey,
  instructions: number[] | undefined,
  baseAddress: number | undefined,
  lookup: SourceLookup,
  byteMap: Map<number, number>,
): TextSegmentRow[] {
  if (!instructions || instructions.length === 0) return [];

  const resolvedBase = baseAddress ?? DEFAULT_TEXT_BASE;
  return instructions.map((word, index) => {
    const address = resolvedBase + index * 4;
    const fromMemory = readWord(byteMap, address);
    const machineWord = Number.isNaN(fromMemory) ? word : fromMemory;
    const source = resolveSource(segmentKey, index, address, lookup);
    const disassembled = disassembleInstruction(machineWord, address);

    return {
      segment: label,
      address,
      machineWord,
      assembly: disassembled?.assembly ?? null,
      source,
    };
  });
}

export function TextSegmentWindow({
  appContext,
  onClose,
  presentation = "window",
}: MarsToolComponentProps): React.JSX.Element {
  const program = (appContext.program as BinaryImage | null | undefined) ?? null;
  const sourceMap = appContext.sourceMap as SourceMapEntry[] | undefined;
  const [dataSnapshot, setDataSnapshot] = useState<DataStateSnapshot>(() => getLatestDataState());

  const byteMap = useMemo(() => buildByteMap(dataSnapshot.entries), [dataSnapshot.entries]);

  useEffect(() => {
    const unsubscribe = subscribeToDataState(setDataSnapshot);
    return () => unsubscribe();
  }, []);

  const effectiveSourceMap = useMemo(() => sourceMap ?? program?.sourceMap ?? [], [program?.sourceMap, sourceMap]);
  const rows = useMemo(() => {
    const lookup = buildSourceLookup(effectiveSourceMap);

    return [
      ...buildSegmentRows("Text", "text", program?.text, program?.textBase, lookup, byteMap),
      ...buildSegmentRows("Kernel Text", "ktext", program?.ktext, program?.ktextBase, lookup, byteMap),
    ];
  }, [byteMap, effectiveSourceMap, program?.ktext, program?.ktextBase, program?.text, program?.textBase]);

  const containerStyle = presentation === "panel" ? panelContainerStyle : overlayStyle;
  const surfaceStyle = presentation === "panel" ? panelWindowStyle : windowStyle;

  return (
    <div style={containerStyle}>
      <div style={surfaceStyle}>
        <header style={headerStyle}>
          <h2 style={{ margin: 0 }}>Text Segment Viewer</h2>
          <button style={closeButtonStyle} onClick={onClose}>
            Close
          </button>
        </header>

        <div style={{ marginBottom: "0.5rem", color: "#9ca3af" }}>
          View assembled instructions with their addresses, machine code, and originating source lines.
        </div>

        <div style={{ overflow: "auto", border: "1px solid #1f2937", borderRadius: "0.5rem", flex: 1 }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={headerCellStyle}>Segment</th>
                <th style={headerCellStyle}>Address</th>
                <th style={headerCellStyle}>Machine Code</th>
                <th style={headerCellStyle}>Disassembly</th>
                <th style={headerCellStyle}>Source Line</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.segment}-${row.address}`}>
                  <td style={segmentCellStyle}>{row.segment}</td>
                  <td style={addressCellStyle}>{formatAddress(row.address)}</td>
                  <td style={valueCellStyle}>{formatMachineWord(row.machineWord)}</td>
                  <td style={valueCellStyle}>{row.assembly ?? "<unrecognized>"}</td>
                  <td style={valueCellStyle}>
                    {row.source ? `${row.source.file}:${row.source.line}` : "<no source mapping>"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td style={emptyCellStyle} colSpan={5}>
                    {program ? "No assembled instructions available." : "Assemble a program to view the text segment."}
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

export const TextSegmentTool: MarsTool = {
  id: "text-segment-viewer",
  name: "Text Segment Viewer",
  description: "Disassemble the text and kernel text segments with source mapping.",
  category: "Code",
  icon: "code",
  shortcut: "Ctrl+Alt+T",
  Component: TextSegmentWindow,
  isAvailable: (context) => Boolean(context.program),
  run: () => {
    // Rendering handled by host.
  },
};

export default TextSegmentTool;

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const panelContainerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  backgroundColor: "#0f172a",
  borderRadius: "0.75rem",
  border: "1px solid #1f2937",
  overflow: "hidden",
};

const panelWindowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "1rem",
  height: "100%",
  color: "#e5e7eb",
};

const windowStyle: React.CSSProperties = {
  backgroundColor: "#0f172a",
  border: "1px solid #1f2937",
  borderRadius: "0.75rem",
  padding: "1rem",
  width: "min(960px, 95vw)",
  maxHeight: "80vh",
  boxShadow: "0 10px 25px rgba(0, 0, 0, 0.35)",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "0.25rem",
};

const closeButtonStyle: React.CSSProperties = {
  backgroundColor: "#1f2937",
  color: "#e5e7eb",
  border: "1px solid #374151",
  borderRadius: "0.4rem",
  padding: "0.35rem 0.75rem",
  cursor: "pointer",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "640px",
};

const headerCellStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "0.5rem",
  backgroundColor: "#111827",
  borderBottom: "1px solid #1f2937",
  color: "#9ca3af",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const addressCellStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  padding: "0.5rem",
  color: "#c084fc",
  borderBottom: "1px solid #1f2937",
  whiteSpace: "nowrap",
};

const valueCellStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  padding: "0.5rem",
  color: "#e5e7eb",
  borderBottom: "1px solid #1f2937",
  whiteSpace: "nowrap",
};

const segmentCellStyle: React.CSSProperties = {
  padding: "0.5rem",
  color: "#fcd34d",
  borderBottom: "1px solid #1f2937",
  whiteSpace: "nowrap",
  fontWeight: 600,
};

const emptyCellStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "1rem",
  color: "#9ca3af",
};
