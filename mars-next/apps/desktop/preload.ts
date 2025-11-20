import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("api", {
  placeholder: true,
});
