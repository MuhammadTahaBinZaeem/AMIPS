import React from "react";
import { RegistersWindow } from "../../tools/register-viewer";

/**
 * Thin wrapper that preserves the RegisterTable name for existing callers while routing
 * to the new dynamic register viewer.
 */
export function RegisterTable(): React.JSX.Element {
  return <RegistersWindow />;
}
