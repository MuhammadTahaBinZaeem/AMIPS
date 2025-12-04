import { Memory, subscribeToRuntimeSnapshots } from "../../../core";

export interface DataStateSnapshot {
  entries: Array<{ address: number; value: number }>;
}

type DataStateListener = (snapshot: DataStateSnapshot) => void;

const listeners = new Set<DataStateListener>();
let latestSnapshot: DataStateSnapshot = createInitialSnapshot();

function createInitialSnapshot(): DataStateSnapshot {
  return snapshotFromMemory(new Memory());
}

function normalizeEntries(entries: Array<{ address: number; value: number }>): Array<{ address: number; value: number }> {
  return [...entries]
    .map((entry) => ({ address: entry.address >>> 0, value: entry.value & 0xff }))
    .sort((a, b) => a.address - b.address);
}

function snapshotFromMemory(memory: Memory): DataStateSnapshot {
  return { entries: normalizeEntries(memory.entries()) };
}

export function publishDataState(snapshot: DataStateSnapshot): void {
  latestSnapshot = { entries: normalizeEntries(snapshot.entries) };
  listeners.forEach((listener) => listener(latestSnapshot));
}

export function subscribeToDataState(listener: DataStateListener): () => void {
  listeners.add(listener);
  listener(latestSnapshot);
  return () => listeners.delete(listener);
}

export function getLatestDataState(): DataStateSnapshot {
  return latestSnapshot;
}

subscribeToRuntimeSnapshots((snapshot) => {
  if (!snapshot.memory) return;

  publishDataState(snapshotFromMemory(snapshot.memory));
});

