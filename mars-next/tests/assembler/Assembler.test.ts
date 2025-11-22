import assert from "node:assert";
import { describe, test } from "node:test";

import { Assembler } from "../../src/core/assembler/Assembler";
import { Lexer } from "../../src/core/assembler/Lexer";
import { Parser } from "../../src/core/assembler/Parser";

const toHexWords = (words: number[]): string[] => words.map((w) => `0x${(w >>> 0).toString(16)}`);

describe("Assembler pipeline", () => {
  test("tokenizes, parses and assembles a simple program", () => {
    const source = "addi $t0, $t1, 5\nsyscall";
    const lexer = new Lexer();
    const parser = new Parser();
    const assembler = new Assembler();

    const lexed = lexer.tokenize(source);
    assert.deepStrictEqual(
      lexed[0]?.tokens.map((t) => t.type),
      ["identifier", "register", "comma", "register", "comma", "number"],
    );
    assert.deepStrictEqual(lexed[1]?.tokens.map((t) => t.type), ["identifier"]);

    const ast = parser.parse(lexed);
    assert.strictEqual(ast.nodes.length, 2);
    assert.strictEqual(ast.nodes[0].kind, "instruction");
    assert.strictEqual((ast.nodes[0] as any).name, "addi");

    const image = assembler.assemble(source);
    assert.deepStrictEqual(image.text, [0x21280005, 0x0000000c]);
    assert.deepStrictEqual(image.dataWords, []);
  });

  test("places .word data in the data segment", () => {
    const source = [".data", "values: .word 100, 200, -1"].join("\n");
    const image = new Assembler().assemble(source);

    assert.deepStrictEqual(image.dataWords, [100, 200, -1]);
    assert.strictEqual(image.symbols["values"], image.dataBase);
  });

  test("resolves forward label references for jumps", () => {
    const source = [
      ".text",
      "main: j end",
      "add $zero, $zero, $zero",
      "end: li $v0, 10",
      "syscall",
    ].join("\n");

    const image = new Assembler().assemble(source);
    assert.deepStrictEqual(toHexWords(image.text), ["0x8100002", "0x20", "0x2002000a", "0xc"]);
    assert.strictEqual(image.symbols["main"], image.textBase);
  });

  test("throws on unknown instructions", () => {
    const source = "bogus $t0, $t1, $t2";
    const assembler = new Assembler();

    assert.throws(() => assembler.assemble(source), /Unknown instruction/);
  });
});
