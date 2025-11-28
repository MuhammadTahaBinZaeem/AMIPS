import { Device, DeviceData, InterruptHandler } from "./Device";

const READY_MASK = 0x1;
const INTERRUPT_ENABLE_MASK = 0x2;

const CONTROL_START = 0x0;
const CONTROL_END = 0x3;
const DATA_START = 0x4;
const DATA_END = 0x7;

const DATA_HIGH_BYTE_INDEX = 2;
const DATA_LOW_BYTE_INDEX = 3;

interface PendingKey {
  value: number;
  consumedLow: boolean;
  consumedHigh: boolean;
}

export class KeyboardDevice implements Device {
  private control = 0;
  private queue: number[] = [];
  private activeKey: PendingKey | null = null;
  private interruptHandler: InterruptHandler | null = null;

  read(offset: number): DeviceData {
    if (offset >= CONTROL_START && offset <= CONTROL_END) {
      return this.readControlByte(offset);
    }

    if (offset >= DATA_START && offset <= DATA_END) {
      return this.readDataByte(offset - DATA_START);
    }

    throw new RangeError(`KeyboardDevice read offset out of range: ${offset}`);
  }

  write(offset: number, value: number | string | Uint8Array): void {
    if (offset < CONTROL_START || offset > CONTROL_END) {
      throw new RangeError(`KeyboardDevice write offset out of range: ${offset}`);
    }

    const numeric = Number(value) & 0xff;
    const interruptEnabled = (numeric & INTERRUPT_ENABLE_MASK) !== 0;
    this.setInterruptEnabled(interruptEnabled);
    this.maybeInterrupt();
  }

  queueInput(...values: Array<number | string>): void {
    for (const value of values) {
      if (typeof value === "string") {
        for (const char of value) {
          this.enqueueKeycode(char.codePointAt(0) ?? 0);
        }
      } else {
        this.enqueueKeycode(value);
      }
    }
  }

  onInterrupt(handler: InterruptHandler): void {
    this.interruptHandler = handler;
    this.maybeInterrupt();
  }

  private readControlByte(byteOffset: number): number {
    const shift = 8 * (CONTROL_END - byteOffset);
    return (this.control >> shift) & 0xff;
  }

  private readDataByte(byteOffset: number): number {
    this.ensureActiveKey(byteOffset);
    const activeKey = this.activeKey;
    if (!activeKey) {
      return 0;
    }

    const shift = 8 * (DATA_END - DATA_START - byteOffset);
    const byte = (activeKey.value >> shift) & 0xff;
    this.markByteConsumed(byteOffset);
    return byte;
  }

  private ensureActiveKey(requestedByte: number): void {
    if (!this.activeKey && this.queue.length > 0) {
      const value = this.queue.shift()!;
      this.activeKey = {
        value,
        consumedLow: requestedByte === DATA_LOW_BYTE_INDEX,
        consumedHigh: requestedByte === DATA_HIGH_BYTE_INDEX,
      };
      this.updateReadyFlag(true);
      return;
    }

    if (!this.activeKey) {
      this.updateReadyFlag(false);
    }
  }

  private markByteConsumed(byteIndex: number): void {
    if (!this.activeKey) {
      this.updateReadyFlag(false);
      return;
    }

    if (byteIndex === DATA_LOW_BYTE_INDEX) {
      this.activeKey.consumedLow = true;
    } else if (byteIndex === DATA_HIGH_BYTE_INDEX) {
      this.activeKey.consumedHigh = true;
    }

    if (this.activeKey.consumedLow && this.activeKey.consumedHigh) {
      this.activeKey = null;
    }

    this.updateReadyFlag(this.queue.length > 0 || this.activeKey !== null);
  }

  private updateReadyFlag(isReady: boolean): void {
    if (isReady) {
      this.control |= READY_MASK;
    } else {
      this.control &= ~READY_MASK;
    }
  }

  private setInterruptEnabled(enabled: boolean): void {
    this.control = (this.control & READY_MASK) | (enabled ? INTERRUPT_ENABLE_MASK : 0);
  }

  private isInterruptEnabled(): boolean {
    return (this.control & INTERRUPT_ENABLE_MASK) !== 0;
  }

  private maybeInterrupt(): void {
    if (this.isInterruptEnabled() && (this.queue.length > 0 || this.activeKey)) {
      this.updateReadyFlag(true);
      this.interruptHandler?.(this);
    }
  }

  private enqueueKeycode(value: number): void {
    const keycode = value & 0xffff;
    this.queue.push(keycode);
    this.updateReadyFlag(true);
    this.maybeInterrupt();
  }
}
