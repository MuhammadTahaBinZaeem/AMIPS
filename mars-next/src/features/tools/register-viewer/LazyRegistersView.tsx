import React from "react";

/**
 * Lazily loads the register viewer window to avoid bundling it in the main chunk
 * while keeping existing consumers unchanged.
 */
export const LazyRegistersWindow = React.lazy(async () => {
  const module = await import("./RegistersWindow");
  return { default: module.RegistersWindow };
});

LazyRegistersWindow.displayName = "LazyRegistersWindow";
