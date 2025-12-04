import type { PipelineRegisterPayload } from "../pipeline/PipelineTypes";
import type { PipelineStatisticsSnapshot } from "../pipeline/PipelineStatistics";

export interface PipelineStageState {
  pc: number | null;
  instruction: number | null;
  decodedName: string | null;
  bubble: boolean;
  stalled: boolean;
  flushed: boolean;
}

export interface PipelineSnapshot {
  cycle: number;
  registers: {
    ifId: PipelineStageState;
    idEx: PipelineStageState;
    exMem: PipelineStageState;
    memWb: PipelineStageState;
  };
  loadUseHazard: boolean;
  structuralHazard: boolean;
  branchRegistered: boolean;
  forwardingEnabled: boolean;
  hazardDetectionEnabled: boolean;
  statistics: PipelineStatisticsSnapshot;
}

type PipelineListener = (snapshot: PipelineSnapshot) => void;

const listeners = new Set<PipelineListener>();

let latestSnapshot: PipelineSnapshot = createEmptySnapshot();

function createStageState(payload: PipelineRegisterPayload): PipelineStageState {
  return {
    pc: payload?.pc ?? null,
    instruction: payload?.instruction ?? null,
    decodedName: payload?.decoded?.name ?? null,
    bubble: payload === null,
    stalled: false,
    flushed: false,
  };
}

function createEmptySnapshot(): PipelineSnapshot {
  return {
    cycle: 0,
    registers: {
      ifId: createStageState(null),
      idEx: createStageState(null),
      exMem: createStageState(null),
      memWb: createStageState(null),
    },
    loadUseHazard: false,
    structuralHazard: false,
    branchRegistered: false,
    forwardingEnabled: true,
    hazardDetectionEnabled: true,
    statistics: {
      cycleCount: 0,
      instructionCount: 0,
      stallCount: 0,
      loadUseStalls: 0,
      structuralStalls: 0,
      bubbleCount: 0,
      flushCount: 0,
      cpi: 0,
      bubbleRate: 0,
    },
  };
}

export function createEmptyPipelineSnapshot(
  overrides: Partial<
    Pick<PipelineSnapshot, "cycle" | "forwardingEnabled" | "hazardDetectionEnabled" | "statistics">
  > = {},
): PipelineSnapshot {
  const snapshot = createEmptySnapshot();
  return {
    ...snapshot,
    ...overrides,
  };
}

export function publishPipelineSnapshot(snapshot: PipelineSnapshot): void {
  latestSnapshot = snapshot;
  listeners.forEach((listener) => listener(snapshot));
}

export function subscribeToPipelineSnapshots(listener: PipelineListener): () => void {
  listeners.add(listener);
  listener(latestSnapshot);
  return () => listeners.delete(listener);
}

export function getLatestPipelineSnapshot(): PipelineSnapshot {
  return latestSnapshot;
}

export function hasPipelineListeners(): boolean {
  return listeners.size > 0;
}
