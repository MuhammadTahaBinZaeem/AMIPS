// Ported from legacy/java/mars/simulator/Simulator.java execution loop.
// This CPU fetches an instruction, pre-increments the PC, executes the
// decoded handler, then applies delayed branch semantics.

import { MachineState } from "../state/MachineState";
import { InvalidInstruction, normalizeCpuException } from "../exceptions/ExecutionExceptions";

export interface InstructionMemory {
  loadWord(address: number): number;
  readWord(address: number): number;
  readByte(address: number): number;
  writeWord(address: number, value: number): void;
  writeByte(address: number, value: number): void;
  hasInstruction?(address: number): boolean;
  setKernelMode?(enabled: boolean): void;
}

export interface DecodedInstruction {
  name: string;
  execute: (state: MachineState, memory: InstructionMemory, cpu: Cpu) => void;
}

export interface InstructionDecoder {
  decode: (instruction: number, pc: number) => DecodedInstruction | null;
}

export interface CpuOptions {
  memory: InstructionMemory;
  decoder: InstructionDecoder;
  state?: MachineState;
}

export class Cpu {
  private readonly memory: InstructionMemory;
  private readonly decoder: InstructionDecoder;
  private readonly state: MachineState;

  constructor(options: CpuOptions) {
    this.memory = options.memory;
    this.decoder = options.decoder;
    this.state = options.state ?? new MachineState();
  }

  getState(): MachineState {
    return this.state;
  }

  getMemory(): InstructionMemory {
    return this.memory;
  }

  getDecoder(): InstructionDecoder {
    return this.decoder;
  }

  step(): void {
    this.memory.setKernelMode?.(this.state.isKernelMode());
    const pc = this.state.getProgramCounter();

    try {
      const rawInstruction = this.memory.loadWord(pc);
      const decoded = this.decoder.decode(rawInstruction, pc);

      if (!decoded) {
        throw new InvalidInstruction(rawInstruction);
      }

      // The legacy simulator increments the PC before running the instruction.
      this.state.incrementProgramCounter();
      decoded.execute(this.state, this.memory, this);
      this.state.finalizeDelayedBranch();
    } catch (error) {
      throw normalizeCpuException(error, pc);
    }
  }
}
