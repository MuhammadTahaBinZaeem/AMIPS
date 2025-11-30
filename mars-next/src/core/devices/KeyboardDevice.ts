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
  consumedHigh: boolean;
  consumedLow: boolean;
}

export interface KeyboardDeviceOptions {
  onInterrupt?: InterruptHandler;
}

export class KeyboardDevice implements Device {
  private control = 0;
  private readonly queue: number[] = [];
  private activeKey: PendingKey | null = null;
  private interruptHandler: InterruptHandler | null = null;

  constructor(options: KeyboardDeviceOptions | InterruptHandler | undefined = undefined) {
    if (typeof options === "function") {
      this.interruptHandler = options;
    } else {
      this.interruptHandler = options?.onInterrupt ?? null;
    }
  }

  getQueueState(): { active: number | null; queued: number[] } {
    return {
      active: this.activeKey ? this.activeKey.value : null,
      queued: [...this.queue],
    };
  }

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
    this.setInterruptEnabled((numeric & INTERRUPT_ENABLE_MASK) !== 0);
    this.signalInterruptIfNeeded();
  }

  queueInput(...values: Array<number | string>): void {
    for (const rawValue of values) {
      if (typeof rawValue === "string") {
        for (const char of rawValue) {
          this.enqueueKey(char.codePointAt(0) ?? 0);
        }
      } else {
        this.enqueueKey(rawValue);
      }
    }
  }

  onInterrupt(handler: InterruptHandler): void {
    this.interruptHandler = handler;
    this.signalInterruptIfNeeded();
  }

  private readControlByte(byteOffset: number): number {
    const shift = 8 * (CONTROL_END - byteOffset);
    return (this.control >> shift) & 0xff;
  }

  private readDataByte(byteOffset: number): number {
    this.ensureActiveKey();

    if (!this.activeKey) {
      this.updateReadyFlag(false);
      return 0;
    }

    const shift = 8 * (DATA_END - DATA_START - byteOffset);
    const byte = (this.activeKey.value >> shift) & 0xff;

    if (byteOffset === DATA_HIGH_BYTE_INDEX) {
      this.activeKey.consumedHigh = true;
    } else if (byteOffset === DATA_LOW_BYTE_INDEX) {
      this.activeKey.consumedLow = true;
    }

    this.finishKeyIfNeeded();
    return byte;
  }

  private enqueueKey(value: number): void {
    const keyCode = value & 0xffff;
    this.queue.push(keyCode);
    this.ensureActiveKey();
    this.updateReadyFlag(true);
    this.signalInterruptIfNeeded();
  }

  private ensureActiveKey(): void {
    if (this.activeKey || this.queue.length === 0) {
      this.updateReadyFlag(this.activeKey !== null || this.queue.length > 0);
      return;
    }

    const value = this.queue.shift()!;
    this.activeKey = {
      value,
      consumedHigh: false,
      consumedLow: false,
    };
    this.updateReadyFlag(true);
  }

  private finishKeyIfNeeded(): void {
    if (!this.activeKey) {
      this.updateReadyFlag(false);
      return;
    }

    if (this.activeKey.consumedHigh && this.activeKey.consumedLow) {
      this.activeKey = null;
      this.ensureActiveKey();
      return;
    }

    this.updateReadyFlag(true);
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

  private signalInterruptIfNeeded(): void {
    if (this.isInterruptEnabled() && (this.activeKey || this.queue.length > 0)) {
      this.updateReadyFlag(true);
      this.interruptHandler?.(this);
    }
  }
}
