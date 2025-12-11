import React, { Suspense } from "react";
import { LazyRegistersWindow } from "../../tools/register-viewer";

/**
 * Thin wrapper that preserves the RegisterTable name for existing callers while routing
 * to the new dynamic register viewer.
 */
export function RegisterTable(): React.JSX.Element {
  return (
    <Suspense fallback={<div style={{ color: "#94a3b8" }}>Loading registers…</div>}>
      <LazyRegistersWindow />
    </Suspense>
  );
}
