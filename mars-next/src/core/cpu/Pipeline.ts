import { BreakpointEngine } from "../debugger/BreakpointEngine";
import { WatchEngine } from "../debugger/WatchEngine";
import { Cpu } from "./Cpu";

export type PipelineStatus = "running" | "breakpoint" | "completed";

export interface PipelineOptions {
  cpu: Cpu;
  breakpoints?: BreakpointEngine;
  watchEngine?: WatchEngine;
}

export class Pipeline {
  private readonly cpu: Cpu;
  private readonly breakpoints?: BreakpointEngine;
  private readonly watchEngine?: WatchEngine;

  private executedInstructions = 0;
  private halted = false;

  constructor(options: PipelineOptions) {
    this.cpu = options.cpu;
    this.breakpoints = options.breakpoints;
    this.watchEngine = options.watchEngine;
  }

  executeCycle(): PipelineStatus {
    const pc = this.cpu.getState().getProgramCounter();

    if (this.breakpoints?.checkForHit(pc, this.executedInstructions)) {
      this.halted = true;
      return "breakpoint";
    }

    this.watchEngine?.beginStep();
    this.cpu.step();
    this.watchEngine?.completeStep();

    this.executedInstructions++;
    return "running";
  }

  run(maxCycles = Number.POSITIVE_INFINITY): PipelineStatus {
    for (let i = 0; i < maxCycles; i++) {
      const status = this.executeCycle();
      if (status !== "running") return status;
    }

    return "completed";
  }

  resume(): void {
    this.halted = false;
    this.breakpoints?.clearHit();
  }

  isHalted(): boolean {
    return this.halted;
  }
}
