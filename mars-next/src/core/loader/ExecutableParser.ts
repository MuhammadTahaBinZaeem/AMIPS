import { BinaryImage } from "../assembler/Assembler";
import { DEFAULT_TEXT_BASE } from "../state/MachineState";

const DEFAULT_DATA_BASE = 0x10010000;
const DEFAULT_KTEXT_BASE = 0x80000000;
const DEFAULT_KDATA_BASE = 0x90000000;

const enum ElfSectionType {
  NULL = 0,
  PROGBITS = 1,
  SYMTAB = 2,
  STRTAB = 3,
  RELA = 4,
  NOBITS = 8,
  REL = 9,
}

const enum ElfRelocationType {
  MIPS_NONE = 0,
  MIPS_16 = 1,
  MIPS_32 = 2,
  MIPS_REL32 = 3,
  MIPS_26 = 4,
  MIPS_HI16 = 5,
  MIPS_LO16 = 6,
  MIPS_GPREL16 = 7,
  MIPS_LITERAL = 8,
  MIPS_GOT16 = 9,
  MIPS_PC16 = 10,
  MIPS_CALL16 = 11,
  MIPS_GPREL32 = 12,
}

const enum CoffRelocationType {
  MIPS16 = 1,
  MIPS32 = 2,
  MIPS_REL32 = 3,
  MIPS26 = 4,
  MIPS_HI16 = 5,
  MIPS_LO16 = 6,
}

interface SectionInfo {
  name: string;
  nameOffset?: number;
  offset: number;
  size: number;
  address: number;
  type?: ElfSectionType;
  link?: number;
  info?: number;
  entrySize?: number;
  rawData?: Uint8Array;
  relocations?: RelocationEntry[];
}

interface RelocationEntry {
  offset: number;
  type: number;
  symbolIndex: number;
  addend?: number;
}

interface SymbolInfo {
  name: string;
  value: number;
  sectionIndex: number;
}

interface Hi16Relocation {
  offset: number;
  symbolValue: number;
  addend: number;
}

/**
 * Minimal ELF/COFF executable parser capable of locating the text/data
 * sections, symbol table entries and applying basic MIPS relocations.
 */
export class ExecutableParser {
  parseExecutable(binary: Uint8Array): BinaryImage {
    if (this.isElf(binary)) {
      return this.parseElf(binary);
    }

    if (this.isCoff(binary)) {
      return this.parseCoff(binary);
    }

    throw new Error("Unsupported executable format: expected ELF or COFF");
  }

  private isElf(binary: Uint8Array): boolean {
    return binary.length >= 4 && binary[0] === 0x7f && binary[1] === 0x45 && binary[2] === 0x4c && binary[3] === 0x46;
  }

  private isCoff(binary: Uint8Array): boolean {
    if (binary.length < 20) return false;
    const machine = this.readUint16(binary, 0);
    const sectionCount = this.readUint16(binary, 2);
    const symbolPointer = this.readUint32(binary, 8);
    return machine !== 0 && sectionCount > 0 && symbolPointer > 0;
  }

