export interface PseudoOpsFileSnapshot {
  sourcePath: string;
  savePath: string;
  contents: string;
}

export interface PseudoOpsOverride {
  path: string;
  contents: string;
  isJson: boolean;
}

export interface MarsRendererApi {
  readTextFileSync: (path: string) => string;
  loadPseudoOpsFile: () => PseudoOpsFileSnapshot;
  savePseudoOpsFile: (contents: string, destinationPath: string) => string;
  loadUserPseudoOpsOverride: () => PseudoOpsOverride | null;
}

export const getRendererApi = (): MarsRendererApi | undefined => {
  if (typeof window === "undefined") return undefined;
  return window.api;
};

declare global {
  interface Window {
    api?: MarsRendererApi;
  }
}
