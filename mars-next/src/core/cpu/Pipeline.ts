import { decodeInstruction } from "./Instructions";
import { Cpu, DecodedInstruction, InstructionDecoder, InstructionMemory } from "./Cpu";
import { MachineState, DEFAULT_TEXT_BASE } from "../state/MachineState";

export interface PipelineOptions {
  memory: InstructionMemory;
  state?: MachineState;
  decoder?: InstructionDecoder;
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
  private readonly breakpoints: Set<number> = new Set();
  private halted = false;

  constructor(options: PipelineOptions) {
    const decoder = options.decoder ?? ({
      decode: (instruction: number, pc: number): DecodedInstruction | null => decodeInstruction(instruction, pc),
    } as InstructionDecoder);

    this.cpu = new Cpu({ memory: options.memory, decoder, state: options.state });
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
    this.breakpoints.add(address | 0);
  }

  removeBreakpoint(address: number): void {
    this.breakpoints.delete(address | 0);
  }

  clearBreakpoints(): void {
    this.breakpoints.clear();
  }

  executeCycle(): void {
    this.step();
  }

  step(): void {
    if (this.halted) return;

    const pc = this.cpu.getState().getProgramCounter();
    if (this.breakpoints.has(pc)) {
      this.halted = true;
      return;
    }

    this.cpu.step();
  }

  run(maxCycles = Number.MAX_SAFE_INTEGER): void {
    let cycles = 0;
    while (!this.halted && cycles < maxCycles) {
      this.step();
      cycles += 1;
    }
  }
}
