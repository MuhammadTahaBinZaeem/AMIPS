import assert from "node:assert";
import { describe, test } from "node:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { Assembler } from "../../src/core/assembler/Assembler";

const toHexWords = (words: number[]): string[] => words.map((w) => `0x${(w >>> 0).toString(16)}`);

const nodeResolver = (absolutePath: string) => fs.readFileSync(path.normalize(absolutePath), "utf8");

describe(".include processing", () => {
  test("inlines included files relative to the base directory", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mars-include-"));
    const nestedDir = path.join(tempDir, "nested");
    fs.mkdirSync(nestedDir);

    const helperPath = path.join(tempDir, "helper.s");
    fs.writeFileSync(helperPath, [".text", "helper: addi $t0, $zero, 1"].join("\n"));

    fs.writeFileSync(path.join(nestedDir, "inner.s"), [".include \"../helper.s\"", "addi $t0, $t0, 2"].join("\n"));

    const source = [".include \"nested/inner.s\"", "addi $t0, $t0, 3"].join("\n");
    const assembler = new Assembler();

    const image = assembler.assemble(source, { baseDir: tempDir, includeResolver: nodeResolver });

    assert.deepStrictEqual(toHexWords(image.text), ["0x20080001", "0x21080002", "0x21080003"]);
    assert.strictEqual(image.symbols["helper"], image.textBase);
  });

  test("detects recursive include chains", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mars-include-"));
    const selfPath = path.join(tempDir, "self.s");
    fs.writeFileSync(selfPath, ".include \"self.s\"\naddi $t0, $t0, 1");

    const assembler = new Assembler();
    assert.throws(() => assembler.assemble('.include "self.s"', { baseDir: tempDir, includeResolver: nodeResolver }),
      /Recursive \.include detected/,
    );
  });
});
