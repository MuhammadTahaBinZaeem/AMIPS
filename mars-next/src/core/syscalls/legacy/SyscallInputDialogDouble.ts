import { Memory } from "../../memory/Memory";
import { MachineState } from "../../state/MachineState";
import { SyscallDevices, SyscallHandler } from "../SyscallHandlers";
import { SyscallImplementation } from "../SyscallTable";

type HandlerMap = Record<string, SyscallHandler>;

/**
 * Double input dialog (syscall 53). The UI is not yet implemented, so this
 * handler uses registered hooks or default values.
 */
export function createInputDialogDouble(memory: Memory, _devices: SyscallDevices, handlers: HandlerMap): SyscallImplementation {
  return (state: MachineState): void => {
    const promptAddress = state.getRegister(4);
    const prompt = readNullTerminatedString(memory, promptAddress);
    const response = readFromHandler("double_input_dialog", handlers, prompt, null);
    const numeric = coerceNumber(response ?? 0);
    state.setFloatRegisterDouble(0, numeric);
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

function readFromHandler(name: string, handlers: HandlerMap, ...args: unknown[]): unknown {
  const handler = handlers[name];
  if (!handler) return undefined;
  return handler(...args);
}

function coerceNumber(value: unknown): number {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return 0;
  return numeric;
}
