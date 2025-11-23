import { DEFAULT_TEXT_BASE } from "../state/MachineState";
import { Lexer } from "./Lexer";
import { MacroExpander } from "./MacroExpander";
import { InstructionNode, Operand, Parser, ProgramAst, Segment } from "./Parser";

export interface BinaryImage {
  textBase: number;
  dataBase: number;
  text: number[]; // machine words
  data: number[]; // bytes
  dataWords: number[]; // data values aligned to 4 bytes where applicable
  ktextBase: number;
  kdataBase: number;
  ktext: number[]; // kernel machine words
  kdata: number[]; // kernel data bytes
  kdataWords: number[]; // kernel data values aligned to 4 bytes
  symbols: Record<string, number>;
}

const DEFAULT_DATA_BASE = 0x10010000;
const DEFAULT_KTEXT_BASE = 0x80000000;
const DEFAULT_KDATA_BASE = 0x90000000;

type SymbolTable = Map<string, number>;

interface NormalizedInstruction {
  name: string;
  operands: Operand[];
  line: number;
}

export class Assembler {
  private readonly lexer = new Lexer();
  private readonly parser = new Parser();
  private readonly macroExpander = new MacroExpander(this.lexer);

  assemble(source: string): BinaryImage {
    const expanded = this.macroExpander.expand(source);
    const lexed = this.lexer.tokenize(expanded);
    const ast = this.parser.parse(lexed);
    const symbols = this.buildSymbolTable(ast);
    const { text, data, dataWords, ktext, kdata, kdataWords } = this.emit(ast, symbols);

    return {
      textBase: DEFAULT_TEXT_BASE,
      dataBase: DEFAULT_DATA_BASE,
      ktextBase: DEFAULT_KTEXT_BASE,
      kdataBase: DEFAULT_KDATA_BASE,
      text,
      data,
      ktext,
      kdata,
      dataWords,
      kdataWords,
      symbols: Object.fromEntries(symbols),
    };
  }

  private buildSymbolTable(ast: ProgramAst): SymbolTable {
    let segment: Segment = "text";
    let textOffset = 0;
    let dataOffset = 0;
    let ktextOffset = 0;
    let kdataOffset = 0;
    const symbols: SymbolTable = new Map();
    const definedSymbols = new Set<string>();
    const externSymbols = new Set<string>();
    const globalSymbols = new Set<string>();
    const eqvDefinitions: Array<{ name: string; value: Operand; line: number }> = [];

    for (const node of ast.nodes) {
      switch (node.kind) {
        case "directive": {
          if (node.name === ".text") segment = "text";
          if (node.name === ".ktext") segment = "ktext";
          if (node.name === ".data") segment = "data";
          if (node.name === ".kdata") segment = "kdata";

          if (node.name === ".globl" || node.name === ".extern") {
            node.args.forEach((arg) => {
              if (arg.kind === "label") {
                if (node.name === ".globl") {
                  globalSymbols.add(arg.name);
                } else {
                  externSymbols.add(arg.name);
                  if (!symbols.has(arg.name)) symbols.set(arg.name, 0);
                }
              }
            });
          }

          if (node.name === ".eqv") {
            const name = (node.args[0] as Operand & { kind: "label" }).name;
            eqvDefinitions.push({ name, value: node.args[1], line: node.line });
          }

          if (segment === "data" || segment === "kdata") {
            switch (node.name) {
              case ".byte":
                if (segment === "data") dataOffset += node.args.length;
                else kdataOffset += node.args.length;
                break;
              case ".half":
                if (segment === "data") dataOffset += 2 * node.args.length;
                else kdataOffset += 2 * node.args.length;
                break;
              case ".word":
              case ".float":
                if (segment === "data") dataOffset += 4 * node.args.length;
                else kdataOffset += 4 * node.args.length;
                break;
              case ".double":
                if (segment === "data") dataOffset += 8 * node.args.length;
                else kdataOffset += 8 * node.args.length;
                break;
              case ".ascii":
                if (segment === "data")
                  dataOffset += this.encodeString((node.args[0] as Operand & { kind: "string" }).value).length;
                else kdataOffset += this.encodeString((node.args[0] as Operand & { kind: "string" }).value).length;
                break;
              case ".asciiz":
                if (segment === "data")
                  dataOffset += this.encodeString((node.args[0] as Operand & { kind: "string" }).value).length + 1;
                else kdataOffset += this.encodeString((node.args[0] as Operand & { kind: "string" }).value).length + 1;
                break;
              case ".space":
                if (segment === "data")
                  dataOffset += (node.args[0] as Operand & { kind: "immediate" }).value;
                else kdataOffset += (node.args[0] as Operand & { kind: "immediate" }).value;
                break;
              case ".align": {
                const power = (node.args[0] as Operand & { kind: "immediate" }).value as number;
                const alignment = Math.pow(2, power);
                if (!Number.isFinite(alignment) || alignment <= 0) {
                  throw new Error(`Invalid alignment at line ${node.line}`);
                }
                const currentOffset = segment === "data" ? dataOffset : kdataOffset;
                const padding = (alignment - (currentOffset % alignment)) % alignment;
                if (segment === "data") dataOffset += padding;
                else kdataOffset += padding;
                break;
              }
            }
          }
          break;
        }
        case "label": {
          const base =
            segment === "text"
              ? DEFAULT_TEXT_BASE
              : segment === "ktext"
                ? DEFAULT_KTEXT_BASE
                : segment === "kdata"
                  ? DEFAULT_KDATA_BASE
                  : DEFAULT_DATA_BASE;
          const offset =
            segment === "text"
              ? textOffset
              : segment === "ktext"
                ? ktextOffset
                : segment === "kdata"
                  ? kdataOffset
                  : dataOffset;
          const address = base + offset;
          if (definedSymbols.has(node.name)) {
            throw new Error(`Duplicate label '${node.name}' at line ${node.line}`);
          }
          symbols.set(node.name, address | 0);
          definedSymbols.add(node.name);
          break;
        }
        case "instruction": {
          const expansion = this.expandInstruction(node);
          if (segment === "text") {
            textOffset += expansion.length * 4;
          } else if (segment === "ktext") {
            ktextOffset += expansion.length * 4;
          }
          break;
        }
      }
    }

    for (const { name, value, line } of eqvDefinitions) {
      if (definedSymbols.has(name)) {
        throw new Error(`Duplicate symbol '${name}' at line ${line}`);
      }
      const resolved = this.resolveValue(value, symbols, line);
      symbols.set(name, this.toInt32(resolved));
      definedSymbols.add(name);
    }

    for (const name of globalSymbols) {
      if (!definedSymbols.has(name)) {
        throw new Error(`Global symbol '${name}' declared but not defined`);
      }
    }

    return symbols;
  }

