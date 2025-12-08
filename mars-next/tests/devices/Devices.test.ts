import assert from "node:assert";
import { describe, test } from "node:test";

import { Assembler } from "../../src/core/assembler/Assembler";
import { Pipeline, ProgramMemory } from "../../src/core/cpu/Pipeline";
import { decodeInstruction } from "../../src/core/cpu/Instructions";
import { InstructionDecoder } from "../../src/core/cpu/Cpu";
import { BitmapDisplayDevice, type DirtyRegion } from "../../src/core/devices/BitmapDisplayDevice";
import { DisplayDevice } from "../../src/core/devices/DisplayDevice";
import { FileDevice } from "../../src/core/devices/FileDevice";
import { KeyboardDevice, KEYBOARD_QUEUE_BYTE_LENGTH } from "../../src/core/devices/KeyboardDevice";
import { TerminalDevice } from "../../src/core/devices/TerminalDevice";
import { TimerDevice } from "../../src/core/devices/TimerDevice";
import { MemoryMap } from "../../src/core/memory/MemoryMap";
import { Memory } from "../../src/core/memory/Memory";
import { MachineState } from "../../src/core/state/MachineState";
import { createDefaultSyscallHandlers } from "../../src/core/syscalls/SyscallHandlers";
import { SyscallTable } from "../../src/core/syscalls/SyscallTable";

describe("TerminalDevice", () => {
  test("captures output from an assembled print syscall program", () => {
    const terminal = new TerminalDevice();
    const assembler = new Assembler();
    const program = [
      ".text",
      "addi $v0, $zero, 1", // syscall: print_int
      "addi $a0, $zero, 777",
      "syscall",
      "addi $v0, $zero, 10", // syscall: exit
      "syscall",
    ].join("\n");

    const image = assembler.assemble(program);
    const state = new MachineState();
    const instructionMemory = new ProgramMemory(image.text, image.textBase);
    const dataMemory = new Memory();
    const syscalls = new SyscallTable(dataMemory, { terminal }, createDefaultSyscallHandlers({ terminal }));
    const decoder: InstructionDecoder = {
      decode: (instruction, pc) => {
        if (instruction === 0x0000000c) {
          return {
            name: "syscall",
            execute: (innerState) => {
              const number = innerState.getRegister(2);
              syscalls.handle(number, innerState);
            },
          };
        }

        return decodeInstruction(instruction, pc);
      },
    };

    const pipeline = new Pipeline({ memory: instructionMemory, state, decoder });
    while (!pipeline.isHalted()) {
      pipeline.step();
    }

    assert.deepStrictEqual(terminal.getOutputLog(), ["777"]);
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

    timer.tick(30);
    assert.strictEqual(state.getRegister(1), 4);
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

describe("MMIO device interrupts", () => {
  test("KeyboardDevice triggers interrupts when ready and enabled", () => {
    const map = new MemoryMap();
    const keyboard = new KeyboardDevice();
    const downStart = map.mmioBase + 0x10;
    const upStart = map.mmioBase + 0x20;
    map.registerDevice(downStart, KEYBOARD_QUEUE_BYTE_LENGTH, keyboard.getQueueDevice("down"));
    map.registerDevice(upStart, KEYBOARD_QUEUE_BYTE_LENGTH, keyboard.getQueueDevice("up"));

    let interrupts = 0;
    map.onInterrupt(() => interrupts++);

    const memory = new Memory({ map });
    keyboard.queueFromBytes("down", [0x41]);
    assert.strictEqual(interrupts, 1);
    assert.strictEqual(memory.readByte(downStart), 1);

    memory.writeByte(downStart + 1, 0x1); // clear queued events
    assert.strictEqual(memory.readByte(downStart), 0);

    keyboard.queueFromBytes("up", [0x42, 0x43]);
    assert.strictEqual(interrupts, 2);
    assert.strictEqual(memory.readByte(upStart), 2);
  });

  test("DisplayDevice fires interrupts when re-enabled and after transmissions", () => {
    const map = new MemoryMap();
    const keyboard = new KeyboardDevice();
    const display = new DisplayDevice(() => {});
    map.registerDevice(map.mmioBase + 0x10, KEYBOARD_QUEUE_BYTE_LENGTH, keyboard.getQueueDevice("down"));
    map.registerDevice(map.mmioBase + 0x20, KEYBOARD_QUEUE_BYTE_LENGTH, keyboard.getQueueDevice("up"));
    map.registerDevice(map.mmioBase, 8, display);

    let interrupts = 0;
    map.onInterrupt(() => interrupts++);

    const memory = new Memory({ map });
    memory.writeByte(map.mmioBase, 0x2); // enable interrupts while already ready
    assert.strictEqual(interrupts, 1);

    memory.writeByte(map.mmioBase + 4, 0x41);
    assert.strictEqual(interrupts, 2);
  });
});

describe("KeyboardDevice queues", () => {
  test("queues simultaneous key events, reports key-up, and clears queues", () => {
    const keyboard = new KeyboardDevice();
    const downQueue = keyboard.getQueueDevice("down");
    const upQueue = keyboard.getQueueDevice("up");

    let interrupts = 0;
    keyboard.onInterrupt(() => interrupts++);

    keyboard.queueKeyDown("A", "B");
    keyboard.queueKeyUp("A");

    assert.strictEqual(interrupts, 2, "down and up queues should trigger separate interrupts");
    assert.strictEqual(downQueue.read(0), 2, "down queue tracks simultaneous key presses");
    assert.strictEqual(upQueue.read(0), 1, "up queue captures releases independently");
    assert.strictEqual(downQueue.read(2), "A".charCodeAt(0));
    assert.strictEqual(downQueue.read(3), "B".charCodeAt(0));

    downQueue.write(1, 0x1);
    assert.strictEqual(downQueue.read(0), 0, "clearing flag empties queued key-down events");

    keyboard.queueFromBytes("down", [0x43]);
    assert.strictEqual(interrupts, 3, "subsequent enqueue triggers another interrupt");
    assert.strictEqual(downQueue.read(0), 1);
    assert.strictEqual(downQueue.read(2), 0x43);
  });
});

describe("BitmapDisplayDevice", () => {
  test("flushes only when the update bit is set", () => {
    const FLUSH_OFFSET = 12;
    const FRAMEBUFFER_OFFSET = 16;
    const flushes: DirtyRegion[][] = [];

    const device = new BitmapDisplayDevice({
      width: 2,
      height: 2,
      onFlush: (regions) => flushes.push(regions.map((region) => ({ ...region }))),
    });

    device.write(FRAMEBUFFER_OFFSET, 0xaa);
    assert.strictEqual(flushes.length, 0, "writes do not flush until the update bit is set");

    device.write(FLUSH_OFFSET, 0x0);
    assert.strictEqual(flushes.length, 0, "clearing the control word alone does not flush");

    device.write(FRAMEBUFFER_OFFSET + 8, 0xbb);
    device.write(FLUSH_OFFSET, 0x1);

    assert.strictEqual(device.read(FLUSH_OFFSET) & 0x1, 0, "update bit is cleared after flush");
    assert.strictEqual(flushes.length, 1, "setting the update bit triggers a flush");
    assert.deepStrictEqual(flushes[0], [{ x: 0, y: 0, width: 1, height: 2 }]);
    assert.deepStrictEqual(device.getDirtyRegions(), [], "dirty regions are reset after flushing");
  });
});
