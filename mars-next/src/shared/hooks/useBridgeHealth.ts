import { useEffect, useState } from "react";
import { getRendererApi, type BridgeHealth } from "../bridge";

const browserFallback: BridgeHealth = {
  ok: true,
  backend: "browser",
  message: "Running without Electron bridge; using in-browser core engine.",
};

export function useBridgeHealth(): BridgeHealth {
  const [health, setHealth] = useState<BridgeHealth>(browserFallback);

  useEffect(() => {
    let cancelled = false;
    const rendererApi = getRendererApi();

    if (rendererApi?.ping) {
      rendererApi
        .ping()
        .then((result) => {
          if (!cancelled) {
            setHealth(result);
          }
        })
        .catch((error) => {
          console.warn("Failed to reach Electron bridge", error);
          if (!cancelled) {
            setHealth({
              ok: false,
              backend: "electron",
              message: "Unable to reach Electron bridge; check that the shell is running.",
            });
          }
        });
    } else if (rendererApi) {
      setHealth({
        ok: true,
        backend: "electron",
        message: "Renderer API detected via preload script.",
      });
    } else {
      setHealth(browserFallback);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return health;
}
