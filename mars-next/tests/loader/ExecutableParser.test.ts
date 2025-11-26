import assert from "node:assert";
import { describe, test } from "node:test";

import { ExecutableParser } from "../../src/core/loader/ExecutableParser";
import { ProgramLoader } from "../../src/core/loader/ProgramLoader";
import { Memory } from "../../src/core/memory/Memory";
import { MachineState } from "../../src/core/state/MachineState";

const TEXT_ADDRESS = 0x00400000;
const DATA_ADDRESS = 0x10010000;

describe("ExecutableParser", () => {
  test("parses a relocatable ELF image and exposes relocation records", () => {
    const elfBytes = buildRelocatableElf();
    const parser = new ExecutableParser();

    const image = parser.parseExecutable(elfBytes);

    assert.strictEqual(image.textBase, TEXT_ADDRESS);
    assert.strictEqual(image.dataBase, DATA_ADDRESS);
    assert.deepStrictEqual(image.text, [0, 0x3c010000, 0x34210000]);
    assert.deepStrictEqual(image.data, [1, 2, 3, 4]);
    assert.ok(image.symbolTable.some((entry) => entry.name === "dataVal"));
    assert.deepStrictEqual(
      image.relocations.map(({ segment, offset, type, symbol }) => ({ segment, offset, type, symbol })),
      [
        { segment: "text", offset: 0, type: "MIPS_32", symbol: "dataVal" },
        { segment: "text", offset: 4, type: "MIPS_HI16", symbol: "dataVal" },
        { segment: "text", offset: 8, type: "MIPS_LO16", symbol: "dataVal" },
      ],
    );

    assertLoadsWithRelocations(image, "dataVal");
  });

  test("parses a COFF object with relocations", () => {
    const coffBytes = buildRelocatableCoff();
    const parser = new ExecutableParser();

    const image = parser.parseExecutable(coffBytes);

    assert.strictEqual(image.textBase, TEXT_ADDRESS);
    assert.strictEqual(image.dataBase, DATA_ADDRESS);
    assert.deepStrictEqual(image.text, [0, 0x3c010000, 0x34210000]);
    assert.deepStrictEqual(image.data, [1, 2, 3, 4]);
    assert.ok(image.symbolTable.some((entry) => entry.name === "data"));
    assert.deepStrictEqual(
      image.relocations.map(({ segment, offset, type, symbol }) => ({ segment, offset, type, symbol })),
      [
        { segment: "text", offset: 0, type: "MIPS_32", symbol: "data" },
        { segment: "text", offset: 4, type: "MIPS_HI16", symbol: "data" },
        { segment: "text", offset: 8, type: "MIPS_LO16", symbol: "data" },
      ],
    );

    assertLoadsWithRelocations(image, "data");
  });
});

function assertLoadsWithRelocations(image: ReturnType<ExecutableParser["parseExecutable"]>, symbolName: string): void {
  const memory = new Memory();
  const loader = new ProgramLoader(memory);
  const state = new MachineState();

  const layout = loader.loadProgram(state, image);

  const loadedText = [
    memory.readWord(TEXT_ADDRESS),
    memory.readWord(TEXT_ADDRESS + 4),
    memory.readWord(TEXT_ADDRESS + 8),
  ];
  const loadedData = [
    memory.readByte(DATA_ADDRESS),
    memory.readByte(DATA_ADDRESS + 1),
    memory.readByte(DATA_ADDRESS + 2),
    memory.readByte(DATA_ADDRESS + 3),
  ];

  assert.deepStrictEqual(loadedText, [0x10010000, 0x3c011001, 0x34210000]);
  assert.deepStrictEqual(loadedData, [1, 2, 3, 4]);
  assert.strictEqual(layout.symbols[symbolName], DATA_ADDRESS);
}

