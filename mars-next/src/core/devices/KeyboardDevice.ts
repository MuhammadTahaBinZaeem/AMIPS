import { Device, DeviceData, InterruptHandler } from "./Device";

const READY_MASK = 0x1;
const INTERRUPT_ENABLE_MASK = 0x2;

export class KeyboardDevice implements Device {
  private control = 0;
  private data = 0;
  private readonly listeners: Array<(char: number) => void> = [];
  private interruptHandler: InterruptHandler | null = null;

  read(offset: number): DeviceData {
    switch (offset) {
      case 0:
        return this.control;
      case 4: {
        const value = this.data & 0xff;
        this.clearReady();
        return value;
      }
      default:
        throw new RangeError(`KeyboardDevice read offset out of range: ${offset}`);
    }
  }

  write(offset: number, value: number | string | Uint8Array): void {
    if (offset === 0) {
      // allow software acknowledgement of the ready bit
      this.control = this.preserveReadyBits(Number(value));
      this.maybeInterrupt();
      return;
    }

    throw new RangeError(`KeyboardDevice write offset out of range: ${offset}`);
  }

  queueInput(value: number | string): void {
    const byte = typeof value === "number" ? value : value.charCodeAt(0);
    this.data = byte & 0xff;
    this.control = this.control | READY_MASK;
    this.listeners.forEach((listener) => listener(this.data));
    this.maybeInterrupt();
  }

  isReady(): boolean {
    return (this.control & READY_MASK) !== 0;
  }

  onInterrupt(handler: InterruptHandler): void {
    this.interruptHandler = handler;
    this.maybeInterrupt();
  }

  onKey(listener: (char: number) => void): void {
    this.listeners.push(listener);
  }

  private clearReady(): void {
    this.control = this.control & ~READY_MASK;
  }

  private isInterruptEnabled(): boolean {
    return (this.control & INTERRUPT_ENABLE_MASK) !== 0;
  }

  private maybeInterrupt(): void {
    if (this.isReady() && this.isInterruptEnabled()) {
      this.interruptHandler?.(this);
    }
  }

  private preserveReadyBits(value: number): number {
    const preservedReady = this.control & READY_MASK;
    return (value & ~READY_MASK) | preservedReady;
  }
}
