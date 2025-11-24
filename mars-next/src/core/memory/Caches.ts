import { AccessType } from "./MemoryMap";

export interface CacheConfig {
  size: number;
  lineSize: number;
  associativity: number;
  writePolicy?: "write-back" | "write-through";
  accessType?: AccessType;
}

interface CacheLine {
  tag: number;
  valid: boolean;
  dirty: boolean;
  lastUsed: number;
  data: Uint8Array;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
}

/**
 * Lightweight cache implementation using LRU eviction and either write-back or write-through policies.
 * Adapted from the legacy MARS cache simulator algorithms for parity with the Java implementation.
 */
export class Cache {
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

    this.sets = Array.from({ length: this.setCount }, () => this.createEmptySet());
  }

  reset(): void {
    for (let i = 0; i < this.sets.length; i++) {
      this.sets[i] = this.createEmptySet();
    }
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
    const lineBase = this.computeLineBase(tag, setIndex);
    const set = this.sets[setIndex];

    let targetLine = set.find((line) => !line.valid);
    if (!targetLine && set.length < this.config.associativity) {
      targetLine = this.createLine();
      set.push(targetLine);
    }
    if (!targetLine) {
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

  private createEmptySet(): CacheLine[] {
    return Array.from({ length: this.config.associativity }, () => this.createLine());
  }

  private selectVictim(set: CacheLine[]): CacheLine {
    if (set.length === 0) {
      return this.createLine();
    }
    return set.reduce((candidate, line) => (line.lastUsed < candidate.lastUsed ? line : candidate));
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
