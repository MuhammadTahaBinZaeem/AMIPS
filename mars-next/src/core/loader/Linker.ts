import { BinaryImage, RelocationRecord, SymbolTableEntry, SourceMapEntry } from "../assembler/Assembler";

interface SegmentPlacement {
  textStart: number;
  dataStart: number;
  ktextStart: number;
  kdataStart: number;
  textOffset: number;
  dataOffset: number;
  ktextOffset: number;
  kdataOffset: number;
}

/**
 * Minimal linker that merges multiple BinaryImage objects into a single image.
 *
 * Each input is assumed to contain absolute addresses for its symbols that are
 * relative to its own segment bases. The linker assigns consecutive segment
 * bases (aligned to 4-byte boundaries), rewrites symbol/relocation addresses
 * and concatenates the raw segments.
 */
export class Linker {
  link(images: BinaryImage[]): BinaryImage {
    if (images.length === 0) {
      throw new Error("No input files provided for linking");
    }

    const baseTemplate = images[0];

    const textBase = this.align(baseTemplate.textBase, 4);
    const dataBase = this.align(baseTemplate.dataBase, 4);
    const ktextBase = this.align(baseTemplate.ktextBase, 4);
    const kdataBase = this.align(baseTemplate.kdataBase, 4);

    const mergedText: number[] = [];
    const mergedData: number[] = [];
    const mergedKtext: number[] = [];
    const mergedKdata: number[] = [];
    const mergedRelocations: RelocationRecord[] = [];
    const mergedSymbols = new Map<string, number>();
    const mergedSymbolTable: SymbolTableEntry[] = [];
    const mergedSourceMap: SourceMapEntry[] = [];
    const unresolvedSymbols = new Set<string>();

    let textOffset = 0;
    let dataOffset = 0;
    let ktextOffset = 0;
    let kdataOffset = 0;

    const endianPreference = images.find((image) => image.littleEndian !== undefined)?.littleEndian ?? true;

    for (const image of images) {
      if (image.littleEndian !== undefined && image.littleEndian !== endianPreference) {
        throw new Error("Input files use mixed endianness, cannot link");
      }

      const placement = this.placeSegments({ textOffset, dataOffset, ktextOffset, kdataOffset });

      this.padWords(mergedText, (placement.textOffset - textOffset) / 4);
      this.padBytes(mergedData, placement.dataOffset - dataOffset);
      this.padWords(mergedKtext, (placement.ktextOffset - ktextOffset) / 4);
      this.padBytes(mergedKdata, placement.kdataOffset - kdataOffset);

      const textIndexOffset = mergedText.length;
      const ktextIndexOffset = mergedKtext.length;

      mergedText.push(...image.text);
      mergedData.push(...image.data);
      mergedKtext.push(...image.ktext);
      mergedKdata.push(...image.kdata);

      const textStartAddress = textBase + placement.textStart;
      const dataStartAddress = dataBase + placement.dataStart;
      const ktextStartAddress = ktextBase + placement.ktextStart;
      const kdataStartAddress = kdataBase + placement.kdataStart;

      const textDelta = textStartAddress - image.textBase;
      const dataDelta = dataStartAddress - image.dataBase;
      const ktextDelta = ktextStartAddress - image.ktextBase;
      const kdataDelta = kdataStartAddress - image.kdataBase;

      this.mergeSymbols(image, mergedSymbols, mergedSymbolTable, {
        textDelta,
        dataDelta,
        ktextDelta,
        kdataDelta,
      });

      (image.externSymbols ?? []).forEach((symbol) => unresolvedSymbols.add(symbol));
      (image.undefinedSymbols ?? []).forEach((symbol) => unresolvedSymbols.add(symbol));

      this.mergeRelocations(image, mergedRelocations, placement);
      this.mergeSourceMap(image, mergedSourceMap, {
        textDelta,
        ktextDelta,
        textIndexOffset,
        ktextIndexOffset,
      });

      textOffset = placement.textOffset + image.text.length * 4;
      dataOffset = placement.dataOffset + image.data.length;
      ktextOffset = placement.ktextOffset + image.ktext.length * 4;
      kdataOffset = placement.kdataOffset + image.kdata.length;
    }

    const littleEndian = endianPreference;
    const dataBytes = new Uint8Array(mergedData);
    const kdataBytes = new Uint8Array(mergedKdata);

    for (const symbol of unresolvedSymbols) {
      if (!mergedSymbols.has(symbol)) {
        throw new Error(`Undefined external symbol '${symbol}' encountered during linking`);
      }
    }

    return {
      textBase,
      dataBase,
      ktextBase,
      kdataBase,
      text: mergedText,
      data: mergedData,
      dataWords: this.bytesToWords(dataBytes, littleEndian),
      ktext: mergedKtext,
      kdata: mergedKdata,
      kdataWords: this.bytesToWords(kdataBytes, littleEndian),
      symbols: Object.fromEntries(mergedSymbols),
      relocations: mergedRelocations,
      symbolTable: mergedSymbolTable,
      littleEndian,
      sourceMap: mergedSourceMap,
    };
  }

