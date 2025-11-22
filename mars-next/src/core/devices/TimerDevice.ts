import { Device, DeviceData } from "./Device";

export class TimerDevice implements Device {
  private nowMs = 0;
  private intervalMs: number | null = null;
  private nextDeadline: number | null = null;
  private interruptHandler: (() => void) | null = null;

  read(offset: number): DeviceData {
    switch (offset) {
      case 0:
        return this.nowMs;
      case 4:
        return this.intervalMs ?? 0;
      default:
        throw new RangeError(`TimerDevice read offset out of range: ${offset}`);
    }
  }

  write(offset: number, value: number | string | Uint8Array): void {
    if (offset !== 4) {
      throw new RangeError(`TimerDevice write offset out of range: ${offset}`);
    }

    const interval = typeof value === "number" ? value : Number(value);
    this.setIntervalMs(interval);
  }

  getCurrentTime(): number {
    return this.nowMs;
  }

  setIntervalMs(interval: number): void {
    if (interval <= 0 || Number.isNaN(interval)) {
      this.intervalMs = null;
      this.nextDeadline = null;
      return;
    }

    this.intervalMs = interval;
    this.nextDeadline = this.nowMs + interval;
  }

  onInterrupt(handler: () => void): void {
    this.interruptHandler = handler;
  }

  tick(elapsedMs: number): void {
    if (elapsedMs < 0) {
      throw new Error("TimerDevice cannot tick backwards");
    }

    this.nowMs += elapsedMs;

    if (this.intervalMs === null || this.nextDeadline === null) return;

    while (this.nowMs >= this.nextDeadline) {
      this.interruptHandler?.();
      this.nextDeadline += this.intervalMs;
    }
  }

  reset(): void {
    this.nowMs = 0;
    this.nextDeadline = this.intervalMs ? this.intervalMs : null;
  }
}
