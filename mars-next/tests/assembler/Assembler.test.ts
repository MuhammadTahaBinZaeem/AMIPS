import assert from "node:assert";
import { describe, test } from "node:test";

import { Assembler } from "../../src/core/assembler/Assembler";
import { Lexer } from "../../src/core/assembler/Lexer";
import { Parser } from "../../src/core/assembler/Parser";
import { parsePseudoOpsFile } from "../../src/core/assembler/PseudoOps";

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

  test("supports symbolic memory operands for load and store", () => {
    const source = [
      ".eqv load_offset, 12",
      ".eqv store_offset, 0x10 + 2",
      "lb $t0, load_offset($t1)",
      "sh $t2, store_offset($t3)",
    ].join("\n");

    const image = new Assembler().assemble(source);

    const expectedLb = (0x20 << 26) | (9 << 21) | (8 << 16) | 12;
    const expectedSh = (0x29 << 26) | (11 << 21) | (10 << 16) | 0x0012;

    assert.deepStrictEqual(image.text, [expectedLb, expectedSh]);
    assert.strictEqual(image.symbols["load_offset"], 12);
    assert.strictEqual(image.symbols["store_offset"], 0x12);
  });

  test("expands muli pseudo-instruction using mul", () => {
    const source = "muli $t0, $t1, 5";

    const image = new Assembler().assemble(source);
    assert.deepStrictEqual(toHexWords(image.text), ["0x20010005", "0x71214002"]);
  });

  test("uses compact pseudo-op templates when operands fit in 16 bits", () => {
    const assembler = new Assembler();
    const custom = parsePseudoOpsFile(
      "foo $t0,100000\tlui RG1, VHL2\tori RG1, RG1, VL2U\tCOMPACT addiu RG1, $0, VL2",
    );
    const fooForms = custom.get("foo");
    assert.ok(fooForms);
    assembler.getPseudoOpTable().set("foo", fooForms);

    const image = assembler.assemble("foo $t0, 0x1234");
    assert.deepStrictEqual(toHexWords(image.text), ["0x24081234"]);
  });

  test("falls back to default pseudo-op templates when operands exceed 16 bits", () => {
    const assembler = new Assembler();
    const custom = parsePseudoOpsFile(
      "foo $t0,100000\tlui RG1, VHL2\tori RG1, RG1, VL2U\tCOMPACT addiu RG1, $0, VL2",
    );
    const fooForms = custom.get("foo");
    assert.ok(fooForms);
    assembler.getPseudoOpTable().set("foo", fooForms);

    const image = assembler.assemble("foo $t0, 0x12345678");
    assert.deepStrictEqual(toHexWords(image.text), ["0x3c081234", "0x35085678"]);
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

  test("normalizes directive aliases in symbol table calculations", () => {
    const source = [
      ".data",
      ".byte 1",
      ".skip 2",
      ".balign 2",
      "alias_label: .byte 2",
      ".text",
      ".global main",
      ".equ CONST, 5",
      "main:",
      "  addi $t0, $zero, CONST",
      ".extern ext_symbol",
    ].join("\n");

    const image = new Assembler().assemble(source);

    assert.strictEqual(image.symbols["alias_label"], image.dataBase + 4);
    assert.deepStrictEqual(image.data.slice(0, 5), [1, 0, 0, 0, 2]);
    assert.strictEqual(image.symbols["CONST"], 5);
    assert.deepStrictEqual(image.globalSymbols, ["main"]);
    assert.ok(image.externSymbols?.includes("ext_symbol"));
    assert.ok(image.undefinedSymbols?.includes("ext_symbol"));
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

  test("supports legacy-style macro parameters and nested label scoping", () => {
    const source = [
      ".macro inner %reg",
      "inner_loop:",
      "addi %reg, %reg, -1",
      "bne %reg, $zero, inner_loop",
      ".end_macro",
      ".macro outer %reg",
      "inner %reg",
      "inner %reg",
      ".end_macro",
      ".text",
      "outer $t0",
      "outer $t1",
    ].join("\n");

    const image = new Assembler().assemble(source);

    assert.deepStrictEqual(toHexWords(image.text), [
      "0x2108ffff",
      "0x1500fffe",
      "0x2108ffff",
      "0x1500fffe",
      "0x2129ffff",
      "0x1520fffe",
      "0x2129ffff",
      "0x1520fffe",
    ]);
    assert.deepStrictEqual(
      Object.keys(image.symbols)
        .filter((key) => key.startsWith("inner_loop_M"))
        .sort(),
      ["inner_loop_M1", "inner_loop_M2", "inner_loop_M4", "inner_loop_M5"],
    );
  });
});
