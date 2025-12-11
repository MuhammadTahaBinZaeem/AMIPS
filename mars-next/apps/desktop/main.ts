import { app, BrowserWindow, session } from "electron";
import { join } from "node:path";

const preloadPath = join(__dirname, "preload.js");
const rendererIndexPath = join(__dirname, "../renderer/index.html");
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
const devToolsEnabled = process.env.ELECTRON_OPEN_DEVTOOLS === "true";

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
    },
    title: "MARS Next",
  });

  if (process.env.NODE_ENV === "development") {
    try {
      await window.loadURL(devServerUrl);
    } catch (error) {
      console.error("Failed to load dev server, falling back to bundled renderer", error);
      await window.loadFile(rendererIndexPath);
    }
    if (devToolsEnabled) {
      window.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    window
      .loadFile(rendererIndexPath)
      .catch((error) => console.error("Failed to load renderer", error));
  }
}

app.whenReady().then(async () => {
  try {
    await session.defaultSession.setProxy({ mode: "direct" });
  } catch (error) {
    console.warn("Failed to disable proxy settings; continuing with defaults", error);
  }

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
