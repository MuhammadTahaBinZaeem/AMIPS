import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MachineState } from "../../core";
import { getLatestCpuState, subscribeToCpuState, type CpuStateSnapshot } from "../tools/register-viewer/registerEvents";

type SortDirection = "asc" | "desc";

interface SortDescriptor<T> {
  key: keyof T;
  direction: SortDirection;
}

interface RegisterRow {
  key: string;
  name: string;
  number: number;
  value: number;
}

interface MemoryRow {
  address: number;
  value: number;
}

interface WordRow {
  baseAddress: number;
  word: number;
}

export interface ExecutePaneProps {
  memoryEntries: Array<MemoryRow>;
}

const REGISTER_NAMES = [
  "$zero",
  "$at",
  "$v0",
  "$v1",
  "$a0",
  "$a1",
  "$a2",
  "$a3",
  "$t0",
  "$t1",
  "$t2",
  "$t3",
  "$t4",
  "$t5",
  "$t6",
  "$t7",
  "$s0",
  "$s1",
  "$s2",
  "$s3",
  "$s4",
  "$s5",
  "$s6",
  "$s7",
  "$t8",
  "$t9",
  "$k0",
  "$k1",
  "$gp",
  "$sp",
  "$fp",
  "$ra",
];

function formatAddress(address: number): string {
  return `0x${(address >>> 0).toString(16).padStart(8, "0")}`;
}

function formatByte(value: number): string {
  return `0x${(value & 0xff).toString(16).padStart(2, "0")}`;
}

function formatWord(word: number): string {
  return `0x${(word >>> 0).toString(16).padStart(8, "0")}`;
}

