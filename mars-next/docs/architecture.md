# Architecture

The workspace is split into an Electron shell, a React renderer, and a headless core simulation engine.

## Desktop shell
- **Entry points:** `apps/desktop/main.ts` creates the browser window and loads the renderer bundle. `apps/desktop/preload.ts` exposes a safe bridge for future IPC routes, and `apps/desktop/ipcRoutes.ts` is the registration point for new channels.
- **CLI:** `apps/cli/index.ts` is a stub that currently just logs its arguments but is wired for future command-line tooling that can reuse the core engine without Electron.

## Renderer
- **Mount point:** `src/app/index.tsx` boots the React app and renders `src/app/App.tsx`.
- **Prototype UI:** `App.tsx` wires the editor, assemble-and-run toolbar, register/memory views, and breakpoint/watch panels against the core engine helpers exported from `src/core/index.ts`.
- **Features:** Each capability under `src/features/` is isolated (editor, breakpoints/watches, run control, register view, memory view, file manager, settings, tools, and console I/O stubs) so UI concerns stay local to their feature folders.

## Core engine
- **Assembler and front-end:** `src/core/assembler/` tokenizes, parses, macro-expands, and emits binary images with source maps and relocation data. Pseudo-ops are loaded from `resources/PseudoOps.txt` at runtime.
- **CPU pipeline:** `src/core/cpu/` contains the instruction decoder, hazard-aware `Pipeline`, and `Cpu` abstractions for stepping or running programs. `decodeInstruction` in `src/core/cpu/Instructions/index.ts` handles the current instruction set.
- **State and memory:** `src/core/state/MachineState.ts` models registers/HI/LO/PC and floating-point registers; `src/core/memory/` provides byte/word memory with a `MemoryMap` for devices.
- **Loading and linking:** `src/core/loader/ProgramLoader.ts` consumes assembled `BinaryImage` payloads, while `src/core/loader/Linker.ts` stubs the future multi-image linker path.
- **Syscalls and devices:** Legacy syscalls (1–59) are registered in `src/core/syscalls/legacy/LegacySyscalls.ts` with pluggable handlers from `SyscallHandlers`. Devices such as terminal, file, timer, keyboard, display, and random stream live under `src/core/devices/` and integrate with the interrupt controller.
- **Debugging/interrupts:** `BreakpointEngine` and `WatchEngine` in `src/core/debugger/` track breakpoints, watches, and hit info. `src/core/interrupts/InterruptController.ts` coordinates syscall/device interrupts surfaced through the pipeline.

## Data flow
`CoreEngine` (exported from `src/core/index.ts`) is the façade used by the renderer. It assembles source, loads it into memory, wires syscalls/devices, enables breakpoints/watches, and drives the `Pipeline` for stepping or long runs. Renderer features (like the editor and run toolbar) call into these helpers so the UI never manipulates CPU state or memory directly.