  private placeSegments(offsets: {
    textOffset: number;
    dataOffset: number;
    ktextOffset: number;
    kdataOffset: number;
  }): SegmentPlacement {
    const textOffset = this.align(offsets.textOffset, 4);
    const dataOffset = this.align(offsets.dataOffset, 4);
    const ktextOffset = this.align(offsets.ktextOffset, 4);
    const kdataOffset = this.align(offsets.kdataOffset, 4);

    return {
      textStart: textOffset,
      dataStart: dataOffset,
      ktextStart: ktextOffset,
      kdataStart: kdataOffset,
      textOffset,
      dataOffset,
      ktextOffset,
      kdataOffset,
    };
  }

  private mergeSymbols(
    image: BinaryImage,
    symbols: Map<string, number>,
    symbolTable: SymbolTableEntry[],
    deltas: { textDelta: number; dataDelta: number; ktextDelta: number; kdataDelta: number },
  ): void {
    const textEnd = image.textBase + image.text.length * 4;
    const dataEnd = image.dataBase + image.data.length;
    const ktextEnd = image.ktextBase + image.ktext.length * 4;
    const kdataEnd = image.kdataBase + image.kdata.length;

    const adjust = (address: number): number => {
      if (image.text.length > 0 && address >= image.textBase && address < textEnd) return address + deltas.textDelta;
      if (image.data.length > 0 && address >= image.dataBase && address < dataEnd) return address + deltas.dataDelta;
      if (image.ktext.length > 0 && address >= image.ktextBase && address < ktextEnd) return address + deltas.ktextDelta;
      if (image.kdata.length > 0 && address >= image.kdataBase && address < kdataEnd) return address + deltas.kdataDelta;
      return address;
    };

    for (const [name, address] of Object.entries(image.symbols)) {
      if (symbols.has(name)) {
        throw new Error(`Duplicate symbol '${name}' encountered during linking`);
      }
      symbols.set(name, adjust(address));
    }

    for (const entry of image.symbolTable) {
      symbolTable.push({ ...entry, address: adjust(entry.address) });
    }
  }

  private mergeRelocations(image: BinaryImage, relocations: RelocationRecord[], placement: SegmentPlacement): void {
    const baseOffset = (segment: RelocationRecord["segment"]): number => {
      switch (segment) {
        case "text":
          return placement.textStart;
        case "data":
          return placement.dataStart;
        case "ktext":
          return placement.ktextStart;
        case "kdata":
          return placement.kdataStart;
        default:
          return 0;
      }
    };

    for (const record of image.relocations ?? []) {
      relocations.push({ ...record, offset: record.offset + baseOffset(record.segment) });
    }
  }

  private mergeSourceMap(
    image: BinaryImage,
    sourceMap: SourceMapEntry[],
    deltas: { textDelta: number; ktextDelta: number; textIndexOffset: number; ktextIndexOffset: number },
  ): void {
    for (const entry of image.sourceMap ?? []) {
      if (entry.segment === "text") {
        sourceMap.push({
          ...entry,
          address: entry.address + deltas.textDelta,
          segmentIndex: entry.segmentIndex + deltas.textIndexOffset,
        });
      } else if (entry.segment === "ktext") {
        sourceMap.push({
          ...entry,
          address: entry.address + deltas.ktextDelta,
          segmentIndex: entry.segmentIndex + deltas.ktextIndexOffset,
        });
      } else {
        sourceMap.push(entry);
      }
    }
  }

  private align(value: number, alignment: number): number {
    const mask = alignment - 1;
    return (value + mask) & ~mask;
  }

  private padWords(target: number[], count: number): void {
    for (let i = 0; i < count; i++) target.push(0);
  }

  private padBytes(target: number[], count: number): void {
    for (let i = 0; i < count; i++) target.push(0);
  }

  private bytesToWords(bytes: Uint8Array, littleEndian: boolean): number[] {
    const words: number[] = [];
    for (let i = 0; i < bytes.length; i += 4) {
      const chunk = new Uint8Array(4);
      chunk.set(bytes.subarray(i, i + 4));
      const view = new DataView(chunk.buffer);
      words.push(view.getUint32(0, littleEndian) >> 0);
    }
    return words;
  }
}
