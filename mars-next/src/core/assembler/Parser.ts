import { LexedLine, Token } from "./Lexer";

export type Segment = "text" | "data" | "ktext" | "kdata";

export type Operand =
  | { kind: "register"; name: string; register: number }
  | { kind: "immediate"; value: number }
  | { kind: "label"; name: string }
  | { kind: "string"; value: string }
  | { kind: "memory"; base: number; offset: number };

export type DirectiveNode = {
  kind: "directive";
  name: string;
  args: Operand[];
  segment: Segment;
  line: number;
};

export type LabelNode = {
  kind: "label";
  name: string;
  segment: Segment;
  line: number;
};

export type InstructionNode = {
  kind: "instruction";
  name: string;
  operands: Operand[];
  segment: Segment;
  line: number;
};

export type AstNode = DirectiveNode | LabelNode | InstructionNode;

export interface ProgramAst {
  nodes: AstNode[];
}

const REGISTER_ALIASES: Record<string, number> = {
  zero: 0,
  at: 1,
  v0: 2,
  v1: 3,
  a0: 4,
  a1: 5,
  a2: 6,
  a3: 7,
  t0: 8,
  t1: 9,
  t2: 10,
  t3: 11,
  t4: 12,
  t5: 13,
  t6: 14,
  t7: 15,
  s0: 16,
  s1: 17,
  s2: 18,
  s3: 19,
  s4: 20,
  s5: 21,
  s6: 22,
  s7: 23,
  t8: 24,
  t9: 25,
  k0: 26,
  k1: 27,
  gp: 28,
  sp: 29,
  fp: 30,
  s8: 30,
  ra: 31,
};

export class Parser {
  parse(lines: LexedLine[]): ProgramAst {
    const nodes: AstNode[] = [];
    let segment: Segment = "text";

    for (const line of lines) {
      let index = 0;
      const tokens = line.tokens;

      // Extract labels at the start of the line (may be chained).
      while (index + 1 < tokens.length && tokens[index].type === "identifier" && tokens[index + 1].type === "colon") {
        const labelToken = tokens[index];
        nodes.push({ kind: "label", name: String(labelToken.value), segment, line: line.line });
        index += 2;
      }

      if (index >= tokens.length) {
        continue; // Label-only line.
      }

      const first = tokens[index];
      if (first.type === "directive") {
        const directive = this.parseDirective(tokens.slice(index), segment, line.line);
        if (directive.name === ".text" || directive.name === ".ktext") segment = directive.name.slice(1) as Segment;
        if (directive.name === ".data" || directive.name === ".kdata") segment = directive.name.slice(1) as Segment;
        nodes.push(directive);
        continue;
      }

      if (first.type === "identifier") {
        if (segment !== "text" && segment !== "ktext") {
          throw new Error(`Instruction '${first.value}' is only valid in a text segment (line ${line.line})`);
        }
        const instruction = this.parseInstruction(tokens.slice(index), segment, line.line);
        nodes.push(instruction);
        continue;
      }

      throw new Error(`Unexpected token '${first.raw}' at line ${line.line}`);
    }

    return { nodes };
  }

