import { Memory } from "../memory/Memory";
import { MachineState } from "../state/MachineState";
import { type WatchEvent, type WatchValue } from "../debugger/WatchEngine";

export type RuntimeStatus = "running" | "breakpoint" | "halted" | "terminated";

export interface RuntimeSnapshot {
  status: RuntimeStatus;
  state: MachineState;
  memory?: Memory;
  watchChanges?: WatchEvent[];
  watchValues?: WatchValue[];
}

type RuntimeListener = (snapshot: RuntimeSnapshot) => void;

const runtimeListeners = new Set<RuntimeListener>();
let latestSnapshot: RuntimeSnapshot = {
  status: "halted",
  state: new MachineState(),
  memory: new Memory(),
  watchChanges: [],
  watchValues: [],
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

export function hasRuntimeListeners(): boolean {
  return runtimeListeners.size > 0;
}
