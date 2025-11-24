import assert from "node:assert";
import { describe, test } from "node:test";

import { BreakpointEngine } from "../../src/core/debugger/BreakpointEngine";
import { WatchEngine, WatchEvent } from "../../src/core/debugger/WatchEngine";
import { Assembler } from "../../src/core/assembler/Assembler";
import { Cpu, DecodedInstruction, InstructionDecoder, InstructionMemory } from "../../src/core/cpu/Cpu";
import { Pipeline, ProgramMemory as PipelineProgramMemory } from "../../src/core/cpu/Pipeline";
import { decodeInstruction } from "../../src/core/cpu/Instructions";
import { DEFAULT_TEXT_BASE, MachineState } from "../../src/core/state/MachineState";

class ProgramMemory implements InstructionMemory {
  constructor(private readonly base: number, private readonly length: number) {}

  loadWord(address: number): number {
    const offset = address - this.base;
    if (offset < 0 || offset % 4 !== 0) {
      throw new Error(`Invalid address: 0x${address.toString(16)}`);
    }

    const index = offset / 4;
    if (index < 0 || index >= this.length) {
      throw new Error(`Instruction address out of range: 0x${address.toString(16)}`);
    }

    return index;
  }

  hasInstruction(address: number): boolean {
    const offset = address - this.base;
    if (offset < 0 || offset % 4 !== 0) return false;
    const index = offset / 4;
    return index >= 0 && index < this.length;
  }

  readWord(address: number): number {
    return this.loadWord(address);
  }

  readByte(): number {
    throw new Error("Byte reads are not supported in ProgramMemory");
  }

  writeWord(): void {
    throw new Error("Word writes are not supported in ProgramMemory");
  }

  writeByte(): void {
    throw new Error("Byte writes are not supported in ProgramMemory");
  }
}

class SequenceDecoder implements InstructionDecoder {
  constructor(private readonly instructions: DecodedInstruction[], private readonly base: number) {}

  decode(_instruction: number, pc: number): DecodedInstruction | null {
    const index = (pc - this.base) / 4;
    return this.instructions[index] ?? null;
  }
}

class DataMemory extends ProgramMemory {
  private readonly data = new Map<number, number>();

  read(address: number): number {
    return this.data.get(address) ?? 0;
  }

  write(address: number, value: number): void {
    this.data.set(address, value | 0);
  }
}

const createCpu = (instructions: DecodedInstruction[], state = new MachineState()) => {
  const memory = new ProgramMemory(state.getProgramCounter(), instructions.length);
  const decoder = new SequenceDecoder(instructions, state.getProgramCounter());
  return new Cpu({ memory, decoder, state });
};

