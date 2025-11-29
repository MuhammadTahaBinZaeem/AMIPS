import { Device, DeviceData, InterruptHandler } from "../devices/Device";
import { AudioDevice } from "../devices/AudioDevice";
import { BitmapDisplayDevice } from "../devices/BitmapDisplayDevice";
import { DisplayDevice } from "../devices/DisplayDevice";
import { KeyboardDevice } from "../devices/KeyboardDevice";
import { RealTimeClockDevice } from "../devices/RealTimeClockDevice";
import { SevenSegmentDisplayDevice } from "../devices/SevenSegmentDisplayDevice";
import { PrivilegeViolation } from "../exceptions/AccessExceptions";

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
const KEYBOARD_START = 0xffff0000;
const KEYBOARD_SIZE = 0x8;
const DISPLAY_START = KEYBOARD_START + KEYBOARD_SIZE;
const DISPLAY_SIZE = 0x8;
const BITMAP_START = 0xffff0100;
const BITMAP_END = 0xffff01ff;
const REAL_TIME_CLOCK_START = 0xffff0010;
const REAL_TIME_CLOCK_SIZE = 0x8;
const SEVEN_SEGMENT_START = 0xffff0018;
const SEVEN_SEGMENT_SIZE = 0x2;
const AUDIO_START = 0xffff0020;
const AUDIO_SIZE = 0x10;

export class MemoryMap {
  private readonly segments: MemorySegment[];
  private readonly devices: DeviceRange[];
  private readonly tlb: TlbEntry[];
  private interruptHandler: InterruptHandler | null = null;
  private kernelMode = true;

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

    const builtinDevices = this.createDefaultDevices();
    this.devices = [...builtinDevices, ...(options.devices ?? [])];
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

  private createDefaultDevices(): DeviceRange[] {
    const keyboard = new KeyboardDevice();
    const display = new DisplayDevice();
    const bitmapDisplay = new BitmapDisplayDevice();
    const realTimeClock = new RealTimeClockDevice();
    const sevenSegmentDisplay = new SevenSegmentDisplayDevice();
    const audioDevice = new AudioDevice();

    const keyboardStart = KEYBOARD_START >>> 0;
    const keyboardEnd = (keyboardStart + KEYBOARD_SIZE - 1) >>> 0;
    const displayStart = DISPLAY_START >>> 0;
    const displayEnd = (displayStart + DISPLAY_SIZE - 1) >>> 0;
    const bitmapStart = BITMAP_START >>> 0;
    const bitmapEnd = BITMAP_END >>> 0;
    const realTimeClockStart = REAL_TIME_CLOCK_START >>> 0;
    const realTimeClockEnd = (realTimeClockStart + REAL_TIME_CLOCK_SIZE - 1) >>> 0;
    const sevenSegmentStart = SEVEN_SEGMENT_START >>> 0;
    const sevenSegmentEnd = (sevenSegmentStart + SEVEN_SEGMENT_SIZE - 1) >>> 0;
    const audioStart = AUDIO_START >>> 0;
    const audioEnd = (audioStart + AUDIO_SIZE - 1) >>> 0;

    return [
      { start: keyboardStart, end: keyboardEnd, device: keyboard },
      { start: displayStart, end: displayEnd, device: display },
      { start: bitmapStart, end: bitmapEnd, device: bitmapDisplay },
      { start: realTimeClockStart, end: realTimeClockEnd, device: realTimeClock },
      { start: sevenSegmentStart, end: sevenSegmentEnd, device: sevenSegmentDisplay },
      { start: audioStart, end: audioEnd, device: audioDevice },
    ];
  }

  onInterrupt(handler: InterruptHandler): void {
    this.interruptHandler = handler;
    this.devices.forEach(({ device }) => this.attachInterruptHandler(device));
  }

  setKernelMode(enabled: boolean): void {
    this.kernelMode = enabled;
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
    this.attachInterruptHandler(device);
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
        this.enforceSegmentPrivileges(segment, access, normalizedAddress, rights);
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
      throw new PrivilegeViolation(address, access, `Access violation for 0x${address.toString(16)} (${access})`);
    }
  }

  private enforceSegmentPrivileges(
    segment: MemorySegment,
    access: AccessType,
    address: number,
    rights: AccessRights,
  ): void {
    const kernelOnly = segment.name === "ktext" || segment.name === "kdata" || segment.name === "mmio";
    if (kernelOnly && !this.kernelMode) {
      throw new PrivilegeViolation(address, access, `Kernel segment ${segment.name} is not accessible in user mode`);
    }

    this.enforceRights(access, rights, address);
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
    for (let i = this.devices.length - 1; i >= 0; i--) {
      const { start, end } = this.devices[i];
      if (address >= start && address <= end) {
        return this.devices[i];
      }
    }

    return undefined;
  }

  private attachInterruptHandler(device: MemoryMappedDevice): void {
    if (this.interruptHandler) {
      device.onInterrupt?.(() => this.interruptHandler?.(device));
    }
  }
}
