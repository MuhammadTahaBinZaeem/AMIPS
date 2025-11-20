import { type SettingsState } from "../state/settingsSlice";

export function loadSettings(): SettingsState {
  return { theme: "light" };
}
