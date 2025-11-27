# Features

## Core simulation
- **Assembler and macro system:** `Assembler` combines an include processor, macro expander, parser, and pseudo-op expansion from `resources/PseudoOps.txt` to emit `BinaryImage` payloads with relocation and source-map data.
- **Instruction execution:** The decoder in `src/core/cpu/Instructions/index.ts` implements 99 of the 139 legacy mnemonics (see `docs/mips-syntax-coverage.md` for the current list) across arithmetic, branches, loads/stores, traps, and FPU conversions.
- **Pipeline with hazards:** `src/core/cpu/Pipeline.ts` provides multi-stage execution with branch-delay handling, load-use stalls, shared-memory fetch suppression, and performance counters. It exposes `run`/`step` helpers through `CoreEngine`.
- **Debugger hooks:** `BreakpointEngine` supports address, label, and instruction-index breakpoints with one-shot/conditional options; `WatchEngine` tracks registers, addresses, and symbols and snapshots hit values for the renderer.
- **Syscalls and devices:** Legacy syscalls (1–59) are registered by default with optional overrides. Terminal, file, timer, keyboard, display, and random-stream devices are available and can raise interrupts via `InterruptController`.

## Renderer prototype
- **Editor and run control:** `src/app/App.tsx` hosts a built-in sample program, a breakpoint-aware editor surface, and the `RunToolbar` for assembling/running against the core engine.
- **State inspection:** `RegisterTable` and `MemoryTable` render current register/HI/LO/PC values and the first 128 memory bytes; symbol tables and source maps are captured after assembly.
- **Breakpoints and watches:** Feature panels collect breakpoints (by address, label, or instruction index) and watches (registers or symbol names) and apply them to the debugger engines before execution.
- **Planned surfaces:** Console I/O views, file manager affordances, settings, tools, and CLI wiring exist as stubs so future work can slot into the existing feature folders. The legacy comparison report in [`docs/legacy-comparison.md`](legacy-comparison.md) lists the renderer and tooling behaviors that remain to be ported.