  private parseElf(binary: Uint8Array): BinaryImage {
    const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    const littleEndian = view.getUint8(5) === 1;
    const sectionCount = view.getUint16(0x30, littleEndian);
    const sectionHeaderOffset = view.getUint32(0x20, littleEndian);
    const sectionEntrySize = view.getUint16(0x2e, littleEndian);
    const shstrIndex = view.getUint16(0x32, littleEndian);

    const sections: SectionInfo[] = [];

    for (let i = 0; i < sectionCount; i++) {
      const offset = sectionHeaderOffset + i * sectionEntrySize;
      const nameOffset = view.getUint32(offset, littleEndian);
      const type = view.getUint32(offset + 4, littleEndian) as ElfSectionType;
      const addr = view.getUint32(offset + 0x0c, littleEndian);
      const sectOffset = view.getUint32(offset + 0x10, littleEndian);
      const size = view.getUint32(offset + 0x14, littleEndian);
      const link = view.getUint32(offset + 0x18, littleEndian);
      const info = view.getUint32(offset + 0x1c, littleEndian);
      const entsize = view.getUint32(offset + 0x24, littleEndian);

      sections.push({
        name: "", // resolved later
        nameOffset,
        offset: sectOffset,
        size,
        address: addr >>> 0,
        type,
        link,
        info,
        entrySize: entsize,
      });
    }

    const shstrSection = sections[shstrIndex];
    if (!shstrSection) {
      throw new Error("ELF missing section string table");
    }
    const shstr = binary.subarray(shstrSection.offset, shstrSection.offset + shstrSection.size);
    sections.forEach((section) => {
      if (section.nameOffset !== undefined) {
        section.name = this.readNullTerminated(shstr, section.nameOffset);
      }
      section.rawData =
        section.type === ElfSectionType.NOBITS
          ? new Uint8Array(section.size)
          : binary.subarray(section.offset, section.offset + section.size);
    });

    const symbolSection = sections.find((section) => section.type === ElfSectionType.SYMTAB);
    const strtabSection = symbolSection ? sections[symbolSection.link ?? 0] : undefined;
    const symbols = symbolSection && strtabSection ? this.readElfSymbols(symbolSection, strtabSection, binary, littleEndian) : [];

    sections.forEach((section) => {
      if (section.type === ElfSectionType.REL || section.type === ElfSectionType.RELA) {
        const target = sections[section.info ?? 0];
        if (!target) return;
        target.relocations = this.readElfRelocations(section, binary, littleEndian);
      }
    });

    const textSection = sections.find((section) => section.name === ".text") ?? null;
    const dataSection = sections.find((section) => section.name === ".data") ?? null;

    const symbolMap = this.buildSymbolMap(symbols, sections);

    if (textSection?.relocations?.length) {
      this.applyRelocations(textSection, symbols, sections, littleEndian);
    }
    if (dataSection?.relocations?.length) {
      this.applyRelocations(dataSection, symbols, sections, littleEndian);
    }

    return this.toBinaryImage(textSection, dataSection, symbolMap, littleEndian);
  }

  private parseCoff(binary: Uint8Array): BinaryImage {
    const sectionCount = this.readUint16(binary, 2);
    const symbolTableOffset = this.readUint32(binary, 8);
    const symbolCount = this.readUint32(binary, 12);
    const optionalHeaderSize = this.readUint16(binary, 16);
    const sectionHeadersOffset = 20 + optionalHeaderSize;

    const sections: SectionInfo[] = [];
    for (let i = 0; i < sectionCount; i++) {
      const offset = sectionHeadersOffset + i * 40;
      const nameBytes = binary.subarray(offset, offset + 8);
      const name = this.readCoffName(nameBytes, binary, symbolTableOffset + symbolCount * 18);
      const virtualSize = this.readUint32(binary, offset + 8);
      const virtualAddress = this.readUint32(binary, offset + 12);
      const sizeOfRawData = this.readUint32(binary, offset + 16);
      const pointerToRawData = this.readUint32(binary, offset + 20);
      const pointerToRelocations = this.readUint32(binary, offset + 24);
      const numberOfRelocations = this.readUint16(binary, offset + 32);

      sections.push({
        name,
        offset: pointerToRawData,
        size: sizeOfRawData || virtualSize,
        address: virtualAddress >>> 0,
        entrySize: 10,
        rawData: binary.subarray(pointerToRawData, pointerToRawData + sizeOfRawData),
        relocations:
          numberOfRelocations > 0
            ? this.readCoffRelocations(pointerToRelocations, numberOfRelocations, binary)
            : undefined,
      });
    }

    const symbols = this.readCoffSymbols(symbolTableOffset, symbolCount, binary);
    const symbolMap = this.buildSymbolMap(symbols, sections);

    const textSection = sections.find((section) => section.name === ".text") ?? null;
    const dataSection = sections.find((section) => section.name === ".data") ?? null;

    if (textSection?.relocations?.length) {
      this.applyRelocations(textSection, symbols, sections, true);
    }
    if (dataSection?.relocations?.length) {
      this.applyRelocations(dataSection, symbols, sections, true);
    }

    return this.toBinaryImage(textSection, dataSection, symbolMap, true);
  }

