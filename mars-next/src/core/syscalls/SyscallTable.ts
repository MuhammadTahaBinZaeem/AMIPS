import { Memory } from "../memory/Memory";
import { TerminalDevice } from "../devices/TerminalDevice";
import { MachineState } from "../state/MachineState";
import { createDefaultSyscallHandlers, SyscallDevices, SyscallHandler } from "./SyscallHandlers";

const defaultDevices: SyscallDevices = {
  terminal: new TerminalDevice(),
  input: {
    readInt: () => 0,
  },
};

export class SyscallTable {
  private readonly handlers = new Map<number, SyscallHandler>();

  constructor(
    private readonly memory: Memory,
    private readonly devices: SyscallDevices,
    initialHandlers: Record<number, SyscallHandler> = createDefaultSyscallHandlers(),
  ) {
    Object.entries(initialHandlers).forEach(([number, handler]) => {
      this.register(Number(number), handler);
    });
  }

  register(number: number, handler: SyscallHandler): void {
    this.handlers.set(number, handler);
  }

  handle(number: number, state: MachineState): void {
    const handler = this.handlers.get(number);
    if (!handler) {
      throw new Error(`unimplemented syscall: ${number}`);
    }

    handler(state, this.memory, this.devices);
  }
}

export function handleSyscall(state: MachineState, number: number, table?: SyscallTable): void {
  const dispatcher = table ?? new SyscallTable(new Memory(), defaultDevices);
  dispatcher.handle(number, state);
}
