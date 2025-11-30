import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assembleAndLoad, Memory } from "../../src/core";

describe("self-modifying code", () => {
  it("invalidates instruction cache lines when text is rewritten", () => {
    const source = [
      ".text",
      "jal patched", // warm the instruction cache with the placeholder instruction
      "nop",
      "lui $t0, 0x2402",
      "ori $t0, $t0, 0x002a", // $t0 = addiu $v0, $zero, 42
      "la $t1, patched",
      "sw $t0, 0($t1)", // overwrite the placeholder instruction
      "jal patched", // should now observe the patched instruction
      "nop",
      "add $s0, $v0, $zero", // preserve the patched result
      "addi $v0, $zero, 10",
      "syscall", // exit
      "patched:",
      "addiu $v0, $zero, 1", // placeholder value to be replaced
      "jr $ra",
      "nop",
    ].join("\n");

    const memory = new Memory({
      dataCache: { size: 64, lineSize: 16, associativity: 1, writePolicy: "write-through" },
      instructionCache: { size: 64, lineSize: 16, associativity: 1 },
    });

    const { engine } = assembleAndLoad(source, { memory });
    engine.run(64);

    const state = engine.getState();
    assert.ok(state.isTerminated());
    assert.equal(state.getRegister(16), 42); // $s0
  });
});
