import type { MarsTool } from "./MarsTool";

type ToolModule = { default?: MarsTool };

const TOOL_IMPORTS: Array<{ label: string; loader: () => Promise<ToolModule> }> = [
  { label: "data-segment", loader: () => import("../../features/tools/data-viewer/DataSegmentWindow") },
  { label: "text-segment", loader: () => import("../../features/tools/text-viewer/TextSegmentWindow") },
  { label: "registers", loader: () => import("../../features/tools/register-viewer/RegistersWindow") },
  { label: "bitmap-display", loader: () => import("../../features/tools/bitmap-display/BitmapDisplayWindow") },
  { label: "keyboard", loader: () => import("../../features/tools/keyboard-view/KeyboardWindow") },
  { label: "pipeline", loader: () => import("../../features/pipeline-view/PipelineStateWindow") },
];

export class ToolLoader {
  private static registry: MarsTool[] | null = null;

  static async loadTools(): Promise<MarsTool[]> {
    if (this.registry) return this.registry;

    const loaded: MarsTool[] = [];

    await Promise.all(
      TOOL_IMPORTS.map(async ({ loader, label }, index) => {
        const pathLabel = label || `tool-${index}`;
        try {
          const module = await loader();
          const tool = module.default;
          if (!tool) {
            console.error(`[ToolLoader] Skipping ${pathLabel} because no default export was found.`);
            return;
          }

          if (!tool.name || typeof tool.run !== "function") {
            console.error(`[ToolLoader] Skipping ${pathLabel} because it does not implement MarsTool.`);
            return;
          }

          const id = tool.id ?? pathLabel;
          loaded.push({ ...tool, id });
        } catch (error) {
          console.error(`[ToolLoader] Failed to load tool from ${pathLabel}:`, error);
        }
      }),
    );

    this.registry = loaded;
    return loaded;
  }

  static getRegisteredTools(): MarsTool[] {
    return this.registry ?? [];
  }
}
