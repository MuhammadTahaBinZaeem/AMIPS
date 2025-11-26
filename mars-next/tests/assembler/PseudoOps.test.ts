import assert from "node:assert";
import { describe, test } from "node:test";

import { Assembler } from "../../src/core/assembler/Assembler";
import { buildPseudoOpDocumentation, parsePseudoOpsFile } from "../../src/core/assembler/PseudoOps";

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

  test("uses inline comments as descriptions for documentation", () => {
    const table = parsePseudoOpsFile("foo $t0\taddi RG1, RG2, VL3 #inline description\n");
    const fooForms = table.get("foo");

    assert.ok(fooForms);
    assert.strictEqual(fooForms?.[0]?.description, "inline description");
  });
});

describe("Pseudo-op expansion", () => {
  test("expands 32-bit immediate addi through the pseudo-op table", () => {
    const assembler = new Assembler();
    const result = assembler.assemble("addi $t0, $t1, 100000\n");

    assert.deepStrictEqual(result.text, [0x3c010001, 0x342186a0, 0x01214020]);
  });

  test("feeds generated pseudo-ops back through the parser", () => {
    const assembler = new Assembler();
    const program = `
la $t0, data
j end
.data
data: .word 0
.text
end: nop
`;

    const result = assembler.assemble(program);

    assert.strictEqual(result.text.length, 4);
    assert.strictEqual(result.text[0], 0x3c011001);
    assert.strictEqual(result.text[1], 0x34280000);
  });

  test("throws when pseudo-instructions are disabled", () => {
    const assembler = new Assembler({ enablePseudoInstructions: false });

    assert.throws(
      () => assembler.assemble("li $t0, 1"),
      /Pseudo-instruction li is disabled.*Enable pseudo-instructions/,
    );
    assert.throws(
      () => assembler.assemble("addi $t0, $t1, 100000\n"),
      /Pseudo-instruction addi is disabled.*Enable pseudo-instructions/,
    );
  });
});

describe("Pseudo-op documentation", () => {
  test("lists syntax, expansions, and descriptive text", () => {
    const table = parsePseudoOpsFile(
      [
        "foo $t0\taddi RG1, RG2, VL3\t#load immediate into foo",
        "bar $t0\tlui RG1, VHL2\tCOMPACT ori RG1, RG1, VL2U\t#two-step load",
      ].join("\n"),
    );

    const docs = buildPseudoOpDocumentation(table);
    const fooDoc = docs.find((entry) => entry.mnemonic === "foo");
    const barDoc = docs.find((entry) => entry.mnemonic === "bar");

    assert.deepStrictEqual(fooDoc?.forms[0]?.expansions, ["addi RG1, RG2, VL3"]);
    assert.strictEqual(fooDoc?.forms[0]?.description, "load immediate into foo");
    assert.deepStrictEqual(barDoc?.forms[0]?.expansions, ["lui RG1, VHL2", "ori RG1, RG1, VL2U"]);
    assert.strictEqual(barDoc?.forms[0]?.description, "two-step load");
  });
});
