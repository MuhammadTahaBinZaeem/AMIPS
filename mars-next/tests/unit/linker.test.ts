import assert from "node:assert";
import { describe, test } from "node:test";

import { BinaryImage } from "../../src/core/assembler/Assembler";
import { Linker } from "../../src/core/loader/Linker";
import { DEFAULT_TEXT_BASE } from "../../src/core/state/MachineState";

const DEFAULT_DATA_BASE = 0x10010000;
const DEFAULT_KTEXT_BASE = 0x80000000;
const DEFAULT_KDATA_BASE = 0x90000000;

describe("Linker", () => {
  const baseImage: Pick<BinaryImage, "dataBase" | "kdataBase" | "ktextBase" | "textBase"> = {
    textBase: DEFAULT_TEXT_BASE,
    dataBase: DEFAULT_DATA_BASE,
    ktextBase: DEFAULT_KTEXT_BASE,
    kdataBase: DEFAULT_KDATA_BASE,
  };

  test("merges images, respecting alignment and adjusting relocations", () => {
    const moduleA: BinaryImage = {
      ...baseImage,
      text: [0xaaaaaaa1, 0xbbbbbbb2],
      data: [1, 2, 3],
      dataWords: [],
      ktext: [],
      kdata: [],
      kdataWords: [],
      symbols: { alpha: DEFAULT_TEXT_BASE },
      relocations: [{ segment: "text", offset: 0, symbol: "beta", type: "MIPS_32" }],
      symbolTable: [{ name: "alpha", address: DEFAULT_TEXT_BASE, segment: "text" }],
      sourceMap: [
        { address: DEFAULT_TEXT_BASE, file: "a.asm", line: 1, segment: "text", segmentIndex: 0 },
      ],
    };

    const moduleB: BinaryImage = {
      ...baseImage,
      text: [0xccccccc3],
      data: [4, 5, 6, 7],
      dataWords: [],
      ktext: [],
      kdata: [],
      kdataWords: [],
      symbols: { beta: DEFAULT_DATA_BASE },
      relocations: [{ segment: "data", offset: 0, symbol: "alpha", type: "MIPS_32" }],
      symbolTable: [{ name: "beta", address: DEFAULT_DATA_BASE, segment: "data" }],
      sourceMap: [
        { address: DEFAULT_TEXT_BASE, file: "b.asm", line: 1, segment: "text", segmentIndex: 0 },
      ],
    };

    const linker = new Linker();
    const linked = linker.link([moduleA, moduleB]);

    assert.deepStrictEqual(linked.text, [0xaaaaaaa1, 0xbbbbbbb2, 0xccccccc3]);
    assert.deepStrictEqual(linked.data, [1, 2, 3, 0, 4, 5, 6, 7]);

    assert.strictEqual(linked.symbols.alpha, DEFAULT_TEXT_BASE);
    assert.strictEqual(linked.symbols.beta, DEFAULT_DATA_BASE + 4);

    const textReloc = linked.relocations.find((r) => r.symbol === "beta");
    assert.strictEqual(textReloc?.offset, 0);

    const dataReloc = linked.relocations.find((r) => r.symbol === "alpha");
    assert.strictEqual(dataReloc?.offset, 4);

    const sourceMapBeta = linked.sourceMap.find((entry) => entry.file === "b.asm");
    assert.deepStrictEqual(sourceMapBeta, {
      address: DEFAULT_TEXT_BASE + 8,
      file: "b.asm",
      line: 1,
      segment: "text",
      segmentIndex: 2,
    });
  });

  test("throws when duplicate symbols are encountered", () => {
    const module: BinaryImage = {
      ...baseImage,
      text: [],
      data: [],
      dataWords: [],
      ktext: [],
      kdata: [],
      kdataWords: [],
      symbols: { shared: DEFAULT_TEXT_BASE },
      relocations: [],
      symbolTable: [{ name: "shared", address: DEFAULT_TEXT_BASE, segment: "text" }],
      sourceMap: [],
    };

    const linker = new Linker();
    assert.throws(() => linker.link([module, module]), /Duplicate symbol 'shared'/);
  });
});
