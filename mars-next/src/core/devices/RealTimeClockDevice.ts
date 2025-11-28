import { DeviceData } from "./Device";
import { TimerDevice } from "./TimerDevice";

/**
 * Real-time clock exposes wall-clock milliseconds split across two registers.
 * Offset 0: low 32 bits, offset 4: high 32 bits. Writes are ignored.
 */
export class RealTimeClockDevice extends TimerDevice {
  read(offset: number): DeviceData {
    const now = Date.now();
    const low = now >>> 0;
    const high = Math.floor(now / 0x100000000) >>> 0;

    if (offset >= 4) {
      return high | 0;
    }

    return low | 0;
  }

  write(_offset: number, _value: number | string | Uint8Array): void {
    // Real-time clock is read-only; ignore writes.
  }
}