describe("Debugger subsystem", () => {
  test("halts execution when hitting an address breakpoint", () => {
    const state = new MachineState();
    const breakpointAddress = (DEFAULT_TEXT_BASE + 4) | 0;
    const registerIndex = 9; // $t1

    const instructions: DecodedInstruction[] = [
      {
        name: "set_t0",
        execute: (machine) => machine.setRegister(8, 123),
      },
      {
        name: "set_t1",
        execute: (machine) => machine.setRegister(registerIndex, 999),
      },
    ];

    const cpu = createCpu(instructions, state);
    const breakpoints = new BreakpointEngine();
    const pipeline = new Pipeline({ cpu, breakpoints });

    breakpoints.setBreakpoint(breakpointAddress);

    let status = pipeline.executeCycle();
    assert.strictEqual(status, "running");

    status = pipeline.executeCycle();
    assert.strictEqual(status, "breakpoint");

    assert.strictEqual(state.getProgramCounter(), breakpointAddress);
    assert.strictEqual(state.getRegister(registerIndex), 0);
    assert.strictEqual(breakpoints.getHitBreakpoint(), breakpointAddress);
  });

  test("resumes after removing a breakpoint", () => {
    const state = new MachineState();
    const breakpointAddress = (DEFAULT_TEXT_BASE + 4) | 0;
    const registerIndex = 9;

    const instructions: DecodedInstruction[] = [
      {
        name: "set_t0",
        execute: (machine) => machine.setRegister(8, 123),
      },
      {
        name: "set_t1",
        execute: (machine) => machine.setRegister(registerIndex, 999),
      },
    ];

    const cpu = createCpu(instructions, state);
    const breakpoints = new BreakpointEngine();
    const pipeline = new Pipeline({ cpu, breakpoints });

    breakpoints.setBreakpoint(breakpointAddress);

    pipeline.executeCycle();
    pipeline.executeCycle();
    assert.strictEqual(pipeline.isHalted(), true);

    breakpoints.removeBreakpoint(breakpointAddress);
    pipeline.resume();

    pipeline.run(10);

    assert.strictEqual(state.getProgramCounter(), (DEFAULT_TEXT_BASE + 8) | 0);
    assert.strictEqual(state.getRegister(registerIndex), 999);
  });

  test("emits register watch events when values change", () => {
    const state = new MachineState();
    const watchEngine = new WatchEngine(state);
    const instructions: DecodedInstruction[] = [
      {
        name: "set_t0",
        execute: (machine) => machine.setRegister(8, 42),
      },
    ];

    const cpu = createCpu(instructions, state);
    const pipeline = new Pipeline({ cpu, watchEngine });

    watchEngine.addWatch("register", "$t0");

    pipeline.run(5);

    const events = watchEngine.getWatchChanges();
    assert.strictEqual(events.length, 1);
    assert.deepStrictEqual<WatchEvent>(events[0], {
      kind: "register",
      identifier: "t0",
      oldValue: 0,
      newValue: 42,
    });
  });

  test("reports multiple watch changes across registers and memory", () => {
    const state = new MachineState();
    const memory = new DataMemory(state.getProgramCounter(), 1);
    const watchEngine = new WatchEngine(state, memory);

    const dataAddress = 0x10010000;

    const instructions: DecodedInstruction[] = [
      {
        name: "update_state",
        execute: (machine) => {
          machine.setRegister(9, 5);
          memory.write(dataAddress, 99);
        },
      },
    ];

    const cpu = createCpu(instructions, state);
    const pipeline = new Pipeline({ cpu, watchEngine });

    watchEngine.addWatch("register", "t1");
    watchEngine.addWatch("memory", dataAddress);

    pipeline.run(5);

    const events = watchEngine.getWatchChanges();
    assert.strictEqual(events.length, 2);

    const registerEvent = events.find((event) => event.kind === "register");
    const memoryEvent = events.find((event) => event.kind === "memory");

    assert.deepStrictEqual(registerEvent, {
      kind: "register",
      identifier: "t1",
      oldValue: 0,
      newValue: 5,
    });

    assert.deepStrictEqual(memoryEvent, {
      kind: "memory",
      identifier: dataAddress,
      oldValue: 0,
      newValue: 99,
    });
  });

  test("halts on assembled breakpoints and reports watched register changes", () => {
    const assembler = new Assembler();
    const program = assembler.assemble(
      [
        ".text",
        "addi $t0, $zero, 1",
        "addi $t1, $zero, 2",
        "add $t2, $t0, $t1",
        "syscall", // treated as program termination in test decoder
      ].join("\n"),
    );

    const state = new MachineState();
    const breakpointAddress = (DEFAULT_TEXT_BASE + 4) | 0;

    const breakpoints = new BreakpointEngine();
    const watchEngine = new WatchEngine(state);

      const decoder: InstructionDecoder = {
        decode: (instruction, pc) => {
          if (instruction === 0x0000000c) {
            return { name: "syscall", execute: (machine) => machine.terminate() };
          }

          return decodeInstruction(instruction, pc);
        },
      };

    const pipeline = new Pipeline({
      memory: new PipelineProgramMemory(program.text, program.textBase),
      state,
      decoder,
      breakpoints,
      watchEngine,
    });

    watchEngine.addWatch("register", "$t2");
    breakpoints.setBreakpoint(breakpointAddress);

    let status = pipeline.executeCycle();

    status = pipeline.executeCycle();
    assert.strictEqual(status, "breakpoint");
    assert.strictEqual(state.getProgramCounter(), breakpointAddress);
    assert.strictEqual(state.getRegister(9), 0);
    assert.strictEqual(breakpoints.getHitBreakpoint(), breakpointAddress);

    breakpoints.removeBreakpoint(breakpointAddress);
    pipeline.resume();

    pipeline.run(10);

    assert.strictEqual(pipeline.isHalted(), true);
    assert.strictEqual(state.isTerminated(), true);
    assert.strictEqual(state.getProgramCounter(), (DEFAULT_TEXT_BASE + 16) | 0);
    assert.strictEqual(state.getRegister(8), 1);
    assert.strictEqual(state.getRegister(9), 2);
    assert.strictEqual(state.getRegister(10), 3);

    const events = watchEngine.getWatchChanges();
    assert.deepStrictEqual(events, [
      {
        kind: "register",
        identifier: "t2",
        oldValue: 0,
        newValue: 3,
      },
    ]);
  });
});

