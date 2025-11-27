import { FileDevice } from "../../devices/FileDevice";
import { TerminalDevice } from "../../devices/TerminalDevice";
import { TimerDevice } from "../../devices/TimerDevice";
import { Memory } from "../../memory/Memory";
import { MachineState } from "../../state/MachineState";
import { SyscallDevices, SyscallHandler } from "../SyscallHandlers";
import { SyscallImplementation, SyscallTable } from "../SyscallTable";

const DEFAULT_HEAP_BASE = 0x10040000;

type HandlerMap = Record<string, SyscallHandler>;

class RandomStream {
  private state: number;

  constructor(seed: number = Date.now()) {
    this.state = seed >>> 0;
  }

  seed(value: number): void {
    this.state = value >>> 0;
  }

  nextInt(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state | 0;
  }

  nextFloat(): number {
    const value = this.nextInt() >>> 0;
    return value / 0xffffffff;
  }

  nextDouble(): number {
    const value = this.nextInt() >>> 0;
    return value / 0xffffffff;
  }
}

export function registerLegacySyscalls(
  table: SyscallTable,
  memory: Memory,
  devices: SyscallDevices,
  handlers: HandlerMap,
): void {
  const randomStreams = new Map<number, RandomStream>();
  let heapPointer = DEFAULT_HEAP_BASE;

  const register = (number: number, implementation: SyscallImplementation): void => table.register(number, implementation);

  register(1, (state) => {
    const value = state.getRegister(4);
    if (!tryHandler("print_int", handlers, value)) {
      writeToTerminal(devices, value);
    }
  });

  register(2, (state) => {
    const value = state.getFloatRegisterSingle(12);
    if (!tryHandler("print_float", handlers, value)) {
      writeToTerminal(devices, value);
    }
  });

  register(3, (state) => {
    const value = state.getFloatRegisterDouble(12);
    if (!tryHandler("print_double", handlers, value)) {
      writeToTerminal(devices, value);
    }
  });

  register(4, (state) => {
    const address = state.getRegister(4);
    const message = readNullTerminatedString(memory, address);
    if (!tryHandler("print_string", handlers, message)) {
      writeToTerminal(devices, message);
    }
  });

  register(5, (state) => {
    const value = coerceNumber(readFromHandler("read_int", handlers) ?? devices.input?.readInt());
    state.setRegister(2, value);
  });

  register(6, (state) => {
    const value = coerceNumber(readFromHandler("read_float", handlers) ?? readFloatFromTerminal(devices));
    state.setFloatRegisterSingle(0, value);
  });

  register(7, (state) => {
    const value = coerceNumber(readFromHandler("read_double", handlers) ?? readFloatFromTerminal(devices));
    state.setFloatRegisterDouble(0, value);
  });

  register(8, (state) => {
    const buffer = state.getRegister(4);
    const length = state.getRegister(5);
    const input = String(readFromHandler("read_string", handlers) ?? readStringFromTerminal(devices));
    writeStringToMemory(memory, buffer, input, length);
  });

  register(9, (state) => {
    const increment = state.getRegister(4);
    const previous = heapPointer;
    heapPointer = (heapPointer + increment) >>> 0;
    state.setRegister(2, previous);
    tryHandler("sbrk", handlers, increment, previous);
  });

  register(10, (state) => {
    state.terminate();
  });

  register(11, (state) => {
    const value = state.getRegister(4) & 0xff;
    const char = String.fromCharCode(value);
    if (!tryHandler("print_char", handlers, char)) {
      writeToTerminal(devices, char);
    }
  });

  register(12, (state) => {
    const code = coerceNumber(readFromHandler("read_char", handlers) ?? readCharFromTerminal(devices));
    state.setRegister(2, code);
  });

  register(13, (state) => {
    const path = readNullTerminatedString(memory, state.getRegister(4));
    const flags = state.getRegister(5);
    const mode = translateFileMode(flags);
    const descriptor = openFile(devices.file, path, mode);
    state.setRegister(2, descriptor);
  });

  register(14, (state) => {
    const descriptor = state.getRegister(4);
    const buffer = state.getRegister(5);
    const length = state.getRegister(6);
    const bytes = readFromFile(devices.file, descriptor, length);
    if (bytes === -1) {
      state.setRegister(2, -1);
      return;
    }
    writeBytes(memory, buffer, bytes);
    state.setRegister(2, bytes.length);
  });

  register(15, (state) => {
    const descriptor = state.getRegister(4);
    const buffer = state.getRegister(5);
    const length = state.getRegister(6);
    const bytes = readBytes(memory, buffer, length);
    const result = writeToFile(devices.file, descriptor, bytes);
    state.setRegister(2, result);
  });

  register(16, (state) => {
    const descriptor = state.getRegister(4);
    state.setRegister(2, closeFile(devices.file, descriptor));
  });

  register(17, (state) => {
    state.terminate();
    state.setRegister(2, state.getRegister(4));
  });

  register(30, (state) => {
    const time = getCurrentTime(devices.timer);
    const low = time & 0xffffffff;
    const high = Math.floor(time / 0x100000000);
    state.setRegister(4, low);
    state.setRegister(5, high);
  });

  register(31, (state) => {
    // MIDI output is not simulated; acknowledge the syscall.
    state.setRegister(2, 0);
  });

  register(32, (state) => {
    const delay = state.getRegister(4);
    devices.timer?.tick(delay);
    state.setRegister(2, 0);
  });

  register(33, (state) => {
    state.setRegister(2, 0);
  });

  register(34, (state) => {
    const value = state.getRegister(4) >>> 0;
    if (!tryHandler("print_int_hex", handlers, value)) {
      writeToTerminal(devices, value.toString(16));
    }
  });

  register(35, (state) => {
    const value = state.getRegister(4) >>> 0;
    if (!tryHandler("print_int_binary", handlers, value)) {
      writeToTerminal(devices, value.toString(2));
    }
  });

  register(36, (state) => {
    const value = state.getRegister(4) >>> 0;
    if (!tryHandler("print_int_unsigned", handlers, value)) {
      writeToTerminal(devices, value);
    }
  });

  register(40, (state) => {
    const index = state.getRegister(4);
    const seed = state.getRegister(5);
    const stream = getRandomStream(randomStreams, index);
    stream.seed(seed);
  });

  register(41, (state) => {
    const index = state.getRegister(4);
    const stream = getRandomStream(randomStreams, index);
    state.setRegister(4, stream.nextInt());
  });

  register(42, (state) => {
    const index = state.getRegister(4);
    const bound = state.getRegister(5);
    if (bound < 0) {
      throw new Error("Upper bound of range cannot be negative (syscall 42)");
    }
    const stream = getRandomStream(randomStreams, index);
    const value = bound === 0 ? 0 : Math.abs(stream.nextInt()) % bound;
    state.setRegister(4, value);
  });

  register(43, (state) => {
    const index = state.getRegister(4);
    const stream = getRandomStream(randomStreams, index);
    state.setFloatRegisterSingle(0, stream.nextFloat());
  });

  register(44, (state) => {
    const index = state.getRegister(4);
    const stream = getRandomStream(randomStreams, index);
    state.setFloatRegisterDouble(0, stream.nextDouble());
  });

  register(50, (state) => {
    const message = readNullTerminatedString(memory, state.getRegister(4));
    const title = readNullTerminatedString(memory, state.getRegister(5));
    const defaultValue = state.getRegister(6);
    const response = readFromHandler("confirm_dialog", handlers, message, title, defaultValue);
    state.setRegister(4, coerceNumber(response ?? defaultValue));
  });

  register(51, (state) => handleInputDialog(state, memory, devices, handlers, "int"));
  register(52, (state) => handleInputDialog(state, memory, devices, handlers, "float"));
  register(53, (state) => handleInputDialog(state, memory, devices, handlers, "double"));
  register(54, (state) => handleInputDialog(state, memory, devices, handlers, "string"));

  register(55, (state) => handleMessageDialog(state, memory, devices, handlers, "message"));
  register(56, (state) => handleMessageDialog(state, memory, devices, handlers, "int"));
  register(57, (state) => handleMessageDialog(state, memory, devices, handlers, "float"));
  register(58, (state) => handleMessageDialog(state, memory, devices, handlers, "double"));
  register(59, (state) => handleMessageDialog(state, memory, devices, handlers, "string"));

  register(60, (state) => {
    const ready = memory.readByte(KEYBOARD_CONTROL_ADDRESS) & READY_FLAG_MASK;
    const low = memory.readByte(KEYBOARD_DATA_ADDRESS);
    const high = memory.readByte(KEYBOARD_DATA_EXTENDED_ADDRESS);
    const value = (high << 8) | low;
    state.setRegister(2, value | 0);
    state.setRegister(3, ready ? 1 : 0);
  });

  register(61, (state) => {
    const source = state.getRegister(4) >>> 0;
    const offset = state.getRegister(5) >>> 0;
    const length = state.getRegister(6) >>> 0;

    const framebufferStart = (BITMAP_BASE_ADDRESS + BITMAP_FRAMEBUFFER_OFFSET) >>> 0;
    const maxBytes = memory.readWord(BITMAP_BASE_ADDRESS) * memory.readWord(BITMAP_BASE_ADDRESS + 4) * 4;
    const writable = Math.max(0, Math.min(length, maxBytes - offset));

    for (let i = 0; i < writable; i++) {
      const byte = memory.readByte(source + i);
      memory.writeByte(framebufferStart + offset + i, byte);
    }

    state.setRegister(2, writable);
  });

  register(62, (state) => {
    const streamIndex = state.getRegister(4);
    const buffer = state.getRegister(5) >>> 0;
    const length = state.getRegister(6) >>> 0;
    const stream = getRandomStream(randomStreams, streamIndex);

    for (let i = 0; i < length; i++) {
      const byteIndex = i % 4;
      if (byteIndex === 0) {
        cachedRandomWord = stream.nextInt() >>> 0;
      }
      const shift = 24 - byteIndex * 8;
      const byte = (cachedRandomWord >>> shift) & 0xff;
      memory.writeByte(buffer + i, byte);
    }

    state.setRegister(2, length);
  });
}

