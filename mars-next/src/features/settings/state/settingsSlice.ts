export interface SettingsState {
  theme: string;
  enablePseudoInstructions: boolean;
  assembleAllFiles: boolean;
  delayedBranching: boolean;
  compactMemoryMap: boolean;
  selfModifyingCodeEnabled: boolean;
  showPipelineDelays: boolean;
  forwardingEnabled: boolean;
  hazardDetectionEnabled: boolean;
  executionMode: "pipeline" | "sequential";
}

export const initialSettingsState: SettingsState = {
  theme: "light",
  enablePseudoInstructions: true,
  assembleAllFiles: false,
  delayedBranching: true,
  compactMemoryMap: false,
  selfModifyingCodeEnabled: true,
  showPipelineDelays: true,
  forwardingEnabled: true,
  hazardDetectionEnabled: true,
  executionMode: "pipeline",
};
