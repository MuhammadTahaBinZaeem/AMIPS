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
  /** Override the kernel text segment base address. */
  ktextBase?: number;
  /** Override the kernel data segment base address. */
  kdataBase?: number;
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
  ktextBase: number;
  kdataBase: number;
  entryPoint: number;
  symbols: Record<string, number>;
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
    const ktextBase = (options.ktextBase ?? binary.ktextBase) + relocationOffset;
    const kdataBase = (options.kdataBase ?? binary.kdataBase) + relocationOffset;

    if (options.clearMemory ?? true) {
      this.memory.reset();
    }

    state.reset();

    binary.text.forEach((word, index) => {
      const address = textBase + index * 4;
      this.memory.writeWord(address, word);
    });

    this.memory.writeBytes(dataBase, binary.data);

    binary.ktext.forEach((word, index) => {
      const address = ktextBase + index * 4;
      this.memory.writeWord(address, word);
    });

    if (binary.kdata.length > 0) {
      this.memory.writeBytes(kdataBase, binary.kdata);
    }

    const stackPointer = options.stackPointer ?? (DEFAULT_STACK_POINTER + relocationOffset);
    state.setRegister(28, (DEFAULT_GLOBAL_POINTER + relocationOffset) | 0);
    state.setRegister(29, stackPointer | 0);
    state.setProgramCounter(textBase);

    return {
      textBase,
      dataBase,
      ktextBase,
      kdataBase,
      entryPoint: textBase,
      symbols: this.relocateSymbols(binary, { textBase, dataBase, ktextBase, kdataBase }),
    };
  }

  private relocateSymbols(
    binary: BinaryImage,
    layout: Pick<ProgramLayout, "textBase" | "dataBase" | "ktextBase" | "kdataBase">,
  ): Record<string, number> {
    const textEnd = binary.textBase + binary.text.length * 4;
    const ktextEnd = binary.ktextBase + binary.ktext.length * 4;
    const dataEnd = binary.dataBase + binary.data.length;
    const kdataEnd = binary.kdataBase + binary.kdata.length;

    const textDelta = layout.textBase - binary.textBase;
    const ktextDelta = layout.ktextBase - binary.ktextBase;
    const dataDelta = layout.dataBase - binary.dataBase;
    const kdataDelta = layout.kdataBase - binary.kdataBase;

    const relocated: Record<string, number> = {};

    for (const [name, value] of Object.entries(binary.symbols)) {
      let resolved = value | 0;

      if (resolved >= binary.textBase && resolved < textEnd) {
        resolved = (resolved + textDelta) | 0;
      } else if (resolved >= binary.ktextBase && resolved < ktextEnd) {
        resolved = (resolved + ktextDelta) | 0;
      } else if (resolved >= binary.dataBase && resolved < dataEnd) {
        resolved = (resolved + dataDelta) | 0;
      } else if (resolved >= binary.kdataBase && resolved < kdataEnd) {
        resolved = (resolved + kdataDelta) | 0;
      }

      relocated[name] = resolved;
    }

    return relocated;
  }
}
