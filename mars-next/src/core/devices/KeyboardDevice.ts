import { Device, DeviceData, InterruptHandler } from "./Device";

const QUEUE_CAPACITY = 14;
const QUEUE_HEADER_BYTES = 2;
const QUEUE_BYTE_LENGTH = QUEUE_HEADER_BYTES + QUEUE_CAPACITY;

type KeyboardQueueKind = "down" | "up";

export interface KeyboardDeviceOptions {
  onInterrupt?: InterruptHandler;
}

class KeyboardEventQueue {
  private readonly bytes: number[] = [];

  enqueue(values: number[], onEnqueue: () => void): void {
    for (const value of values) {
      if (this.bytes.length >= QUEUE_CAPACITY) {
        this.bytes.shift();
      }
      this.bytes.push(value & 0xff);
    }

    if (values.length > 0) {
      onEnqueue();
    }
  }

  clear(): void {
    this.bytes.length = 0;
  }

  dequeue(): number | null {
    return this.bytes.shift() ?? null;
  }

  length(): number {
    return this.bytes.length;
  }

  snapshot(): number[] {
    return [...this.bytes];
  }

  read(offset: number): number {
    if (offset === 0) {
      return this.length();
    }

    if (offset === 1) {
      return 0;
    }

    const index = offset - QUEUE_HEADER_BYTES;
    if (index < 0 || index >= QUEUE_CAPACITY) {
      throw new RangeError(`KeyboardDevice queue read offset out of range: ${offset}`);
    }

    return this.bytes[index] ?? 0;
  }

  write(offset: number, value: number): void {
    if (offset === 1 && (value & 0xff) === 1) {
      this.clear();
      return;
    }

    if (offset < 0 || offset >= QUEUE_BYTE_LENGTH) {
      throw new RangeError(`KeyboardDevice queue write offset out of range: ${offset}`);
    }
  }
}

class KeyboardQueueView implements Device {
  constructor(private readonly device: KeyboardDevice, private readonly kind: KeyboardQueueKind) {}

  read(offset: number): DeviceData {
    return this.device.readQueue(this.kind, offset);
  }

  write(offset: number, value: number | string | Uint8Array): void {
    this.device.writeQueue(this.kind, offset, value);
  }

  onInterrupt(handler: InterruptHandler): void {
    this.device.onInterrupt(handler);
  }
}

export class KeyboardDevice implements Device {
  private readonly queues: Record<KeyboardQueueKind, KeyboardEventQueue> = {
    down: new KeyboardEventQueue(),
    up: new KeyboardEventQueue(),
  };

  private readonly views: Record<KeyboardQueueKind, KeyboardQueueView> = {
    down: new KeyboardQueueView(this, "down"),
    up: new KeyboardQueueView(this, "up"),
  };

  private interruptHandler: InterruptHandler | null = null;

  constructor(options: KeyboardDeviceOptions | InterruptHandler | undefined = undefined) {
    if (typeof options === "function") {
      this.interruptHandler = options;
    } else {
      this.interruptHandler = options?.onInterrupt ?? null;
    }
  }

  getQueueState(): { down: number[]; up: number[] } {
    return {
      down: this.queues.down.snapshot(),
      up: this.queues.up.snapshot(),
    };
  }

  getQueueDevice(kind: KeyboardQueueKind): Device {
    return this.views[kind];
  }

  getQueueLength(kind: KeyboardQueueKind): number {
    return this.queues[kind].length();
  }

  dequeue(kind: KeyboardQueueKind = "down"): number | null {
    const value = this.queues[kind].dequeue();
    return value !== null ? value & 0xff : null;
  }

  queueInput(...values: Array<number | string>): void {
    this.queueKeyDown(...values);
    this.queueKeyUp(...values);
  }

  queueKeyDown(...values: Array<number | string>): void {
    this.queue("down", ...values);
  }

  queueKeyUp(...values: Array<number | string>): void {
    this.queue("up", ...values);
  }

  queueFromBytes(kind: KeyboardQueueKind, bytes: number[]): void {
    this.enqueue(kind, bytes);
  }

  read(offset: number): DeviceData {
    return this.readQueue("down", offset);
  }

  write(offset: number, value: number | string | Uint8Array): void {
    this.writeQueue("down", offset, value);
  }

  onInterrupt(handler: InterruptHandler): void {
    this.interruptHandler = handler;
  }

  private readQueue(kind: KeyboardQueueKind, offset: number): number {
    return this.queues[kind].read(offset);
  }

  private writeQueue(kind: KeyboardQueueKind, offset: number, value: number | string | Uint8Array): void {
    const numeric = typeof value === "number" ? value : typeof value === "string" ? value.charCodeAt(0) : value[0];
    this.queues[kind].write(offset, numeric & 0xff);
  }

  private queue(kind: KeyboardQueueKind, ...values: Array<number | string>): void {
    const bytes: number[] = [];

    for (const rawValue of values) {
      if (typeof rawValue === "string") {
        for (const char of rawValue) {
          bytes.push(char.codePointAt(0) ?? 0);
        }
      } else {
        const numeric = Number(rawValue) >>> 0;
        if (numeric > 0xff) {
          bytes.push((numeric >>> 8) & 0xff, numeric & 0xff);
        } else {
          bytes.push(numeric & 0xff);
        }
      }
    }

    this.enqueue(kind, bytes);
  }

  private enqueue(kind: KeyboardQueueKind, bytes: number[]): void {
    this.queues[kind].enqueue(bytes, () => this.interruptHandler?.(this));
  }
}

export const KEYBOARD_QUEUE_CAPACITY = QUEUE_CAPACITY;
export const KEYBOARD_QUEUE_BYTE_LENGTH = QUEUE_BYTE_LENGTH;
