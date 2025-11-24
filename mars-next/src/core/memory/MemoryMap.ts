import { Device, DeviceData } from "../devices/Device";

export type MemorySegmentName = "text" | "data" | "heap" | "stack" | "mmio" | "ktext" | "kdata";

export type AccessType = "read" | "write" | "execute";

export interface AccessRights {
  read: boolean;
  write: boolean;
  execute: boolean;
}

export interface MemoryMappedDevice extends Device {}

export interface MemoryMapOptions {
  textBase?: number;
  textSize?: number;
  dataBase?: number;
  dataSize?: number;
  heapBase?: number;
  ktextBase?: number;
  ktextSize?: number;
  kdataBase?: number;
  kdataSize?: number;
  stackBase?: number;
  stackSize?: number;
  mmioBase?: number;
  mmioSize?: number;
  devices?: DeviceRange[];
  tlbEntries?: TlbEntry[];
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
  physicalAddress: number;
  rights: AccessRights;
}

export interface TlbEntry {
  virtualPage: number;
  physicalPage: number;
  pageSize: number;
  rights: AccessRights;
}

const DEFAULT_TEXT_BASE = 0x00400000;
const DEFAULT_TEXT_SIZE = 4 * 1024 * 1024;
const DEFAULT_DATA_BASE = 0x10000000;
const DEFAULT_DATA_SIZE = 4 * 1024 * 1024;
const DEFAULT_HEAP_BASE = 0x10040000;
const DEFAULT_KTEXT_BASE = 0x80000000;
const DEFAULT_KTEXT_SIZE = 4 * 1024 * 1024;
const DEFAULT_KDATA_BASE = 0x90000000;
const DEFAULT_KDATA_SIZE = 4 * 1024 * 1024;
const DEFAULT_STACK_BASE = 0x7ffffffc;
const DEFAULT_STACK_SIZE = 4 * 1024 * 1024;
const DEFAULT_MMIO_BASE = 0xffff0000;
const DEFAULT_MMIO_SIZE = 0x00010000;

export class MemoryMap {
  private readonly segments: MemorySegment[];
  private readonly devices: DeviceRange[];
  private readonly tlb: TlbEntry[];

