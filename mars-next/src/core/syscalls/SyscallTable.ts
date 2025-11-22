import { SyscallHandler } from "./SyscallHandlers";

export class SyscallTable {
  private readonly handlers = new Map<string, SyscallHandler>();

  register(name: string, handler: SyscallHandler): void {
    if (this.handlers.has(name)) {
      throw new Error(`Syscall already registered: ${name}`);
    }
    this.handlers.set(name, handler);
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  invoke(name: string, ...args: unknown[]): unknown {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`Unknown syscall: ${name}`);
    }

    return handler(...args);
  }

  asRecord(): Record<string, SyscallHandler> {
    return Object.fromEntries(this.handlers.entries());
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
