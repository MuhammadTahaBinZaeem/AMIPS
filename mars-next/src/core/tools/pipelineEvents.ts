import { MachineState } from "../state/MachineState";
import type { PipelineRegisterPayload } from "../pipeline/PipelineTypes";
import type { PipelineStatisticsSnapshot } from "../pipeline/PipelineStatistics";

export type HazardType = "data" | "structural" | "control";
export type HazardResolution = "stall" | "forward" | "flush" | "none";

export interface PipelineHazard {
  type: HazardType;
  description: string;
  resolution: HazardResolution;
  stages: Array<keyof PipelineSnapshot["registers"]>;
  registers?: { source?: number; destination?: number | null };
}

export interface PipelineRegisterView {
  stage: keyof PipelineSnapshot["registers"];
  controlSignals: Record<string, string | number | boolean>;
  dataValues: {
    pc: number | null;
    instruction: number | null;
    decodedName: string | null;
    operands: Array<{ register: number; value: number | null }>;
    destination: number | null;
    aluResult: number | null;
    memoryAddress: number | null;
  };
}

export interface RegisterFileSnapshot {
  general: number[];
  hi: number;
  lo: number;
}

export interface PipelineStageState {
  pc: number | null;
  instruction: number | null;
  decodedName: string | null;
  bubble: boolean;
  stalled: boolean;
  flushed: boolean;
  note: string | null;
  resolution: HazardResolution;
  hazards: HazardType[];
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
  hazards: PipelineHazard[];
  pipelineRegisters: Record<keyof PipelineSnapshot["registers"], PipelineRegisterView>;
  registerFile: RegisterFileSnapshot;
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
    note: null,
    resolution: "none",
    hazards: [],
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
    hazards: [],
    pipelineRegisters: {
      ifId: createRegisterView("ifId", null),
      idEx: createRegisterView("idEx", null),
      exMem: createRegisterView("exMem", null),
      memWb: createRegisterView("memWb", null),
    },
    registerFile: createRegisterFileSnapshot(),
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

function createRegisterView(stage: keyof PipelineSnapshot["registers"], payload: PipelineRegisterPayload): PipelineRegisterView {
  return {
    stage,
    controlSignals: {
      bubble: payload === null,
      stalled: false,
      flushed: false,
    },
    dataValues: {
      pc: payload?.pc ?? null,
      instruction: payload?.instruction ?? null,
      decodedName: payload?.decoded?.name ?? null,
      operands: [],
      destination: null,
      aluResult: null,
      memoryAddress: null,
    },
  };
}

function createRegisterFileSnapshot(): RegisterFileSnapshot {
  return {
    general: Array.from({ length: MachineState.REGISTER_COUNT }, () => 0),
    hi: 0,
    lo: 0,
  };
}

export function createEmptyPipelineSnapshot(
  overrides: Partial<
    Pick<
      PipelineSnapshot,
      "cycle" | "forwardingEnabled" | "hazardDetectionEnabled" | "statistics" | "registerFile" | "pipelineRegisters" | "hazards"
    >
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
