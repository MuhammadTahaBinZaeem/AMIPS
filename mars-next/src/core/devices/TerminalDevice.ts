import { Device, DeviceData } from "./Device";

export class TerminalDevice implements Device {
  private readonly outputLog: string[] = [];
  private readonly inputQueue: string[] = [];
  private readonly sink: (message: string) => void;

  constructor(sink: (message: string) => void = console.log) {
    this.sink = sink;
  }

  read(offset: number): DeviceData {
    if (offset !== 0) {
      throw new RangeError(`TerminalDevice read offset out of range: ${offset}`);
    }

    return this.inputQueue.shift() ?? null;
  }

  write(offset: number, value: number | string | Uint8Array): void {
    if (offset !== 0) {
      throw new RangeError(`TerminalDevice write offset out of range: ${offset}`);
    }

    const message = this.normalizeValue(value);
    this.outputLog.push(message);
    this.sink(message);
  }

  printString(value: string): void {
    this.write(0, value);
  }

  printInt(value: number): void {
    this.write(0, value);
  }

  readString(): string {
    const value = this.read(0);
    if (value === null) {
      throw new Error("Terminal input buffer is empty");
    }
    return String(value);
  }

  queueInput(...values: string[]): void {
    this.inputQueue.push(...values);
  }

  getOutputLog(): string[] {
    return [...this.outputLog];
  }

  private normalizeValue(value: number | string | Uint8Array): string {
    if (typeof value === "string") return value;
    if (typeof value === "number") return value.toString();
    return new TextDecoder().decode(value);
  }
}
