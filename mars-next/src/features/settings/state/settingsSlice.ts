export interface SettingsState {
  theme: string;
  enablePseudoInstructions: boolean;
  forwardingEnabled: boolean;
  hazardDetectionEnabled: boolean;
  executionMode: "pipeline" | "sequential";
}

export const initialSettingsState: SettingsState = {
  theme: "light",
  enablePseudoInstructions: true,
  forwardingEnabled: true,
  hazardDetectionEnabled: true,
  executionMode: "pipeline",
};
