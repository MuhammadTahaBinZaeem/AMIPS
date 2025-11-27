# mars-next

TypeScript/Electron workspace for the next-generation MARS simulator. The repository includes a headless core engine (assembler, loader, CPU pipeline, syscalls, and devices) plus a React prototype renderer that exercises breakpoints, watches, and memory/register inspection.

## Quick start

- Install dependencies: `npm install`
- Run the desktop dev stack: `npm run dev` (watches the Electron main/preload bundle, serves the renderer with Vite, and launches Electron)
- Build production bundles: `npm run build`
- Run the test suite: `npm test`
- Clean build artifacts: `npm run clean` (or `npm run clean:modules` to also remove dependencies)

## Workspace layout

- [`apps/desktop/`](apps/desktop/): Electron entry points (`main.ts`, `preload.ts`, and `ipcRoutes.ts`).
- [`apps/cli/`](apps/cli/): Placeholder CLI entry for future tooling around the core engine.
- [`src/app/`](src/app/): React renderer entry point and top-level `App` component wiring together the prototype UI.
- [`src/features/`](src/features/): Feature modules for editing, breakpoints/watches, run controls, register/memory tables, and stubs for console I/O, tools, settings, and file management.
- [`src/core/`](src/core/): Headless simulation engine (assembler, program loader/linker, CPU pipeline, devices, syscalls, debugger engines, and state/memory management).
- [`docs/`](docs/): Architecture, feature, and porting notes for the TypeScript workspace.
  - [`docs/macro-symbols.md`](docs/macro-symbols.md): Macro template symbol reference for customizing `PseudoOps.txt`.
- [`resources/`](resources/): Bundled PseudoOps table imported by the assembler.

See [`docs/troubleshooting.md`](docs/troubleshooting.md) if you run into npm installation errors or Windows cleanup warnings, and [`docs/legacy-comparison.md`](docs/legacy-comparison.md) for a gap report against the legacy Java MARS distribution.
