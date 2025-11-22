import { decodeInstruction } from "./Instructions";
import { Cpu, DecodedInstruction, InstructionDecoder, InstructionMemory } from "./Cpu";
import { MachineState, DEFAULT_TEXT_BASE } from "../state/MachineState";
import { BreakpointEngine } from "../debugger/BreakpointEngine";
import { WatchEngine } from "../debugger/WatchEngine";

export interface PipelineOptions {
  memory?: InstructionMemory;
  state?: MachineState;
  decoder?: InstructionDecoder;
  cpu?: Cpu;
  breakpoints?: BreakpointEngine;
  watchEngine?: WatchEngine;
}

export class ProgramMemory implements InstructionMemory {
  private readonly words: Map<number, number>;
  private readonly baseAddress: number;

  constructor(program: number[], baseAddress = DEFAULT_TEXT_BASE) {
    this.words = new Map();
    this.baseAddress = baseAddress | 0;

    program.forEach((word, index) => {
      const address = (this.baseAddress + index * 4) | 0;
      this.words.set(address, word | 0);
    });
  }

  loadWord(address: number): number {
    const alignedAddress = address | 0;
    if ((alignedAddress - this.baseAddress) % 4 !== 0) {
      throw new Error(`Unaligned instruction fetch at 0x${alignedAddress.toString(16)}`);
    }

    const word = this.words.get(alignedAddress);
    if (word === undefined) {
      throw new Error(`No instruction at 0x${alignedAddress.toString(16)}`);
    }
    return word;
  }
}

export class Pipeline {
  private readonly cpu: Cpu;
  private readonly breakpoints: BreakpointEngine | null;
  private readonly watchEngine: WatchEngine | null;
  private halted = false;

  constructor(options: PipelineOptions) {
    const decoder = options.decoder ?? ({
      decode: (instruction: number, pc: number): DecodedInstruction | null => decodeInstruction(instruction, pc),
    } as InstructionDecoder);

    if (!options.cpu && !options.memory) {
      throw new Error("Pipeline requires either a CPU instance or instruction memory");
    }

    this.cpu = options.cpu ?? new Cpu({ memory: options.memory!, decoder, state: options.state });
    this.breakpoints = options.breakpoints ?? null;
    this.watchEngine = options.watchEngine ?? null;
  }

  getState(): MachineState {
    return this.cpu.getState();
  }

  isHalted(): boolean {
    return this.halted;
  }

  halt(): void {
    this.halted = true;
  }

  resume(): void {
    this.halted = false;
  }

  addBreakpoint(address: number): void {
    this.breakpoints?.setBreakpoint(address);
  }

  removeBreakpoint(address: number): void {
    this.breakpoints?.removeBreakpoint(address);
  }

  clearBreakpoints(): void {
    this.breakpoints?.clearAll();
  }

  executeCycle(): "running" | "breakpoint" | "halted" | "terminated" {
    return this.step();
  }

  step(): "running" | "breakpoint" | "halted" | "terminated" {
    if (this.halted) return "halted";

    const state = this.cpu.getState();
    const pc = state.getProgramCounter();
    const instructionIndex = ((pc - DEFAULT_TEXT_BASE) / 4) | 0;

    if (this.breakpoints?.checkForHit(pc, instructionIndex)) {
      this.halted = true;
      return "breakpoint";
    }

    this.watchEngine?.beginStep();
    this.cpu.step();
    this.watchEngine?.completeStep();

    if (state.isTerminated()) {
      this.halted = true;
      return "terminated";
    }

    return "running";
  }

  run(maxCycles = Number.MAX_SAFE_INTEGER): void {
    let cycles = 0;
    while (!this.halted && cycles < maxCycles) {
      this.step();
      cycles += 1;
    }
  }
}
