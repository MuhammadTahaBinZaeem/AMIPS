import { Device, DeviceData } from "./Device";

export interface DirtyRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BitmapDisplayOptions {
  width?: number;
  height?: number;
  onFlush?: (regions: DirtyRegion[], buffer: Uint8Array) => void;
}

const CONTROL_WIDTH_OFFSET = 0;
const CONTROL_HEIGHT_OFFSET = 4;
const CONTROL_DIRTY_COUNT_OFFSET = 8;
const CONTROL_FLUSH_OFFSET = 12;
const FRAMEBUFFER_OFFSET = 16;

export class BitmapDisplayDevice implements Device {
  readonly width: number;
  readonly height: number;

  private readonly buffer: Uint8Array;
  private readonly dirtyRegions: DirtyRegion[] = [];
  private pendingRegion: DirtyRegion | null = null;
  private readonly onFlush?: (regions: DirtyRegion[], buffer: Uint8Array) => void;

  constructor(options: BitmapDisplayOptions = {}) {
    this.width = Math.max(1, options.width ?? 64);
    this.height = Math.max(1, options.height ?? 64);
    this.buffer = new Uint8Array(this.width * this.height * 4);
    this.onFlush = options.onFlush;
  }

  get byteLength(): number {
    return FRAMEBUFFER_OFFSET + this.buffer.length;
  }

  read(offset: number): DeviceData {
    if (offset === CONTROL_WIDTH_OFFSET) {
      return this.width;
    }
    if (offset === CONTROL_HEIGHT_OFFSET) {
      return this.height;
    }
    if (offset === CONTROL_DIRTY_COUNT_OFFSET) {
      return this.dirtyRegions.length + (this.pendingRegion ? 1 : 0);
    }

    if (offset >= FRAMEBUFFER_OFFSET && offset < FRAMEBUFFER_OFFSET + this.buffer.length) {
      return this.buffer[offset - FRAMEBUFFER_OFFSET];
    }

    throw new RangeError(`BitmapDisplayDevice read offset out of range: ${offset}`);
  }

  write(offset: number, value: number | string | Uint8Array): void {
    if (offset === CONTROL_FLUSH_OFFSET) {
      this.flushDirtyRegions();
      return;
    }

    if (offset < FRAMEBUFFER_OFFSET || offset >= FRAMEBUFFER_OFFSET + this.buffer.length) {
      throw new RangeError(`BitmapDisplayDevice write offset out of range: ${offset}`);
    }

    if (typeof value === "number") {
      this.writeByte(offset - FRAMEBUFFER_OFFSET, value & 0xff);
      return;
    }

    if (typeof value === "string") {
      this.writeByte(offset - FRAMEBUFFER_OFFSET, value.charCodeAt(0) & 0xff);
      return;
    }

    this.writeBytes(offset - FRAMEBUFFER_OFFSET, value);
  }

  getDirtyRegions(): DirtyRegion[] {
    return [...this.dirtyRegions, ...(this.pendingRegion ? [this.pendingRegion] : [])];
  }

  getBuffer(): Uint8Array {
    return this.buffer;
  }

  private writeByte(index: number, byte: number): void {
    const normalizedIndex = Math.max(0, Math.min(this.buffer.length - 1, index));
    if (this.buffer[normalizedIndex] === byte) {
      return;
    }

    this.buffer[normalizedIndex] = byte;
    this.markDirtyByIndex(normalizedIndex);
  }

  private writeBytes(startIndex: number, bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; i++) {
      this.writeByte(startIndex + i, bytes[i]);
    }
  }

  private markDirtyByIndex(index: number): void {
    const pixelIndex = Math.floor(index / 4);
    const x = pixelIndex % this.width;
    const y = Math.floor(pixelIndex / this.width);
    this.expandDirtyRegion(x, y);
  }

  private expandDirtyRegion(x: number, y: number): void {
    if (!this.pendingRegion) {
      this.pendingRegion = { x, y, width: 1, height: 1 };
      return;
    }

    const withinExisting =
      x >= this.pendingRegion.x - 1 &&
      x <= this.pendingRegion.x + this.pendingRegion.width &&
      y >= this.pendingRegion.y - 1 &&
      y <= this.pendingRegion.y + this.pendingRegion.height;

    if (withinExisting) {
      const minX = Math.min(this.pendingRegion.x, x);
      const minY = Math.min(this.pendingRegion.y, y);
      const maxX = Math.max(this.pendingRegion.x + this.pendingRegion.width - 1, x);
      const maxY = Math.max(this.pendingRegion.y + this.pendingRegion.height - 1, y);
      this.pendingRegion = {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };
      return;
    }

    this.dirtyRegions.push(this.pendingRegion);
    this.pendingRegion = { x, y, width: 1, height: 1 };
  }

  private flushDirtyRegions(): void {
    if (this.pendingRegion) {
      this.dirtyRegions.push(this.pendingRegion);
      this.pendingRegion = null;
    }

    if (this.dirtyRegions.length === 0) {
      return;
    }

    const regions = [...this.dirtyRegions];
    this.dirtyRegions.length = 0;
    this.onFlush?.(regions, this.buffer);
  }
}
