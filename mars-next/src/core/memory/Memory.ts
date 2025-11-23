import { AccessType, MemoryMap } from "./MemoryMap";

export interface CacheConfig {
  size: number;
  lineSize: number;
  associativity: number;
  writePolicy?: "write-back" | "write-through";
}

interface CacheLine {
  tag: number;
  valid: boolean;
  dirty: boolean;
  lastUsed: number;
  data: Uint8Array;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
}

class Cache {
  private readonly writePolicy: "write-back" | "write-through";
  private readonly setCount: number;
  private readonly sets: CacheLine[][];
  private usageCounter = 0;
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0 };

  constructor(private readonly config: CacheConfig) {
    if (config.lineSize <= 0 || config.size <= 0 || config.associativity <= 0) {
      throw new RangeError("Cache configuration values must be positive");
    }

    if ((config.lineSize & (config.lineSize - 1)) !== 0) {
      throw new RangeError("Cache line size must be a power of two");
    }

    this.writePolicy = config.writePolicy ?? "write-back";

    const totalLines = Math.floor(config.size / config.lineSize);
    this.setCount = Math.floor(totalLines / config.associativity);

    if (this.setCount <= 0 || !Number.isFinite(this.setCount)) {
      throw new RangeError("Cache size must fit at least one full set");
    }

    this.sets = Array.from({ length: this.setCount }, () => []);
  }

  reset(): void {
    this.sets.forEach((set) => set.splice(0, set.length));
    this.usageCounter = 0;
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  flush(writeBack: (address: number, data: Uint8Array) => void): void {
    for (let setIndex = 0; setIndex < this.sets.length; setIndex++) {
      for (const line of this.sets[setIndex]) {
        if (line.valid && line.dirty) {
          writeBack(this.computeLineBase(line.tag, setIndex), line.data);
          line.dirty = false;
        }
      }
    }
  }

  readByte(
    address: number,
    loadLine: (address: number, size: number) => Uint8Array,
    writeBack: (address: number, data: Uint8Array) => void,
  ): number {
    const { setIndex, tag, offset } = this.indexAddress(address);
    const set = this.sets[setIndex];
    const line = this.findLine(set, tag);

    if (line) {
      this.touch(line);
      this.stats.hits += 1;
      return line.data[offset];
    }

    this.stats.misses += 1;
    const filledLine = this.fillLine(setIndex, tag, loadLine, writeBack);
    return filledLine.data[offset];
  }

  writeByte(
    address: number,
    value: number,
    loadLine: (address: number, size: number) => Uint8Array,
    writeBack: (address: number, data: Uint8Array) => void,
  ): void {
    const { setIndex, tag, offset } = this.indexAddress(address);
    const set = this.sets[setIndex];
    let line = this.findLine(set, tag);

    if (!line) {
      this.stats.misses += 1;
      line = this.fillLine(setIndex, tag, loadLine, writeBack);
    } else {
      this.stats.hits += 1;
    }

    line.data[offset] = value & 0xff;
    if (this.writePolicy === "write-back") {
      line.dirty = true;
    } else {
      writeBack(this.computeLineBase(tag, setIndex), line.data);
    }
    this.touch(line);
  }

  getLineSize(): number {
    return this.config.lineSize;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  private fillLine(
    setIndex: number,
    tag: number,
    loadLine: (address: number, size: number) => Uint8Array,
    writeBack: (address: number, data: Uint8Array) => void,
  ): CacheLine {
    const set = this.sets[setIndex];
    const lineBase = this.computeLineBase(tag, setIndex);
    let targetLine: CacheLine | null = null;

    if (set.length < this.config.associativity) {
      targetLine = this.createLine();
      set.push(targetLine);
    } else {
      targetLine = this.selectVictim(set);
      if (targetLine.valid) {
        this.stats.evictions += 1;
        if (targetLine.dirty && this.writePolicy === "write-back") {
          writeBack(this.computeLineBase(targetLine.tag, setIndex), targetLine.data);
        }
      }
    }

    targetLine.tag = tag;
    targetLine.valid = true;
    targetLine.dirty = false;
    targetLine.data = loadLine(lineBase, this.config.lineSize);
    this.touch(targetLine);
    return targetLine;
  }

  private createLine(): CacheLine {
    return { tag: 0, valid: false, dirty: false, lastUsed: 0, data: new Uint8Array(this.config.lineSize) };
  }

  private selectVictim(set: CacheLine[]): CacheLine {
    return set.reduce((oldest, candidate) => (candidate.lastUsed < oldest.lastUsed ? candidate : oldest));
  }

  private computeLineBase(tag: number, setIndex: number): number {
    const blockNumber = tag * this.setCount + setIndex;
    return (blockNumber * this.config.lineSize) >>> 0;
  }

  private findLine(set: CacheLine[], tag: number): CacheLine | undefined {
    return set.find((line) => line.valid && line.tag === tag);
  }

  private indexAddress(address: number): { setIndex: number; tag: number; offset: number } {
    const blockNumber = Math.floor(address / this.config.lineSize);
    const setIndex = blockNumber % this.setCount;
    const tag = Math.floor(blockNumber / this.setCount);
    const offset = address % this.config.lineSize;
    return { setIndex, tag, offset };
  }

  private touch(line: CacheLine): void {
    this.usageCounter += 1;
    line.lastUsed = this.usageCounter;
  }
}

export interface MemoryOptions {
  map?: MemoryMap;
  dataCache?: CacheConfig | null;
  instructionCache?: CacheConfig | null;
}

export class Memory {
  private readonly bytes = new Map<number, number>();
  private readonly memoryMap: MemoryMap;
  private readonly dataCache: Cache | null;
  private readonly instructionCache: Cache | null;

  constructor(options: MemoryOptions = {}) {
    this.memoryMap = options.map ?? new MemoryMap();
    this.dataCache = options.dataCache ? new Cache(options.dataCache) : null;
    this.instructionCache = options.instructionCache ? new Cache(options.instructionCache) : null;
  }

  reset(): void {
    this.bytes.clear();
    this.dataCache?.reset();
    this.instructionCache?.reset();
  }

  flushCaches(): void {
    this.dataCache?.flush((address, data) => this.writeBackLine(address, data));
    this.instructionCache?.flush((address, data) => this.writeBackLine(address, data));
  }

  loadWord(address: number): number {
    return this.readWord(address, "execute");
  }

  readWord(address: number, access: AccessType = "read"): number {
    const normalizedAddress = this.validateWordAddress(address);

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
    const normalizedAddress = this.validateWordAddress(address);

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
    values.forEach((value, index) => this.writeByte(baseAddress + index, value));
  }

  /**
   * Returns a snapshot of all written bytes sorted by address. Useful for simple UIs or debugging
   * scenarios where a read-only view of memory contents is needed.
   */
  entries(): Array<{ address: number; value: number }> {
    return [...this.bytes.entries()]
      .sort(([a], [b]) => a - b)
      .map(([address, value]) => ({ address, value }));
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
    return this.bytes.get(normalizedAddress) ?? 0;
  }

  private writeByteToBacking(address: number, value: number): void {
    const normalizedAddress = this.validateAddress(address);
    this.bytes.set(normalizedAddress, value & 0xff);
  }

  private validateAddress(address: number): number {
    if (!Number.isInteger(address)) {
      throw new RangeError(`Invalid memory address: ${address}`);
    }

    return address >>> 0;
  }

  private validateWordAddress(address: number): number {
    const normalizedAddress = this.validateAddress(address);
    if (normalizedAddress % 4 !== 0) {
      throw new RangeError(`Unaligned word address: ${address}`);
    }
    return normalizedAddress;
  }
}
