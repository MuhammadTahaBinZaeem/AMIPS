import { AddressError } from "../exceptions/AccessExceptions";
import { Cache, CacheConfig } from "./Caches";
import { AccessType, MemoryMap } from "./MemoryMap";
import { InterruptHandler } from "../devices/Device";

const BLOCK_SIZE = 4096;
const BLOCK_MASK = BLOCK_SIZE - 1;
const BLOCK_SHIFT = 12;

export interface MemoryOptions {
  map?: MemoryMap;
  dataCache?: CacheConfig | null;
  instructionCache?: CacheConfig | null;
}

export class Memory {
  private readonly blocks = new Map<number, Uint8Array>();
  private readonly writtenAddresses = new Set<number>();
  private readonly memoryMap: MemoryMap;
  private readonly dataCache: Cache | null;
  private readonly instructionCache: Cache | null;
  private kernelMode = true;

  constructor(options: MemoryOptions = {}) {
    this.memoryMap = options.map ?? new MemoryMap();
    this.dataCache = options.dataCache ? new Cache(options.dataCache) : null;
    this.instructionCache = options.instructionCache ? new Cache(options.instructionCache) : null;
    this.memoryMap.setKernelMode(this.kernelMode);
  }

  onInterrupt(handler: InterruptHandler): void {
    this.memoryMap.onInterrupt(handler);
  }

  reset(): void {
    this.blocks.clear();
    this.writtenAddresses.clear();
    this.dataCache?.reset();
    this.instructionCache?.reset();
  }

  setKernelMode(enabled: boolean): void {
    this.kernelMode = enabled;
    this.memoryMap.setKernelMode(enabled);
  }

  flushCaches(): void {
    this.dataCache?.flush((address, data) => this.writeBackLine(address, data));
    this.instructionCache?.flush((address, data) => this.writeBackLine(address, data));
  }

  loadWord(address: number): number {
    return this.readWord(address, "execute");
  }

  readWord(address: number, access: AccessType = "read"): number {
    const normalizedAddress = this.validateWordAddress(address, access);

    let value = 0;
    for (let i = 0; i < 4; i++) {
      value = (value << 8) | this.readByte(normalizedAddress + i, access);
    }
    return value | 0;
  }

  /**
   * Convenience wrapper used by debugger subsystems to read either a word (aligned) or a single byte (unaligned).
   */
  read(address: number): number {
    if (address % 4 === 0) {
      return this.readWord(address);
    }

    return this.readByte(address);
  }

  writeWord(address: number, value: number): void {
    const normalizedAddress = this.validateWordAddress(address, "write");

    for (let i = 0; i < 4; i++) {
      const shift = 24 - 8 * i;
      this.writeByte(normalizedAddress + i, (value >>> shift) & 0xff);
    }
  }

  readByte(address: number, access: AccessType = "read"): number {
    const mapping = this.memoryMap.resolve(address, access);
    if (mapping.device) {
      const data = mapping.device.read(mapping.offset);
      if (typeof data !== "number") {
        throw new RangeError(`Device at 0x${address.toString(16)} did not return a numeric byte`);
      }
      return data & 0xff;
    }

    const targetCache = this.selectCache(access);
    const physical = mapping.physicalAddress >>> 0;
    if (!targetCache) {
      return this.readByteFromBacking(physical);
    }

    return targetCache.readByte(physical, (addr, size) => this.loadLineFromBacking(addr, size), (addr, data) => {
      this.writeBackLine(addr, data);
    });
  }

  writeByte(address: number, value: number): void {
    const mapping = this.memoryMap.resolve(address, "write");
    if (mapping.device) {
      mapping.device.write(mapping.offset, value & 0xff);
      return;
    }

    const targetCache = this.selectCache("write");
    const physical = mapping.physicalAddress >>> 0;
    if (!targetCache) {
      this.writeByteToBacking(physical, value);
      return;
    }

    targetCache.writeByte(
      physical,
      value,
      (addr, size) => this.loadLineFromBacking(addr, size),
      (addr, data) => this.writeBackLine(addr, data),
    );
  }

  writeBytes(baseAddress: number, values: number[]): void {
    values.forEach((byte, index) => this.writeByte(baseAddress + index, byte));
  }

  /**
   * Returns a snapshot of all written bytes sorted by address. Useful for simple UIs or debugging
   * scenarios where a read-only view of memory contents is needed.
   */
  entries(): Array<{ address: number; value: number }> {
    return [...this.writtenAddresses]
      .sort((a, b) => a - b)
      .map((address) => ({ address, value: this.readByteFromBacking(address) }));
  }

  private selectCache(access: AccessType): Cache | null {
    if (access === "execute") {
      return this.instructionCache ?? this.dataCache;
    }

    return this.dataCache;
  }

  private loadLineFromBacking(address: number, size: number): Uint8Array {
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      data[i] = this.readByteFromBacking(address + i);
    }
    return data;
  }

  private writeBackLine(address: number, data: Uint8Array): void {
    for (let i = 0; i < data.length; i++) {
      this.writeByteToBacking(address + i, data[i]);
    }
  }

  private readByteFromBacking(address: number): number {
    const normalizedAddress = this.validateAddress(address);
    const block = this.blocks.get(normalizedAddress >>> BLOCK_SHIFT);
    if (!block) {
      return 0;
    }

    const offset = normalizedAddress & BLOCK_MASK;
    return block[offset] ?? 0;
  }

  private writeByteToBacking(address: number, value: number): void {
    const normalizedAddress = this.validateAddress(address);
    const blockIndex = normalizedAddress >>> BLOCK_SHIFT;
    const block = this.getOrCreateBlock(blockIndex);

    block[normalizedAddress & BLOCK_MASK] = value & 0xff;
    this.writtenAddresses.add(normalizedAddress);
  }

  private getOrCreateBlock(index: number): Uint8Array {
    let block = this.blocks.get(index);
    if (!block) {
      block = new Uint8Array(BLOCK_SIZE);
      this.blocks.set(index, block);
    }
    return block;
  }

  private validateAddress(address: number): number {
    if (!Number.isInteger(address)) {
      throw new RangeError(`Invalid memory address: ${address}`);
    }

    return address >>> 0;
  }

  private validateWordAddress(address: number, access: AccessType): number {
    const normalizedAddress = this.validateAddress(address);
    if (normalizedAddress % 4 !== 0) {
      throw new AddressError(address, access, `Unaligned word address: 0x${address.toString(16)}`);
    }
    return normalizedAddress;
  }
}
