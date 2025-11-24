import { Device, DeviceData, InterruptHandler } from "./Device";

const READY_MASK = 0x1;
const INTERRUPT_ENABLE_MASK = 0x2;

export class DisplayDevice implements Device {
  private control = READY_MASK;
  private data = 0;
  private transmitDelayMs = 0;
  private readonly sink: (char: string) => void;
  private readonly output: string[] = [];
  private interruptHandler: InterruptHandler | null = null;

  constructor(sink: (char: string) => void = (char) => process.stdout.write(char)) {
    this.sink = sink;
  }

  read(offset: number): DeviceData {
    switch (offset) {
      case 0:
        return this.control;
      case 4:
        return this.data & 0xff;
      default:
        throw new RangeError(`DisplayDevice read offset out of range: ${offset}`);
    }
  }

  write(offset: number, value: number | string | Uint8Array): void {
    if (offset === 0) {
      this.control = this.preserveReadyBits(Number(value));
      this.maybeInterrupt();
      return;
    }

    if (offset !== 4) {
      throw new RangeError(`DisplayDevice write offset out of range: ${offset}`);
    }

    if (!this.isReady()) {
      throw new Error("DisplayDevice is not ready to transmit");
    }

    const byte = typeof value === "number" ? value : typeof value === "string" ? value.charCodeAt(0) : value[0];
    this.data = byte & 0xff;
    this.control &= ~READY_MASK;
    this.emitCharacter(this.data);
  }

  onInterrupt(handler: InterruptHandler): void {
    this.interruptHandler = handler;
    this.maybeInterrupt();
  }

  setTransmitDelayMs(delay: number): void {
    this.transmitDelayMs = Math.max(0, delay);
  }

  isReady(): boolean {
    return (this.control & READY_MASK) !== 0;
  }

  private isInterruptEnabled(): boolean {
    return (this.control & INTERRUPT_ENABLE_MASK) !== 0;
  }

  getOutput(): string[] {
    return [...this.output];
  }

  private emitCharacter(byte: number): void {
    const char = String.fromCharCode(byte & 0xff);
    this.output.push(char);
    this.sink(char);

    if (this.transmitDelayMs > 0) {
      setTimeout(() => this.markReady(), this.transmitDelayMs);
    } else {
      this.markReady();
    }
  }

  private markReady(): void {
    this.control |= READY_MASK;
    this.maybeInterrupt();
  }

  private maybeInterrupt(): void {
    if (this.isReady() && this.isInterruptEnabled()) {
      this.interruptHandler?.();
    }
  }

  private preserveReadyBits(value: number): number {
    const preservedReady = this.control & READY_MASK;
    return (value & ~READY_MASK) | preservedReady;
  }
}
