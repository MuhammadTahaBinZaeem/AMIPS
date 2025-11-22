import assert from "node:assert";
import { describe, test } from "node:test";

import { FileDevice } from "../../src/core/devices/FileDevice";
import { TerminalDevice } from "../../src/core/devices/TerminalDevice";
import { TimerDevice } from "../../src/core/devices/TimerDevice";
import { MemoryMap } from "../../src/core/memory/MemoryMap";
import { MachineState } from "../../src/core/state/MachineState";
import { createDefaultSyscallHandlers } from "../../src/core/syscalls/SyscallHandlers";

describe("TerminalDevice", () => {
  test("captures output produced through syscall handlers", () => {
    const terminal = new TerminalDevice();
    const syscalls = createDefaultSyscallHandlers({ terminal });

    syscalls.print_int(42);
    syscalls.print_string(" hello");

    assert.deepStrictEqual(terminal.getOutputLog(), ["42", " hello"]);
  });

  test("reads from queued input", () => {
    const terminal = new TerminalDevice();
    const syscalls = createDefaultSyscallHandlers({ terminal });

    terminal.queueInput("first", "second");
    assert.strictEqual(syscalls.read_string(), "first");
    assert.strictEqual(syscalls.read_string(), "second");
  });
});

describe("FileDevice", () => {
  test("supports opening, writing, and reading files through syscalls", () => {
    const files = new FileDevice();
    const syscalls = createDefaultSyscallHandlers({ file: files });

    const descriptor = syscalls.file_open("/tmp/example.txt", "w");
    syscalls.file_write(descriptor, "Hello");
    syscalls.file_write(descriptor, " World");
    syscalls.file_close(descriptor);

    const reader = syscalls.file_open("/tmp/example.txt", "r");
    const contents = syscalls.file_read(reader);

    assert.strictEqual(contents, "Hello World");
  });

  test("raises clear errors when file device is missing", () => {
    const syscalls = createDefaultSyscallHandlers();

    assert.throws(() => syscalls.file_open("/tmp/missing.txt", "r"), /FileDevice is not available/);
  });
});

describe("TimerDevice", () => {
  test("triggers interrupts on ticks that cross the interval", () => {
    const timer = new TimerDevice();
    const state = new MachineState();
    timer.onInterrupt(() => state.setRegister(1, state.getRegister(1) + 1));
    timer.setIntervalMs(10);

    timer.tick(5);
    assert.strictEqual(state.getRegister(1), 0);

    timer.tick(5);
    assert.strictEqual(state.getRegister(1), 1);
  });

  test("exposes timer state through the memory map", () => {
    const timer = new TimerDevice();
    const map = new MemoryMap();
    const base = 0xffff0000;
    map.registerDevice(base, 8, timer);

    timer.tick(7);
    assert.strictEqual(map.read(base), 7);

    map.write(base + 4, 3);
    timer.tick(3);
    assert.strictEqual(map.read(base + 4), 3);
  });

  test("reports unsupported syscall when no timer is wired", () => {
    const syscalls = createDefaultSyscallHandlers();
    assert.throws(() => syscalls.timer_now(), /TimerDevice is not available/);
  });
});
