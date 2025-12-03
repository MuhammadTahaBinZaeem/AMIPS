import type { MarsTool } from "./MarsTool";

const TOOL_GLOBS = {
  tools: import.meta.glob("../../features/tools/**/*{Tool,Window}.tsx"),
  pipeline: import.meta.glob("../../features/pipeline-view/**/*Window.tsx"),
};

export class ToolLoader {
  private static registry: MarsTool[] | null = null;

  static async loadTools(): Promise<MarsTool[]> {
    if (this.registry) return this.registry;

    const loaded: MarsTool[] = [];
    const modules = { ...TOOL_GLOBS.tools, ...TOOL_GLOBS.pipeline };

    await Promise.all(
      Object.entries(modules).map(async ([path, loader]) => {
        try {
          const module = (await loader()) as { default?: MarsTool };
          const tool = module.default;
          if (!tool) {
            console.error(`[ToolLoader] Skipping ${path} because no default export was found.`);
            return;
          }

          if (!tool.name || typeof tool.run !== "function") {
            console.error(`[ToolLoader] Skipping ${path} because it does not implement MarsTool.`);
            return;
          }

          const id = tool.id ?? path;
          loaded.push({ ...tool, id });
        } catch (error) {
          console.error(`[ToolLoader] Failed to load tool from ${path}:`, error);
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
