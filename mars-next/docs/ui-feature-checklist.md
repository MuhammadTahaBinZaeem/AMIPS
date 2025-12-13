# UI Feature Verification

This checklist captures the current implementation status of key Mars Next UI features.

## Dark theme defaults
- Dark color tokens define the global palette for surfaces, borders, and text, and the global color scheme is set to `dark` so headers, panels, and controls render on dark backgrounds by default. Relevant tokens include `--color-elevated`, `--color-surface`, and `--color-border`. [src/ui/theme/global.css]
- The Monaco editor registers the custom `amips-dark` theme with matching surface, text, and accent colors and applies it on mount to keep the editor aligned with the dark UI. [src/features/editor/components/EditorView.tsx]
- Settings currently expose a `theme` field but no UI toggle, so the interface runs in dark mode by default.

## Register sidebar
- The application tracks `isRegisterSidebarOpen` and renders a dedicated inspector panel for the register viewer. Header buttons and the top toolbar toggle visibility, keeping a sliver of the sidebar present when collapsed. [src/app/App.tsx]
- The register viewer highlights updated registers for a short duration and shows a green accent when changes arrive from the CPU state feed. [src/features/tools/register-viewer/RegistersWindow.tsx]

## Unified assembler/runtime terminal
- Bottom panel tabs include a "terminal" view backed by `UnifiedTerminal`, with toolbar controls for search, clearing, and scrolling. Status text appears above the viewport. [src/app/App.tsx]
- `appendTerminalLine` prefixes lines with their source (`asm` or `run`), appends them to the unified stream, and automatically opens the terminal tab when new output arrives. [src/app/App.tsx]

## IDE-like shell layout
- `App` composes a grid-based shell with a header, activity bar, navigation sidebar, collapsible register inspector, tabbed editor region, tool panels, and a bottom panel—mirroring modern IDE layouts. [src/app/App.tsx]
- Tool menus group icons with shortcuts and support docked or detached presentation via `ToolLoader`. [src/app/App.tsx]

## Monaco editor controls
- Editor options enable minimap, smooth scrolling, glyph margin breakpoints, and folding while exposing command hooks for search, replace, and undo/redo via the toolbar. [src/features/editor/components/EditorView.tsx]
- Zoom controls adjust font size between 12px and 26px, and clicking the glyph margin toggles breakpoints; active lines receive dedicated decorations. [src/features/editor/components/EditorView.tsx]

## Execute pane tables
- The execute pane renders registers, memory bytes, and data words in sortable tables with click-to-toggle sort order and Shift for multi-column sorting. [src/features/execute-pane/ExecutePane.tsx]
- Each table includes live filters, row-level copy controls, and tooltips describing multi-sort behavior. Data words aggregate four bytes per row for easier inspection. [src/features/execute-pane/ExecutePane.tsx]

## Action bar icons
- Header buttons for new/open/save/save-as and register toggling use compact icon buttons with tooltips to match VS Code-style command affordances. [src/app/App.tsx]
- The run toolbar in the terminal tab exposes assemble, run, and cache flush actions in a similar compact style. [src/app/App.tsx]

## File management
- The workspace integrates a `FileExplorer` with recent files and binds open/save actions to browser file pickers when available, falling back to workspace writes. [src/app/App.tsx]

## Observations
- Dark mode is consistently applied across UI chrome and the editor, but a light/dark toggle is not yet surfaced.
