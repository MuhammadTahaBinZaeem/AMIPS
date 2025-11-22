# AMIPS

This repository keeps the original Java-based MARS simulator alongside the new TypeScript/Electron workspace for the Mars-next project.

## Repository layout

- [`legacy/`](legacy/): the historical Java MARS sources, kept intact in their original layout.
- [`mars-next/`](mars-next/): a starter TypeScript workspace for the next-generation UI built with React, Vite, and Electron.

## Legacy Java MARS

- Location: [`legacy/`](legacy/)
- Build: run `CreateMarsJar.bat` from the `legacy` directory (you can invoke it from the repo root; the script changes into the correct folder before building).
- Notes: the Java sources were only relocated under `legacy/`; they were not modified.

## Mars-next TypeScript workspace

- Location: [`mars-next/`](mars-next/)
- Install dependencies: `cd mars-next && npm install`
- Development: `npm run dev` (launches the Electron app after building the main and renderer bundles)
- Production build: `npm run build`
- Tests: `npm test`
- Cleanup: `npm run clean` to remove build artifacts or `npm run clean:modules` to remove dependencies as well.
