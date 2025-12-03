import { initialSettingsState, type SettingsState } from "../state/settingsSlice";

export function loadSettings(): SettingsState {
  if (typeof window === "undefined") return initialSettingsState;

  try {
    const serialized = window.localStorage.getItem("mars-next.settings");
    if (!serialized) return initialSettingsState;

    const parsed = JSON.parse(serialized) as Partial<SettingsState>;
    return { ...initialSettingsState, ...parsed };
  } catch (error) {
    console.warn("Failed to load settings; falling back to defaults", error);
    return initialSettingsState;
  }
}

export function saveSettings(settings: SettingsState): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem("mars-next.settings", JSON.stringify(settings));
  } catch (error) {
    console.warn("Failed to persist settings", error);
  }
}
