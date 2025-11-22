import { BinaryImage } from "../assembler/Assembler";
import { Memory } from "../memory/Memory";
import {
  DEFAULT_GLOBAL_POINTER,
  DEFAULT_STACK_POINTER,
  MachineState,
} from "../state/MachineState";

export interface ProgramLoadOptions {
  /** Override the text segment base address. */
  textBase?: number;
  /** Override the data segment base address. */
  dataBase?: number;
  /** Optional relocation offset applied to both segments. */
  relocationOffset?: number;
  /** Override the initial stack pointer value. */
  stackPointer?: number;
  /** Whether to clear memory before loading. Defaults to true. */
  clearMemory?: boolean;
}

export interface ProgramLayout {
  textBase: number;
  dataBase: number;
  entryPoint: number;
}

export class ProgramLoader {
  constructor(private readonly memory: Memory) {}

  normalizeSource(source: string): string {
    return source;
  }

  loadProgram(state: MachineState, binary: BinaryImage, options: ProgramLoadOptions = {}): ProgramLayout {
    const relocationOffset = options.relocationOffset ?? 0;
    const textBase = (options.textBase ?? binary.textBase) + relocationOffset;
    const dataBase = (options.dataBase ?? binary.dataBase) + relocationOffset;

    if (options.clearMemory ?? true) {
      this.memory.reset();
    }

    state.reset();

    binary.text.forEach((word, index) => {
      const address = textBase + index * 4;
      this.memory.writeWord(address, word);
    });

    this.memory.writeBytes(dataBase, binary.data);

    const stackPointer = options.stackPointer ?? (DEFAULT_STACK_POINTER + relocationOffset);
    state.setRegister(28, (DEFAULT_GLOBAL_POINTER + relocationOffset) | 0);
    state.setRegister(29, stackPointer | 0);
    state.setProgramCounter(textBase);

    return { textBase, dataBase, entryPoint: textBase };
  }
}
