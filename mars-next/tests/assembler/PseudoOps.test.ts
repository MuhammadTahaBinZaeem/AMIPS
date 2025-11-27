import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";

import { Assembler } from "../../src/core/assembler/Assembler";
import {
  buildPseudoOpDocumentation,
  getMacroSymbolDocumentation,
  getPseudoOpDocumentation,
  loadPseudoOpTable,
  parsePseudoOpsFile,
  reloadPseudoOpTable,
  resetPseudoOpCacheForTesting,
  validatePseudoOpsText,
} from "../../src/core/assembler/PseudoOps";

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

  test("rejects malformed pseudo-op definitions", () => {
    assert.doesNotThrow(() => validatePseudoOpsText("foo $t0\taddi RG1, $zero, 1"));

    assert.throws(
      () => validatePseudoOpsText("  bar $t0\taddi RG1, $zero, 1"),
      /must start in the first column/,
    );

    assert.throws(
      () => validatePseudoOpsText("baz $t0 addu RG1, RG2, $zero"),
      /expected tab-separated example and template definitions/,
    );
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

describe("User-supplied pseudo-op table", () => {
  test("overrides bundled definitions from a working directory file", () => {
    const originalCwd = process.cwd();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pseudoops-wd-"));

    try {
      fs.writeFileSync(
        path.join(tempDir, "PseudoOps.txt"),
        [
          "li $t0, 123\taddi RG1, $zero, 123",
          "foo $t1\taddu RG1, RG2, $zero\t#custom foo",
        ].join("\n"),
        "utf8",
      );

      process.chdir(tempDir);
      resetPseudoOpCacheForTesting();

      const table = loadPseudoOpTable();

      const liForms = table.get("li");
      assert.deepStrictEqual(liForms?.[0]?.templates, ["addi RG1, $zero, 123"]);
      assert.strictEqual(liForms?.[0]?.description, undefined);

      const fooForms = table.get("foo");
      assert.ok(fooForms);
      assert.strictEqual(fooForms?.[0]?.description, "custom foo");

      const bundledNot = table.get("not");
      assert.ok(bundledNot, "built-in definitions should still be present");
    } finally {
      process.chdir(originalCwd);
      resetPseudoOpCacheForTesting();
    }
  });

  test("loads JSON pseudo-op overrides from a config directory", () => {
    const originalCwd = process.cwd();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pseudoops-config-"));
    const configDir = path.join(tempDir, "config");
    fs.mkdirSync(configDir);

    try {
      fs.writeFileSync(
        path.join(configDir, "PseudoOps.json"),
        JSON.stringify([
          { example: "bar $t0", templates: ["addi RG1, $zero, 5"], description: "json override" },
          { example: "baz $t1", templates: ["addu RG1, RG2, $zero"] },
        ]),
      );

      process.chdir(tempDir);
      resetPseudoOpCacheForTesting();

      const table = loadPseudoOpTable();

      const barForms = table.get("bar");
      assert.ok(barForms);
      assert.strictEqual(barForms?.[0]?.description, "json override");
      assert.deepStrictEqual(barForms?.[0]?.templates, ["addi RG1, $zero, 5"]);

      const bazForms = table.get("baz");
      assert.ok(bazForms);
    } finally {
      process.chdir(originalCwd);
      resetPseudoOpCacheForTesting();
    }
  });

  test("hot-reloads user pseudo-ops from disk", () => {
    const originalCwd = process.cwd();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pseudoops-reload-"));

    try {
      const pseudoOpsPath = path.join(tempDir, "PseudoOps.txt");
      fs.writeFileSync(pseudoOpsPath, "foo $t0\taddi RG1, $zero, 1", "utf8");

      process.chdir(tempDir);
      resetPseudoOpCacheForTesting();

      const initial = loadPseudoOpTable();
      assert.strictEqual(initial.get("foo")?.[0]?.templates[0], "addi RG1, $zero, 1");

      fs.writeFileSync(pseudoOpsPath, "foo $t0\taddi RG1, $zero, 2", "utf8");

      const reloaded = reloadPseudoOpTable();
      assert.strictEqual(reloaded.get("foo")?.[0]?.templates[0], "addi RG1, $zero, 2");
      assert.ok(reloaded.get("not"), "built-in pseudo-ops remain available after reload");
    } finally {
      process.chdir(originalCwd);
      resetPseudoOpCacheForTesting();
    }
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

  test("refreshes documentation after reloading pseudo-ops", () => {
    const originalCwd = process.cwd();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pseudoops-docs-"));

    try {
      const pseudoOpsPath = path.join(tempDir, "PseudoOps.txt");
      fs.writeFileSync(pseudoOpsPath, "foo $t0\taddi RG1, $zero, 1\t#first description", "utf8");

      process.chdir(tempDir);
      resetPseudoOpCacheForTesting();

      let docs = getPseudoOpDocumentation();
      let fooDoc = docs.find((entry) => entry.mnemonic === "foo");
      assert.strictEqual(fooDoc?.forms[0]?.expansions[0], "addi RG1, $zero, 1");
      assert.strictEqual(fooDoc?.forms[0]?.description, "first description");

      fs.writeFileSync(pseudoOpsPath, "foo $t0\taddi RG1, $zero, 2\t#second description", "utf8");
      reloadPseudoOpTable();

      docs = getPseudoOpDocumentation();
      fooDoc = docs.find((entry) => entry.mnemonic === "foo");
      assert.strictEqual(fooDoc?.forms[0]?.expansions[0], "addi RG1, $zero, 2");
      assert.strictEqual(fooDoc?.forms[0]?.description, "second description");
    } finally {
      process.chdir(originalCwd);
      resetPseudoOpCacheForTesting();
    }
  });

  test("exposes macro symbol documentation", () => {
    const macros = getMacroSymbolDocumentation();
    const broff = macros.find((entry) => entry.symbol === "BROFFnm");

    assert.ok(macros.length > 0);
    assert.ok(broff);
    assert.match(broff?.description ?? "", /delayed branching/i);
  });

  test("documents unsigned and addend macro variants", () => {
    const macros = getMacroSymbolDocumentation();

    const llpu = macros.find((entry) => entry.symbol === "LLPU");
    const vhlAddend = macros.find((entry) => entry.symbol === "VHLnPm");

    assert.ok(llpu, "expected LLPU macro documentation");
    assert.match(llpu?.description ?? "", /unsigned low-order 16 bits/i);

    assert.ok(vhlAddend, "expected VHLnPm macro documentation");
    assert.match(vhlAddend?.description ?? "", /after adding m/i);
  });
});

describe("Pseudo-op macro substitutions", () => {
  test("supports label high/low halves and LLPP offsets", () => {
    const assembler = new Assembler();
    const tokens = (assembler as any).tokenizeExample("bar $t0,label+4($t1)") as string[];

    const withHigh = (assembler as any).applyPseudoTemplate("lui RG1, LH2P1", tokens) as string;
    assert.strictEqual(withHigh, "lui $t0, (((((label+4) + 1) + 0x8000) >> 16) & 0xffff)");

    const withLow = (assembler as any).applyPseudoTemplate("lwl RG1, LLPP3(RG4)", tokens) as string;
    assert.strictEqual(withLow, "lwl $t0, (((((label+4) + 3)) << 16) >> 16)($t1)");
  });

  test("substitutes the first immediate token with IMM", () => {
    const assembler = new Assembler();
    const tokens = (assembler as any).tokenizeExample("immtest $t0,42") as string[];

    const substituted = (assembler as any).applyPseudoTemplate("addi RG1, $zero, IMM", tokens) as string;
    assert.strictEqual(substituted, "addi $t0, $zero, 42");
  });

  test("BROFF selects offsets based on delayed branching setting", () => {
    const tokens = (new Assembler() as any).tokenizeExample("beq $t0, $t1, label");

    const delayedAssembler = new Assembler({ delayedBranchingEnabled: true });
    const delayedSubstitution = (delayedAssembler as any).applyPseudoTemplate("beq RG1, RG2, BROFF12", tokens) as string;
    assert.strictEqual(delayedSubstitution, "beq $t0, $t1, 2");

    const nonDelayedAssembler = new Assembler({ delayedBranchingEnabled: false });
    const nonDelayedSubstitution = (nonDelayedAssembler as any).applyPseudoTemplate("beq RG1, RG2, BROFF12", tokens) as string;
    assert.strictEqual(nonDelayedSubstitution, "beq $t0, $t1, 1");
  });
});
