import { app, BrowserWindow, session } from "electron";
import { join } from "node:path";

const preloadPath = join(__dirname, "preload.js");
const rendererIndexPath = join(__dirname, "../renderer/index.html");

const normalizeDevServerUrl = (rawUrl?: string): string => {
  const value = rawUrl ?? "http://localhost:5173";
  if (value.startsWith("https://")) {
    const parsed = new URL(value);
    const port = parsed.port ? `:${parsed.port}` : "";
    return `http://${parsed.hostname}${port}${parsed.pathname}`;
  }
  return value;
};

const rawDevServerUrl = process.env.VITE_DEV_SERVER_URL;
const devServerUrl = normalizeDevServerUrl(rawDevServerUrl);
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
    let loaded = false;
    const devUrls = [devServerUrl];

    // When the dev server URL points at HTTPS with an invalid certificate, Electron will throw
    // a handshake error instead of rendering the UI. Try the HTTP variant first to avoid
    // relying on local certificates when developing in restricted environments, but still
    // attempt the original value if it differs.
    if (rawDevServerUrl && rawDevServerUrl !== devServerUrl) {
      devUrls.push(rawDevServerUrl);
    }

    for (const url of devUrls) {
      try {
        await window.loadURL(url);
        loaded = true;
        break;
      } catch (error) {
        console.warn(`Failed to load dev server at ${url}`, error);
      }
    }

    if (!loaded) {
      console.error("Failed to load dev server, falling back to bundled renderer");
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
