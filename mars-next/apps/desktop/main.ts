import { app, BrowserWindow, session } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const preloadPath = join(__dirname, "preload.js");
const rendererIndexPath = join(__dirname, "../renderer/index.html");
const rendererFileUrl = pathToFileURL(rendererIndexPath).toString();

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
const devServerHostnames = new Set<string>();

try {
  devServerHostnames.add(new URL(devServerUrl).hostname);
} catch (error) {
  console.warn("Unable to parse normalized dev server URL", devServerUrl, error);
}

if (rawDevServerUrl && rawDevServerUrl !== devServerUrl) {
  try {
    devServerHostnames.add(new URL(rawDevServerUrl).hostname);
  } catch (error) {
    console.warn("Unable to parse raw dev server URL", rawDevServerUrl, error);
  }
}

const renderErrorFallback = async (
  window: BrowserWindow,
  title: string,
  message: string,
  details?: unknown,
): Promise<void> => {
  const detailText = details instanceof Error ? details.message : String(details ?? "");
  const html = `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
        <style>
          :root {
            color-scheme: dark;
          }
          body {
            margin: 0;
            padding: 2.5rem;
            background: #0b1220;
            color: #e5e7eb;
            font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            line-height: 1.6;
          }
          h1 {
            margin-bottom: 0.75rem;
            font-size: 1.35rem;
          }
          p {
            margin: 0.35rem 0;
            color: #cbd5e1;
          }
          code {
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
            background: #111827;
            padding: 0.15rem 0.35rem;
            border-radius: 0.35rem;
            border: 1px solid #1f2937;
          }
          .panel {
            border: 1px solid #1f2937;
            border-radius: 0.75rem;
            background: #0f172a;
            padding: 1rem 1.25rem;
            max-width: 720px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
          }
          .muted {
            color: #94a3b8;
            margin-top: 0.85rem;
            font-size: 0.95rem;
          }
        </style>
      </head>
      <body>
        <div class="panel">
          <h1>${title}</h1>
          <p>${message}</p>
          ${detailText ? `<p class="muted">${detailText}</p>` : ""}
          <p class="muted">The renderer bundle could not be loaded. Ensure <code>npm run dev</code> is running or rerun <code>npm run build</code> before launching Electron.</p>
        </div>
      </body>
    </html>`;

  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await window.loadURL(dataUrl);
};

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
    let lastError: unknown;
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
        lastError = error;
        console.warn(`Failed to load dev server at ${url}`, error);
      }
    }

    if (!loaded) {
      console.error("Failed to load dev server, falling back to bundled renderer");
      try {
        await window.loadURL(rendererFileUrl);
        loaded = true;
      } catch (fallbackError) {
        console.error("Failed to load bundled renderer", fallbackError);
        await renderErrorFallback(
          window,
          "Renderer unavailable",
          "Neither the dev server nor the packaged renderer could be loaded.",
          lastError ?? fallbackError,
        );
      }
    }
    if (devToolsEnabled) {
      window.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    try {
      await window.loadURL(rendererFileUrl);
    } catch (error) {
      console.error("Failed to load renderer", error);
      await renderErrorFallback(
        window,
        "Renderer unavailable",
        "The packaged renderer bundle could not be loaded.",
        error,
      );
    }
  }
}

app.whenReady().then(async () => {
  if (process.env.NODE_ENV === "development") {
    session.defaultSession.setCertificateVerifyProc((request, callback) => {
      if (devServerHostnames.has(request.hostname)) {
        callback(0);
        return;
      }

      callback(-3);
    });

    app.on("certificate-error", (event, webContents, url, error, certificate, callback) => {
      try {
        const { hostname } = new URL(url);
        if (devServerHostnames.has(hostname)) {
          event.preventDefault();
          callback(true);
          return;
        }
      } catch (parseError) {
        console.warn("Failed to parse certificate error URL", url, parseError);
      }

      callback(false);
    });
  }

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