function tryHandler(name: string, handlers: HandlerMap, ...args: unknown[]): boolean {
  const handler = handlers[name];
  if (!handler) return false;
  try {
    handler(...args);
    return true;
  } catch {
    return false;
  }
}

function readFromHandler(name: string, handlers: HandlerMap, ...args: unknown[]): unknown {
  const handler = handlers[name];
  if (!handler) return undefined;
  return handler(...args);
}

function writeToTerminal(devices: SyscallDevices, value: number | string): void {
  const terminal = requireDevice<TerminalDevice>(devices, "terminal");
  if (typeof value === "number" && typeof terminal.printInt === "function") {
    terminal.printInt(value);
    return;
  }
  if (typeof value === "string" && typeof terminal.printString === "function") {
    terminal.printString(value);
    return;
  }
  terminal.printString(String(value));
}

function readNullTerminatedString(memory: Memory, baseAddress: number): string {
  const bytes: number[] = [];
  let offset = 0;

  while (true) {
    const value = memory.readByte(baseAddress + offset);
    if (value === 0) break;
    bytes.push(value);
    offset += 1;
  }

  return String.fromCharCode(...bytes);
}

function writeStringToMemory(memory: Memory, baseAddress: number, value: string, maxLength: number): void {
  const truncated = value.slice(0, Math.max(0, maxLength - 1));
  const bytes = [...truncated].map((char) => char.charCodeAt(0));
  writeBytes(memory, baseAddress, bytes);
  memory.writeByte(baseAddress + bytes.length, 0);
}

