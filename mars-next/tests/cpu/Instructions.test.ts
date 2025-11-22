import assert from "node:assert";
import { describe, test } from "node:test";

import { decodeInstruction } from "../../src/core/cpu/Instructions";
import { DEFAULT_TEXT_BASE, MachineState } from "../../src/core/state/MachineState";

describe("Instruction decoding", () => {
  test("decodes and executes mul", () => {
    const state = new MachineState();
    state.setRegister(9, 6);
    state.setRegister(10, 7);

    const instruction = 0x712a4002; // mul $t0, $t1, $t2
    const decoded = decodeInstruction(instruction, DEFAULT_TEXT_BASE);

    assert.ok(decoded, "decoder should recognize mul");
    decoded!.execute(state);

    assert.strictEqual(state.getRegister(8), 42);
  });
});
