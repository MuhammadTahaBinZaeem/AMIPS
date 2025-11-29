import { MachineState } from "../../../core";

export interface CpuStateSnapshot {
  registers: number[];
  hi: number;
  lo: number;
  pc: number;
}

type CpuStateListener = (snapshot: CpuStateSnapshot) => void;

const listeners = new Set<CpuStateListener>();
let latestSnapshot: CpuStateSnapshot = createInitialSnapshot();

function createInitialSnapshot(): CpuStateSnapshot {
  const state = new MachineState();
  return normalizeSnapshot({
    registers: Array.from({ length: MachineState.REGISTER_COUNT }, (_, index) => state.getRegister(index)),
    hi: state.getHi(),
    lo: state.getLo(),
    pc: state.getProgramCounter(),
  });
}

function normalizeSnapshot(snapshot: CpuStateSnapshot): CpuStateSnapshot {
  const normalizedRegisters = Array.from({ length: MachineState.REGISTER_COUNT }, (_, index) => snapshot.registers[index] ?? 0);
  return {
    registers: normalizedRegisters,
    hi: snapshot.hi | 0,
    lo: snapshot.lo | 0,
    pc: snapshot.pc >>> 0,
  };
}

export function publishCpuState(snapshot: CpuStateSnapshot): void {
  latestSnapshot = normalizeSnapshot(snapshot);
  listeners.forEach((listener) => listener(latestSnapshot));
}

export function subscribeToCpuState(listener: CpuStateListener): () => void {
  listeners.add(listener);
  listener(latestSnapshot);
  return () => listeners.delete(listener);
}

export function getLatestCpuState(): CpuStateSnapshot {
  return latestSnapshot;
}

