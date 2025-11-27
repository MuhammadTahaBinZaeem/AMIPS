# Legacy vs. mars-next coverage report

This report compares the legacy Java MARS distribution under `legacy/` against the current TypeScript/Electron prototype under `mars-next/`. It summarizes which legacy artifacts already have equivalents and where mars-next still needs to replicate or implement functionality. Use it alongside [`docs/porting-status.md`](porting-status.md) (current implementation snapshot) and [`docs/mips-syntax-coverage.md`](mips-syntax-coverage.md) (instruction coverage) when planning work.

## Resource and configuration gaps
- **Runtime configuration defaults:** The legacy simulator ships default UI/runtime flags (e.g., delayed branching toggle, highlight colors, load exception handler, editor behaviors) in `Settings.properties`, none of which exist in mars-next. These preferences cover assembly-time options, editor affordances, and register/memory highlighting that the new renderer does not yet expose.【F:legacy/Settings.properties†L1-L33】
- **Global simulator limits:** `Config.properties` defines message log sizes, error/backstep limits, accepted file extensions, and the ASCII translation table for memory rendering. mars-next does not yet surface equivalent limits or ASCII table customization in code or configuration.【F:legacy/Config.properties†L1-L52】
- **Syscall numbering overrides:** Legacy allows remapping syscall IDs through `Syscall.properties`, supporting dialogs, random streams, file I/O, timers, and MIDI hooks. mars-next registers syscalls 1–59 but lacks the external remapping table and associated UI prompts (dialogs, MIDI) noted in the legacy config.【F:legacy/Syscall.properties†L1-L45】【F:mars-next/docs/porting-status.md†L10-L15】
- **Datapath visualization maps:** Legacy bundles `ALUcontrolDatapath.xml`, `controlDatapath.xml`, and `registerDatapath.xml` defining equivalence tables and vertex/color mappings for the pipeline/datapath visualizer. mars-next has not ported these XML-driven visual aids or any renderer for them.【F:legacy/ALUcontrolDatapath.xml†L1-L40】
- **Additional packaged assets:** Legacy includes help documentation (`legacy/docs/`), images, and packaging metadata (e.g., `META-INF/MANIFEST.MF`, `CreateMarsJar.bat`, `mainclass.txt`) that have no counterparts in mars-next. These would need new documentation surfaces and build scripts if parity is required.

## Core simulator deltas
- **Instruction coverage:** mars-next currently decodes 99 of the 139 legacy mnemonics, leaving 40 floating-point arithmetic/branch and move variants unimplemented (`abs.*`, `add.*`, `mov*`, `mul.*`, `sub.*`, `sqrt.*`, `trunc/round/ceil/floor`, and FPU branches). Implementing these instructions is required for full parity.【F:mars-next/docs/mips-syntax-coverage.md†L3-L9】
- **Linker and binary ingestion:** The TypeScript `Linker` is stubbed and `ProgramLoader` only handles in-memory `BinaryImage` payloads. Legacy supports object/ELF parsing and multi-file linking; mars-next must add these loaders to match legacy behavior.【F:mars-next/docs/porting-status.md†L12-L15】
- **Pseudo-op table parity:** `PseudoOps.txt` is identical in both projects, so pseudo-instruction expansion is already aligned and does not require further action.【F:mars-next/docs/porting-status.md†L5-L9】

## Debugger, devices, and syscall behavior
- **UI-driven syscalls and dialogs:** Legacy supports dialog-based syscalls (confirm/input/message) plus MIDI outputs as shown in `Syscall.properties`. mars-next registers the numeric range but lacks the renderer/IPC pathways to present dialogs, MIDI devices, or configurable syscall prompts.【F:legacy/Syscall.properties†L24-L45】【F:mars-next/docs/porting-status.md†L10-L15】
- **Device parity:** mars-next already implements terminal, file, timer, keyboard, display, and random-stream devices, but it does not yet expose the legacy GUI tools (e.g., bitmap display windows, keyboard dialog widgets) that accompany those devices. Replicating the interactive device UIs remains pending.【F:mars-next/docs/porting-status.md†L8-L15】

## Renderer and tooling gaps
- **Console and I/O panes:** The legacy IDE exposes Run I/O panes with message limits and ASCII renderings governed by `Config.properties`; mars-next’s renderer omits console output/input views, so equivalent panes and preferences must be built.【F:legacy/Config.properties†L1-L52】【F:mars-next/docs/porting-status.md†L14-L15】
- **Editor affordances and settings UI:** Features like line numbering, current-line highlighting, popup instruction guidance, delayed-branch toggles, and data/register highlighting preferences are defined in legacy defaults but absent from the mars-next UI. A settings surface and associated state management are needed to replicate them.【F:legacy/Settings.properties†L3-L33】【F:mars-next/docs/features.md†L10-L14】
- **Tools and file manager:** Legacy bundles auxiliary tools and a richer file manager; mars-next leaves these as stubs, with `apps/cli` also only logging arguments. Implementing the tool suite, file browsing/open/save, and a functional CLI is required for parity.【F:mars-next/docs/porting-status.md†L14-L15】【F:mars-next/docs/features.md†L10-L14】
- **Documentation and help system:** The legacy distribution ships comprehensive HTML help under `legacy/docs/`. mars-next lacks an integrated help viewer or equivalent documentation inside the app, so porting or rewriting user-facing help remains outstanding.

## Packaging and distribution
- **Desktop packaging:** Legacy includes manifest and batch scripts for producing the runnable JAR. mars-next currently documents dev/build commands but does not define platform installers or packaging scripts for Electron, so production-ready distribution artifacts still need to be specified.【F:legacy/META-INF/MANIFEST.MF†L1-L12】【F:mars-next/README.md†L8-L21】
- **Main class metadata:** `legacy/mainclass.txt` identifies the Java entrypoint for packaging, which has no analogue in mars-next; Electron main/preload entry points exist but lack installer metadata or OS integration instructions.【F:legacy/mainclass.txt†L1-L1】【F:mars-next/README.md†L8-L17】

## Overall priority list for parity
1. Complete instruction decoder coverage for the remaining 40 mnemonics and validate floating-point execution paths.【F:mars-next/docs/mips-syntax-coverage.md†L3-L9】
2. Implement full linker/object/ELF loading and multi-image support in `ProgramLoader`/`Linker`.【F:mars-next/docs/porting-status.md†L12-L15】
3. Build renderer features for console I/O, settings/preferences, file management, and tool dialogs that match legacy capabilities.【F:legacy/Config.properties†L1-L52】【F:legacy/Settings.properties†L3-L33】【F:mars-next/docs/porting-status.md†L14-L15】
4. Add UI/device support for dialog-based syscalls, MIDI output, and other interactive devices exposed in the legacy configs.【F:legacy/Syscall.properties†L24-L45】【F:mars-next/docs/porting-status.md†L10-L15】
5. Define Electron packaging/distribution equivalents for the legacy JAR manifests and scripts.【F:legacy/META-INF/MANIFEST.MF†L1-L12】【F:mars-next/README.md†L8-L21】
