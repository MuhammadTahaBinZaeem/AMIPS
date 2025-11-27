# Core porting status

This document tracks how much of the legacy Java MARS core has been ported into `mars-next/src/core` and where placeholders remain.

## Current implementation snapshot
- **Assembler/front-end:** Supports `.text`, `.data`, `.ktext`, `.kdata`, `.word`, `.byte`, `.half`, `.float`, `.double`, `.ascii`, `.asciiz`, `.space`, `.align`, `.globl`, `.extern`, `.eqv`, and `.set` with arithmetic/bitwise expressions. Macros and includes are expanded before parsing, and all 83 pseudo-op mnemonics from `resources/PseudoOps.txt` are loaded at runtime.
- **Instruction decoder:** `src/core/cpu/Instructions/index.ts` implements 99 of the 139 legacy instruction mnemonics, spanning arithmetic/logic, branches (with delay slots), load/store variants, traps, coprocessor transfers, and basic FPU conversions. See `docs/mips-syntax-coverage.md` for the complete matrix.
- **Pipeline and execution:** `src/core/cpu/Pipeline.ts` models a multi-stage pipeline with hazard detection for load-use stalls and shared memory, performance counters, branch-delay handling, and interrupt hooks. Tests under `tests/cpu/` and `tests/integration/` cover arithmetic, branching, and hazard scenarios.
- **Debugger hooks:** `BreakpointEngine` resolves breakpoints by address or symbol and records hit metadata; `WatchEngine` tracks registers/addresses/symbols and snapshots values for the renderer. Source maps from the assembler are threaded through `CoreEngine` so UI breakpoints can map back to instructions.
- **Syscalls and devices:** Legacy syscalls 1–59 are registered in `SyscallTable` with optional handler overrides. Terminal, file, timer, keyboard, display, and random-stream devices are available and raise interrupts through `InterruptController`; heap growth, file I/O, and pseudo-random streams match the legacy behaviors.

## Known gaps and placeholders
- **Missing instructions:** 40 legacy mnemonics are still unimplemented in the TypeScript decoder: `abs.d`, `abs.s`, `add.d`, `add.s`, `bc1f`, `bc1t`, `c.eq.d`, `c.eq.s`, `c.le.d`, `c.le.s`, `c.lt.d`, `c.lt.s`, `ceil.w.d`, `ceil.w.s`, `div.d`, `div.s`, `floor.w.d`, `floor.w.s`, `mov.d`, `mov.s`, `movf`, `movf.d`, `movf.s`, `movn.d`, `movn.s`, `movt`, `movt.d`, `movt.s`, `movz.d`, `movz.s`, `mul.d`, `mul.s`, `round.w.d`, `round.w.s`, `sqrt.d`, `sqrt.s`, `sub.d`, `sub.s`, `trunc.w.d`, `trunc.w.s`.
- **Linking and binaries:** `Linker` is stubbed and `ProgramLoader` only consumes in-memory `BinaryImage` payloads; ELF/object parsing and multi-image linking remain TODOs.
- **Renderer coverage:** Console I/O, tools, settings, and file manager features exist as stubs; CLI entry (`apps/cli`) also only logs arguments. UI polish such as disassembly views or advanced debugger panes has not been ported yet.
- **Legacy-specific assets:** The legacy distribution ships configuration/property files (e.g., `Settings.properties`, `Config.properties`, `Syscall.properties`) plus datapath visualizer XML and packaging metadata that are not yet represented in the TypeScript workspace. See [`docs/legacy-comparison.md`](legacy-comparison.md) for a detailed list.
