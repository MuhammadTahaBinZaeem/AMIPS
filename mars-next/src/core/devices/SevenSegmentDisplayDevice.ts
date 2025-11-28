import { Device, DeviceData } from "./Device";

/**
 * Stores two hexadecimal digits for a seven-segment display. Offsets 0 and 1
 * represent the lower and upper digits respectively.
 */
export class SevenSegmentDisplayDevice implements Device {
  private digits: [number, number] = [0, 0];

  read(offset: number): DeviceData {
    const index = offset >> 0;
    if (index < 0 || index > 1) {
      return 0;
    }

    return this.digits[index] & 0xff;
  }

  write(offset: number, value: number | string | Uint8Array): void {
    if (typeof value !== "number") {
      return;
    }

    const index = offset >> 0;
    if (index < 0 || index > 1) {
      return;
    }

    this.digits[index] = value & 0xff;
  }
}
