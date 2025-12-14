import { contextBridge, ipcRenderer } from "electron";
import type { MarsRendererApi } from "../src/shared/bridge";

const api: MarsRendererApi = {
  readTextFileSync: (path) => ipcRenderer.sendSync("file:read-text", path),
  loadPseudoOpsFile: () => ipcRenderer.sendSync("pseudoOps:load"),
  savePseudoOpsFile: (contents, destinationPath) => ipcRenderer.sendSync("pseudoOps:save", contents, destinationPath),
  loadUserPseudoOpsOverride: () => ipcRenderer.sendSync("pseudoOps:override"),
};

contextBridge.exposeInMainWorld("api", api);
