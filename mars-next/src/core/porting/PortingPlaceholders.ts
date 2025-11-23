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
      "Assembler now supports core data layout directives (.byte/.half/.word/.float/.double/.ascii/.asciiz/.space/.align) alongside li/move/nop expansions",
      "Segment selectors (.ktext/.kdata) and symbol utilities (.globl/.extern/.eqv/.set) are recognized in addition to the base directive set",
      "Macro expansion and .include file substitution are implemented, but expression evaluation and other pseudo-ops remain",
      "Data directives now apply implicit alignment consistent with their natural sizes",
    ],
  },
  {
    component: "Syscall table",
    legacyLocation: "legacy/mars/mips/instructions/syscalls",
    status: "partial",
    notes: [
      "Legacy syscall numbers 1-59 are registered in src/core/syscalls/legacy/LegacySyscalls with headless implementations for dialogs and MIDI",
      "Exception signaling and full fidelity argument validation are not yet present",
    ],
  },
  {
    component: "Device and MMIO coverage",
    legacyLocation: "legacy/mars/mips/hardware/memory",
    status: "partial",
    notes: [
      "Memory-mapped FileDevice read/write offsets are stubbed and no keyboard/display/MMIO interrupts are available",
      "MemoryMap now performs TLB translation and cache-aware access via src/core/memory/Memory, but parity with legacy eviction policies and hazards remains",
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
