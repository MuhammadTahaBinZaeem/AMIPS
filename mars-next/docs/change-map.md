# Change map and safe modification guide

This document explains where different kinds of changes belong in the mars-next workspace so that features stay isolated and do not unintentionally break each other. Follow the paths below when planning frontend UI updates, new feature work, or infrastructure changes like error handling and file access.

## High-level layout

- **Electron shell (desktop app scaffolding):** `apps/desktop/main.ts` bootstraps Electron windows and loads the renderer, while `apps/desktop/preload.ts` is the bridge for exposing safe APIs to the renderer. IPC routes should be registered in `apps/desktop/ipcRoutes.ts`.
- **Renderer entry point:** `src/app/index.tsx` mounts the React app, with `src/app/App.tsx` as the top-level component. Client-side routing (`src/app/routes.tsx`) and global state setup (`src/app/store.ts`) live alongside.
- **UI scaffolding:** Shared layout, theme, and primitive components live under `src/ui/` (`src/ui/layouts`, `src/ui/theme`, `src/ui/components`).
- **Feature modules:** Each user-facing capability has a dedicated folder in `src/features/` with a consistent structure: `components/` for UI, `state/` for slice-like logic, `services/` for adapters, `commands/` (where applicable) for editor actions, and `tests/` for module-level tests.
- **Shared utilities and contracts:** Cross-cutting helpers reside in `src/shared/` (e.g., `src/shared/utils/errorBoundary.tsx`, `src/shared/utils/logger.ts`, `src/shared/utils/eventBus.ts`, and typed adapters in `src/shared/adapters/`). Common types live in `src/shared/types/`.
- **Core simulation engine:** MIPS assembly parsing, memory, CPU, syscalls, and loader logic live under `src/core/` (e.g., `src/core/assembler`, `src/core/memory`, `src/core/cpu`, `src/core/loader`). Keep UI code out of this layer.
- **CLI entry point:** `apps/cli/index.ts` is available for command-line tooling that should reuse the core engine without Electron.
- **Documentation and tests:** Repo-wide docs are under `docs/`; workspace tests live under `tests/` plus per-feature `tests/` folders. Review [`docs/legacy-comparison.md`](legacy-comparison.md) when touching features that map to legacy behaviors so parity gaps do not widen.

## Where to add or adjust functionality

### New interface or screen
- Build new UI inside a **feature module** (prefer creating a new folder under `src/features/` if it does not fit an existing capability).
- Place visual components in `components/`, local state in `state/`, and feature-specific services in `services/` to keep concerns separated.
- Register navigation or surface entry points through `src/app/routes.tsx` (routing) and `src/ui/layouts` (layout slots) instead of editing unrelated features.
- Use `src/ui/theme` and `src/ui/components` for shared styling primitives rather than duplicating styles inside features.

### Better error detection and reporting
- **Renderer-level errors:** Wrap new screens with the shared `ErrorBoundary` helper (`src/shared/utils/errorBoundary.tsx`) and log through `src/shared/utils/logger.ts` so diagnostics stay centralized.
- **Domain/engine validation:** Enhance validation in the relevant core module (e.g., parsing errors in `src/core/assembler`, memory protection in `src/core/memory`, execution faults in `src/core/cpu`). Surface structured errors upward rather than throwing raw exceptions in UI layers.
- **Cross-layer messaging:** If renderer code needs to react to core errors dispatched via IPC, route the messages through a dedicated adapter in `src/shared/adapters/` and register the corresponding channel in `apps/desktop/ipcRoutes.ts`. Keep UI response handling inside the owning feature module.

### File opening and saving improvements
- Extend file browsing or recent-file behavior inside `src/features/file-manager/` (`components/` for UI affordances, `state/` for lists/history, `services/fileSystemAdapter.ts` for renderer-facing file API calls).
- For filesystem access that requires Node/Electron privileges, add IPC handlers in `apps/desktop/ipcRoutes.ts`, expose a safe method via `apps/desktop/preload.ts`, and consume it from the renderer through a typed adapter in `src/shared/adapters/` or the file manager service.
- If loaded files must be fed to the simulator, normalize and load them through `src/core/loader/ProgramLoader.ts` and related core classes rather than coupling UI to memory management directly.

### Adding new feature experiments
- Mirror the established feature shape: create `components/`, `state/`, `services/`, and `tests/` folders under a new `src/features/<feature-name>/` directory.
- Keep cross-feature dependencies limited to `src/shared` utilities and `src/core` APIs. Avoid reaching into another feature's internal files.
- Add integration points (buttons, tabs, menus) in shared UI components (`src/ui/components/Toolbar.tsx`, `src/ui/components/Tabs.tsx`, etc.) only when the interaction is global; otherwise, keep the UI changes inside the feature module.

## Isolation and regression safety

- **Keep layers separate:** Core simulation code (`src/core`) should stay UI-agnostic. Renderer-facing adapters in `src/shared/adapters` should be the bridge to Electron or Node-only capabilities.
- **Feature encapsulation:** Do not import another feature's `state/` or `components/` directly; share contracts through `src/shared/types` or new adapters instead.
- **Scoped tests:** Add or update tests near the change (feature `tests/` folder or root `tests/` for cross-cutting concerns) so regressions remain localized.
- **Parity check:** Before landing changes that affect legacy-aligned functionality (syscalls, devices, renderer affordances, tool surfaces), cross-reference the open gaps summarized in [`docs/legacy-comparison.md`](legacy-comparison.md) and the active porting snapshot in [`docs/porting-status.md`](porting-status.md).
- **Incremental commits:** Land one feature or improvement per commit to make rollbacks safe and to keep unrelated areas untouched.

## Quick references

- Start the renderer app from `src/app/index.tsx` and `src/app/App.tsx`.
- Electron window/bootstrap logic lives in `apps/desktop/main.ts`; preload exposure is in `apps/desktop/preload.ts`.
- File-centric UI and state live in `src/features/file-manager/`, while simulator loading occurs in `src/core/loader/ProgramLoader.ts`.
- Shared visual primitives and theming are under `src/ui/`; cross-cutting utilities are under `src/shared/`.
