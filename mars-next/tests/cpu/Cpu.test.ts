import assert from "node:assert";
import { describe, test } from "node:test";

import { Cpu, DecodedInstruction, InstructionDecoder, InstructionMemory } from "../../src/core/cpu/Cpu";
import { MachineState } from "../../src/core/state/MachineState";

class FakeMemory implements InstructionMemory {
  constructor(private readonly words: Record<number, number>) {}

  loadWord(address: number): number {
    if (!(address in this.words)) {
      throw new Error(`No instruction at ${address.toString(16)}`);
    }
    return this.words[address];
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
});

