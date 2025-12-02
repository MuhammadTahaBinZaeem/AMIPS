import assert from "assert";
import { describe, test } from "node:test";
import { Assembler } from "../../src/core/assembler/Assembler";
import { Pipeline, ProgramMemory } from "../../src/core/cpu/Pipeline";
import { MachineState } from "../../src/core/state/MachineState";

function buildPipeline(source: string, options?: { forwardingEnabled?: boolean; hazardDetectionEnabled?: boolean }) {
  const assembler = new Assembler();
  const image = assembler.assemble(source);
  const state = new MachineState();
  const memory = new ProgramMemory(image.text, image.textBase);

  const pipeline = new Pipeline({
    memory,
    state,
    forwardingEnabled: options?.forwardingEnabled,
    hazardDetectionEnabled: options?.hazardDetectionEnabled,
  });

  return { pipeline, state };
}

describe("Pipeline hazard toggles", () => {
  test("disabling hazard detection allows load-use to advance", () => {
    const { pipeline, state } = buildPipeline(
      [
        ".text",
        "lw $t0, 0($zero)",
        "add $t1, $t0, $t0",
        "addi $t2, $zero, 1",
      ].join("\n"),
      { hazardDetectionEnabled: false },
    );

    pipeline.step();
    pipeline.step();
    const pcBeforeDependency = state.getProgramCounter();

    pipeline.step();
    assert.strictEqual(state.getProgramCounter(), (pcBeforeDependency + 4) | 0);
  });

  test("disabling forwarding inserts extra bubbles for RAW hazards", () => {
    const { pipeline, state } = buildPipeline(
      [
        ".text",
        "addi $t0, $zero, 3",
        "add $t1, $t0, $t0",
        "add $t2, $t1, $t0",
      ].join("\n"),
      { forwardingEnabled: false },
    );

    pipeline.step();
    pipeline.step();
    const pcBeforeDependency = state.getProgramCounter();

    pipeline.step();
    assert.strictEqual(state.getProgramCounter(), pcBeforeDependency);

    let waitCycles = 0;
    while (state.getProgramCounter() === pcBeforeDependency && waitCycles < 6) {
      pipeline.step();
      waitCycles += 1;
    }

    assert.ok(waitCycles >= 1, "expected at least one stall when forwarding is disabled");
    assert.strictEqual(state.getProgramCounter(), (pcBeforeDependency + 4) | 0);
  });
});
