import { app, BrowserWindow } from "electron";
import { join } from "node:path";

const preloadPath = join(__dirname, "preload.js");
const rendererIndexPath = join(__dirname, "../renderer/index.html");
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
    },
    title: "MARS Next",
  });

  if (process.env.NODE_ENV === "development") {
    window.loadURL(devServerUrl).catch((error) => {
      console.error("Failed to load dev server", error);
    });
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    window
      .loadFile(rendererIndexPath)
      .catch((error) => console.error("Failed to load renderer", error));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
