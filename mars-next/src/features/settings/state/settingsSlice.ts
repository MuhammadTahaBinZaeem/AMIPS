export interface SettingsState {
  theme: string;
  enablePseudoInstructions: boolean;
}

export const initialSettingsState: SettingsState = {
  theme: "light",
  enablePseudoInstructions: true,
};
