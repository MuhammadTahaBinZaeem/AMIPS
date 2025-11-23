import { Memory } from "../memory/Memory";
import { MachineState } from "../state/MachineState";
import { SyscallDevices, SyscallHandler } from "./SyscallHandlers";
import { registerLegacySyscalls } from "./legacy/LegacySyscalls";

export type SyscallImplementation = (state: MachineState) => void;

export class SyscallTable {
  private readonly handlers = new Map<number, SyscallImplementation>();

  constructor(memory: Memory, devices: SyscallDevices = {}, customHandlers: Record<string, SyscallHandler> = {}) {
    registerLegacySyscalls(this, memory, devices, customHandlers);
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
}
