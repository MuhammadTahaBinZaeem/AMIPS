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
  onFlush?: (regions: DirtyRegion[], pixels: Uint8Array) => void;
}

const CONTROL_WIDTH_OFFSET = 0;
const CONTROL_HEIGHT_OFFSET = 4;
const CONTROL_DIRTY_COUNT_OFFSET = 8;
const CONTROL_FLUSH_OFFSET = 12;
const FRAMEBUFFER_OFFSET = 16;

export class BitmapDisplayDevice implements Device {
  readonly width: number;
  readonly height: number;

  private readonly pixels: Uint8Array;
  private readonly dirtyRegions: DirtyRegion[] = [];
  private dirtyRegion: DirtyRegion | null = null;
  private readonly onFlush?: (regions: DirtyRegion[], pixels: Uint8Array) => void;

  constructor(options: BitmapDisplayOptions = {}) {
    this.width = Math.max(1, options.width ?? 10);
    this.height = Math.max(1, options.height ?? 6);

    const bufferLength = this.width * this.height * 4;
    const maxBufferLength = 0x100 - FRAMEBUFFER_OFFSET;
    if (bufferLength > maxBufferLength) {
      throw new RangeError(
        `BitmapDisplayDevice buffer too large: ${bufferLength} bytes (max ${maxBufferLength})`,
      );
    }

    this.pixels = new Uint8Array(bufferLength);
    this.onFlush = options.onFlush;
  }

  get byteLength(): number {
    return 0x100;
  }

  read(offset: number): DeviceData {
    if (offset === CONTROL_WIDTH_OFFSET) return this.width;
    if (offset === CONTROL_HEIGHT_OFFSET) return this.height;
    if (offset === CONTROL_DIRTY_COUNT_OFFSET) return this.getDirtyRegions().length;

    if (offset >= FRAMEBUFFER_OFFSET && offset < this.byteLength) {
      const index = offset - FRAMEBUFFER_OFFSET;
      return index < this.pixels.length ? this.pixels[index] : 0;
    }

    throw new RangeError(`BitmapDisplayDevice read offset out of range: ${offset}`);
  }

  write(offset: number, value: number | string | Uint8Array): void {
    if (offset === CONTROL_FLUSH_OFFSET) {
      this.flush();
      return;
    }

    if (offset < FRAMEBUFFER_OFFSET || offset >= this.byteLength) {
      throw new RangeError(`BitmapDisplayDevice write offset out of range: ${offset}`);
    }

    const index = offset - FRAMEBUFFER_OFFSET;
    if (index >= this.pixels.length) {
      return;
    }

    if (typeof value === "number") {
      this.writeByte(index, value & 0xff);
      return;
    }

    if (typeof value === "string") {
      this.writeByte(index, value.charCodeAt(0) & 0xff);
      return;
    }

    this.writeBytes(index, value);
  }

  getBuffer(): Uint8Array {
    return this.pixels;
  }

  getDirtyRegions(): DirtyRegion[] {
    return [...this.dirtyRegions, ...(this.dirtyRegion ? [this.dirtyRegion] : [])];
  }

  writeByte(address: number, value: number): void {
    const normalized = Math.max(0, Math.min(this.pixels.length - 1, address));
    if (this.pixels[normalized] === value) return;

    this.pixels[normalized] = value;
    this.markDirty(normalized);
  }

  writeBytes(address: number, values: Uint8Array): void {
    for (let i = 0; i < values.length; i++) {
      this.writeByte(address + i, values[i]);
    }
  }

  flush(): void {
    if (this.dirtyRegion) {
      this.dirtyRegions.push(this.dirtyRegion);
      this.dirtyRegion = null;
    }

    if (this.dirtyRegions.length === 0) return;

    const regions = [...this.dirtyRegions];
    this.dirtyRegions.length = 0;
    this.onFlush?.(regions, this.pixels);
  }

  private markDirty(bufferIndex: number): void {
    const pixelIndex = Math.floor(bufferIndex / 4);
    const x = pixelIndex % this.width;
    const y = Math.floor(pixelIndex / this.width);

    if (!this.dirtyRegion) {
      this.dirtyRegion = { x, y, width: 1, height: 1 };
      return;
    }

    const minX = Math.min(this.dirtyRegion.x, x);
    const minY = Math.min(this.dirtyRegion.y, y);
    const maxX = Math.max(this.dirtyRegion.x + this.dirtyRegion.width - 1, x);
    const maxY = Math.max(this.dirtyRegion.y + this.dirtyRegion.height - 1, y);
    const expanded = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };

    const overlapsExisting =
      expanded.x <= this.dirtyRegion.x + this.dirtyRegion.width &&
      expanded.y <= this.dirtyRegion.y + this.dirtyRegion.height &&
      expanded.x + expanded.width >= this.dirtyRegion.x &&
      expanded.y + expanded.height >= this.dirtyRegion.y;

    if (overlapsExisting) {
      this.dirtyRegion = expanded;
      return;
    }

    this.dirtyRegions.push(this.dirtyRegion);
    this.dirtyRegion = { x, y, width: 1, height: 1 };
  }
}
