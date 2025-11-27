import assert from "node:assert";
import { describe, test } from "node:test";

import { parseMacro } from "../../src/core/assembler/MacroParser";

describe("MacroParser", () => {
  test("parses register- and operand-based macros", () => {
    assert.deepStrictEqual(parseMacro("RG2"), { kind: "RG", raw: "RG2", index: 2 });
    assert.deepStrictEqual(parseMacro("NR3"), { kind: "NR", raw: "NR3", index: 3 });
    assert.deepStrictEqual(parseMacro("OP1"), { kind: "OP", raw: "OP1", index: 1 });
  });

  test("parses value macros with addends and unsigned markers", () => {
    assert.deepStrictEqual(parseMacro("VL2P3U"), {
      kind: "VL",
      raw: "VL2P3U",
      index: 2,
      addend: 3,
      unsigned: true,
    });

    assert.deepStrictEqual(parseMacro("LL4P1"), {
      kind: "LL",
      raw: "LL4P1",
      index: 4,
      addend: 1,
      unsigned: false,
    });

    assert.deepStrictEqual(parseMacro("LLP"), { kind: "LLP", raw: "LLP", addend: 0, unsigned: false });
    assert.deepStrictEqual(parseMacro("LLPU"), { kind: "LLP", raw: "LLPU", addend: 0, unsigned: true });
    assert.deepStrictEqual(parseMacro("LLPP4"), { kind: "LLPP", raw: "LLPP4", addend: 4 });
  });

  test("parses high-half label variants", () => {
    assert.deepStrictEqual(parseMacro("LH3P2"), { kind: "LH", raw: "LH3P2", index: 3, addend: 2 });
    assert.deepStrictEqual(parseMacro("LHPA"), { kind: "LHPA", raw: "LHPA", addend: 0 });
    assert.deepStrictEqual(parseMacro("LHPAP1"), { kind: "LHPA", raw: "LHPAP1", addend: 1 });
    assert.deepStrictEqual(parseMacro("LHPN"), { kind: "LHPN", raw: "LHPN" });
  });

  test("returns undefined for unknown macros", () => {
    assert.strictEqual(parseMacro("UNKNOWN"), undefined);
    assert.strictEqual(parseMacro("L"), undefined);
  });
});