function formatRegister(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function createDefaultSnapshot(): CpuStateSnapshot {
  const state = new MachineState();
  return {
    registers: Array.from({ length: MachineState.REGISTER_COUNT }, (_, index) => state.getRegister(index)),
    hi: state.getHi(),
    lo: state.getLo(),
    pc: state.getProgramCounter(),
  };
}

function applySorts<T>(rows: Array<T>, sorts: Array<SortDescriptor<T>>): Array<T> {
  if (sorts.length === 0) return rows;

  return [...rows].sort((left, right) => {
    for (const sort of sorts) {
      const leftValue = left[sort.key];
      const rightValue = right[sort.key];

      if (leftValue === rightValue) continue;

      if (leftValue < rightValue) return sort.direction === "asc" ? -1 : 1;
      return sort.direction === "asc" ? 1 : -1;
    }

    return 0;
  });
}

function toggleSort<T>(
  key: keyof T,
  shift: boolean,
  sorts: Array<SortDescriptor<T>>,
  setSorts: React.Dispatch<React.SetStateAction<Array<SortDescriptor<T>>>>,
): void {
  setSorts((previous) => {
    const existingIndex = previous.findIndex((entry) => entry.key === key);

    const cycleDirection = (direction: SortDirection | undefined): SortDirection | null => {
      if (!direction) return "asc";
      if (direction === "asc") return "desc";
      return null;
    };

    const nextDirection = cycleDirection(previous[existingIndex]?.direction);

    if (nextDirection === null) {
      if (!shift) return [];
      return previous.filter((entry) => entry.key !== key);
    }

    if (existingIndex === -1) {
      return shift ? [...previous, { key, direction: nextDirection }] : [{ key, direction: nextDirection }];
    }

    const updated = [...previous];
    updated[existingIndex] = { key, direction: nextDirection };
    return shift ? updated : [updated[existingIndex]];
  });
}

function sortIndicator<T>(key: keyof T, sorts: Array<SortDescriptor<T>>): string {
  const entry = sorts.find((sort) => sort.key === key);
  if (!entry) return "↕";
  return entry.direction === "asc" ? "▲" : "▼";
}

function useRegisterRows(): Array<RegisterRow> {
  const [snapshot, setSnapshot] = useState<CpuStateSnapshot>(() => getLatestCpuState() ?? createDefaultSnapshot());

  useEffect(() => {
    return subscribeToCpuState((next) => {
      setSnapshot({
        registers: Array.from({ length: MachineState.REGISTER_COUNT }, (_, index) => next.registers[index] ?? 0),
        hi: next.hi,
        lo: next.lo,
        pc: next.pc,
      });
    });
  }, []);

  return useMemo(
    () =>
      REGISTER_NAMES.map((name, index) => ({
        key: `r${index}`,
        name,
        number: index,
        value: snapshot.registers[index] ?? 0,
      })),
    [snapshot.registers],
  );
}

function useWordRows(memoryEntries: Array<MemoryRow>): Array<WordRow> {
  return useMemo(() => {
    const words = new Map<number, number>();

    memoryEntries.forEach(({ address, value }) => {
      const base = address - (address % 4);
      const offset = address % 4;
      const existing = words.get(base) ?? 0;
      const nextWord = existing | ((value & 0xff) << (8 * (3 - offset)));
      words.set(base, nextWord >>> 0);
    });

    return Array.from(words.entries()).map(([baseAddress, word]) => ({ baseAddress, word }));
  }, [memoryEntries]);
}

export function ExecutePane({ memoryEntries }: ExecutePaneProps): React.JSX.Element {
  const registerRows = useRegisterRows();
  const wordRows = useWordRows(memoryEntries);

  const [registerFilter, setRegisterFilter] = useState("");
  const [memoryFilter, setMemoryFilter] = useState("");
  const [wordFilter, setWordFilter] = useState("");

  const [registerSorts, setRegisterSorts] = useState<Array<SortDescriptor<RegisterRow>>>([
    { key: "number", direction: "asc" },
  ]);
  const [memorySorts, setMemorySorts] = useState<Array<SortDescriptor<MemoryRow>>>([
    { key: "address", direction: "asc" },
  ]);
  const [wordSorts, setWordSorts] = useState<Array<SortDescriptor<WordRow>>>([
    { key: "baseAddress", direction: "asc" },
  ]);

  const [hoveredRegister, setHoveredRegister] = useState<string | null>(null);
  const [hoveredMemory, setHoveredMemory] = useState<number | null>(null);
  const [hoveredWord, setHoveredWord] = useState<number | null>(null);

  const filterRows = useCallback(<T,>(rows: Array<T>, filter: string, predicate: (row: T, lower: string) => boolean): Array<T> => {
    if (!filter.trim()) return rows;
    const lower = filter.trim().toLowerCase();
    return rows.filter((row) => predicate(row, lower));
  }, []);

  const filteredRegisters = useMemo(() => {
    const rows = filterRows(registerRows, registerFilter, (row, lower) => {
      const valueHex = formatRegister(row.value).toLowerCase();
      return row.name.toLowerCase().includes(lower) || row.number.toString().includes(lower) || valueHex.includes(lower);
    });

    return applySorts(rows, registerSorts);
  }, [filterRows, registerFilter, registerRows, registerSorts]);

  const filteredMemory = useMemo(() => {
    const rows = filterRows(memoryEntries, memoryFilter, (row, lower) => {
      const addressHex = formatAddress(row.address).toLowerCase();
      const valueHex = formatByte(row.value).toLowerCase();
      return (
        addressHex.includes(lower) ||
        row.address.toString().includes(lower) ||
        valueHex.includes(lower) ||
        row.value.toString().includes(lower)
      );
    });

    return applySorts(rows, memorySorts);
  }, [filterRows, memoryEntries, memoryFilter, memorySorts]);

  const filteredWords = useMemo(() => {
    const rows = filterRows(wordRows, wordFilter, (row, lower) => {
      const addressHex = formatAddress(row.baseAddress).toLowerCase();
      const wordHex = formatWord(row.word).toLowerCase();
      return addressHex.includes(lower) || row.baseAddress.toString().includes(lower) || wordHex.includes(lower);
    });

    return applySorts(rows, wordSorts);
  }, [filterRows, wordFilter, wordRows, wordSorts]);

  const copyText = useCallback((text: string) => void navigator.clipboard?.writeText(text), []);

  return (
    <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
      <div style={panelStyle}>
        <header style={panelHeaderStyle}>
          <div>
            <div style={panelTitleStyle}>Registers</div>
            <small style={panelHelpStyle}>Shift-click headers to multi-sort. Values update live.</small>
          </div>
          <input
            aria-label="Filter registers"
            style={filterInputStyle}
            placeholder="Search name, number, or value"
            value={registerFilter}
            onChange={(event) => setRegisterFilter(event.target.value)}
          />
        </header>
        <div style={tableWrapperStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th
                  style={{ ...headerCellStyle, textAlign: "left" }}
                  onClick={(event) => toggleSort("name", event.shiftKey, registerSorts, setRegisterSorts)}
                >
                  Name <span style={sortIconStyle}>{sortIndicator("name", registerSorts)}</span>
                </th>
                <th
                  style={{ ...headerCellStyle, textAlign: "right", width: "20%" }}
                  onClick={(event) => toggleSort("number", event.shiftKey, registerSorts, setRegisterSorts)}
                >
                  # <span style={sortIconStyle}>{sortIndicator("number", registerSorts)}</span>
                </th>
                <th
                  style={{ ...headerCellStyle, textAlign: "right", width: "45%" }}
                  onClick={(event) => toggleSort("value", event.shiftKey, registerSorts, setRegisterSorts)}
                >
                  Value <span style={sortIconStyle}>{sortIndicator("value", registerSorts)}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRegisters.map((row) => (
                <tr
                  key={row.key}
                  onMouseEnter={() => setHoveredRegister(row.key)}
                  onMouseLeave={() => setHoveredRegister((current) => (current === row.key ? null : current))}
                >
                  <th style={{ ...rowHeaderStyle, textAlign: "left" }} scope="row">
                    {row.name}
                  </th>
                  <td style={{ ...cellStyle, textAlign: "right" }}>{row.number}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>
                    <div style={valueCellContentStyle}>
                      <span>{formatRegister(row.value)}</span>
                      <button
                        style={{ ...rowActionStyle, opacity: hoveredRegister === row.key ? 1 : 0 }}
                        onClick={() => copyText(formatRegister(row.value))}
                        title="Copy value"
                      >
                        Copy
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={footerHintStyle}>Hover to reveal quick actions.</div>
      </div>

      <div style={panelStyle}>
        <header style={panelHeaderStyle}>
          <div>
            <div style={panelTitleStyle}>Memory bytes</div>
            <small style={panelHelpStyle}>Sortable by address or value; filter any column.</small>
          </div>
          <input
            aria-label="Filter memory"
            style={filterInputStyle}
            placeholder="Search address or value"
            value={memoryFilter}
            onChange={(event) => setMemoryFilter(event.target.value)}
          />
        </header>
        <div style={tableWrapperStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th
                  style={{ ...headerCellStyle, textAlign: "left", width: "55%" }}
                  onClick={(event) => toggleSort("address", event.shiftKey, memorySorts, setMemorySorts)}
                >
                  Address <span style={sortIconStyle}>{sortIndicator("address", memorySorts)}</span>
                </th>
                <th
                  style={{ ...headerCellStyle, textAlign: "right" }}
                  onClick={(event) => toggleSort("value", event.shiftKey, memorySorts, setMemorySorts)}
                >
                  Byte <span style={sortIconStyle}>{sortIndicator("value", memorySorts)}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredMemory.map((row) => (
                <tr
                  key={row.address}
                  onMouseEnter={() => setHoveredMemory(row.address)}
                  onMouseLeave={() => setHoveredMemory((current) => (current === row.address ? null : current))}
                >
                  <th style={{ ...rowHeaderStyle, textAlign: "left" }} scope="row">
                    {formatAddress(row.address)}
                  </th>
                  <td style={{ ...cellStyle, textAlign: "right" }}>
                    <div style={valueCellContentStyle}>
                      <span>{formatByte(row.value)}</span>
                      <button
                        style={{ ...rowActionStyle, opacity: hoveredMemory === row.address ? 1 : 0 }}
                        onClick={() => copyText(formatByte(row.value))}
                        title="Copy byte"
                      >
                        Copy
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={footerHintStyle}>Search updates the predicate in real time.</div>
      </div>

      <div style={panelStyle}>
        <header style={panelHeaderStyle}>
          <div>
            <div style={panelTitleStyle}>Data words</div>
            <small style={panelHelpStyle}>Aggregated 32-bit view for easier comparisons.</small>
          </div>
          <input
            aria-label="Filter data words"
            style={filterInputStyle}
            placeholder="Search base address or word"
            value={wordFilter}
            onChange={(event) => setWordFilter(event.target.value)}
          />
        </header>
        <div style={tableWrapperStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th
                  style={{ ...headerCellStyle, textAlign: "left", width: "55%" }}
                  onClick={(event) => toggleSort("baseAddress", event.shiftKey, wordSorts, setWordSorts)}
                >
                  Base address <span style={sortIconStyle}>{sortIndicator("baseAddress", wordSorts)}</span>
                </th>
                <th
                  style={{ ...headerCellStyle, textAlign: "right" }}
                  onClick={(event) => toggleSort("word", event.shiftKey, wordSorts, setWordSorts)}
                >
                  Word <span style={sortIconStyle}>{sortIndicator("word", wordSorts)}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredWords.map((row) => (
                <tr
                  key={row.baseAddress}
                  onMouseEnter={() => setHoveredWord(row.baseAddress)}
                  onMouseLeave={() => setHoveredWord((current) => (current === row.baseAddress ? null : current))}
                >
                  <th style={{ ...rowHeaderStyle, textAlign: "left" }} scope="row">
                    {formatAddress(row.baseAddress)}
                  </th>
                  <td style={{ ...cellStyle, textAlign: "right" }}>
                    <div style={valueCellContentStyle}>
                      <span>{formatWord(row.word)}</span>
                      <button
                        style={{ ...rowActionStyle, opacity: hoveredWord === row.baseAddress ? 1 : 0 }}
                        onClick={() => copyText(formatWord(row.word))}
                        title="Copy word"
                      >
                        Copy
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={footerHintStyle}>Hold Shift to keep existing sorts while adding a new column.</div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  backgroundColor: "#0b1220",
  border: "1px solid #1f2937",
  borderRadius: "0.5rem",
  padding: "0.75rem",
  color: "#e5e7eb",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const panelHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
};

const panelTitleStyle: React.CSSProperties = { fontSize: "1rem", fontWeight: 600 };
const panelHelpStyle: React.CSSProperties = { color: "#94a3b8" };

const filterInputStyle: React.CSSProperties = {
  backgroundColor: "#111827",
  border: "1px solid #1f2937",
  color: "#e5e7eb",
  borderRadius: "0.4rem",
  padding: "0.35rem 0.5rem",
  minWidth: "180px",
};

const tableWrapperStyle: React.CSSProperties = { overflow: "auto", borderRadius: "0.35rem" };

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: "0.9rem",
};

const headerCellStyle: React.CSSProperties = {
  padding: "0.4rem 0.5rem",
  backgroundColor: "#111827",
  color: "#cbd5e1",
  position: "sticky",
  top: 0,
  cursor: "pointer",
  borderBottom: "1px solid #1f2937",
};

const rowHeaderStyle: React.CSSProperties = {
  padding: "0.4rem 0.5rem",
  backgroundColor: "#0b1220",
  fontWeight: 500,
  color: "#cbd5e1",
  borderBottom: "1px solid #1f2937",
};

const cellStyle: React.CSSProperties = {
  padding: "0.4rem 0.5rem",
  backgroundColor: "#0b1220",
  borderBottom: "1px solid #1f2937",
  fontFamily: "'JetBrains Mono', monospace",
};

const valueCellContentStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "0.35rem",
};

const rowActionStyle: React.CSSProperties = {
  transition: "opacity 150ms ease",
  opacity: 0,
  background: "#1e293b",
  border: "1px solid #1f2937",
  borderRadius: "0.3rem",
  color: "#cbd5e1",
  padding: "0.2rem 0.45rem",
  cursor: "pointer",
};

const sortIconStyle: React.CSSProperties = { marginLeft: "0.35rem", color: "#64748b" };

const footerHintStyle: React.CSSProperties = { color: "#94a3b8", fontSize: "0.85rem" };

export default ExecutePane;