  private emit(
    ast: ProgramAst,
    symbols: SymbolTable,
  ): { text: number[]; data: number[]; dataWords: number[]; ktext: number[]; kdata: number[]; kdataWords: number[] } {
    let segment: Segment = "text";
    let pc = DEFAULT_TEXT_BASE;
    const text: number[] = [];
    const ktext: number[] = [];
    const data: number[] = [];
    const kdata: number[] = [];
    const dataWords: number[] = [];
    const kdataWords: number[] = [];
    let dataOffset = 0;
    let kdataOffset = 0;
    let textOffset = 0;
    let ktextOffset = 0;

    for (const node of ast.nodes) {
      if (node.kind === "directive") {
        switch (node.name) {
          case ".text":
            segment = "text";
            pc = DEFAULT_TEXT_BASE + textOffset;
            continue;
          case ".ktext":
            segment = "ktext";
            pc = DEFAULT_KTEXT_BASE + ktextOffset;
            continue;
          case ".data":
            segment = "data";
            continue;
          case ".kdata":
            segment = "kdata";
            continue;
          case ".word": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.word directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const targetWords = segment === "data" ? dataWords : kdataWords;
            const targetBytes = segment === "data" ? data : kdata;
            for (const arg of node.args) {
              if (arg.kind !== "immediate" && arg.kind !== "label") {
                throw new Error(`.word expects numeric arguments (line ${node.line})`);
              }
              const value = this.resolveValue(arg, symbols, node.line);
              targetWords.push(this.toInt32(value));
              this.pushWordBytes(value, targetBytes);
              if (segment === "data") dataOffset += 4;
              else kdataOffset += 4;
            }
            continue;
          }
          case ".byte": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.byte directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const target = segment === "data" ? data : kdata;
            for (const arg of node.args) {
              if (arg.kind !== "immediate" && arg.kind !== "label") {
                throw new Error(`.byte expects numeric arguments (line ${node.line})`);
              }
              const value = this.resolveValue(arg, symbols, node.line);
              target.push(value & 0xff);
              if (segment === "data") dataOffset += 1;
              else kdataOffset += 1;
            }
            continue;
          }
          case ".half": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.half directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const target = segment === "data" ? data : kdata;
            for (const arg of node.args) {
              if (arg.kind !== "immediate" && arg.kind !== "label") {
                throw new Error(`.half expects numeric arguments (line ${node.line})`);
              }
              const value = this.resolveValue(arg, symbols, node.line);
              this.pushHalfBytes(value, target);
              if (segment === "data") dataOffset += 2;
              else kdataOffset += 2;
            }
            continue;
          }
          case ".float": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.float directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const target = segment === "data" ? data : kdata;
            for (const arg of node.args) {
              if (arg.kind !== "immediate") {
                throw new Error(`.float expects numeric arguments (line ${node.line})`);
              }
              this.pushFloatBytes(arg.value, target);
              if (segment === "data") dataOffset += 4;
              else kdataOffset += 4;
            }
            continue;
          }
          case ".double": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.double directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const target = segment === "data" ? data : kdata;
            for (const arg of node.args) {
              if (arg.kind !== "immediate") {
                throw new Error(`.double expects numeric arguments (line ${node.line})`);
              }
              this.pushDoubleBytes(arg.value, target);
              if (segment === "data") dataOffset += 8;
              else kdataOffset += 8;
            }
            continue;
          }
          case ".asciiz": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.asciiz directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const literal = (node.args[0] as Operand & { kind: "string" }).value;
            const bytes = [...this.encodeString(literal), 0];
            const target = segment === "data" ? data : kdata;
            target.push(...bytes.map((b) => b & 0xff));
            if (segment === "data") dataOffset += bytes.length;
            else kdataOffset += bytes.length;
            continue;
          }
          case ".ascii": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.ascii directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const literal = (node.args[0] as Operand & { kind: "string" }).value;
            const bytes = this.encodeString(literal);
            const target = segment === "data" ? data : kdata;
            target.push(...bytes.map((b) => b & 0xff));
            if (segment === "data") dataOffset += bytes.length;
            else kdataOffset += bytes.length;
            continue;
          }
          case ".space": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.space directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const count = (node.args[0] as Operand & { kind: "immediate" }).value;
            const target = segment === "data" ? data : kdata;
            for (let i = 0; i < count; i++) target.push(0);
            if (segment === "data") dataOffset += count;
            else kdataOffset += count;
            continue;
          }
          case ".align": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.align directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const power = (node.args[0] as Operand & { kind: "immediate" }).value;
            const alignment = Math.pow(2, power);
            if (!Number.isFinite(alignment) || alignment <= 0) {
              throw new Error(`Invalid alignment at line ${node.line}`);
            }
            const currentOffset = segment === "data" ? dataOffset : kdataOffset;
            const padding = (alignment - (currentOffset % alignment)) % alignment;
            const target = segment === "data" ? data : kdata;
            for (let i = 0; i < padding; i++) target.push(0);
            if (segment === "data") dataOffset += padding;
            else kdataOffset += padding;
            continue;
          }
          case ".globl":
          case ".extern":
          case ".eqv":
          case ".set":
            continue;
          default:
            throw new Error(`Unsupported directive ${node.name} at line ${node.line}`);
        }
      }

      if (node.kind === "label") {
        continue;
      }

      if (node.kind === "instruction") {
        if (segment !== "text" && segment !== "ktext") {
          throw new Error(`Instruction in non-text segment at line ${node.line}`);
        }

        const normalized = this.expandInstruction(node);
        const targetText = segment === "ktext" ? ktext : text;
        for (const inst of normalized) {
          const encoded = this.encodeInstruction(inst, pc, symbols);
          targetText.push(encoded);
          if (segment === "text") {
            textOffset += 4;
          } else {
            ktextOffset += 4;
          }
          pc = (pc + 4) | 0;
        }
      }
    }

    return {
      text: text.map((w) => this.toInt32(w)),
      data,
      dataWords: dataWords.map((w) => this.toInt32(w)),
      ktext: ktext.map((w) => this.toInt32(w)),
      kdata,
      kdataWords: kdataWords.map((w) => this.toInt32(w)),
    };
  }

  private resolveValue(operand: Operand, symbols: SymbolTable, line: number): number {
    if (operand.kind === "immediate") return operand.value;
    if (operand.kind === "label") {
      const value = symbols.get(operand.name);
      if (value === undefined) {
        throw new Error(`Undefined label '${operand.name}' (line ${line})`);
      }
      return value;
    }
    throw new Error(`Unsupported operand for immediate value at line ${line}`);
  }

  private expandLoadImmediate(
    target: Operand | undefined,
    immediate: Operand | undefined,
    line: number,
    instructionName: string,
  ): NormalizedInstruction[] {
    if (!target || target.kind !== "register") {
      throw new Error(`${instructionName} expects a destination register (line ${line})`);
    }

    if (!immediate || (immediate.kind !== "immediate" && immediate.kind !== "label")) {
      throw new Error(`${instructionName} expects an immediate value (line ${line})`);
    }

    const fits16 = immediate.kind === "immediate" && immediate.value >= -32768 && immediate.value <= 32767;
    if (fits16) {
      return [
        {
          name: "addi",
          operands: [target, { kind: "register", name: "$zero", register: 0 }, immediate],
          line,
        },
      ];
    }

    if (immediate.kind !== "immediate") {
      // Conservatively expand label immediates into two instructions to allow full address resolution.
      return [
        { name: "lui", operands: [target, immediate], line },
        { name: "ori", operands: [target, target, immediate], line },
      ];
    }

    const value = immediate.value >>> 0;
    const upper = (value >>> 16) & 0xffff;
    const lower = value & 0xffff;
    return [
      { name: "lui", operands: [target, { kind: "immediate", value: upper }], line },
      { name: "ori", operands: [target, target, { kind: "immediate", value: lower }], line },
    ];
  }

  private expandInstruction(instruction: InstructionNode): NormalizedInstruction[] {
    const { name, operands, line } = instruction;
    switch (name) {
      case "li": {
        const [dest, immediate] = operands;
        return this.expandLoadImmediate(dest, immediate, line, "li");
      }
      case "move": {
        const [dest, source] = operands;
        if (!dest || dest.kind !== "register" || !source || source.kind !== "register") {
          throw new Error(`move expects two register operands (line ${line})`);
        }
        return [{ name: "addu", operands: [dest, source, { kind: "register", name: "$zero", register: 0 }], line }];
      }
      case "muli": {
        const [dest, source, immediate] = operands;
        if (!dest || dest.kind !== "register" || !source || source.kind !== "register") {
          throw new Error(`muli expects two registers followed by an immediate (line ${line})`);
        }

        const atRegister: Operand = { kind: "register", name: "$at", register: 1 };
        const loadImmediate = this.expandLoadImmediate(atRegister, immediate, line, "muli");
        return [...loadImmediate, { name: "mul", operands: [dest, source, atRegister], line }];
      }
      case "nop":
        return [{ name: "sll", operands: [{ kind: "register", name: "$zero", register: 0 }, { kind: "register", name: "$zero", register: 0 }, { kind: "immediate", value: 0 }], line }];
      default:
        return [{ name, operands, line }];
    }
  }

  private encodeInstruction(instruction: NormalizedInstruction, pc: number, symbols: SymbolTable): number {
    const { name, operands, line } = instruction;
    switch (name) {
      case "addi":
      case "addiu":
        this.expectOperands(name, operands, ["register", "register", "immediate|label"], line);
        return this.encodeI(name === "addi" ? 0x08 : 0x09, operands[1], operands[0], operands[2], line, symbols);
      case "ori":
        this.expectOperands(name, operands, ["register", "register", "immediate|label"], line);
        return this.encodeOri(operands[1], operands[0], operands[2], line, symbols);
      case "lui":
        this.expectOperands(name, operands, ["register", "immediate|label"], line);
        return this.encodeLui(operands[0], operands[1], line, symbols);
      case "add":
        this.expectOperands(name, operands, ["register", "register", "register"], line);
        return this.encodeR(0x20, operands[1], operands[2], operands[0], line);
      case "addu":
        this.expectOperands(name, operands, ["register", "register", "register"], line);
        return this.encodeR(0x21, operands[1], operands[2], operands[0], line);
      case "mul":
        this.expectOperands(name, operands, ["register", "register", "register"], line);
        return this.encodeMul(operands[1], operands[2], operands[0], line);
      case "sub":
        this.expectOperands(name, operands, ["register", "register", "register"], line);
        return this.encodeR(0x22, operands[1], operands[2], operands[0], line);
      case "and":
        this.expectOperands(name, operands, ["register", "register", "register"], line);
        return this.encodeR(0x24, operands[1], operands[2], operands[0], line);
      case "or":
        this.expectOperands(name, operands, ["register", "register", "register"], line);
        return this.encodeR(0x25, operands[1], operands[2], operands[0], line);
      case "slt":
        this.expectOperands(name, operands, ["register", "register", "register"], line);
        return this.encodeR(0x2a, operands[1], operands[2], operands[0], line);
      case "sll":
        this.expectOperands(name, operands, ["register", "register", "immediate|label"], line);
        return this.encodeR(0x00, { kind: "register", name: "$zero", register: 0 }, operands[1], operands[0], line, operands[2]);
      case "slti":
        this.expectOperands(name, operands, ["register", "register", "immediate|label"], line);
        return this.encodeI(0x0a, operands[1], operands[0], operands[2], line, symbols);
      case "lw": {
        this.expectOperands(name, operands, ["register", "memory"], line);
        const memory = operands[1] as Operand & { kind: "memory"; base: number; offset: number };
        const baseRegister: Operand = { kind: "register", name: `$${memory.base}`, register: memory.base };
        return this.encodeI(0x23, baseRegister, operands[0], { kind: "immediate", value: memory.offset }, line, symbols);
      }
      case "sw": {
        this.expectOperands(name, operands, ["register", "memory"], line);
        const memory = operands[1] as Operand & { kind: "memory"; base: number; offset: number };
        const baseRegister: Operand = { kind: "register", name: `$${memory.base}`, register: memory.base };
        return this.encodeI(0x2b, baseRegister, operands[0], { kind: "immediate", value: memory.offset }, line, symbols);
      }
      case "beq":
        this.expectOperands(name, operands, ["register", "register", "label|immediate"], line);
        return this.encodeBranch(0x04, operands[0], operands[1], operands[2], pc, symbols, line);
      case "bne":
        this.expectOperands(name, operands, ["register", "register", "label|immediate"], line);
        return this.encodeBranch(0x05, operands[0], operands[1], operands[2], pc, symbols, line);
      case "j":
        this.expectOperands(name, operands, ["label|immediate"], line);
        return this.encodeJump(0x02, operands[0], symbols, line);
      case "jal":
        this.expectOperands(name, operands, ["label|immediate"], line);
        return this.encodeJump(0x03, operands[0], symbols, line);
      case "jr":
        this.expectOperands(name, operands, ["register"], line);
        return this.encodeR(0x08, operands[0], { kind: "register", name: "$zero", register: 0 }, { kind: "register", name: "$zero", register: 0 }, line);
      case "syscall":
        return 0x0000000c;
      default:
        throw new Error(`Unknown instruction '${name}' at line ${line}`);
    }
  }

  private encodeR(funct: number, rs: Operand, rt: Operand, rd: Operand, line: number, shamtOperand?: Operand): number {
    const rsNum = this.requireRegister(rs, line);
    const rtNum = this.requireRegister(rt, line);
    const rdNum = this.requireRegister(rd, line);
    const shamt = shamtOperand ? this.requireImmediate(shamtOperand, line, 0, 31) : 0;
    return (rsNum << 21) | (rtNum << 16) | (rdNum << 11) | (shamt << 6) | (funct & 0x3f);
  }

  private encodeMul(rs: Operand, rt: Operand, rd: Operand, line: number): number {
    const rsNum = this.requireRegister(rs, line);
    const rtNum = this.requireRegister(rt, line);
    const rdNum = this.requireRegister(rd, line);
    return (0x1c << 26) | (rsNum << 21) | (rtNum << 16) | (rdNum << 11) | 0x02;
  }

  private encodeI(
    opcode: number,
    rs: Operand,
    rt: Operand,
    immediate: Operand,
    line: number,
    symbols: SymbolTable,
    signed = true,
  ): number {
    const rsNum = this.requireRegister(rs, line);
    const rtNum = this.requireRegister(rt, line);
    const immValue = this.resolveImmediate(immediate, symbols, line, signed);
    return (opcode << 26) | (rsNum << 21) | (rtNum << 16) | (immValue & 0xffff);
  }

  private encodeLui(rt: Operand, immediate: Operand, line: number, symbols: SymbolTable): number {
    const rtNum = this.requireRegister(rt, line);
    const value = this.resolveLabelOrImmediate(immediate, symbols, line);
    const imm = immediate.kind === "label" ? (value >>> 16) & 0xffff : this.resolveImmediate(immediate, symbols, line, false);
    return (0x0f << 26) | (rtNum << 16) | (imm & 0xffff);
  }

  private encodeOri(rs: Operand, rt: Operand, immediate: Operand, line: number, symbols: SymbolTable): number {
    const rsNum = this.requireRegister(rs, line);
    const rtNum = this.requireRegister(rt, line);
    const value = this.resolveLabelOrImmediate(immediate, symbols, line);
    const imm = immediate.kind === "label" ? value & 0xffff : this.resolveImmediate(immediate, symbols, line, false);
    return (0x0d << 26) | (rsNum << 21) | (rtNum << 16) | (imm & 0xffff);
  }

  private encodeBranch(
    opcode: number,
    rs: Operand,
    rt: Operand,
    target: Operand,
    pc: number,
    symbols: SymbolTable,
    line: number,
  ): number {
    const rsNum = this.requireRegister(rs, line);
    const rtNum = this.requireRegister(rt, line);
    const address = this.resolveLabelOrImmediate(target, symbols, line);
    const offset = ((address - (pc + 4)) / 4) | 0;
    if (offset < -32768 || offset > 32767) {
      throw new Error(`Branch target out of range at line ${line}`);
    }
    return (opcode << 26) | (rsNum << 21) | (rtNum << 16) | (offset & 0xffff);
  }

  private encodeJump(opcode: number, target: Operand, symbols: SymbolTable, line: number): number {
    const address = this.resolveLabelOrImmediate(target, symbols, line);
    const field = (address >>> 2) & 0x03ffffff;
    return (opcode << 26) | field;
  }

  private expectOperands(name: string, operands: Operand[], kinds: string[], line: number): void {
    if (operands.length !== kinds.length) {
      throw new Error(`${name} expects ${kinds.length} operand(s) (line ${line})`);
    }
    operands.forEach((operand, index) => {
      const expected = kinds[index];
      if (expected.includes("register") && operand.kind === "register") return;
      if (expected.includes("immediate") && operand.kind === "immediate") return;
      if (expected.includes("label") && operand.kind === "label") return;
      if (expected.includes("memory") && operand.kind === "memory") return;
      throw new Error(`Unexpected operand for ${name} at position ${index + 1} (line ${line})`);
    });
  }

  private resolveImmediate(operand: Operand, symbols: SymbolTable, line: number, signed: boolean): number {
    const value = this.resolveLabelOrImmediate(operand, symbols, line);
    if (signed && (value < -32768 || value > 32767)) {
      throw new Error(`Immediate out of range at line ${line}`);
    }
    if (!signed && (value < 0 || value > 0xffff)) {
      throw new Error(`Immediate out of range at line ${line}`);
    }
    return value;
  }

  private resolveLabelOrImmediate(operand: Operand, symbols: SymbolTable, line: number): number {
    if (operand.kind === "immediate") return operand.value;
    if (operand.kind === "label") {
      const value = symbols.get(operand.name);
      if (value === undefined) {
        throw new Error(`Undefined label '${operand.name}' (line ${line})`);
      }
      return value;
    }
    throw new Error(`Expected immediate or label at line ${line}`);
  }

  private requireRegister(operand: Operand, line: number): number {
    if (operand.kind !== "register") {
      throw new Error(`Expected register operand at line ${line}`);
    }
    return operand.register;
  }

  private requireImmediate(operand: Operand, line: number, min: number, max: number): number {
    if (operand.kind !== "immediate") {
      throw new Error(`Expected immediate operand at line ${line}`);
    }
    if (operand.value < min || operand.value > max) {
      throw new Error(`Immediate value out of range at line ${line}`);
    }
    return operand.value;
  }

  private encodeString(literal: string): Uint8Array {
    return new TextEncoder().encode(literal);
  }

  private toInt32(value: number): number {
    return value | 0;
  }

  private pushHalfBytes(value: number, sink: number[]): void {
    const short = value & 0xffff;
    sink.push((short >>> 8) & 0xff, short & 0xff);
  }

  private pushWordBytes(value: number, sink: number[]): void {
    sink.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  }

  private pushFloatBytes(value: number, sink: number[]): void {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, value, false);
    sink.push(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  }

  private pushDoubleBytes(value: number, sink: number[]): void {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value, false);
    sink.push(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3),
      view.getUint8(4),
      view.getUint8(5),
      view.getUint8(6),
      view.getUint8(7),
    );
  }
}