function writeBytes(memory: Memory, baseAddress: number, bytes: number[]): void {
  bytes.forEach((byte, index) => memory.writeByte(baseAddress + index, byte));
}

function readBytes(memory: Memory, baseAddress: number, length: number): string {
  const bytes: number[] = [];
  for (let i = 0; i < length; i++) {
    bytes.push(memory.readByte(baseAddress + i));
  }
  return String.fromCharCode(...bytes);
}

function readFloatFromTerminal(devices: SyscallDevices): number {
  const terminal = requireDevice<TerminalDevice>(devices, "terminal");
  return parseFloat(terminal.readString());
}

function readStringFromTerminal(devices: SyscallDevices): string {
  const terminal = requireDevice<TerminalDevice>(devices, "terminal");
  return terminal.readString();
}

function readCharFromTerminal(devices: SyscallDevices): number {
  const terminal = requireDevice<TerminalDevice>(devices, "terminal");
  const value = terminal.readString();
  return value.length > 0 ? value.charCodeAt(0) : -1;
}

function translateFileMode(flags: number): "r" | "w" | "a" | null {
  switch (flags) {
    case 0:
      return "r";
    case 1:
      return "w";
    case 9:
      return "a";
    default:
      return null;
  }
}

function openFile(device: FileDevice | undefined, path: string, mode: "r" | "w" | "a" | null): number {
  if (!device || !mode) return -1;
  try {
    return device.open(path, mode);
  } catch {
    return -1;
  }
}