  readonly textBase: number;
  readonly textSize: number;
  readonly dataBase: number;
  readonly dataSize: number;
  readonly heapBase: number;
  readonly heapSize: number;
  readonly ktextBase: number;
  readonly ktextSize: number;
  readonly kdataBase: number;
  readonly kdataSize: number;
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
    this.ktextBase = options.ktextBase ?? DEFAULT_KTEXT_BASE;
    this.ktextSize = options.ktextSize ?? DEFAULT_KTEXT_SIZE;
    this.kdataBase = options.kdataBase ?? DEFAULT_KDATA_BASE;
    this.kdataSize = options.kdataSize ?? DEFAULT_KDATA_SIZE;
    this.stackBase = options.stackBase ?? DEFAULT_STACK_BASE;
    this.stackSize = options.stackSize ?? DEFAULT_STACK_SIZE;
    this.mmioBase = options.mmioBase ?? DEFAULT_MMIO_BASE;
    this.mmioSize = options.mmioSize ?? DEFAULT_MMIO_SIZE;
    this.devices = [...(options.devices ?? [])];
    this.tlb = [];

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
        name: "ktext",
        start: this.ktextBase,
        end: this.ktextBase + this.ktextSize - 1,
        direction: "up",
        writable: true,
      },
      {
        name: "kdata",
        start: this.kdataBase,
        end: this.kdataBase + this.kdataSize - 1,
        direction: "up",
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

    (options.tlbEntries ?? []).forEach((entry) => this.addTlbEntry(entry));
  }

  addTlbEntry(entry: TlbEntry): void {
    this.validateTlbEntry(entry);
    this.tlb.push(this.normalizeTlbEntry(entry));
  }

  clearTlb(): void {
    this.tlb.length = 0;
  }

  registerDevice(start: number, size: number, device: MemoryMappedDevice): void {
    const normalizedStart = start >>> 0;
    const normalizedEnd = (normalizedStart + size - 1) >>> 0;
    this.devices.push({ start: normalizedStart, end: normalizedEnd, device });
  }

  read(address: number): DeviceData {
    const { physicalAddress, device } = this.resolve(address, "read");
    const range = device ? this.findDeviceRange(physicalAddress) : undefined;
    if (!range) {
      throw new RangeError(`No memory-mapped device for address 0x${address.toString(16)}`);
    }

    const offset = (physicalAddress - range.start) | 0;
    return range.device.read(offset);
  }

  write(address: number, value: number | string | Uint8Array): void {
    const { physicalAddress, device } = this.resolve(address, "write");
    const range = device ? this.findDeviceRange(physicalAddress) : undefined;
    if (!range) {
      throw new RangeError(`No memory-mapped device for address 0x${address.toString(16)}`);
    }

    const offset = (physicalAddress - range.start) | 0;
    range.device.write(offset, value);
  }

  resolve(address: number, access: AccessType = "read"): MemoryMappingResult {
    const normalizedAddress = this.validateAddress(address);
    const { physicalAddress, rights } = this.translateThroughTlb(normalizedAddress, access);

    for (const segment of this.segments) {
      if (this.inSegmentRange(normalizedAddress, segment)) {
        const deviceRange = segment.name === "mmio" ? this.findDeviceRange(physicalAddress) : undefined;
        const offset = deviceRange
          ? (physicalAddress - deviceRange.start) | 0
          : this.computeOffset(normalizedAddress, segment);
        const device = deviceRange?.device;
        return { segment, offset, device, physicalAddress, rights };
      }
    }

    throw new RangeError(`Address out of bounds: 0x${normalizedAddress.toString(16)}`);
  }

  private translateThroughTlb(address: number, access: AccessType): { physicalAddress: number; rights: AccessRights } {
    for (const entry of this.tlb) {
      const normalized = this.normalizeTlbEntry(entry);
      const withinPage = address >= normalized.virtualPage && address < normalized.virtualPage + normalized.pageSize;
      if (!withinPage) continue;

      this.enforceRights(access, normalized.rights, address);
      const offset = (address - normalized.virtualPage) | 0;
      return { physicalAddress: (normalized.physicalPage + offset) >>> 0, rights: normalized.rights };
    }

    // Default identity mapping with permissive rights keeps backwards compatibility.
    return { physicalAddress: address, rights: { read: true, write: true, execute: true } };
  }

  private inSegmentRange(address: number, segment: MemorySegment): boolean {
    return segment.direction === "up"
      ? address >= segment.start && address <= segment.end
      : address <= segment.start && address >= segment.end;
  }

  private computeOffset(address: number, segment: MemorySegment): number {
    return segment.direction === "up" ? address - segment.start : segment.start - address;
  }

  private enforceRights(access: AccessType, rights: AccessRights, address: number): void {
    const allowed =
      (access === "read" && rights.read) ||
      (access === "write" && rights.write) ||
      (access === "execute" && rights.execute);

    if (!allowed) {
      throw new RangeError(`Access violation for 0x${address.toString(16)} (${access})`);
    }
  }

  private normalizeTlbEntry(entry: TlbEntry): TlbEntry {
    return {
      virtualPage: this.validateAddress(entry.virtualPage),
      physicalPage: this.validateAddress(entry.physicalPage),
      pageSize: entry.pageSize >>> 0,
      rights: entry.rights,
    };
  }

  private validateTlbEntry(entry: TlbEntry): void {
    if (!Number.isInteger(entry.pageSize) || entry.pageSize <= 0) {
      throw new RangeError(`Invalid TLB page size: ${entry.pageSize}`);
    }

    if ((entry.pageSize & (entry.pageSize - 1)) !== 0) {
      throw new RangeError(`TLB page size must be a power of two: ${entry.pageSize}`);
    }
  }

  private validateAddress(address: number): number {
    if (!Number.isInteger(address)) {
      throw new RangeError(`Address must be an integer: ${address}`);
    }
    return address >>> 0;
  }

  private findDeviceRange(address: number): DeviceRange | undefined {
    return this.devices.find(({ start, end }) => address >= start && address <= end);
  }
}
