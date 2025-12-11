# mars-next

TypeScript/Electron workspace for the next-generation MARS simulator. The repository includes a headless core engine (assembler, loader, CPU pipeline, syscalls, and devices) plus a React prototype renderer that exercises breakpoints, watches, and memory/register inspection.

## Quick start

- Install dependencies: `npm install`
- Run the desktop dev stack: `npm run dev` (watches the Electron main/preload bundle, serves the renderer with Vite, and launches Electron).
- Enable Electron DevTools during development by setting `ELECTRON_OPEN_DEVTOOLS=true` when starting the dev stack (DevTools stay closed by default to avoid noisy console warnings in some environments).
- Build production bundles: `npm run build`
- Run the test suite: `npm test`
- Clean build artifacts: `npm run clean` (or `npm run clean:modules` to also remove dependencies)

### Previewing the renderer build

If you only need to inspect the React UI (for example, to grab screenshots), you can serve the production renderer bundle without starting Electron:

1. Build the workspace: `npm run build`.
2. Launch a preview server on all interfaces: `npm exec -- vite preview --config config/vite.config.ts --host 0.0.0.0 --port 9010` (adjust the port as needed).
3. Open `http://localhost:9010` in a browser to view the packaged renderer.

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
