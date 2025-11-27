import { Device, DeviceData, InterruptHandler } from "./Device";

const READY_MASK = 0x1;
const INTERRUPT_ENABLE_MASK = 0x2;

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
    switch (offset) {
      case 0:
        return this.control;
      case 4:
        return this.readKeyByte(0);
      case 6:
        return this.readKeyByte(1);
      default:
        throw new RangeError(`KeyboardDevice read offset out of range: ${offset}`);
    }
  }

  write(offset: number, value: number | string | Uint8Array): void {
    if (offset !== 0) {
      throw new RangeError(`KeyboardDevice write offset out of range: ${offset}`);
    }

    const numeric = Number(value);
    const interruptEnabled = (numeric & INTERRUPT_ENABLE_MASK) !== 0;
    this.control = (this.control & READY_MASK) | (interruptEnabled ? INTERRUPT_ENABLE_MASK : 0);
    this.maybeInterrupt();
  }

  queueInput(value: number | string): void {
    const numeric = typeof value === "number" ? value : value.charCodeAt(0);
    const keycode = numeric & 0xffff;
    this.queue.push(keycode);
    this.updateReadyFlag(true);
    this.maybeInterrupt();
  }

  onInterrupt(handler: InterruptHandler): void {
    this.interruptHandler = handler;
    this.maybeInterrupt();
  }

  private readKeyByte(byteIndex: 0 | 1): number {
    this.ensureActiveKey(byteIndex);
    if (!this.activeKey) {
      return 0;
    }

    const byte = byteIndex === 0 ? this.activeKey.value & 0xff : (this.activeKey.value >> 8) & 0xff;
    this.markByteConsumed(byteIndex);
    return byte;
  }

  private ensureActiveKey(requestedByte: 0 | 1): void {
    if (!this.activeKey && this.queue.length > 0) {
      const value = this.queue.shift()!;
      this.activeKey = { value, consumedLow: requestedByte === 0, consumedHigh: requestedByte === 1 };
      this.updateReadyFlag(true);
      return;
    }

    if (!this.activeKey) {
      this.updateReadyFlag(false);
    }
  }

  private markByteConsumed(byteIndex: 0 | 1): void {
    if (!this.activeKey) {
      this.updateReadyFlag(false);
      return;
    }

    if (byteIndex === 0) {
      this.activeKey.consumedLow = true;
    } else {
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

  private isInterruptEnabled(): boolean {
    return (this.control & INTERRUPT_ENABLE_MASK) !== 0;
  }

  private maybeInterrupt(): void {
    if (this.isInterruptEnabled() && (this.queue.length > 0 || this.activeKey)) {
      this.updateReadyFlag(true);
      this.interruptHandler?.(this);
    }
  }
}
