import type { PipelineRegisterPayload } from "./PipelineTypes";

export interface PerformanceCounters {
  cycleCount: number;
  instructionCount: number;
  stallCount: number;
}

export interface PipelineStatisticsSnapshot {
  cycleCount: number;
  instructionCount: number;
  stallCount: number;
  loadUseStalls: number;
  structuralStalls: number;
  bubbleCount: number;
  flushCount: number;
  cpi: number;
  bubbleRate: number;
}

export class PipelineStatistics {
  private cycleCount = 0;
  private instructionCount = 0;
  private stallCount = 0;
  private loadUseStalls = 0;
  private structuralStalls = 0;
  private bubbleCount = 0;
  private flushCount = 0;

  beginCycle(retiredInstruction: boolean): void {
    this.cycleCount += 1;
    if (retiredInstruction) {
      this.instructionCount += 1;
    }
  }

  recordStall({ loadUse, structural }: { loadUse: boolean; structural: boolean }): void {
    if (!loadUse && !structural) return;

    this.stallCount += 1;
    if (loadUse) this.loadUseStalls += 1;
    if (structural) this.structuralStalls += 1;
  }

  observePipeline(
    registers: Record<string, PipelineRegisterPayload>,
    options: { pipelineCleared?: boolean } = {},
  ): void {
    const bubblesThisCycle = Object.values(registers).filter((payload) => payload === null).length;
    this.bubbleCount += bubblesThisCycle;

    if (options.pipelineCleared) {
      this.flushCount += 1;
    }
  }

  reset(): void {
    this.cycleCount = 0;
    this.instructionCount = 0;
    this.stallCount = 0;
    this.loadUseStalls = 0;
    this.structuralStalls = 0;
    this.bubbleCount = 0;
    this.flushCount = 0;
  }

  getCycleCount(): number {
    return this.cycleCount;
  }

  getSnapshot(): PipelineStatisticsSnapshot {
    const slots = this.cycleCount * 4;
    const cpi = this.instructionCount === 0 ? 0 : this.cycleCount / this.instructionCount;
    const bubbleRate = slots === 0 ? 0 : this.bubbleCount / slots;

    return {
      cycleCount: this.cycleCount,
      instructionCount: this.instructionCount,
      stallCount: this.stallCount,
      loadUseStalls: this.loadUseStalls,
      structuralStalls: this.structuralStalls,
      bubbleCount: this.bubbleCount,
      flushCount: this.flushCount,
      cpi,
      bubbleRate,
    };
  }
}

export function createStatisticsSnapshotFromCounters(
  counters: PerformanceCounters,
  bubbleCount = 0,
): PipelineStatisticsSnapshot {
  const pipelineSlots = counters.cycleCount * 4;
  const cpi = counters.instructionCount === 0 ? 0 : counters.cycleCount / counters.instructionCount;
  const bubbleRate = pipelineSlots === 0 ? 0 : bubbleCount / pipelineSlots;

  return {
    cycleCount: counters.cycleCount,
    instructionCount: counters.instructionCount,
    stallCount: counters.stallCount,
    loadUseStalls: 0,
    structuralStalls: 0,
    bubbleCount,
    flushCount: 0,
    cpi,
    bubbleRate,
  };
}
