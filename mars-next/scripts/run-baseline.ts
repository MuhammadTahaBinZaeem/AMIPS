import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  BitmapDisplayDevice,
  DisplayDevice,
  FileDevice,
  KeyboardDevice,
  Memory,
  MemoryMap,
  TerminalDevice,
  assembleAndLoad,
} from "../src/core";

interface MemoryRange {
  start: number;
  length: number;
}

interface SampleSpec {
  name: string;
  path: string;
  stdin?: string;
  registers: string[];
  memoryRanges?: MemoryRange[];
  description: string;
}

interface MemoryDumpEntry {
  address: string;
  words: string[];
}

interface RunResult {
  exitCode: number | null;
  output: string[];
  registers: Record<string, string>;
  memory: Record<string, MemoryDumpEntry[]>;
  devices?: Record<string, unknown>;
}

class QueuedInput {
  private readonly values: number[];

  constructor(values: number[]) {
    this.values = [...values];
  }

  readInt(): number {
    if (this.values.length === 0) {
      throw new Error("No more queued input values");
    }
    return this.values.shift()!;
  }
}

const SAMPLES: SampleSpec[] = [
  {
    name: "fibonacci",
    path: path.join("resources", "samples", "fibonacci.asm"),
    registers: ["$t0", "$t1", "$t2", "$t3", "$v0"],
    memoryRanges: [{ start: 0x10010000, length: 0x20 }],
    description: "Baseline console printing of the first twelve Fibonacci numbers",
  },
  {
    name: "syscall-mixed",
    path: path.join("resources", "samples", "syscall-mixed.asm"),
    stdin: "123\n",
    registers: ["$t0", "$v0", "$a0"],
    memoryRanges: [{ start: 0x10010000, length: 0x20 }],
    description: "Console input/output coverage for read_int, print_int, print_hex, and print_char",
  },
  {
    name: "floating-point",
    path: path.join("resources", "samples", "floating-point.asm"),
    registers: ["$f2", "$f4", "$f10"],
    memoryRanges: [{ start: 0x10010000, length: 0x20 }],
    description: "Single- and double-precision arithmetic and printing",
  },
  {
    name: "file-io",
    path: path.join("resources", "samples", "file-io.asm"),
    registers: ["$s0", "$s1", "$t0"],
    memoryRanges: [{ start: 0x10010000, length: 0x40 }],
    description: "Syscall-based open/read/write/close flow",
  },
  {
    name: "device-mmio",
    path: path.join("resources", "samples", "device-mmio.asm"),
    registers: ["$t2", "$t6"],
    memoryRanges: [
      { start: 0xffff0000, length: 0x10 },
      { start: 0xffff1000, length: 0x20 },
    ],
    description: "MMIO access to UART-style display and bitmap buffer",
  },
];

