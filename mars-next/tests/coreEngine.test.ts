import assert from "node:assert";
import { describe, test } from "node:test";

import { assemble, createEngine, type EngineStepResult } from "../src/core";
import { TerminalDevice } from "../src/core/devices/TerminalDevice";

function drain(engineStep: () => EngineStepResult, isTerminated: () => boolean, limit = 64): void {
  let cycles = 0;
  while (!isTerminated() && cycles < limit) {
    engineStep();
    cycles += 1;
  }
}

describe("CoreEngine public API", () => {
  test("assembles, loads, and runs a small program", () => {
    const source = [
      ".data",
      "value: .word 7",
      ".text",
      "addi $t0, $zero, 2",
      "addi $t1, $zero, 5",
      "add $a0, $t0, $t1", // -> 7
      "addi $v0, $zero, 1", // print_int
      "syscall",
      "addi $v0, $zero, 10", // exit
      "syscall",
    ].join("\n");

    const terminal = new TerminalDevice(() => {});
    const engine = createEngine({ devices: { terminal } });
    const image = assemble(source);
    const layout = engine.load(image);

    const firstStep = engine.step();
    assert.strictEqual(firstStep, "running");
    assert.strictEqual(engine.getState().getProgramCounter(), layout.textBase + 4);

    drain(() => engine.step(), () => engine.getState().isTerminated());

    const state = engine.getState();
    assert.ok(state.isTerminated());
    assert.strictEqual(state.getRegister(4), 7);
    assert.strictEqual(engine.getMemory().readWord(image.dataBase), 7);
    assert.deepStrictEqual(terminal.getOutputLog(), ["7"]);
  });

  test("halts on breakpoints and can resume execution", () => {
    const source = [
      "addi $t0, $zero, 1",
      "addi $t0, $t0, 2",
      "addi $v0, $zero, 10",
      "syscall",
    ].join("\n");

    const engine = createEngine();
    const { textBase } = engine.load(assemble(source));

    engine.addBreakpoint(textBase);
    const result = engine.step();
    assert.strictEqual(result, "breakpoint");
    assert.strictEqual(engine.getState().getProgramCounter(), textBase);

    engine.clearBreakpoints();
    engine.resume();

    const outcomes: EngineStepResult[] = [];
    while (!engine.getState().isTerminated()) {
      outcomes.push(engine.step());
    }

    assert.ok(outcomes.includes("running"));
    assert.strictEqual(engine.getState().getRegister(8), 3); // $t0
  });

  test("exposes performance counters for debugging", () => {
    const source = [
      "addi $t0, $zero, 1",
      "addi $t1, $zero, 2",
    ].join("\n");

    const engine = createEngine();
    engine.load(assemble(source));

    assert.deepStrictEqual(engine.getPerformanceCounters(), {
      cycleCount: 0,
      instructionCount: 0,
      stallCount: 0,
    });

    engine.step();
    engine.step();

    const counters = engine.getPerformanceCounters();
    assert.strictEqual(counters.cycleCount, 2);
    assert.strictEqual(counters.stallCount, 0);
    assert.ok(counters.instructionCount <= counters.cycleCount);

    engine.resetPerformanceCounters();
    assert.deepStrictEqual(engine.getPerformanceCounters(), {
      cycleCount: 0,
      instructionCount: 0,
      stallCount: 0,
    });
  });
});
