import { FileDevice } from "../devices/FileDevice";
import { TerminalDevice } from "../devices/TerminalDevice";
import { TimerDevice } from "../devices/TimerDevice";

export type SyscallHandler = (...args: unknown[]) => unknown;

export interface SyscallDevices {
  terminal?: TerminalDevice;
  file?: FileDevice;
  timer?: TimerDevice;
  input?: InputDevice;
}

export function createDefaultSyscallHandlers(devices: SyscallDevices = {}): Record<string, SyscallHandler> {
  const { terminal, file, timer, input } = devices;

  return {
    print_int: (value: unknown) => requireDevice(terminal, "TerminalDevice").printInt(Number(value)),
    print_int_hex: (value: unknown) => requireDevice(terminal, "TerminalDevice").printString(Number(value >>> 0).toString(16)),
    print_int_binary: (value: unknown) =>
      requireDevice(terminal, "TerminalDevice").printString((Number(value) >>> 0).toString(2)),
    print_int_unsigned: (value: unknown) => requireDevice(terminal, "TerminalDevice").printString((Number(value) >>> 0).toString()),
    print_float: (value: unknown) => requireDevice(terminal, "TerminalDevice").printString(String(value)),
    print_double: (value: unknown) => requireDevice(terminal, "TerminalDevice").printString(String(value)),
    print_string: (value: unknown) => requireDevice(terminal, "TerminalDevice").printString(String(value)),
    print_char: (value: unknown) => requireDevice(terminal, "TerminalDevice").printString(String.fromCharCode(Number(value))),
    read_string: () => requireDevice(terminal, "TerminalDevice").readString(),
    read_int: () => requireDevice(input, "InputDevice").readInt(),
    read_float: () => parseFloat(requireDevice(terminal, "TerminalDevice").readString()),
    read_double: () => parseFloat(requireDevice(terminal, "TerminalDevice").readString()),
    read_char: () => {
      const value = requireDevice(terminal, "TerminalDevice").readString();
      return value.length > 0 ? value.charCodeAt(0) : -1;
    },
    file_open: (path: unknown, mode: unknown) => requireDevice(file, "FileDevice").open(String(path), normalizeFileMode(mode)),
    file_read: (descriptor: unknown) => requireDevice(file, "FileDevice").readFile(Number(descriptor)),
    file_write: (descriptor: unknown, content: unknown) =>
      requireDevice(file, "FileDevice").writeFile(Number(descriptor), String(content)),
    file_close: (descriptor: unknown) => requireDevice(file, "FileDevice").close(Number(descriptor)),
    timer_now: () => requireDevice(timer, "TimerDevice").getCurrentTime(),
  };
}

function requireDevice<T>(device: T | undefined, name: string): T {
  if (!device) {
    throw new Error(`${name} is not available in this environment`);
  }
  return device;
}

function normalizeFileMode(mode: unknown): "r" | "w" | "a" {
  switch (mode) {
    case "r":
    case "w":
    case "a":
      return mode;
    default:
      throw new Error(`Unsupported file mode: ${mode}`);
  }
}

export interface InputDevice {
  readInt(): number;
}
