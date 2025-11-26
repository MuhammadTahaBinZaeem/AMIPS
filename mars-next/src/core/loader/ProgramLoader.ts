import { BinaryImage, RelocationRecord } from "../assembler/Assembler";
import { Memory } from "../memory/Memory";
import {
  DEFAULT_GLOBAL_POINTER,
  DEFAULT_STACK_POINTER,
  MachineState,
} from "../state/MachineState";
import { SourceMapEntry } from "../assembler/Assembler";

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
  sourceMap: SourceMapEntry[];
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
    const littleEndian = binary.littleEndian ?? true;

    if (options.clearMemory ?? true) {
      this.memory.reset();
    }

    state.reset();

    const relocatedSymbols = this.relocateSymbols(binary, { textBase, dataBase, ktextBase, kdataBase });
    const relocations = binary.relocations ?? [];

    const textBuffer = this.wordsToBytes(binary.text, littleEndian);
    const dataBuffer = new Uint8Array(binary.data);
    const ktextBuffer = this.wordsToBytes(binary.ktext, littleEndian);
    const kdataBuffer = new Uint8Array(binary.kdata);

    this.applyRelocationsToBuffer(textBuffer, textBase, relocations, relocatedSymbols, littleEndian, "text");
    this.applyRelocationsToBuffer(dataBuffer, dataBase, relocations, relocatedSymbols, littleEndian, "data");
    this.applyRelocationsToBuffer(ktextBuffer, ktextBase, relocations, relocatedSymbols, littleEndian, "ktext");
    this.applyRelocationsToBuffer(kdataBuffer, kdataBase, relocations, relocatedSymbols, littleEndian, "kdata");

    const patchedText = this.bytesToWords(textBuffer, littleEndian);
    const patchedKtext = this.bytesToWords(ktextBuffer, littleEndian);

    patchedText.forEach((word, index) => {
      const address = textBase + index * 4;
      this.memory.writeWord(address, word);
    });

    this.memory.writeBytes(dataBase, Array.from(dataBuffer));

    patchedKtext.forEach((word, index) => {
      const address = ktextBase + index * 4;
      this.memory.writeWord(address, word);
    });

    if (kdataBuffer.length > 0) {
      this.memory.writeBytes(kdataBase, Array.from(kdataBuffer));
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
      symbols: relocatedSymbols,
      sourceMap: this.relocateSourceMap(binary, { textBase, dataBase, ktextBase, kdataBase }),
    };
  }

  private applyRelocationsToBuffer(
    buffer: Uint8Array,
    segmentBase: number,
    relocations: RelocationRecord[],
    symbols: Record<string, number>,
    littleEndian: boolean,
    segment: "text" | "data" | "ktext" | "kdata",
  ): void {
    const filtered = relocations.filter((reloc) => reloc.segment === segment);
    if (filtered.length === 0) return;

    const dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const pendingHi16: Array<{ offset: number; symbolValue: number; addend: number }> = [];

    for (const relocation of filtered) {
      const symbolValue = symbols[relocation.symbol] ?? 0;

      switch (relocation.type) {
        case "MIPS_32": {
          const addend = relocation.addend ?? dataView.getUint32(relocation.offset, littleEndian);
          const relocated = (addend + symbolValue) >>> 0;
          dataView.setUint32(relocation.offset, relocated, littleEndian);
          break;
        }
        case "MIPS_26": {
          const original = dataView.getUint32(relocation.offset, littleEndian);
          const addend = relocation.addend ?? ((original & 0x03ffffff) << 2);
          const target = (symbolValue + addend) >>> 0;
          const patched = (original & 0xfc000000) | ((target >>> 2) & 0x03ffffff);
          dataView.setUint32(relocation.offset, patched >>> 0, littleEndian);
          break;
        }
        case "MIPS_PC16": {
          const original = dataView.getUint32(relocation.offset, littleEndian);
          const addend = (relocation.addend ?? (this.signExtend16(original & 0xffff) << 2)) | 0;
          const place = (segmentBase + relocation.offset) >>> 0;
          const delta = (symbolValue + addend - (place + 4)) >> 2;
          const patched = (original & 0xffff0000) | (delta & 0xffff);
          dataView.setUint32(relocation.offset, patched >>> 0, littleEndian);
          break;
        }
        case "MIPS_HI16": {
          const word = dataView.getUint32(relocation.offset, littleEndian);
          const addend = relocation.addend ?? ((this.signExtend16(word & 0xffff) << 16) >>> 0);
          pendingHi16.push({ offset: relocation.offset, symbolValue, addend });
          break;
        }
        case "MIPS_LO16": {
          const word = dataView.getUint32(relocation.offset, littleEndian);
          const addend = relocation.addend ?? this.signExtend16(word & 0xffff);
          const pendingIndex = pendingHi16.findIndex((item) => item.symbolValue === symbolValue);
          const pending = pendingIndex >= 0 ? pendingHi16[pendingIndex] : null;
          const hiAddend = pending?.addend ?? 0;
          const combined = (symbolValue + hiAddend + addend) | 0;
          const hiValue = ((combined + 0x8000) >>> 16) & 0xffff;
          const loValue = combined & 0xffff;

          if (pending) {
            const hiWord = dataView.getUint32(pending.offset, littleEndian);
            const hiPatched = (hiWord & 0xffff0000) | hiValue;
            dataView.setUint32(pending.offset, hiPatched >>> 0, littleEndian);
            pendingHi16.splice(pendingIndex, 1);
          }

          const loPatched = (word & 0xffff0000) | (loValue & 0xffff);
          dataView.setUint32(relocation.offset, loPatched >>> 0, littleEndian);
          break;
        }
        default:
          break;
      }
    }
  }

  private wordsToBytes(words: number[], littleEndian: boolean): Uint8Array {
    const buffer = new Uint8Array(words.length * 4);
    const view = new DataView(buffer.buffer);
    words.forEach((word, index) => view.setUint32(index * 4, word >>> 0, littleEndian));
    return buffer;
  }

  private bytesToWords(bytes: Uint8Array, littleEndian: boolean): number[] {
    const words: number[] = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < bytes.length; i += 4) {
      words.push(view.getUint32(i, littleEndian) >> 0);
    }
    return words;
  }

  private signExtend16(value: number): number {
    return (value << 16) >> 16;
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

  private relocateSourceMap(
    binary: BinaryImage,
    layout: Pick<ProgramLayout, "textBase" | "ktextBase" | "dataBase" | "kdataBase">,
  ): SourceMapEntry[] {
    const map = binary.sourceMap ?? [];
    const textDelta = layout.textBase - binary.textBase;
    const ktextDelta = layout.ktextBase - binary.ktextBase;

    return map.map((entry) => {
      let address = entry.address;
      if (entry.segment === "text") {
        address = (address + textDelta) | 0;
      } else if (entry.segment === "ktext") {
        address = (address + ktextDelta) | 0;
      }

      return { ...entry, address };
    });
  }
}