  private readElfSymbols(
    symbolSection: SectionInfo,
    strtab: SectionInfo,
    binary: Uint8Array,
    littleEndian: boolean,
  ): SymbolInfo[] {
    const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    const entrySize = symbolSection.entrySize || 16;
    const entries = symbolSection.size / entrySize;
    const symbols: SymbolInfo[] = [];
    const strtabData = binary.subarray(strtab.offset, strtab.offset + strtab.size);

    for (let i = 0; i < entries; i++) {
      const offset = symbolSection.offset + i * entrySize;
      const nameOffset = view.getUint32(offset, littleEndian);
      const value = view.getUint32(offset + 4, littleEndian);
      const shndx = view.getUint16(offset + 14, littleEndian);
      const name = this.readNullTerminated(strtabData, nameOffset);
      symbols.push({ name, value: value >>> 0, sectionIndex: shndx === 0 ? -1 : shndx });
    }

    return symbols;
  }

  private readElfRelocations(section: SectionInfo, binary: Uint8Array, littleEndian: boolean): RelocationEntry[] {
    const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
    const entrySize = section.entrySize || (section.type === ElfSectionType.RELA ? 12 : 8);
    const entries: RelocationEntry[] = [];
    const count = section.size / entrySize;

    for (let i = 0; i < count; i++) {
      const base = section.offset + i * entrySize;
      const offset = view.getUint32(base, littleEndian);
      const info = view.getUint32(base + 4, littleEndian);
      const type = info & 0xff;
      const symbolIndex = info >>> 8;
      let addend: number | undefined;

      if (section.type === ElfSectionType.RELA) {
        addend = view.getInt32(base + 8, littleEndian);
      }

      entries.push({ offset, type, symbolIndex, addend });
    }

    return entries;
  }

  private readCoffName(nameBytes: Uint8Array, binary: Uint8Array, stringTableOffset: number): string {
    if (nameBytes[0] === 0 && nameBytes[1] === 0 && nameBytes[2] === 0 && nameBytes[3] === 0) {
      const offset = this.readUint32(nameBytes, 4);
      const length = this.readUint32(binary, stringTableOffset);
      if (offset >= 4 && offset < length) {
        return this.readNullTerminated(binary.subarray(stringTableOffset), offset - 4);
      }
      return "";
    }

    let end = 0;
    while (end < nameBytes.length && nameBytes[end] !== 0) end++;
    return new TextDecoder().decode(nameBytes.slice(0, end));
  }

  private readCoffSymbols(symbolOffset: number, count: number, binary: Uint8Array): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const stringTableOffset = symbolOffset + count * 18;

    for (let i = 0; i < count; i++) {
      const base = symbolOffset + i * 18;
      const name = this.readCoffName(binary.subarray(base, base + 8), binary, stringTableOffset);
      const value = this.readUint32(binary, base + 8);
      const sectionNumber = this.readInt16(binary, base + 12);
      const auxCount = binary[base + 17];

      const sectionIndex =
        sectionNumber > 0 ? sectionNumber - 1 : sectionNumber === 0 ? -1 : sectionNumber;

      symbols.push({ name, value: value >>> 0, sectionIndex });
      i += auxCount;
    }

