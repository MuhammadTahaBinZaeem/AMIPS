# Core porting status

This document tracks how much of the legacy MARS core has been ported into `mars-next/src/core` and where placeholders remain.

## Legacy gaps

The following items come directly from the legacy Java tree and have not been fully re-created yet. See `src/core/porting/PortingPlaceholders.ts` for details on the open work.

- Instruction decoder/executor coverage beyond the minimal `add`, `addi`, `beq`, and `nop` handlers.
- Full assembler directives, expressions, and pseudo-op handling from `PseudoOps.java`.
- Comprehensive syscall catalog (only 1, 4, 5, 10 are wired today).
- Broader MMIO devices (keyboard/display), file-backed memory mapping, and cache/TLB simulation.
- Simulator pipeline hazards, exceptions, and profiling hooks.
- Rich debugger affordances such as disassembly, symbol lookup, and source mapping.
- Loader support for ELF/MIPS binaries, relocation records, and alignment rules.

## Current core implementation snapshot

### Implemented and under test

- **MachineState**: Register file, delayed branch bookkeeping, and termination flags with unit coverage in `tests/state/MachineState.test.ts`.
- **Memory**: Byte and word reads/writes with alignment enforcement, tested in `tests/memory/Memory.test.ts`.
- **MemoryMap**: Segment mapping and MMIO device resolution, covered by `tests/memory/MemoryMap.test.ts`.
- **ProgramLoader**: BinaryImage loading, relocation offsets, and register initialization, verified by `tests/loader/ProgramLoader.test.ts`.
- **Debugger basics**: BreakpointEngine and WatchEngine watch sets, exercised via `tests/debugger/Debugger.test.ts`.
- **Devices**: TerminalDevice logging/queueing, TimerDevice ticking, and FileDevice descriptor bookkeeping are smoke-tested in `tests/devices/Devices.test.ts`.
- **CPU/Pipeline shell**: Program stepping with branch-delay handling is validated by `tests/cpu/Cpu.test.ts`, `tests/cpu/Pipeline.test.ts`, and integration tests under `tests/integration`.
- **Assembler front-end**: Tokenization/parsing plus encoding for a small instruction subset with tests in `tests/assembler/Assembler.test.ts`.
- **Syscall wiring**: Baseline print/read/exit syscalls are asserted in `tests/syscalls`.

### Placeholder or incomplete areas

- **Instruction set**: `src/core/cpu/Instructions` only decodes `add`, `addi`, `beq`, and `nop`; no load/store, shifts, jumps, coprocessors, or exceptions.
- **Assembler directives**: `src/core/assembler/Assembler.ts` recognizes `.text`, `.data`, `.word`, `.asciiz` plus `li`/`move`/`nop` expansions; other directives and expression evaluation remain unimplemented.
- **Syscalls**: `src/core/syscalls/SyscallTable.ts` registers only numbers 1, 4, 5, and 10; the legacy syscall set is largely absent.
- **Devices/MMIO**: `src/core/devices/FileDevice.ts` throws for memory-mapped reads/writes, and no keyboard/display/timer interrupts are surfaced through `MemoryMap`.
- **Pipeline depth**: `src/core/cpu/Pipeline.ts` provides single-step execution without hazard detection, exceptions, or performance counters found in the legacy simulator.
- **Loader formats**: `src/core/loader/ProgramLoader.ts` consumes an in-memory BinaryImage only; there is no ELF or object file parsing yet.
- **Debugger depth**: `src/core/debugger` lacks disassembly, source mapping, or symbol-aware breakpoints beyond basic watch/breakpoint lists.
