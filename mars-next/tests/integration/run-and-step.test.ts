import assert from "node:assert";
import { describe, test } from "node:test";

import { assembleAndLoad, loadMachineFromBinary } from "../../src/core";
import { TerminalDevice } from "../../src/core/devices/TerminalDevice";

function runToCompletion(step: () => string, isDone: () => boolean, maxCycles = 64): void {
  let cycles = 0;
  while (!isDone() && cycles < maxCycles) {
    step();
    cycles += 1;
  }
}

describe("core public API integration", () => {
  test("assemble → load → step lifecycle works end-to-end", () => {
    const program = [
      ".data",
      "buffer: .word 0x11223344",
      ".text",
      "addi $t0, $zero, 4",
      "addi $t1, $zero, 5",
      "add $a0, $t0, $t1", // => 9
      "addi $v0, $zero, 1", // print_int
      "syscall",
      "addi $v0, $zero, 10", // exit
      "syscall",
    ].join("\n");

    const terminal = new TerminalDevice(() => {});
    const { engine, image, layout } = assembleAndLoad(program, { devices: { terminal } });

    let result = engine.step();
    assert.strictEqual(result, "running");
    assert.strictEqual(engine.getState().getProgramCounter(), layout.textBase + 4);

    runToCompletion(() => {
      result = engine.step();
      return result;
    }, () => result === "terminated");

    assert.strictEqual(result, "terminated");
    assert.ok(engine.getState().isTerminated());
    assert.deepStrictEqual(terminal.getOutputLog(), ["9"]);
    assert.strictEqual(engine.getMemory().readWord(image.dataBase), 0x11223344);

    const reload = loadMachineFromBinary(image);
    reload.run(32);
    assert.ok(reload.getState().isTerminated());
  });
});