function buildRelocatableElf(): Uint8Array {
  const ELF_HEADER_SIZE = 52;
  const TEXT_SIZE = 12;
  const DATA_SIZE = 4;
  const REL_SIZE = 24;
  const SYMTAB_SIZE = 32;
  const STRTAB_SIZE = 12;
  const SHSTRTAB_SIZE = 52;
  const SECTION_HEADERS_SIZE = 7 * 40;

  const TEXT_OFFSET = ELF_HEADER_SIZE;
  const DATA_OFFSET = TEXT_OFFSET + TEXT_SIZE;
  const REL_OFFSET = DATA_OFFSET + DATA_SIZE;
  const SYMTAB_OFFSET = REL_OFFSET + REL_SIZE;
  const STRTAB_OFFSET = SYMTAB_OFFSET + SYMTAB_SIZE;
  const SHSTRTAB_OFFSET = STRTAB_OFFSET + STRTAB_SIZE;
  const SECTION_HEADERS_OFFSET = SHSTRTAB_OFFSET + SHSTRTAB_SIZE;

  const fileSize = SECTION_HEADERS_OFFSET + SECTION_HEADERS_SIZE;
  const buffer = new Uint8Array(fileSize);
  const view = new DataView(buffer.buffer);

  // e_ident
  buffer.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1], 0);
  view.setUint16(0x10, 2, true); // e_type executable
  view.setUint16(0x12, 8, true); // e_machine MIPS
  view.setUint32(0x14, 1, true); // e_version
  view.setUint32(0x18, TEXT_ADDRESS, true); // e_entry
  view.setUint32(0x20, SECTION_HEADERS_OFFSET, true); // e_shoff
  view.setUint16(0x2e, 40, true); // e_shentsize
  view.setUint16(0x30, 7, true); // e_shnum
  view.setUint16(0x32, 6, true); // e_shstrndx

  // Section names for shstrtab
  const shstrOffsets: Record<string, number> = {};
  let shstrCursor = 0;
  for (const name of ["", ".text", ".data", ".rel.text", ".symtab", ".strtab", ".shstrtab"]) {
    shstrOffsets[name] = shstrCursor;
    const bytes = new TextEncoder().encode(name + "\0");
    buffer.set(bytes, SHSTRTAB_OFFSET + shstrCursor);
    shstrCursor += bytes.length;
  }

  // strtab contents
  const strtabStrings = ["", "dataVal"];
  let strCursor = 0;
  for (const name of strtabStrings) {
    const bytes = new TextEncoder().encode(name + "\0");
    buffer.set(bytes, STRTAB_OFFSET + strCursor);
    strCursor += bytes.length;
  }

  // .text contents
  view.setUint32(TEXT_OFFSET, 0, true); // word 0 patched by R_MIPS_32
  view.setUint32(TEXT_OFFSET + 4, 0x3c010000, true); // lui $at, 0
  view.setUint32(TEXT_OFFSET + 8, 0x34210000, true); // ori $at, $at, 0

  // .data contents
  buffer.set([1, 2, 3, 4], DATA_OFFSET);

  // Relocations for .text
  const relocBase = REL_OFFSET;
  // R_MIPS_32 -> word0
  view.setUint32(relocBase, 0, true);
  view.setUint32(relocBase + 4, (1 << 8) | 2, true);
  // R_MIPS_HI16 -> word1
  view.setUint32(relocBase + 8, 4, true);
  view.setUint32(relocBase + 12, (1 << 8) | 5, true);
  // R_MIPS_LO16 -> word2
  view.setUint32(relocBase + 16, 8, true);
  view.setUint32(relocBase + 20, (1 << 8) | 6, true);

  // Symbol table (2 entries)
  // null symbol already zeroed
  // dataVal symbol
  view.setUint32(SYMTAB_OFFSET + 16, 1, true); // st_name offset in strtab
  view.setUint32(SYMTAB_OFFSET + 20, 0, true); // value within section
  view.setUint16(SYMTAB_OFFSET + 30, 2, true); // shndx -> .data section index

  // Section headers
  const writeSection = (
    index: number,
    name: number,
    type: number,
    flags: number,
    addr: number,
    offset: number,
    size: number,
    link: number,
    info: number,
    addralign: number,
    entsize: number,
  ): void => {
    const base = SECTION_HEADERS_OFFSET + index * 40;
    view.setUint32(base, name, true);
    view.setUint32(base + 4, type, true);
    view.setUint32(base + 8, flags, true);
    view.setUint32(base + 12, addr, true);
    view.setUint32(base + 16, offset, true);
    view.setUint32(base + 20, size, true);
    view.setUint32(base + 24, link, true);
    view.setUint32(base + 28, info, true);
    view.setUint32(base + 32, addralign, true);
    view.setUint32(base + 36, entsize, true);
  };

  writeSection(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  writeSection(1, shstrOffsets[".text"], 1, 0x6, TEXT_ADDRESS, TEXT_OFFSET, TEXT_SIZE, 0, 0, 4, 0);
  writeSection(2, shstrOffsets[".data"], 1, 0x3, DATA_ADDRESS, DATA_OFFSET, DATA_SIZE, 0, 0, 4, 0);
  writeSection(3, shstrOffsets[".rel.text"], 9, 0, 0, REL_OFFSET, REL_SIZE, 4, 1, 4, 8);
  writeSection(4, shstrOffsets[".symtab"], 2, 0, 0, SYMTAB_OFFSET, SYMTAB_SIZE, 5, 1, 4, 16);
  writeSection(5, shstrOffsets[".strtab"], 3, 0, 0, STRTAB_OFFSET, STRTAB_SIZE, 0, 0, 1, 0);
  writeSection(6, shstrOffsets[".shstrtab"], 3, 0, 0, SHSTRTAB_OFFSET, SHSTRTAB_SIZE, 0, 0, 1, 0);

  return buffer;
}

