import { Memory } from "../../memory/Memory";
import { SyscallDevices, SyscallHandler } from "../SyscallHandlers";
import { SyscallImplementation } from "../SyscallTable";

type HandlerMap = Record<string, SyscallHandler>;

/**
 * Message dialog for double values (syscall 58). Without UI support, this
 * implementation calls optional handlers and falls back to terminal output.
 */
export function createMessageDialogDouble(memory: Memory, devices: SyscallDevices, handlers: HandlerMap): SyscallImplementation {
  return (state): void => {
    const message = readNullTerminatedString(memory, state.getRegister(4));
    const title = readNullTerminatedString(memory, state.getRegister(5));
    if (!tryHandler("double_message_dialog", handlers, message, title)) {
      const prefix = title ? `${title}: ` : "";
      devices.terminal?.printString?.(`${prefix}${message}`);
    }
  };
}

function readNullTerminatedString(memory: Memory, address: number): string {
  let result = "";
  let offset = 0;
  while (true) {
    const byte = memory.readByte(address + offset);
    if (byte === 0 || byte === undefined) break;
    result += String.fromCharCode(byte);
    offset++;
  }
  return result;
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
