import { BinaryImage } from "../assembler/Assembler";
import { InstructionMemory } from "../cpu/Cpu";
import { MemoryMap, MemoryMappingResult } from "./MemoryMap";

const WORD_SIZE = 4;

export interface MemoryOptions {
  littleEndian?: boolean;
  map?: MemoryMap;
}

export class Memory implements InstructionMemory {
  private readonly map: MemoryMap;
  private readonly littleEndian: boolean;

  private readonly text: Uint8Array;
  private readonly data: Uint8Array;
  private readonly heap: Uint8Array;
  private readonly stack: Uint8Array;
  private readonly mmio: Uint8Array;

  constructor(options: MemoryOptions = {}) {
    this.map = options.map ?? new MemoryMap();
    this.littleEndian = options.littleEndian ?? true;

    this.text = new Uint8Array(this.map.textSize);
    this.data = new Uint8Array(this.map.heapBase - this.map.dataBase);
    this.heap = new Uint8Array(this.map.heapSize);
    this.stack = new Uint8Array(this.map.stackSize);
    this.mmio = new Uint8Array(this.map.mmioSize);
  }

  loadImage(image: BinaryImage): void {
    for (let i = 0; i < image.text.length; i++) {
      this.writeWord(image.textBase + i * WORD_SIZE, image.text[i]);
    }

    for (let i = 0; i < image.data.length; i++) {
      this.writeByte(image.dataBase + i, image.data[i]);
    }
  }

  loadWord(address: number): number {
    return this.readWord(address);
  }

  readWord(address: number): number {
    this.ensureWordAligned(address);
    const mappings = this.resolveContiguousRange(address, WORD_SIZE);
    const bytes = mappings.map((mapping, index) => this.readByteInternal(mapping, address + index));
    return this.combineBytes(bytes);
  }

  writeWord(address: number, value: number): void {
    this.ensureWordAligned(address);
    const mappings = this.resolveContiguousRange(address, WORD_SIZE);
    const bytes = this.splitWord(value);
    for (let i = 0; i < WORD_SIZE; i++) {
      this.writeByteInternal(mappings[i], address + i, bytes[i]);
    }
  }

  readByte(address: number): number {
    const mapping = this.map.resolve(address);
    return this.readByteInternal(mapping, address);
  }

  writeByte(address: number, value: number): void {
    const mapping = this.map.resolve(address);
    this.writeByteInternal(mapping, address, value);
  }

  private readByteInternal(mapping: MemoryMappingResult, address: number): number {
    if (mapping.device) {
      return mapping.device.readByte(address) & 0xff;
    }

    const buffer = this.resolveBuffer(mapping.segment.name);
    const value = buffer[mapping.offset];
    if (value === undefined) {
      throw new RangeError(`Address out of bounds: 0x${address.toString(16)}`);
    }
    return value;
  }

  private writeByteInternal(mapping: MemoryMappingResult, address: number, value: number): void {
    if (value < 0 || value > 0xff || !Number.isInteger(value)) {
      throw new RangeError(`Byte value must be an unsigned 8-bit integer: ${value}`);
    }

    if (mapping.device) {
      mapping.device.writeByte(address, value & 0xff);
      return;
    }

    const buffer = this.resolveBuffer(mapping.segment.name);
    if (mapping.offset < 0 || mapping.offset >= buffer.length) {
      throw new RangeError(`Address out of bounds: 0x${address.toString(16)}`);
    }

    buffer[mapping.offset] = value & 0xff;
  }

  private combineBytes(bytes: number[]): number {
    if (!this.littleEndian) {
      bytes = [...bytes].reverse();
    }

    let word = 0;
    for (let i = 0; i < WORD_SIZE; i++) {
      word |= (bytes[i] & 0xff) << (8 * i);
    }
    return word >>> 0;
  }

  private splitWord(value: number): number[] {
    const sanitized = value >>> 0;
    const bytes = [0, 0, 0, 0];
    for (let i = 0; i < WORD_SIZE; i++) {
      bytes[i] = (sanitized >>> (8 * i)) & 0xff;
    }
    return this.littleEndian ? bytes : bytes.reverse();
  }

  private ensureWordAligned(address: number): void {
    if (address % WORD_SIZE !== 0) {
      throw new Error(`Unaligned word access at address 0x${address.toString(16)}`);
    }
  }

  private resolveBuffer(segment: string): Uint8Array {
    switch (segment) {
      case "text":
        return this.text;
      case "data":
        return this.data;
      case "heap":
        return this.heap;
      case "stack":
        return this.stack;
      case "mmio":
        return this.mmio;
      default:
        throw new Error(`Unknown memory segment: ${segment}`);
    }
  }

  private resolveContiguousRange(address: number, length: number): MemoryMappingResult[] {
    const mappings: MemoryMappingResult[] = [];
    for (let i = 0; i < length; i++) {
      const mapping = this.map.resolve(address + i);
      if (i > 0) {
        const previous = mappings[i - 1];
        if (mapping.segment.name !== previous.segment.name || mapping.device !== previous.device) {
          throw new RangeError(`Access crosses memory segment boundary at address 0x${(address + i).toString(16)}`);
        }
      }
      mappings.push(mapping);
    }
    return mappings;
  }
}
