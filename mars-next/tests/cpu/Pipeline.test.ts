import assert from "node:assert";
import { describe, test } from "node:test";

import { Assembler } from "../../src/core/assembler/Assembler";
import { ProgramMemory, Pipeline } from "../../src/core/cpu/Pipeline";
import { MachineState, DEFAULT_TEXT_BASE } from "../../src/core/state/MachineState";

type PipelineFixture = {
  pipeline: Pipeline;
  state: MachineState;
};

function buildPipeline(source: string): PipelineFixture {
  const assembler = new Assembler();
  const image = assembler.assemble(source);
  const state = new MachineState();
  const memory = new ProgramMemory(image.text, image.textBase);

  return {
    pipeline: new Pipeline({ memory, state }),
    state,
  };
}

describe("Pipeline", () => {
  test("steps through assembled arithmetic program and updates PC", () => {
    const { pipeline, state } = buildPipeline(
      [
        ".text",
        "addi $t0, $zero, 5",
        "addi $t1, $zero, 7",
        "add $t2, $t0, $t1",
      ].join("\n"),
    );

    pipeline.run(10);

    assert.strictEqual(state.getRegister(8), 5);
    assert.strictEqual(state.getRegister(9), 7);
    assert.strictEqual(state.getRegister(10), 12);
    assert.strictEqual(state.getProgramCounter(), (DEFAULT_TEXT_BASE + 12) | 0);
  });

  test("branches taken with delay slot updating PC and registers", () => {
    const { pipeline, state } = buildPipeline(
      [
        ".text",
        "addi $t0, $zero, 1",
        "addi $t1, $zero, 1",
        "beq $t0, $t1, target",
        "addi $v0, $zero, 5", // delay slot
        "addi $v1, $zero, 9", // skipped when branch is taken
        "target: addi $a0, $zero, 7",
      ].join("\n"),
    );

    pipeline.run(12);

    assert.strictEqual(state.getRegister(2), 5);
    assert.strictEqual(state.getRegister(3), 0);
    assert.strictEqual(state.getRegister(4), 7);
    assert.strictEqual(state.getProgramCounter(), (DEFAULT_TEXT_BASE + 24) | 0);
  });

  test("falls through when branch condition fails", () => {
    const { pipeline, state } = buildPipeline(
      [
        ".text",
        "addi $t0, $zero, 1",
        "addi $t1, $zero, 2", // condition fails
        "beq $t0, $t1, target",
        "addi $v0, $zero, 5", // delay slot always runs
        "addi $v1, $zero, 9", // executes on fall-through
        "target: addi $a0, $zero, 7",
      ].join("\n"),
    );

    pipeline.run(12);

    assert.strictEqual(state.getRegister(2), 5);
    assert.strictEqual(state.getRegister(3), 9);
    assert.strictEqual(state.getRegister(4), 7);
    assert.strictEqual(state.getProgramCounter(), (DEFAULT_TEXT_BASE + 24) | 0);
  });
});
