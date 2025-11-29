# Bug Report

## Testing Performed
- `npm test` (passes).
- `npm run build` for the Electron renderer/main bundle.

## Issues Observed

1. **Renderer build failed due to incorrect core import path.**
   - The settings `PseudoOpsEditor` imported from `../../core`, which resolves to `src/features/core` instead of `src/core`. Vite failed to resolve this module, preventing any production build or packaging of the app.
   - Updated the import to `../../../core` so the renderer bundle can be produced and the app can launch.

2. **Duplicate relocation case warnings in `ExecutableParser`.**
   - The renderer build emits multiple esbuild warnings that `mapRelocationType` has case labels that duplicate earlier clauses (ELF and COFF relocation enums share values). While the build succeeds, these warnings indicate the COFF cases are unreachable and may hide distinct handling if the constants ever diverge.
