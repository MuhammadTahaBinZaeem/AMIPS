import assert from "node:assert";
import { describe, test } from "node:test";

import { Assembler } from "../../src/core/assembler/Assembler";
import { parsePseudoOpsFile } from "../../src/core/assembler/PseudoOps";

describe("Pseudo-op table bootstrap", () => {
  test("loads definitions during assembler initialization", () => {
    const assembler = new Assembler();
    const table = assembler.getPseudoOpTable();

    const notForms = table.get("not");
    assert.ok(notForms);
    assert.deepStrictEqual(notForms?.[0]?.tokens, ["not", "$t1", "$t2"]);
    assert.deepStrictEqual(notForms?.[0]?.templates, ["nor RG1, RG2, $0"]);
  });

  test("parses tokens and templates from a pseudo-op definition", () => {
    const table = parsePseudoOpsFile("lw $t0,100($t1)\tlw RG1, LLP(RG2)\t#load word\n");
    const lwForms = table.get("lw");

    assert.ok(lwForms);
    assert.deepStrictEqual(lwForms?.[0]?.tokens, ["lw", "$t0", "100", "(", "$t1", ")"]);
    assert.deepStrictEqual(lwForms?.[0]?.templates, ["lw RG1, LLP(RG2)"]);
    assert.strictEqual(lwForms?.[0]?.description, "load word");
  });
});
