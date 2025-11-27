# Contributing

Thanks for contributing to mars-next! A few quick pointers to keep changes predictable:

- Install dependencies with `npm install` and use the provided scripts: `npm run dev` for the Electron + Vite dev stack, `npm run build` for production bundles, and `npm test` for the TypeScript test suite.
- Keep renderer work scoped to feature folders under `src/features/` and route shared UI concerns through `src/app` or `src/ui` helpers. Core simulation changes belong under `src/core/` and should avoid renderer/Electron imports.
- When touching the simulation engine, prefer adding or updating tests in `tests/` (or the feature’s own `tests/` folder) so coverage tracks new behaviors. The current lint script is a placeholder, so tests are the primary regression guard.
- Update the docs in `docs/` when adding new capabilities or changing supported syntax so UI and engine consumers stay in sync. For legacy-aligned work, refresh [`docs/legacy-comparison.md`](legacy-comparison.md) and [`docs/porting-status.md`](porting-status.md) to capture the current parity snapshot.
