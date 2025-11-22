import assert from "node:assert";
import { describe, test } from "node:test";

import { MachineState } from "../../src/core/state/MachineState";
import { Memory } from "../../src/core/memory/Memory";
import { SyscallTable } from "../../src/core/syscalls/SyscallTable";
import { createDefaultSyscallHandlers, InputDevice, SyscallDevices } from "../../src/core/syscalls/SyscallHandlers";

class StubTerminal {
  public readonly writes: string[] = [];

  write(message: string): void {
    this.writes.push(message);
  }
}

class StubInput implements InputDevice {
  constructor(private readonly values: number[]) {}

  readInt(): number {
    const value = this.values.shift();
    if (value === undefined) throw new Error("No more input values queued");
    return value;
  }
}

describe("SyscallTable", () => {
  test("prints integer to terminal device (syscall 1)", () => {
    const state = new MachineState();
    const memory = new Memory();
    const terminal = new StubTerminal();
    const devices: SyscallDevices = { terminal, input: new StubInput([]) };
    const table = new SyscallTable(memory, devices, createDefaultSyscallHandlers());

    state.setRegister(4, 12345);
    table.handle(1, state);

    assert.deepStrictEqual(terminal.writes, ["12345"]);
  });

  test("reads integer from input device into $v0 (syscall 5)", () => {
    const state = new MachineState();
    const memory = new Memory();
    const devices: SyscallDevices = { terminal: new StubTerminal(), input: new StubInput([1337]) };
    const table = new SyscallTable(memory, devices, createDefaultSyscallHandlers());

    table.handle(5, state);

    assert.strictEqual(state.getRegister(2), 1337);
  });

  test("writes null-terminated strings from memory (syscall 4)", () => {
    const state = new MachineState();
    const memory = new Memory();
    const terminal = new StubTerminal();
    const devices: SyscallDevices = { terminal, input: new StubInput([]) };
    const table = new SyscallTable(memory, devices, createDefaultSyscallHandlers());

    const baseAddress = 0x10010000;
    const message = "Hello";
    message
      .split("")
      .map((char, index) => memory.writeByte(baseAddress + index, char.charCodeAt(0)));
    memory.writeByte(baseAddress + message.length, 0);
    state.setRegister(4, baseAddress);

    table.handle(4, state);

    assert.deepStrictEqual(terminal.writes, ["Hello"]);
  });

  test("marks the machine as terminated on syscall 10", () => {
    const state = new MachineState();
    const memory = new Memory();
    const devices: SyscallDevices = { terminal: new StubTerminal(), input: new StubInput([]) };
    const table = new SyscallTable(memory, devices, createDefaultSyscallHandlers());

    assert.ok(!state.isTerminated());
    table.handle(10, state);
    assert.ok(state.isTerminated());
  });

  test("throws for unsupported syscall numbers", () => {
    const state = new MachineState();
    const memory = new Memory();
    const devices: SyscallDevices = { terminal: new StubTerminal(), input: new StubInput([]) };
    const table = new SyscallTable(memory, devices, createDefaultSyscallHandlers());

    assert.throws(() => table.handle(999, state), /unimplemented syscall/i);
  });
});
