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
    assert.deepStrictEqual(image.data, [0, 0, 0, 100, 0, 0, 0, 200, 255, 255, 255, 255]);
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

  test("computes forward branch offsets", () => {
    const source = [
      "beq $t0, $t1, target",
      "addi $t2, $zero, 1",
      "target: addi $t2, $t2, 2",
    ].join("\n");

    const image = new Assembler().assemble(source);
    assert.deepStrictEqual(toHexWords(image.text), ["0x11090001", "0x200a0001", "0x214a0002"]);
    assert.strictEqual(image.symbols["target"], image.textBase + 8);
  });

  test("expands muli pseudo-instruction using mul", () => {
    const source = "muli $t0, $t1, 5";

    const image = new Assembler().assemble(source);
    assert.deepStrictEqual(toHexWords(image.text), ["0x20010005", "0x71214002"]);
  });

  test("throws on unknown instructions", () => {
    const source = "bogus $t0, $t1, $t2";
    const assembler = new Assembler();

    assert.throws(() => assembler.assemble(source), /Unknown instruction/);
  });

  test("rejects invalid operand syntax", () => {
    const assembler = new Assembler();

    assert.throws(() => assembler.assemble(".text\n.word 1"), /.word is only allowed in .data/);
    assert.throws(() => assembler.assemble("addi $t0 $t1 5"), /Unable to parse operand/);
  });

  test("handles additional data layout directives", () => {
    const floatBytes = (value: number) => {
      const view = new DataView(new ArrayBuffer(4));
      view.setFloat32(0, value, false);
      return [view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)];
    };

    const doubleBytes = (value: number) => {
      const view = new DataView(new ArrayBuffer(8));
      view.setFloat64(0, value, false);
      return [
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3),
        view.getUint8(4),
        view.getUint8(5),
        view.getUint8(6),
        view.getUint8(7),
      ];
    };

    const source = [
      ".data",
      ".byte 1, -1",
      ".half 0x1234, label",
      ".align 2",
      "label: .float 1.5",
      ".double -2.5",
      ".space 3",
      ".ascii \"hi\"",
      ".asciiz \"z\"",
    ].join("\n");

    const image = new Assembler().assemble(source);

    assert.strictEqual(image.symbols["label"], image.dataBase + 8);
    assert.deepStrictEqual(image.dataWords, []);
    assert.deepStrictEqual(
      image.data,
      [
        0x01,
        0xff,
        0x12,
        0x34,
        0x00,
        0x08,
        0x00,
        0x00,
        ...floatBytes(1.5),
        0x00,
        0x00,
        0x00,
        0x00,
        ...doubleBytes(-2.5),
        0x00,
        0x00,
        0x00,
        0x68,
        0x69,
        0x7a,
        0x00,
      ],
    );
  });

  test("aligns data according to directive requirements", () => {
    const source = [
      ".data",
      ".byte 0xaa",
      "half_label: .half 0x1234",
      ".byte 0xdd",
      "word_label: .word 0x11223344",
      ".byte 0xee",
      "double_label: .double 0",
      ".byte 0xff",
      "float_label: .float 0",
    ].join("\n");

    const image = new Assembler().assemble(source);

    assert.strictEqual(image.symbols["half_label"], image.dataBase + 2);
    assert.strictEqual(image.symbols["word_label"], image.dataBase + 8);
    assert.strictEqual(image.symbols["double_label"], image.dataBase + 16);
    assert.strictEqual(image.symbols["float_label"], image.dataBase + 28);
    assert.deepStrictEqual(image.dataWords, [0x11223344]);
    assert.deepStrictEqual(
      image.data,
      [
        0xaa,
        0x00,
        0x12,
        0x34,
        0xdd,
        0x00,
        0x00,
        0x00,
        0x11,
        0x22,
        0x33,
        0x44,
        0xee,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0xff,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
      ],
    );
  });

  test("evaluates expressions within directives", () => {
    const source = [
      ".data",
      ".eqv four, 2 + 2",
      "base: .word 1 + 2 * 3, four << 1",
      ".byte four - 1, ~0xff & 0xff",
      ".space 1 << 2",
      ".align 1 + 1",
      "aligned: .half (base >> 1) + 3",
    ].join("\n");

    const image = new Assembler().assemble(source);

    assert.strictEqual(image.symbols["base"], image.dataBase);
    assert.strictEqual(image.symbols["aligned"], image.dataBase + 16);
    assert.deepStrictEqual(image.dataWords, [7, 8]);
    assert.deepStrictEqual(image.data, [
      0x00,
      0x00,
      0x00,
      0x07,
      0x00,
      0x00,
      0x00,
      0x08,
      0x03,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x80,
      0x03,
    ]);
  });

  test("expands simple macros with parameters", () => {
    const source = [
      ".macro inc reg",
      "addi reg, reg, 1",
      ".end_macro",
      ".text",
      "inc $t0",
      "inc $t1",
    ].join("\n");

    const image = new Assembler().assemble(source);
    assert.deepStrictEqual(toHexWords(image.text), ["0x21080001", "0x21290001"]);
  });

  test("renames macro-local labels per expansion", () => {
    const source = [
      ".macro loop reg",
      "loop_body:",
      "addi reg, reg, -1",
      "bne reg, $zero, loop_body",
      ".end_macro",
      ".text",
      "loop $t0",
      "loop $t1",
    ].join("\n");

    const image = new Assembler().assemble(source);

    assert.strictEqual(image.symbols["loop_body_M0"], image.textBase);
    assert.strictEqual(image.symbols["loop_body_M1"], image.textBase + 8);
    assert.deepStrictEqual(toHexWords(image.text), ["0x2108ffff", "0x1500fffe", "0x2129ffff", "0x1520fffe"]);
  });
});
