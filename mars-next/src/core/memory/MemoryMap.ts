import { Device, DeviceData } from "../devices/Device";

export type MemorySegmentName = "text" | "data" | "heap" | "stack" | "mmio";

export interface MemoryMappedDevice extends Device {}

export interface MemoryMapOptions {
  textBase?: number;
  textSize?: number;
  dataBase?: number;
  dataSize?: number;
  heapBase?: number;
  stackBase?: number;
  stackSize?: number;
  mmioBase?: number;
  mmioSize?: number;
  devices?: DeviceRange[];
}

interface DeviceRange {
  start: number;
  end: number;
  device: MemoryMappedDevice;
}

interface MemorySegment {
  name: MemorySegmentName;
  start: number;
  end: number;
  direction: "up" | "down";
  writable: boolean;
}

export interface MemoryMappingResult {
  segment: MemorySegment;
  offset: number;
  device?: MemoryMappedDevice;
}

const DEFAULT_TEXT_BASE = 0x00400000;
const DEFAULT_TEXT_SIZE = 4 * 1024 * 1024;
const DEFAULT_DATA_BASE = 0x10000000;
const DEFAULT_DATA_SIZE = 4 * 1024 * 1024;
const DEFAULT_HEAP_BASE = 0x10040000;
const DEFAULT_STACK_BASE = 0x7ffffffc;
const DEFAULT_STACK_SIZE = 4 * 1024 * 1024;
const DEFAULT_MMIO_BASE = 0xffff0000;
const DEFAULT_MMIO_SIZE = 0x00010000;

export class MemoryMap {
  private readonly segments: MemorySegment[];
  private readonly devices: DeviceRange[];

  readonly textBase: number;
  readonly textSize: number;
  readonly dataBase: number;
  readonly dataSize: number;
  readonly heapBase: number;
  readonly heapSize: number;
  readonly stackBase: number;
  readonly stackSize: number;
  readonly mmioBase: number;
  readonly mmioSize: number;

  constructor(options: MemoryMapOptions = {}) {
    this.textBase = options.textBase ?? DEFAULT_TEXT_BASE;
    this.textSize = options.textSize ?? DEFAULT_TEXT_SIZE;
    this.dataBase = options.dataBase ?? DEFAULT_DATA_BASE;
    this.dataSize = options.dataSize ?? DEFAULT_DATA_SIZE;
    this.heapBase = options.heapBase ?? DEFAULT_HEAP_BASE;
    this.stackBase = options.stackBase ?? DEFAULT_STACK_BASE;
    this.stackSize = options.stackSize ?? DEFAULT_STACK_SIZE;
    this.mmioBase = options.mmioBase ?? DEFAULT_MMIO_BASE;
    this.mmioSize = options.mmioSize ?? DEFAULT_MMIO_SIZE;
    this.devices = [...(options.devices ?? [])];

    if (this.heapBase < this.dataBase) {
      throw new Error("Heap base cannot precede data base address");
    }

    if (this.heapBase > this.dataBase + this.dataSize) {
      throw new Error("Heap base lies beyond the data segment");
    }

    this.heapSize = Math.max(0, this.dataBase + this.dataSize - this.heapBase);

    this.segments = [
      {
        name: "text",
        start: this.textBase,
        end: this.textBase + this.textSize - 1,
        direction: "up",
        writable: true,
      },
      {
        name: "data",
        start: this.dataBase,
        end: Math.max(this.dataBase, this.heapBase - 1),
        direction: "up",
        writable: true,
      },
      {
        name: "heap",
        start: this.heapBase,
        end: this.heapBase + this.heapSize - 1,
        direction: "up",
        writable: true,
      },
      {
        name: "stack",
        start: this.stackBase,
        end: this.stackBase - this.stackSize + 1,
        direction: "down",
        writable: true,
      },
      {
        name: "mmio",
        start: this.mmioBase,
        end: this.mmioBase + this.mmioSize - 1,
        direction: "up",
        writable: true,
      },
    ];
  }

  registerDevice(start: number, size: number, device: MemoryMappedDevice): void {
    const normalizedStart = start >>> 0;
    const normalizedEnd = (normalizedStart + size - 1) >>> 0;
    this.devices.push({ start: normalizedStart, end: normalizedEnd, device });
  }

  read(address: number): DeviceData {
    const range = this.findDeviceRange(address);
    if (!range) {
      throw new RangeError(`No memory-mapped device for address 0x${address.toString(16)}`);
    }

    const offset = (address - range.start) | 0;
    return range.device.read(offset);
  }

  write(address: number, value: number | string | Uint8Array): void {
    const range = this.findDeviceRange(address);
    if (!range) {
      throw new RangeError(`No memory-mapped device for address 0x${address.toString(16)}`);
    }

    const offset = (address - range.start) | 0;
    range.device.write(offset, value);
  }

  resolve(address: number): MemoryMappingResult {
    this.validateAddress(address);
    const normalizedAddress = address >>> 0;

    for (const segment of this.segments) {
      if (this.inSegmentRange(normalizedAddress, segment)) {
        const offset = this.computeOffset(normalizedAddress, segment);
        const device = segment.name === "mmio" ? this.findDeviceRange(normalizedAddress)?.device : undefined;
        return { segment, offset, device };
      }
    }

    throw new RangeError(`Address out of bounds: 0x${normalizedAddress.toString(16)}`);
  }

  private inSegmentRange(address: number, segment: MemorySegment): boolean {
    return segment.direction === "up"
      ? address >= segment.start && address <= segment.end
      : address <= segment.start && address >= segment.end;
  }

  private computeOffset(address: number, segment: MemorySegment): number {
    return segment.direction === "up" ? address - segment.start : segment.start - address;
  }

  private validateAddress(address: number): void {
    if (!Number.isInteger(address)) {
      throw new RangeError(`Address must be an integer: ${address}`);
    }
  }

  private findDeviceRange(address: number): DeviceRange | undefined {
    return this.devices.find(({ start, end }) => address >= start && address <= end);
  }
}
