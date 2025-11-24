import { Device, DeviceData } from "./Device";

class RandomStream {
  private state: number;

  constructor(seed: number = Date.now()) {
    this.state = seed >>> 0;
  }

  seed(value: number): void {
    this.state = value >>> 0;
  }

  nextInt(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state | 0;
  }
}

/**
 * Memory-mapped random stream device inspired by the legacy RandomStreams helper.
 * Reading from offset N*4 produces the next 32-bit random int from stream N; writing seeds the stream.
 */
export class RandomStreamDevice implements Device {
  private readonly streams = new Map<number, RandomStream>();

  read(offset: number): DeviceData {
    const index = this.normalizeIndex(offset);
    return this.getStream(index).nextInt();
  }

  write(offset: number, value: number | string | Uint8Array): void {
    const index = this.normalizeIndex(offset);
    const seed = typeof value === "number" ? value : Number(value);
    this.getStream(index).seed(seed);
  }

  reset(): void {
    this.streams.clear();
  }

  private getStream(index: number): RandomStream {
    let stream = this.streams.get(index);
    if (!stream) {
      stream = new RandomStream();
      this.streams.set(index, stream);
    }
    return stream;
  }

  private normalizeIndex(offset: number): number {
    if (offset % 4 !== 0) {
      throw new RangeError(`RandomStreamDevice offsets must be word aligned: ${offset}`);
    }
    return offset >>> 2;
  }
}
