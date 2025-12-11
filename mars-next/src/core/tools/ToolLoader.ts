import type { MarsTool } from "./MarsTool";

type ToolModule = { default?: MarsTool };

const TOOL_MODULES = import.meta.glob<ToolModule>(
  [
    "../../features/**/*.tool.{ts,tsx}",
    "../../features/**/*Tool.{ts,tsx}",
    "../../features/**/*Window.{ts,tsx}",
  ],
  { eager: false },
);

export class ToolLoader {
  private static registry: MarsTool[] | null = null;

  static async loadTools(): Promise<MarsTool[]> {
    if (this.registry) return this.registry;

    const loaded: MarsTool[] = [];

    await Promise.all(
      Object.entries(TOOL_MODULES).map(async ([pathLabel, loader], index) => {
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

          const id = tool.id ?? `tool-${index}`;
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
