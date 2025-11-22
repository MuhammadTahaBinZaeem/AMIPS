import assert from "node:assert";
import { describe, test } from "node:test";

import { LEGACY_MNEMONICS } from "../../src/core/assembler/LegacyMnemonics";

function findMnemonic(name: string) {
  return LEGACY_MNEMONICS.find((entry) => entry.mnemonic === name);
}

describe("legacy mnemonic catalog", () => {
  test("includes the full legacy set", () => {
    assert.strictEqual(LEGACY_MNEMONICS.length, 139);
  });

  test("carries syntax and descriptions for representative instructions", () => {
    const add = findMnemonic("add");
    assert.ok(add, "add should be captured from the legacy instruction set");
    assert.ok(
      add.forms.some((form) => form.syntax.startsWith("add $t1")),
      "add should preserve syntax examples",
    );

    const j = findMnemonic("j");
    assert.ok(j, "j should be present");
    assert.ok(j.forms.some((form) => form.description.toLowerCase().includes("jump")));

    const cvt = findMnemonic("cvt.s.w");
    assert.ok(cvt, "floating point conversion instructions should be preserved");
    assert.ok(
      cvt.forms.some((form) => form.description.toLowerCase().includes("single precision")),
    );
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