function readFromFile(device: FileDevice | undefined, descriptor: number, length: number): number[] | -1 {
  if (!device) return -1;
  try {
    const content = device.readFileSegment(descriptor, length);
    return [...new TextEncoder().encode(content)];
  } catch {
    return -1;
  }
}

function writeToFile(device: FileDevice | undefined, descriptor: number, bytes: string): number {
  if (!device) return -1;
  try {
    device.writeFile(descriptor, bytes);
    return bytes.length;
  } catch {
    return -1;
  }
}

function closeFile(device: FileDevice | undefined, descriptor: number): number {
  if (!device) return -1;
  try {
    device.close(descriptor);
    return 0;
  } catch {
    return -1;
  }
}

function getCurrentTime(timer: TimerDevice | undefined): number {
  if (timer) return timer.getCurrentTime();
  return Date.now();
}

function getRandomStream(map: Map<number, RandomStream>, index: number): RandomStream {
  const existing = map.get(index);
  if (existing) return existing;
  const created = new RandomStream();
  map.set(index, created);
  return created;
}

const READY_FLAG_MASK = 0x1;
const KEYBOARD_CONTROL_ADDRESS = 0xffff0000;
const KEYBOARD_DATA_ADDRESS = 0xffff0004;
const KEYBOARD_DATA_EXTENDED_ADDRESS = 0xffff0006;

const BITMAP_BASE_ADDRESS = 0xffff1000;
const BITMAP_FRAMEBUFFER_OFFSET = 16;

let cachedRandomWord = 0;

function handleInputDialog(
  state: MachineState,
  memory: Memory,
  devices: SyscallDevices,
  handlers: HandlerMap,
  type: "int" | "float" | "double" | "string",
): void {
  const prompt = readNullTerminatedString(memory, state.getRegister(4));
  const defaultAddress = state.getRegister(5);
  const maxLength = state.getRegister(6);
  const defaultValue = type === "string" ? readNullTerminatedString(memory, defaultAddress) : null;
  const handlerName = `${type}_input_dialog`;
  const response = readFromHandler(handlerName, handlers, prompt, defaultValue);
  if (type === "string") {
    const value = String(response ?? defaultValue ?? "");
    writeStringToMemory(memory, defaultAddress, value, maxLength);
  } else {
    const numeric = coerceNumber(response ?? defaultValue ?? 0);
    if (type === "int") state.setRegister(4, numeric);
    if (type === "float") state.setFloatRegisterSingle(0, numeric);
    if (type === "double") state.setFloatRegisterDouble(0, numeric);
  }
}

function handleMessageDialog(
  state: MachineState,
  memory: Memory,
  devices: SyscallDevices,
  handlers: HandlerMap,
  type: "message" | "int" | "float" | "double" | "string",
): void {
  const message = readNullTerminatedString(memory, state.getRegister(4));
  const title = readNullTerminatedString(memory, state.getRegister(5));
  const handlerName = `${type}_message_dialog`;
  if (!tryHandler(handlerName, handlers, message, title)) {
    writeToTerminal(devices, `${title ? `${title}: ` : ""}${message}`);
  }
}

function coerceNumber(value: unknown): number {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return 0;
  return numeric;
}

function requireDevice<T>(devices: SyscallDevices, key: keyof SyscallDevices): T {
  const device = devices[key];
  if (!device) {
    const name = `${String(key).charAt(0).toUpperCase()}${String(key).slice(1)}Device`;
    throw new Error(`${name} is not available in this environment`);
  }
  return device as T;
}
