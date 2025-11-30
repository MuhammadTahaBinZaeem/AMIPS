import React, { useMemo } from "react";
import { BinaryImage, DEFAULT_TEXT_BASE, SourceMapEntry } from "../../../core";
import { disassembleInstruction } from "../../../core/debugger/Disassembler";
import { MarsTool, MarsToolContext } from "../../../core/tools/MarsTool";

export interface TextSegmentWindowProps {
  program?: BinaryImage | null;
  sourceMap?: SourceMapEntry[] | undefined;
  onClose: () => void;
}

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
): TextSegmentRow[] {
  if (!instructions || instructions.length === 0) return [];

  const resolvedBase = baseAddress ?? DEFAULT_TEXT_BASE;
  return instructions.map((word, index) => {
    const address = resolvedBase + index * 4;
    const source = resolveSource(segmentKey, index, address, lookup);
    const disassembled = disassembleInstruction(word, address);

    return {
      segment: label,
      address,
      machineWord: word,
      assembly: disassembled?.assembly ?? null,
      source,
    };
  });
}

export function TextSegmentWindow({ program, sourceMap, onClose }: TextSegmentWindowProps): React.JSX.Element {
  const effectiveSourceMap = useMemo(() => sourceMap ?? program?.sourceMap ?? [], [program?.sourceMap, sourceMap]);
  const rows = useMemo(() => {
    const lookup = buildSourceLookup(effectiveSourceMap);

    return [
      ...buildSegmentRows("Text", "text", program?.text, program?.textBase, lookup),
      ...buildSegmentRows("Kernel Text", "ktext", program?.ktext, program?.ktextBase, lookup),
    ];
  }, [effectiveSourceMap, program?.ktext, program?.ktextBase, program?.text, program?.textBase]);

  return (
    <div style={overlayStyle}>
      <div style={windowStyle}>
        <header style={headerStyle}>
          <h2 style={{ margin: 0 }}>Text Segment Viewer</h2>
          <button style={closeButtonStyle} onClick={onClose}>
            Close
          </button>
        </header>

        <div style={{ marginBottom: "0.5rem", color: "#9ca3af" }}>
          View assembled instructions with their addresses, machine code, and originating source lines.
        </div>

        <div style={{ overflow: "auto", border: "1px solid #1f2937", borderRadius: "0.5rem" }}>
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

type TextSegmentToolContext = MarsToolContext & {
  program?: BinaryImage | null;
  sourceMap?: SourceMapEntry[] | undefined;
};

export const TextSegmentTool: MarsTool<TextSegmentToolContext> = {
  getName: () => "Text Segment Viewer",
  getFile: () => "text-viewer/TextSegmentWindow.tsx",
  go: ({ context, onClose }) => (
    <TextSegmentWindow program={context.program ?? null} sourceMap={context.sourceMap} onClose={onClose} />
  ),
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
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
