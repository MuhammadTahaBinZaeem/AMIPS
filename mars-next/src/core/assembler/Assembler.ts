import { DEFAULT_TEXT_BASE } from "../state/MachineState";
import { Lexer } from "./Lexer";
import { InstructionNode, Operand, Parser, ProgramAst, Segment } from "./Parser";

export interface BinaryImage {
  textBase: number;
  dataBase: number;
  text: number[]; // machine words
  data: number[]; // bytes
  dataWords: number[]; // data values aligned to 4 bytes where applicable
  symbols: Record<string, number>;
}

const DEFAULT_DATA_BASE = 0x10010000;

type SymbolTable = Map<string, number>;

interface NormalizedInstruction {
  name: string;
  operands: Operand[];
  line: number;
}

export class Assembler {
  private readonly lexer = new Lexer();
  private readonly parser = new Parser();

  assemble(source: string): BinaryImage {
    const lexed = this.lexer.tokenize(source);
    const ast = this.parser.parse(lexed);
    const symbols = this.buildSymbolTable(ast);
    const { text, data, dataWords } = this.emit(ast, symbols);

    return {
      textBase: DEFAULT_TEXT_BASE,
      dataBase: DEFAULT_DATA_BASE,
      text,
      data,
      dataWords,
      symbols: Object.fromEntries(symbols),
    };
  }

  private buildSymbolTable(ast: ProgramAst): SymbolTable {
    let segment: Segment = "text";
    let textOffset = 0;
    let dataOffset = 0;
    const symbols: SymbolTable = new Map();

    for (const node of ast.nodes) {
      switch (node.kind) {
        case "directive": {
          if (node.name === ".text") segment = "text";
          if (node.name === ".data") segment = "data";
          if (node.name === ".word") {
            dataOffset += 4 * node.args.length;
          }
          if (node.name === ".asciiz") {
            const literal = (node.args[0] as Operand & { kind: "string" }).value;
            dataOffset += new TextEncoder().encode(literal).length + 1;
          }
          break;
        }
        case "label": {
          const address = segment === "text" ? DEFAULT_TEXT_BASE + textOffset : DEFAULT_DATA_BASE + dataOffset;
          if (symbols.has(node.name)) {
            throw new Error(`Duplicate label '${node.name}' at line ${node.line}`);
          }
          symbols.set(node.name, address | 0);
          break;
        }
        case "instruction": {
          const expansion = this.expandInstruction(node);
          textOffset += expansion.length * 4;
          break;
        }
      }
    }

    return symbols;
  }

  private emit(ast: ProgramAst, symbols: SymbolTable): { text: number[]; data: number[]; dataWords: number[] } {
    let segment: Segment = "text";
    let pc = DEFAULT_TEXT_BASE;
    const text: number[] = [];
    const data: number[] = [];
    const dataWords: number[] = [];

    for (const node of ast.nodes) {
      if (node.kind === "directive") {
        switch (node.name) {
          case ".text":
            segment = "text";
            continue;
          case ".data":
            segment = "data";
            continue;
          case ".word": {
            if (segment !== "data") {
              throw new Error(`.word directive encountered outside .data at line ${node.line}`);
            }
            for (const arg of node.args) {
              if (arg.kind !== "immediate" && arg.kind !== "label") {
                throw new Error(`.word expects numeric arguments (line ${node.line})`);
              }
              const value = this.resolveValue(arg, symbols, node.line);
              dataWords.push(this.toInt32(value));
              this.pushWordBytes(value, data);
            }
            continue;
          }
          case ".asciiz": {
            if (segment !== "data") {
              throw new Error(`.asciiz directive encountered outside .data at line ${node.line}`);
            }
            const literal = (node.args[0] as Operand & { kind: "string" }).value;
            const bytes = [...new TextEncoder().encode(literal), 0];
            data.push(...bytes.map((b) => b & 0xff));
            continue;
          }
          default:
            throw new Error(`Unsupported directive ${node.name} at line ${node.line}`);
        }
      }

      if (node.kind === "label") {
        continue;
      }

      if (node.kind === "instruction") {
        if (segment !== "text") {
          throw new Error(`Instruction in non-text segment at line ${node.line}`);
        }

        const normalized = this.expandInstruction(node);
        for (const inst of normalized) {
          const encoded = this.encodeInstruction(inst, pc, symbols);
          text.push(encoded);
          pc = (pc + 4) | 0;
        }
      }
    }

    return { text: text.map((w) => this.toInt32(w)), data, dataWords: dataWords.map((w) => this.toInt32(w)) };
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

  private expandInstruction(instruction: InstructionNode): NormalizedInstruction[] {
    const { name, operands, line } = instruction;
    switch (name) {
      case "li": {
        const [dest, immediate] = operands;
        if (!dest || dest.kind !== "register") {
          throw new Error(`li expects a destination register (line ${line})`);
        }
        if (!immediate || (immediate.kind !== "immediate" && immediate.kind !== "label")) {
          throw new Error(`li expects an immediate value (line ${line})`);
        }
        const fits16 = immediate.kind === "immediate" && immediate.value >= -32768 && immediate.value <= 32767;
        if (fits16) {
          return [
            {
              name: "addi",
              operands: [dest, { kind: "register", name: "$zero", register: 0 }, immediate],
              line,
            },
          ];
        }

        if (immediate.kind !== "immediate") {
          // Conservatively expand label immediates into two instructions to allow full address resolution.
          return [
            { name: "lui", operands: [dest, immediate], line },
            { name: "ori", operands: [dest, dest, immediate], line },
          ];
        }

        const value = immediate.value >>> 0;
        const upper = (value >>> 16) & 0xffff;
        const lower = value & 0xffff;
        return [
          { name: "lui", operands: [dest, { kind: "immediate", value: upper }], line },
          { name: "ori", operands: [dest, dest, { kind: "immediate", value: lower }], line },
        ];
      }
      case "move": {
        const [dest, source] = operands;
        if (!dest || dest.kind !== "register" || !source || source.kind !== "register") {
          throw new Error(`move expects two register operands (line ${line})`);
        }
        return [{ name: "addu", operands: [dest, source, { kind: "register", name: "$zero", register: 0 }], line }];
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

  private toInt32(value: number): number {
    return value | 0;
  }

  private pushWordBytes(value: number, sink: number[]): void {
    sink.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  }
}