    return symbols;
  }

  private readCoffRelocations(offset: number, count: number, binary: Uint8Array): RelocationEntry[] {
    const relocations: RelocationEntry[] = [];
    for (let i = 0; i < count; i++) {
      const base = offset + i * 10;
      const relocOffset = this.readUint32(binary, base);
      const symbolIndex = this.readUint32(binary, base + 4);
      const type = this.readUint16(binary, base + 8);
      relocations.push({ offset: relocOffset, symbolIndex, type });
    }
    return relocations;
  }

  private applyRelocations(
    section: SectionInfo,
    symbols: SymbolInfo[],
    sections: SectionInfo[],
    littleEndian: boolean,
  ): void {
    if (!section.rawData || !section.relocations) return;

    const dataView = new DataView(section.rawData.buffer, section.rawData.byteOffset, section.rawData.byteLength);
    const pendingHi16: Hi16Relocation[] = [];
    const sectionBase = section.address >>> 0;

    for (const relocation of section.relocations) {
      const symbol = symbols[relocation.symbolIndex];
      const symbolValue = this.resolveSymbolAddress(symbol, sections);

      switch (relocation.type) {
        case ElfRelocationType.MIPS_32:
        case CoffRelocationType.MIPS32: {
          const addend = relocation.addend ?? dataView.getUint32(relocation.offset, littleEndian);
          const relocated = (addend + symbolValue) >>> 0;
          dataView.setUint32(relocation.offset, relocated, littleEndian);
          break;
        }
        case ElfRelocationType.MIPS_26:
        case CoffRelocationType.MIPS26: {
          const original = dataView.getUint32(relocation.offset, littleEndian);
          const addend = (original & 0x03ffffff) << 2;
          const target = (symbolValue + addend) >>> 0;
          const patched = (original & 0xfc000000) | ((target >>> 2) & 0x03ffffff);
          dataView.setUint32(relocation.offset, patched >>> 0, littleEndian);
          break;
        }
        case ElfRelocationType.MIPS_PC16: {
          const original = dataView.getUint32(relocation.offset, littleEndian);
          const addend = this.signExtend16(original & 0xffff) << 2;
          const place = (sectionBase + relocation.offset) >>> 0;
          const delta = (symbolValue + addend - (place + 4)) >> 2;
          const patched = (original & 0xffff0000) | (delta & 0xffff);
          dataView.setUint32(relocation.offset, patched >>> 0, littleEndian);
          break;
        }
        case ElfRelocationType.MIPS_HI16:
        case CoffRelocationType.MIPS_HI16: {
          const word = dataView.getUint32(relocation.offset, littleEndian);
          const addend = (this.signExtend16(word & 0xffff) << 16) >>> 0;
          pendingHi16.push({ offset: relocation.offset, symbolValue, addend });
          break;
        }
        case ElfRelocationType.MIPS_LO16:
        case CoffRelocationType.MIPS_LO16: {
          const word = dataView.getUint32(relocation.offset, littleEndian);
          const addend = this.signExtend16(word & 0xffff);
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
          // Unsupported relocation types are ignored for now.
          break;
      }
    }
  }

  private resolveSymbolAddress(symbol: SymbolInfo | undefined, sections: SectionInfo[]): number {
    if (!symbol) return 0;

    if (symbol.sectionIndex >= 0) {
      const section = sections[symbol.sectionIndex];
      if (section) {
        return (section.address + symbol.value) >>> 0;
      }
    }

    return symbol.value >>> 0;
  }

  private toBinaryImage(
    text: SectionInfo | null,
    data: SectionInfo | null,
    symbols: Record<string, number>,
    littleEndian: boolean,
  ): BinaryImage {
    const textBytes = text?.rawData ?? new Uint8Array();
    const dataBytes = data?.rawData ?? new Uint8Array();

    return {
      textBase: text?.address ?? DEFAULT_TEXT_BASE,
      dataBase: data?.address ?? DEFAULT_DATA_BASE,
      ktextBase: DEFAULT_KTEXT_BASE,
      kdataBase: DEFAULT_KDATA_BASE,
      text: this.bytesToWords(textBytes, littleEndian),
      data: Array.from(dataBytes),
      dataWords: this.bytesToWords(dataBytes, littleEndian),
      ktext: [],
      kdata: [],
      kdataWords: [],
      symbols,
    };
  }

  private buildSymbolMap(symbols: SymbolInfo[], sections: SectionInfo[]): Record<string, number> {
    const result: Record<string, number> = {};
    symbols.forEach((symbol) => {
      if (!symbol.name) return;
      let address = symbol.value >>> 0;
      if (symbol.sectionIndex >= 0) {
        const section = sections[symbol.sectionIndex];
        if (section) {
          address = (section.address + symbol.value) >>> 0;
        }
      }
      result[symbol.name] = address;
    });
    return result;
  }

  private bytesToWords(bytes: Uint8Array, littleEndian: boolean): number[] {
    const words: number[] = [];
    for (let i = 0; i < bytes.length; i += 4) {
      const chunk = new Uint8Array(4);
      chunk.set(bytes.subarray(i, i + 4));
      const view = new DataView(chunk.buffer);
      const value = view.getUint32(0, littleEndian);
      words.push(value >> 0);
    }
    return words;
  }

  private readNullTerminated(buffer: Uint8Array, offset: number): string {
    let end = offset;
    while (end < buffer.length && buffer[end] !== 0) end++;
    return new TextDecoder().decode(buffer.slice(offset, end));
  }

  private readUint16(buffer: Uint8Array, offset: number): number {
    return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint16(offset, true);
  }

  private readInt16(buffer: Uint8Array, offset: number): number {
    return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getInt16(offset, true);
  }

  private readUint32(buffer: Uint8Array | Uint8ClampedArray, offset: number, littleEndian = true): number {
    return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(offset, littleEndian) >>> 0;
  }

  private signExtend16(value: number): number {
    return (value << 16) >> 16;
  }
}
