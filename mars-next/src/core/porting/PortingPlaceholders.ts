export interface LegacyPortingGap {
  component: string;
  legacyLocation: string;
  status: "missing" | "partial";
  notes: string[];
}

/**
 * Inventory of core subsystems that exist in the legacy Java codebase but are
 * either missing or only partially represented in the current mars-next core.
 * These entries act as placeholders so the matching TypeScript modules can be
 * fleshed out without re-discovering the gaps.
 */
export const LEGACY_PORTING_GAPS: LegacyPortingGap[] = [
  {
    component: "Instruction decoder & executor",
    legacyLocation: "legacy/mars/mips/instructions",
    status: "partial",
    notes: [
      "Only add/addi/beq/nop decoding exists in src/core/cpu/Instructions (no R/I/J coverage, coprocessors, or traps)",
      "Execution currently lacks memory access, multiply/divide, floating point, and exception support",
    ],
  },
  {
    component: "Assembler directives & pseudo-ops",
    legacyLocation: "legacy/mars/assembler/PseudoOps.java",
    status: "partial",
    notes: [
      "Assembler only accepts .text, .data, .word, .asciiz plus li/move/nop expansions",
      "Macro expansion, alignment, and expression handling from the legacy assembler are unimplemented",
    ],
  },
  {
    component: "Syscall table",
    legacyLocation: "legacy/mars/mips/instructions/syscalls",
    status: "partial",
    notes: [
      "Only syscalls 1, 4, 5, and 10 are wired; the legacy set includes dozens of services (file I/O, random, time, etc.)",
      "Exception signaling and argument validation parity are not yet present",
    ],
  },
  {
    component: "Device and MMIO coverage",
    legacyLocation: "legacy/mars/mips/hardware/memory",
    status: "partial",
    notes: [
      "Memory-mapped FileDevice read/write offsets are stubbed and no keyboard/display/MMIO interrupts are available",
      "MemoryMap does not yet orchestrate simulated cache/TLB behavior from the legacy hardware layer",
    ],
  },
  {
    component: "Simulator pipeline features",
    legacyLocation: "legacy/mars/simulator",
    status: "partial",
    notes: [
      "Pipeline only supports single-step with minimal hazard/exception handling",
      "No instruction-level debugging metadata, delayed-load hazards, or instruction count profiling from the legacy simulator",
    ],
  },
  {
    component: "Debugging utilities",
    legacyLocation: "legacy/mars/venus/gui/EditorPaneHighlighting",
    status: "partial",
    notes: [
      "Current BreakpointEngine/WatchEngine cover simple watches; no disassembly, symbol lookup, or source mapping yet",
    ],
  },
  {
    component: "Loader & binary formats",
    legacyLocation: "legacy/mars/loader",
    status: "partial",
    notes: [
      "ProgramLoader handles raw BinaryImage only; ELF/MIPS executable loaders, relocation records, and text/data alignment rules remain",
    ],
  },
];
