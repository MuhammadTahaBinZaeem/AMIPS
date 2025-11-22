import assert from "node:assert";
import { describe, test } from "node:test";

import { TerminalDevice } from "../../src/core/devices/TerminalDevice";
import { createDefaultSyscallHandlers, InputDevice } from "../../src/core/syscalls/SyscallHandlers";

class StubInput implements InputDevice {
  constructor(private readonly queue: number[]) {}

  readInt(): number {
    const value = this.queue.shift();
    if (value === undefined) throw new Error("No values left");
    return value;
  }
}

describe("createDefaultSyscallHandlers", () => {
  test("writes integers and strings through the terminal device", () => {
    const terminal = new TerminalDevice();
    const syscalls = createDefaultSyscallHandlers({ terminal });

    syscalls.print_int(42);
    syscalls.print_string("hello");

    assert.deepStrictEqual(terminal.getOutputLog(), ["42", "hello"]);
  });

  test("reads integers from the provided input device", () => {
    const syscalls = createDefaultSyscallHandlers({ input: new StubInput([9, 10]) });

    assert.strictEqual(syscalls.read_int(), 9);
    assert.strictEqual(syscalls.read_int(), 10);
  });

  test("throws helpful errors when required devices are missing", () => {
    const syscalls = createDefaultSyscallHandlers();

    assert.throws(() => syscalls.print_int(1), /TerminalDevice is not available/);
    assert.throws(() => syscalls.read_int(), /InputDevice is not available/);
  });
});
