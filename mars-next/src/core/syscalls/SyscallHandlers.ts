import { Memory } from "../memory/Memory";
import { TerminalDevice } from "../devices/TerminalDevice";
import { MachineState } from "../state/MachineState";

export interface InputDevice {
  readInt(): number;
}

export interface SyscallDevices {
  terminal: Pick<TerminalDevice, "write">;
  input: InputDevice;
}

export type SyscallHandler = (
  state: MachineState,
  memory: Memory,
  devices: SyscallDevices,
) => void;

export function createDefaultSyscallHandlers(): Record<number, SyscallHandler> {
  return {
    1: handlePrintInteger,
    4: handlePrintString,
    5: handleReadInteger,
    10: handleExit,
  };
}

function handlePrintInteger(state: MachineState, _memory: Memory, devices: SyscallDevices): void {
  const value = state.getRegister(4);
  devices.terminal.write(value.toString());
}

function handlePrintString(state: MachineState, memory: Memory, devices: SyscallDevices): void {
  const baseAddress = state.getRegister(4);
  const chars: number[] = [];
  let offset = 0;

  while (true) {
    const byte = memory.readByte(baseAddress + offset);
    if (byte === 0) break;
    chars.push(byte);
    offset += 1;
  }

  const message = String.fromCharCode(...chars);
  devices.terminal.write(message);
}

function handleReadInteger(state: MachineState, _memory: Memory, devices: SyscallDevices): void {
  const value = devices.input.readInt();
  state.setRegister(2, value);
}

function handleExit(state: MachineState): void {
  state.terminate();
}
