import assert from "node:assert";
import { describe, test } from "node:test";

import { macroPattern, parseMacro } from "../../src/core/assembler/MacroParser";

describe("MacroParser", () => {
  test("parses register- and operand-based macros", () => {
    assert.deepStrictEqual(parseMacro("RG2"), { kind: "RG", raw: "RG2", index: 2 });
    assert.deepStrictEqual(parseMacro("NR3"), { kind: "NR", raw: "NR3", index: 3 });
    assert.deepStrictEqual(parseMacro("OP1"), { kind: "OP", raw: "OP1", index: 1 });

    assert.deepStrictEqual(parseMacro("RG10"), { kind: "RG", raw: "RG10", index: 10 });
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

    assert.deepStrictEqual(parseMacro("LL12U"), { kind: "LL", raw: "LL12U", index: 12, addend: 0, unsigned: true });
  });

  test("parses high-half label variants", () => {
    assert.deepStrictEqual(parseMacro("LH3P2"), { kind: "LH", raw: "LH3P2", index: 3, addend: 2 });
    assert.deepStrictEqual(parseMacro("LHPA"), { kind: "LHPA", raw: "LHPA", addend: 0 });
    assert.deepStrictEqual(parseMacro("LHPAP1"), { kind: "LHPA", raw: "LHPAP1", addend: 1 });
    assert.deepStrictEqual(parseMacro("LHPN"), { kind: "LHPN", raw: "LHPN" });
  });

  test("parses branch offset macros with multi-digit offsets", () => {
    assert.deepStrictEqual(parseMacro("BROFF12"), {
      kind: "BROFF",
      raw: "BROFF12",
      disabledOffset: 1,
      enabledOffset: 2,
    });

    assert.deepStrictEqual(parseMacro("BROFF200"), {
      kind: "BROFF",
      raw: "BROFF200",
      disabledOffset: 20,
      enabledOffset: 0,
    });

    assert.deepStrictEqual(parseMacro("BROFF1234"), {
      kind: "BROFF",
      raw: "BROFF1234",
      disabledOffset: 12,
      enabledOffset: 34,
    });
  });

  test("matches multi-digit macros in pseudo-op templates", () => {
    const matches = "add RG10,LL12U,BROFF200".match(macroPattern);
    assert.deepStrictEqual(matches, ["RG10", "LL12U", "BROFF200"]);
  });

  test("returns undefined for unknown macros", () => {
    assert.strictEqual(parseMacro("UNKNOWN"), undefined);
    assert.strictEqual(parseMacro("L"), undefined);
  });
});
