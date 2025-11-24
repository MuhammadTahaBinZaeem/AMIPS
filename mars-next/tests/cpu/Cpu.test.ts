import assert from "node:assert";
import { describe, test } from "node:test";

import { Cpu, DecodedInstruction, InstructionDecoder, InstructionMemory } from "../../src/core/cpu/Cpu";
import { MachineState } from "../../src/core/state/MachineState";
import { Memory } from "../../src/core/memory/Memory";
import { decodeInstruction } from "../../src/core/cpu/Instructions";
import {
  ArithmeticOverflow,
  InvalidInstruction,
  MemoryAccessException,
  SyscallException,
} from "../../src/core/exceptions/ExecutionExceptions";

class FakeMemory implements InstructionMemory {
  constructor(private readonly words: Record<number, number>) {}

  loadWord(address: number): number {
    if (!(address in this.words)) {
      throw new Error(`No instruction at ${address.toString(16)}`);
    }
    return this.words[address];
  }

  readWord(address: number): number {
    return this.loadWord(address);
  }

  readByte(): number {
    throw new Error("Byte reads are not supported in FakeMemory");
  }

  writeWord(address: number, value: number): void {
    this.words[address] = value;
  }

  writeByte(): void {
    throw new Error("Byte writes are not supported in FakeMemory");
  }
}

class FakeDecoder implements InstructionDecoder {
  private readonly handlers: DecodedInstruction[];
  private index = 0;

  constructor(handlers: DecodedInstruction[]) {
    this.handlers = handlers;
  }

  decode(): DecodedInstruction | null {
    return this.handlers[this.index++] ?? null;
  }
}

describe("Cpu", () => {
  test("pre-increments PC before executing an instruction", () => {
    const state = new MachineState();
    const memory = new FakeMemory({
      [state.getProgramCounter()]: 0x1,
    });

    const observedPC: number[] = [];
    const decoder = new FakeDecoder([
      {
        name: "observe",
        execute: (machine) => {
          observedPC.push(machine.getProgramCounter());
        },
      },
    ]);

    const cpu = new Cpu({ memory, decoder, state });
    cpu.step();

    assert.deepStrictEqual(observedPC, [state.getProgramCounter()]);
  });

  test("honors delayed branch progression across steps", () => {
    const state = new MachineState();
    const startPC = state.getProgramCounter();
    const branchTarget = (startPC + 0x100) | 0;
    const memory = new FakeMemory({
      [startPC]: 0x1,
      [startPC + 4]: 0x2,
    });

    const decoder = new FakeDecoder([
      {
        name: "branch",
        execute: (machine) => machine.registerDelayedBranch(branchTarget),
      },
      {
        name: "delaySlot",
        execute: () => {
          /* no-op */
        },
      },
    ]);

    const cpu = new Cpu({ memory, decoder, state });

    cpu.step();
    assert.strictEqual(state.getProgramCounter(), (startPC + 4) | 0);
    assert.ok(state.isBranchTriggered());

    cpu.step();
    assert.strictEqual(state.getProgramCounter(), branchTarget);
    assert.ok(!state.isBranchTriggered());
  });

  test("raises typed exceptions for invalid instructions", () => {
    const state = new MachineState();
    const memory = new Memory();
    const pc = state.getProgramCounter();
    memory.writeWord(pc, 0xffffffff);

    const cpu = new Cpu({ memory, decoder: { decode: (instruction, currentPc) => decodeInstruction(instruction, currentPc) }, state });

    let caught: unknown;
    assert.throws(() => {
      try {
        cpu.step();
      } catch (error) {
        caught = error;
        throw error;
      }
    }, InvalidInstruction);

    const error = caught as InvalidInstruction;
    assert.strictEqual(error.pc, pc >>> 0);
    assert.strictEqual(error.instruction, 0xffffffff);
  });

  test("reports arithmetic overflow with PC context", () => {
    const state = new MachineState();
    const memory = new Memory();
    const pc = state.getProgramCounter();

    memory.writeWord(pc, 0x21080001); // addi $t0, $t0, 1
    state.setRegister(8, 0x7fffffff);

    const cpu = new Cpu({ memory, decoder: { decode: (instruction, currentPc) => decodeInstruction(instruction, currentPc) }, state });

    let caught: unknown;
    assert.throws(() => {
      try {
        cpu.step();
      } catch (error) {
        caught = error;
        throw error;
      }
    }, ArithmeticOverflow);

    const error = caught as ArithmeticOverflow;
    assert.strictEqual(error.pc, pc >>> 0);
  });

  test("wraps unaligned memory access errors with PC context", () => {
    const state = new MachineState();
    const memory = new Memory();
    const pc = state.getProgramCounter();

    memory.writeWord(pc, 0x8c080001); // lw $t0, 1($zero)

    const cpu = new Cpu({ memory, decoder: { decode: (instruction, currentPc) => decodeInstruction(instruction, currentPc) }, state });

    let caught: unknown;
    assert.throws(() => {
      try {
        cpu.step();
      } catch (error) {
        caught = error;
        throw error;
      }
    }, MemoryAccessException);

    const error = caught as MemoryAccessException;
    assert.strictEqual(error.pc, pc >>> 0);
    assert.strictEqual(error.address, 1);
    assert.strictEqual(error.access, "read");
  });

  test("surfaces syscalls as exceptions when no table is wired", () => {
    const state = new MachineState();
    const memory = new Memory();
    const pc = state.getProgramCounter();
    state.setRegister(2, 42);
    memory.writeWord(pc, 0x0000000c); // syscall

    const cpu = new Cpu({ memory, decoder: { decode: (instruction, currentPc) => decodeInstruction(instruction, currentPc) }, state });

    let caught: unknown;
    assert.throws(() => {
      try {
        cpu.step();
      } catch (error) {
        caught = error;
        throw error;
      }
    }, SyscallException);

    const error = caught as SyscallException;
    assert.strictEqual(error.pc, pc >>> 0);
    assert.strictEqual(error.code, 42);
  });
});

