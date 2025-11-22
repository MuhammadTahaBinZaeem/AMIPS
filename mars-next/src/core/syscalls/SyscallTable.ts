import { Memory } from "../memory/Memory";
import { MachineState } from "../state/MachineState";
import { TerminalDevice } from "../devices/TerminalDevice";
import { SyscallDevices, SyscallHandler, InputDevice } from "./SyscallHandlers";

export type SyscallImplementation = (state: MachineState) => void;

export class SyscallTable {
  private readonly memory: Memory;
  private readonly devices: SyscallDevices;
  private readonly handlers = new Map<number, SyscallImplementation>();

  constructor(memory: Memory, devices: SyscallDevices = {}, customHandlers: Record<string, SyscallHandler> = {}) {
    this.memory = memory;
    this.devices = devices;
    this.registerDefaults(customHandlers);
  }

  register(number: number, handler: SyscallImplementation): void {
    if (this.handlers.has(number)) {
      throw new Error(`Syscall already registered: ${number}`);
    }
    this.handlers.set(number, handler);
  }

  handle(number: number, state: MachineState): void {
    const handler = this.handlers.get(number);
    if (!handler) {
      throw new Error(`unimplemented syscall: ${number}`);
    }

    handler(state);
  }

  private registerDefaults(handlers: Record<string, SyscallHandler>): void {
    this.register(1, (state) => {
      const value = state.getRegister(4);
      if (handlers.print_int) {
        try {
          handlers.print_int(value);
          return;
        } catch {
          // Fall through to device-backed implementation if handler cannot run
        }
      }
      this.writeToTerminal(value);
    });

    this.register(4, (state) => {
      const address = state.getRegister(4);
      const message = this.readNullTerminatedString(address);
      if (handlers.print_string) {
        try {
          handlers.print_string(message);
          return;
        } catch {
          // Fall back to device-backed implementation
        }
      }
      this.writeToTerminal(message);
    });

    this.register(5, (state) => {
      let value: number;
      if (handlers.read_int) {
        try {
          value = Number(handlers.read_int());
        } catch {
          value = this.requireDevice<InputDevice>("input").readInt();
        }
      } else {
        value = this.requireDevice<InputDevice>("input").readInt();
      }
      state.setRegister(2, value);
    });

    this.register(10, (state) => {
      state.terminate();
    });
  }

  private requireDevice<T>(key: keyof SyscallDevices): T {
    const device = this.devices[key];
    if (!device) {
      const name = `${String(key).charAt(0).toUpperCase()}${String(key).slice(1)}Device`;
      throw new Error(`${name} is not available in this environment`);
    }
    return device as T;
  }

  private writeToTerminal(value: number | string): void {
    const terminal = this.requireDevice<TerminalDevice | { write?: (message: string) => void }>("terminal");

    if (typeof value === "number" && typeof (terminal as TerminalDevice).printInt === "function") {
      (terminal as TerminalDevice).printInt(value);
      return;
    }

    if (typeof value === "string" && typeof (terminal as TerminalDevice).printString === "function") {
      (terminal as TerminalDevice).printString(value);
      return;
    }

    if (typeof (terminal as { write?: (message: string) => void }).write === "function") {
      (terminal as { write: (message: string) => void }).write(String(value));
      return;
    }

    throw new Error("Terminal device does not support writing output");
  }

  private readNullTerminatedString(baseAddress: number): string {
    const bytes: number[] = [];
    let offset = 0;

    while (true) {
      const value = this.memory.readByte(baseAddress + offset);
      if (value === 0) break;
      bytes.push(value);
      offset += 1;
    }

    return String.fromCharCode(...bytes);
  }
}
