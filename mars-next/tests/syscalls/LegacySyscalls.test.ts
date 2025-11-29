import assert from "node:assert";
import { describe, test } from "node:test";

import { DisplayDevice } from "../../src/core/devices/DisplayDevice";
import { FileDevice } from "../../src/core/devices/FileDevice";
import { KeyboardDevice } from "../../src/core/devices/KeyboardDevice";
import { TerminalDevice } from "../../src/core/devices/TerminalDevice";
import { Memory } from "../../src/core/memory/Memory";
import { MemoryMap } from "../../src/core/memory/MemoryMap";
import { MachineState } from "../../src/core/state/MachineState";
import { createDefaultSyscallHandlers, SyscallDevices } from "../../src/core/syscalls/SyscallHandlers";
import { SyscallTable } from "../../src/core/syscalls/SyscallTable";

class StubInput {
  constructor(private readonly values: number[]) {}

  readInt(): number {
    const value = this.values.shift();
    if (value === undefined) throw new Error("No more input values queued");
    return value;
  }
}

function buildTable(memory: Memory, devices: SyscallDevices): SyscallTable {
  return new SyscallTable(memory, devices, createDefaultSyscallHandlers(devices));
}

describe("Legacy syscall coverage", () => {
  test("prints additional numeric formats", () => {
    const memory = new Memory();
    const terminal = new TerminalDevice();
    const devices: SyscallDevices = { terminal, input: new StubInput([]) };
    const table = buildTable(memory, devices);
    const state = new MachineState();

    state.setFloatRegisterSingle(12, 1.25);
    table.handle(2, state);

    state.setFloatRegisterDouble(12, 2.5);
    table.handle(3, state);

    state.setRegister(4, 0x2a);
    table.handle(34, state);
    table.handle(35, state);
    table.handle(36, state);

    assert.deepStrictEqual(terminal.getOutputLog(), ["1.25", "2.5", "2a", "101010", "42"]);
  });

  test("reads a string into memory", () => {
    const memory = new Memory();
    const terminal = new TerminalDevice();
    terminal.queueInput("Hello world");
    const devices: SyscallDevices = { terminal, input: new StubInput([]) };
    const table = buildTable(memory, devices);
    const state = new MachineState();
    const buffer = 0x10010000;

    state.setRegister(4, buffer);
    state.setRegister(5, 6);
    table.handle(8, state);

    const result = String.fromCharCode(
      memory.readByte(buffer),
      memory.readByte(buffer + 1),
      memory.readByte(buffer + 2),
      memory.readByte(buffer + 3),
      memory.readByte(buffer + 4),
    );

    assert.strictEqual(result, "Hello");
    assert.strictEqual(memory.readByte(buffer + 5), 0);
  });

  test("advances heap pointer with sbrk", () => {
    const memory = new Memory();
    const terminal = new TerminalDevice();
    const devices: SyscallDevices = { terminal, input: new StubInput([]) };
    const table = buildTable(memory, devices);
    const state = new MachineState();

    state.setRegister(4, 16);
    table.handle(9, state);
    assert.strictEqual(state.getRegister(2), 0x10040000);

    state.setRegister(4, 4);
    table.handle(9, state);
    assert.strictEqual(state.getRegister(2), 0x10040010);
  });

  test("supports seeded random streams", () => {
    const memory = new Memory();
    const terminal = new TerminalDevice();
    const devices: SyscallDevices = { terminal, input: new StubInput([]) };
    const table = buildTable(memory, devices);
    const state = new MachineState();

    const index = 3;
    const seed = 1234;
    state.setRegister(4, index);
    state.setRegister(5, seed);
    table.handle(40, state);

    state.setRegister(4, index);
    table.handle(41, state);
    const first = state.getRegister(4);

    state.setRegister(4, index);
    table.handle(41, state);
    const second = state.getRegister(4);

    state.setRegister(4, index);
    state.setRegister(5, seed);
    table.handle(40, state);
    state.setRegister(4, index);
    table.handle(41, state);
    const repeat = state.getRegister(4);

    assert.notStrictEqual(first, second);
    assert.strictEqual(first, repeat);
  });

  test("performs file read and write syscalls", () => {
    const memory = new Memory();
    const terminal = new TerminalDevice();
    const files = new FileDevice();
    const devices: SyscallDevices = { terminal, file: files, input: new StubInput([]) };
    const table = buildTable(memory, devices);
    const state = new MachineState();

    const pathAddr = 0x10010000;
    "log.txt\0".split("").forEach((char, index) => memory.writeByte(pathAddr + index, char.charCodeAt(0)));

    state.setRegister(4, pathAddr);
    state.setRegister(5, 1);
    table.handle(13, state);
    const writer = state.getRegister(2);

    const dataAddr = 0x10011000;
    "Hi!!!".split("").forEach((char, index) => memory.writeByte(dataAddr + index, char.charCodeAt(0)));
    state.setRegister(4, writer);
    state.setRegister(5, dataAddr);
    state.setRegister(6, 5);
    table.handle(15, state);
    assert.strictEqual(state.getRegister(2), 5);

    state.setRegister(4, pathAddr);
    state.setRegister(5, 0);
    table.handle(13, state);
    const reader = state.getRegister(2);

    const readAddr = 0x10012000;
    state.setRegister(4, reader);
    state.setRegister(5, readAddr);
    state.setRegister(6, 5);
    table.handle(14, state);

    const contents = String.fromCharCode(
      memory.readByte(readAddr),
      memory.readByte(readAddr + 1),
      memory.readByte(readAddr + 2),
      memory.readByte(readAddr + 3),
      memory.readByte(readAddr + 4),
    );

    assert.strictEqual(contents, "Hi!!!");
  });

  test("read_char pulls from the keyboard device when ready", () => {
    const map = new MemoryMap({ devices: [] });
    const keyboard = new KeyboardDevice();
    map.registerDevice(map.mmioBase, 8, keyboard);
    keyboard.queueInput("Z");

    const memory = new Memory({ map });
    const table = buildTable(memory, {});
    const state = new MachineState();

    table.handle(12, state);

    assert.strictEqual(state.getRegister(2), "Z".charCodeAt(0));
  });

  test("writes to the display device through syscall 63", () => {
    const map = new MemoryMap({ devices: [] });
    const log: string[] = [];
    const display = new DisplayDevice((char) => log.push(char));
    map.registerDevice(map.mmioBase + 8, 8, display);

    const memory = new Memory({ map });
    const table = buildTable(memory, {});
    const state = new MachineState();

    state.setRegister(4, "A".charCodeAt(0));
    table.handle(63, state);

    assert.deepStrictEqual(log, ["A"]);
    assert.strictEqual(state.getRegister(2), 1);
  });
});