function toHex(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

function registerIndex(name: string): number | null {
  const normalized = name.replace("$", "").toLowerCase();
  const lookup: Record<string, number> = {
    zero: 0,
    at: 1,
    v0: 2,
    v1: 3,
    a0: 4,
    a1: 5,
    a2: 6,
    a3: 7,
    t0: 8,
    t1: 9,
    t2: 10,
    t3: 11,
    t4: 12,
    t5: 13,
    t6: 14,
    t7: 15,
    s0: 16,
    s1: 17,
    s2: 18,
    s3: 19,
    s4: 20,
    s5: 21,
    s6: 22,
    s7: 23,
    t8: 24,
    t9: 25,
    k0: 26,
    k1: 27,
    gp: 28,
    sp: 29,
    fp: 30,
    s8: 30,
    ra: 31,
  };

  if (normalized.startsWith("f")) {
    return Number.parseInt(normalized.slice(1), 10);
  }

  return lookup[normalized] ?? null;
}

function parseMemoryLines(lines: string[]): MemoryDumpEntry[] {
  const entries: MemoryDumpEntry[] = [];
  for (const line of lines) {
    const match = line.match(/^Mem\[(0x[0-9a-f]+)\]\s+(.+)$/i);
    if (!match) continue;

    const [, address, body] = match;
    const words = body
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    entries.push({ address, words });
  }
  return entries;
}

function runMarsLegacy(sample: SampleSpec): RunResult {
  const args = [
    "-Djava.awt.headless=true",
    "-cp",
    "../legacy",
    "Mars",
    "nc",
    ...sample.registers,
    ...(sample.memoryRanges?.map(({ start, length }) => {
      const end = start + Math.max(0, length - 4);
      return `0x${start.toString(16)}-0x${end.toString(16)}`;
    }) ?? []),
    sample.path,
  ];

  const proc = spawnSync("java", args, { input: sample.stdin, encoding: "utf8" });
  const stdout = proc.stdout.split(/\r?\n/).filter((line) => line.length > 0);
  const registers: Record<string, string> = {};
  const memoryLines: string[] = [];
  const output: string[] = [];

  for (const line of stdout) {
    if (/^\$[a-z0-9]/i.test(line)) {
      const [name, value] = line.trim().split(/\s+/);
      registers[name] = value;
      continue;
    }

    if (line.startsWith("Mem[")) {
      memoryLines.push(line);
      continue;
    }

    output.push(line);
  }

  return {
    exitCode: proc.status,
    output,
    registers,
    memory: { memory: parseMemoryLines(memoryLines) },
  };
}

function readWords(memory: Memory, range: MemoryRange): MemoryDumpEntry {
  const words: string[] = [];
  for (let address = range.start; address < range.start + range.length; address += 4) {
    const value = memory.readWord(address);
    words.push(toHex(value));
  }
  return { address: `0x${range.start.toString(16)}`, words };
}

function runMarsNext(sample: SampleSpec): RunResult {
  const terminalOutput: string[] = [];
  const terminal = new TerminalDevice((message) => terminalOutput.push(message));
  const file = new FileDevice();
  const displayOutput: string[] = [];
  const display = new DisplayDevice((char) => displayOutput.push(char));
  const bitmapEvents: { regions: unknown; pixels: string }[] = [];
  const bitmap = new BitmapDisplayDevice({
    onFlush: (regions, pixels) => {
      bitmapEvents.push({ regions, pixels: Buffer.from(pixels).toString("hex") });
    },
  });
  const devices = { terminal, file, input: new QueuedInput(sample.stdin ? [Number.parseInt(sample.stdin, 10)] : []) } as const;

  const memoryMap = new MemoryMap({
    devices: [
      { start: 0xffff0000, end: 0xffff0007, device: new KeyboardDevice() },
      { start: 0xffff0008, end: 0xffff000f, device: display },
      { start: 0xffff1000, end: 0xffff1fff, device: bitmap },
    ],
  });
  const memory = new Memory({ map: memoryMap });

  const source = readFileSync(sample.path, "utf8");
  try {
    const { engine } = assembleAndLoad(source, { devices, memory });
    engine.run(100000);

    const state = engine.getState();
    const runtimeMemory = engine.getMemory();
    const registers: Record<string, string> = {};

    for (const name of sample.registers) {
      const index = registerIndex(name);
      if (index === null) continue;

      if (name.toLowerCase().startsWith("$f")) {
        const single = state.getFloatRegisterSingle(index);
        const doubleValue = index % 2 === 0 ? state.getFloatRegisterDouble(index) : null;
        registers[name] = doubleValue !== null ? `single=${single} double=${doubleValue}` : `single=${single}`;
        continue;
      }

      registers[name] = toHex(state.getRegister(index));
    }

    const memoryDumps: Record<string, MemoryDumpEntry[]> = {
      memory: sample.memoryRanges?.map((range) => readWords(runtimeMemory, range)) ?? [],
    };

    const devicesSnapshot: Record<string, unknown> = {
      terminal: terminalOutput,
      display: displayOutput,
      bitmap: bitmapEvents,
    };

    const fileContents: Record<string, string> = {};
    for (const fileName of ["baseline-file.txt"]) {
      const content = file.getFile(fileName);
      if (content !== undefined) {
        fileContents[fileName] = content;
      }
    }
    if (Object.keys(fileContents).length > 0) {
      devicesSnapshot.file = fileContents;
    }

    return {
      exitCode: state.isTerminated() ? state.getRegister(2) : null,
      output: terminalOutput,
      registers,
      memory: memoryDumps,
      devices: devicesSnapshot,
    };
  } catch (error) {
    return {
      exitCode: null,
      output: [],
      registers: {},
      memory: { memory: [] },
      devices: { error: String(error) },
    };
  }
}

function main(): void {
  const baseline: Record<string, { description: string; mars: RunResult; marsNext: RunResult }> = {};

  const outputFile = path.join(process.cwd(), "baseline-file.txt");
  if (existsSync(outputFile)) {
    unlinkSync(outputFile);
  }

  for (const sample of SAMPLES) {
    const mars = runMarsLegacy(sample);
    const marsNext = runMarsNext(sample);
    baseline[sample.name] = { description: sample.description, mars, marsNext };
  }

  const outputPath = path.join("docs", "baseline-results.json");
  writeFileSync(outputPath, JSON.stringify(baseline, null, 2));
  // eslint-disable-next-line no-console
  console.log(`Wrote baseline results to ${outputPath}`);
}

main();