  private parseDirective(tokens: Token[], segment: Segment, line: number): DirectiveNode {
    const name = tokens[0].raw.startsWith(".")
      ? tokens[0].raw.toLowerCase()
      : `.${String(tokens[0].value).toLowerCase()}`;
    const args = this.collectArguments(tokens.slice(1), line);
    switch (name) {
      case ".text":
      case ".ktext":
      case ".data":
      case ".kdata":
        if (args.length !== 0) {
          throw new Error(`Directive ${name} does not take arguments (line ${line})`);
        }
        break;
      case ".word":
      case ".byte":
      case ".half":
        if (segment !== "data" && segment !== "kdata") {
          throw new Error(`Directive ${name} is only allowed in .data/.kdata (line ${line})`);
        }
        args.forEach((arg) => {
          if (arg.kind !== "immediate" && arg.kind !== "label") {
            throw new Error(`${name} expects numeric arguments (line ${line})`);
          }
        });
        break;
      case ".float":
      case ".double":
        if (segment !== "data" && segment !== "kdata") {
          throw new Error(`Directive ${name} is only allowed in .data/.kdata (line ${line})`);
        }
        args.forEach((arg) => {
          if (arg.kind !== "immediate") {
            throw new Error(`${name} expects numeric arguments (line ${line})`);
          }
        });
        break;
      case ".ascii":
      case ".asciiz":
        if (segment !== "data" && segment !== "kdata") {
          throw new Error(`Directive ${name} is only allowed in .data/.kdata (line ${line})`);
        }
        if (args.length !== 1 || args[0].kind !== "string") {
          throw new Error(`${name} expects a single string argument (line ${line})`);
        }
        break;
      case ".space":
        if (segment !== "data" && segment !== "kdata") {
          throw new Error(`Directive .space is only allowed in .data/.kdata (line ${line})`);
        }
        if (args.length !== 1 || args[0].kind !== "immediate") {
          throw new Error(`.space expects a single size argument (line ${line})`);
        }
        if (!Number.isInteger(args[0].value) || args[0].value < 0) {
          throw new Error(`.space size must be a non-negative integer (line ${line})`);
        }
        break;
      case ".align":
        if (segment !== "data" && segment !== "kdata") {
          throw new Error(`Directive .align is only allowed in .data/.kdata (line ${line})`);
        }
        if (args.length !== 1 || args[0].kind !== "immediate") {
          throw new Error(`.align expects a single power-of-two argument (line ${line})`);
        }
        if (!Number.isInteger(args[0].value) || args[0].value < 0) {
          throw new Error(`.align expects a non-negative integer (line ${line})`);
        }
        break;
      case ".globl":
      case ".extern":
        if (args.length < 1) {
          throw new Error(`${name} expects at least one symbol name (line ${line})`);
        }
        args.forEach((arg) => {
          if (arg.kind !== "label") {
            throw new Error(`${name} expects symbol operands (line ${line})`);
          }
        });
        break;
      case ".eqv":
        if (
          args.length !== 2 ||
          args[0].kind !== "label" ||
          (args[1].kind !== "immediate" && args[1].kind !== "label")
        ) {
          throw new Error(`${name} expects a symbol name followed by a value (line ${line})`);
        }
        break;
      case ".set":
        if (args.length < 1) {
          throw new Error(`${name} expects at least one option name (line ${line})`);
        }
        break;
      default:
        throw new Error(`Unknown directive ${name} (line ${line})`);
    }

    return { kind: "directive", name, args, segment, line };
  }

  private parseInstruction(tokens: Token[], segment: Segment, line: number): InstructionNode {
    const name = String(tokens[0].value).toLowerCase();
    const args = this.collectArguments(tokens.slice(1), line, true);
    return { kind: "instruction", name, operands: args, segment, line };
  }

  private collectArguments(tokens: Token[], line: number, allowMemory = false): Operand[] {
    const operands: Operand[] = [];
    let current: Token[] = [];
    const flush = () => {
      if (current.length === 0) return;
      operands.push(this.parseOperand(current, line, allowMemory));
      current = [];
    };

    for (const token of tokens) {
      if (token.type === "comma") {
        flush();
        continue;
      }
      current.push(token);
    }
    flush();

    return operands;
  }

  private parseOperand(tokens: Token[], line: number, allowMemory: boolean): Operand {
    if (tokens.length === 0) {
      throw new Error(`Missing operand at line ${line}`);
    }

    // Memory operand: offset(base)
    if (allowMemory && tokens.length >= 3 && tokens.some((t) => t.type === "lparen")) {
      return this.parseMemoryOperand(tokens, line);
    }

    if (tokens.length === 1) {
      const token = tokens[0];
      if (token.type === "register") {
        return { kind: "register", name: String(token.value), register: this.parseRegister(String(token.value), line) };
      }

      if (token.type === "number") {
        return { kind: "immediate", value: Number(token.value) };
      }

      if (token.type === "string") {
        return { kind: "string", value: String(token.value) };
      }

      if (token.type === "identifier") {
        return { kind: "label", name: String(token.value) };
      }
    }

    throw new Error(`Unable to parse operand near '${tokens.map((t) => t.raw).join(" ")}' (line ${line})`);
  }

  private parseMemoryOperand(tokens: Token[], line: number): Operand {
    let offset = 0;
    let registerToken: Token | null = null;
    let sawLParen = false;

    for (const token of tokens) {
      if (token.type === "number" && !sawLParen) {
        offset = Number(token.value);
        continue;
      }

      if (token.type === "lparen") {
        sawLParen = true;
        continue;
      }

      if (token.type === "register") {
        registerToken = token;
        continue;
      }
    }

    if (!registerToken) {
      throw new Error(`Malformed memory operand at line ${line}`);
    }

    return {
      kind: "memory",
      base: this.parseRegister(String(registerToken.value), line),
      offset,
    };
  }

  private parseRegister(register: string, line: number): number {
    const trimmed = register.replace(/^\$/g, "").toLowerCase();
    if (/^\d+$/.test(trimmed)) {
      const value = Number.parseInt(trimmed, 10);
      if (value < 0 || value > 31) {
        throw new Error(`Register index out of bounds at line ${line}`);
      }
      return value;
    }

    if (trimmed in REGISTER_ALIASES) {
      return REGISTER_ALIASES[trimmed];
    }

    throw new Error(`Unknown register ${register} (line ${line})`);
  }
}
