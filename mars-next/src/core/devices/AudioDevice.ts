import { Device, DeviceData } from "./Device";

/**
 * Minimal audio device placeholder. Offset 0 stores the most recent sample
 * value, while offset 4 toggles whether the device is enabled. Reads return
 * the last written values.
 */
export class AudioDevice implements Device {
  private enabled = false;
  private lastSample = 0;

  read(offset: number): DeviceData {
    if (offset >= 4) {
      return this.enabled ? 1 : 0;
    }

    return this.lastSample | 0;
  }

  write(offset: number, value: number | string | Uint8Array): void {
    if (typeof value !== "number") {
      return;
    }

    if (offset >= 4) {
      this.enabled = value !== 0;
      return;
    }

    this.lastSample = value | 0;
  }
}
