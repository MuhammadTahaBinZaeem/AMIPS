import assert from "node:assert";
import { describe, test } from "node:test";

import { LEGACY_MNEMONICS } from "../../src/core/assembler/LegacyMnemonics";

function findMnemonic(name: string) {
  return LEGACY_MNEMONICS.find((entry) => entry.mnemonic === name);
}

describe("legacy mnemonic catalog", () => {
  test("tracks only unported instructions", () => {
    const integrated = [
      "add",
      "addi",
      "addiu",
      "addu",
      "and",
      "beq",
      "bne",
      "j",
      "jal",
      "jr",
      "lui",
      "mul",
      "nop",
      "or",
      "ori",
      "sll",
      "slt",
      "slti",
      "sub",
      "syscall",
    ];

    assert.strictEqual(LEGACY_MNEMONICS.length, 139 - integrated.length);
    integrated.forEach((name) => {
      assert.strictEqual(findMnemonic(name), undefined, `${name} should be fully ported and omitted`);
    });
  });

  test("carries syntax and descriptions for representative instructions", () => {
    const cvt = findMnemonic("cvt.s.w");
    assert.ok(cvt, "floating point conversion instructions should be preserved");
    assert.ok(
      cvt.forms.some((form) => form.description.toLowerCase().includes("single precision")),
    );

    const branchLessThanZero = findMnemonic("bltz");
    assert.ok(branchLessThanZero, "branch families should remain tracked until implemented");
    assert.ok(branchLessThanZero.forms[0].syntax.startsWith("bltz"));
  });

  test("provides syntax and descriptive text for every mnemonic", () => {
    const missingSyntax = LEGACY_MNEMONICS.filter((entry) => entry.forms.some((form) => !form.syntax.trim()));
    const missingDescription = LEGACY_MNEMONICS.filter((entry) =>
      entry.forms.some((form) => !form.description.trim()),
    );

    assert.deepStrictEqual(missingSyntax, [], "all instruction forms should carry example syntax");
    assert.deepStrictEqual(missingDescription, [], "all instruction forms should include a description");
  });
});
