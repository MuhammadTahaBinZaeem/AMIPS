import { Memory } from "../memory/Memory";
import { MachineState } from "../state/MachineState";

export type RuntimeStatus = "running" | "breakpoint" | "halted" | "terminated";

export interface RuntimeSnapshot {
  status: RuntimeStatus;
  state: MachineState;
  memory?: Memory;
}

type RuntimeListener = (snapshot: RuntimeSnapshot) => void;

const runtimeListeners = new Set<RuntimeListener>();
let latestSnapshot: RuntimeSnapshot = {
  status: "halted",
  state: new MachineState(),
  memory: new Memory(),
};

export function publishRuntimeSnapshot(snapshot: RuntimeSnapshot): void {
  latestSnapshot = snapshot;
  runtimeListeners.forEach((listener) => listener(snapshot));
}

export function subscribeToRuntimeSnapshots(listener: RuntimeListener): () => void {
  runtimeListeners.add(listener);
  listener(latestSnapshot);
  return () => runtimeListeners.delete(listener);
}

export function getLatestRuntimeSnapshot(): RuntimeSnapshot {
  return latestSnapshot;
}