function buildRelocatableCoff(): Uint8Array {
  const COFF_HEADER_SIZE = 20;
  const SECTION_HEADER_SIZE = 40;
  const TEXT_SIZE = 12;
  const DATA_SIZE = 4;
  const TEXT_RELOC_COUNT = 3;
  const TEXT_RELOC_SIZE = TEXT_RELOC_COUNT * 10;

  const sectionHeadersOffset = COFF_HEADER_SIZE;
  const textOffset = sectionHeadersOffset + SECTION_HEADER_SIZE * 2;
  const relocOffset = textOffset + TEXT_SIZE;
  const dataOffset = relocOffset + TEXT_RELOC_SIZE + 2; // small padding for alignment
  const symbolTableOffset = dataOffset + DATA_SIZE;
  const stringTableOffset = symbolTableOffset + 18; // one symbol

  const fileSize = stringTableOffset + 4; // minimal string table
  const buffer = new Uint8Array(fileSize);
  const view = new DataView(buffer.buffer);

  // COFF header
  view.setUint16(0, 0x0162, true); // machine
  view.setUint16(2, 2, true); // number of sections
  view.setUint32(8, symbolTableOffset, true);
  view.setUint32(12, 1, true); // number of symbols
  view.setUint16(16, 0, true); // optional header size

  const writeSectionHeader = (
    index: number,
    name: string,
    virtualSize: number,
    virtualAddress: number,
    sizeOfRawData: number,
    pointerToRawData: number,
    pointerToRelocations: number,
    numberOfRelocations: number,
  ): void => {
    const base = sectionHeadersOffset + index * SECTION_HEADER_SIZE;
    const nameBytes = new TextEncoder().encode(name);
    buffer.set(nameBytes.slice(0, 8), base);
    view.setUint32(base + 8, virtualSize, true);
    view.setUint32(base + 12, virtualAddress, true);
    view.setUint32(base + 16, sizeOfRawData, true);
    view.setUint32(base + 20, pointerToRawData, true);
    view.setUint32(base + 24, pointerToRelocations, true);
    view.setUint16(base + 32, numberOfRelocations, true);
  };

  writeSectionHeader(0, ".text\0\0\0", TEXT_SIZE, TEXT_ADDRESS, TEXT_SIZE, textOffset, relocOffset, TEXT_RELOC_COUNT);
  writeSectionHeader(1, ".data\0\0\0", DATA_SIZE, DATA_ADDRESS, DATA_SIZE, dataOffset, 0, 0);

  // text contents
  view.setUint32(textOffset, 0, true);
  view.setUint32(textOffset + 4, 0x3c010000, true);
  view.setUint32(textOffset + 8, 0x34210000, true);

  // data contents
  buffer.set([1, 2, 3, 4], dataOffset);

  // relocations (offset, symbol index, type)
  view.setUint32(relocOffset, 0, true);
  view.setUint32(relocOffset + 4, 0, true);
  view.setUint16(relocOffset + 8, 2, true); // R_MIPS_32

  view.setUint32(relocOffset + 10, 4, true);
  view.setUint32(relocOffset + 14, 0, true);
  view.setUint16(relocOffset + 18, 5, true); // R_MIPS_HI16

  view.setUint32(relocOffset + 20, 8, true);
  view.setUint32(relocOffset + 24, 0, true);
  view.setUint16(relocOffset + 28, 6, true); // R_MIPS_LO16

  // symbol table with one external data symbol
  const symbolBase = symbolTableOffset;
  buffer.set(new TextEncoder().encode("data\0\0\0\0"), symbolBase); // name
  view.setUint32(symbolBase + 8, 0, true); // value
  view.setUint16(symbolBase + 12, 2, true); // section number (.data)
  buffer[symbolBase + 17] = 0; // aux count

  // minimal string table (length only)
  view.setUint32(stringTableOffset, 4, true);

  return buffer;
}
