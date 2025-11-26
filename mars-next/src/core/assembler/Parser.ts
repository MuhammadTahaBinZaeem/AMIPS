import { LexedLine, Token } from "./Lexer";

export type Segment = "text" | "data" | "ktext" | "kdata";

export type MemoryOffset =
  | { kind: "immediate"; value: number }
  | { kind: "label"; name: string }
  | { kind: "expression"; expression: ExpressionNode };

export type Operand =
  | { kind: "register"; name: string; register: number }
  | MemoryOffset
  | { kind: "string"; value: string }
  | { kind: "memory"; base: number; offset: MemoryOffset };

export type ExpressionNode =
  | { type: "number"; value: number }
  | { type: "symbol"; name: string }
  | { type: "unary"; op: "plus" | "minus" | "bitnot"; argument: ExpressionNode }
  | {
      type: "binary";
      op: "add" | "sub" | "mul" | "div" | "mod" | "lshift" | "rshift" | "and" | "xor" | "or";
      left: ExpressionNode;
      right: ExpressionNode;
    };

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
  /** Raw source tokens (operator is token 0; parentheses are tokens, commas are not). */
  tokens?: string[];
};

export type AstNode = DirectiveNode | LabelNode | InstructionNode;

export interface ProgramAst {
  nodes: AstNode[];
}

export const REGISTER_ALIASES: Record<string, number> = {
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
    const args = this.collectArguments(tokens.slice(1), line, false, true);
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
          if (arg.kind !== "immediate" && arg.kind !== "label" && arg.kind !== "expression") {
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
          if (arg.kind !== "immediate" && arg.kind !== "expression") {
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
        if (args.length !== 1 || (args[0].kind !== "immediate" && args[0].kind !== "expression")) {
          throw new Error(`.space expects a single size argument (line ${line})`);
        }
        break;
      case ".align":
        if (segment !== "data" && segment !== "kdata") {
          throw new Error(`Directive .align is only allowed in .data/.kdata (line ${line})`);
        }
        if (args.length !== 1 || (args[0].kind !== "immediate" && args[0].kind !== "expression")) {
          throw new Error(`.align expects a single power-of-two argument (line ${line})`);
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
          (args[1].kind !== "immediate" && args[1].kind !== "label" && args[1].kind !== "expression")
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
    const args = this.collectArguments(tokens.slice(1), line, true, true);
    return { kind: "instruction", name, operands: args, segment, line };
  }

  private collectArguments(tokens: Token[], line: number, allowMemory = false, allowExpression = false): Operand[] {
    const operands: Operand[] = [];
    let current: Token[] = [];
    const flush = () => {
      if (current.length === 0) return;
      operands.push(this.parseOperand(current, line, allowMemory, allowExpression));
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

  private parseOperand(tokens: Token[], line: number, allowMemory: boolean, allowExpression: boolean): Operand {
    if (tokens.length === 0) {
      throw new Error(`Missing operand at line ${line}`);
    }

    // Memory operand: offset(base)
    if (allowMemory && tokens.length >= 3) {
      const lparenIndex = tokens.findIndex((token) => token.type === "lparen");
      const rparenIndex = tokens.findIndex((token) => token.type === "rparen");
      const hasRegisterBetween =
        lparenIndex !== -1 &&
        rparenIndex !== -1 &&
        rparenIndex > lparenIndex &&
        tokens.slice(lparenIndex + 1, rparenIndex).some((token) => token.type === "register");

      if (hasRegisterBetween) {
        return this.parseMemoryOperand(tokens, line);
      }
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

    if (allowExpression) {
      try {
        const expression = this.parseExpression(tokens, line);
        return { kind: "expression", expression };
      } catch (error) {
        const message = tokens.map((t) => t.raw).join(" ");
        throw new Error(`Unable to parse operand near '${message}' (line ${line})`);
      }
    }

    throw new Error(`Unable to parse operand near '${tokens.map((t) => t.raw).join(" ")}' (line ${line})`);
  }

  private parseMemoryOperand(tokens: Token[], line: number): Operand {
    const lparenIndex = tokens.findIndex((token) => token.type === "lparen");
    const rparenIndex = tokens.findIndex((token) => token.type === "rparen");

    if (lparenIndex === -1 || rparenIndex === -1 || rparenIndex < lparenIndex) {
      throw new Error(`Malformed memory operand at line ${line}`);
    }

    const offsetTokens = tokens.slice(0, lparenIndex);
    const registerToken = tokens.slice(lparenIndex + 1, rparenIndex).find((token) => token.type === "register");

    if (!registerToken) {
      throw new Error(`Malformed memory operand at line ${line}`);
    }

    const offsetOperand =
      offsetTokens.length === 0
        ? ({ kind: "immediate", value: 0 } as const)
        : this.parseOperand(offsetTokens, line, false, true);

    if (offsetOperand.kind !== "immediate" && offsetOperand.kind !== "label" && offsetOperand.kind !== "expression") {
      throw new Error(`Unsupported offset in memory operand (line ${line})`);
    }

    return {
      kind: "memory",
      base: this.parseRegister(String(registerToken.value), line),
      offset: offsetOperand,
    };
  }

  private parseExpression(tokens: Token[], line: number): ExpressionNode {
    const parser = new ExpressionParser(tokens, line);
    return parser.parse();
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

class ExpressionParser {
  private readonly tokens: Token[];
  private readonly line: number;
  private index = 0;

  constructor(tokens: Token[], line: number) {
    this.tokens = tokens;
    this.line = line;
  }

  parse(): ExpressionNode {
    const expression = this.parsePrecedence(0);
    if (this.peek() !== null) {
      throw new Error(`Unexpected token '${this.peek()!.raw}' in expression (line ${this.line})`);
    }
    return expression;
  }

  private parsePrecedence(minPrecedence: number): ExpressionNode {
    let left = this.parseUnary();

    while (true) {
      const operator = this.peek();
      const precedence = operator ? this.binaryPrecedence(operator.type) : -1;
      if (precedence < minPrecedence) break;

      this.index++;
      const right = this.parsePrecedence(precedence + 1);
      left = { type: "binary", op: this.toBinaryOp(operator!.type), left, right };
    }

    return left;
  }

  private parseUnary(): ExpressionNode {
    const token = this.peek();
    if (token?.type === "plus" || token?.type === "minus" || token?.type === "tilde") {
      this.index++;
      const argument = this.parseUnary();
      return { type: "unary", op: this.toUnaryOp(token.type), argument };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode {
    const token = this.next();
    if (!token) {
      throw new Error(`Unexpected end of expression (line ${this.line})`);
    }

    if (token.type === "number") {
      return { type: "number", value: Number(token.value) };
    }

    if (token.type === "identifier") {
      return { type: "symbol", name: String(token.value) };
    }

    if (token.type === "lparen") {
      const inner = this.parsePrecedence(0);
      const closing = this.next();
      if (!closing || closing.type !== "rparen") {
        throw new Error(`Unclosed parenthesis in expression (line ${this.line})`);
      }
      return inner;
    }

    throw new Error(`Unexpected token '${token.raw}' in expression (line ${this.line})`);
  }

  private peek(): Token | null {
    return this.tokens[this.index] ?? null;
  }

  private next(): Token | null {
    if (this.index >= this.tokens.length) return null;
    return this.tokens[this.index++] ?? null;
  }

  private binaryPrecedence(type: Token["type"]): number {
    switch (type) {
      case "pipe":
        return 1;
      case "caret":
        return 2;
      case "amp":
        return 3;
      case "lshift":
      case "rshift":
        return 4;
      case "plus":
      case "minus":
        return 5;
      case "star":
      case "slash":
      case "percent":
        return 6;
      default:
        return -1;
    }
  }

  private toBinaryOp(type: Token["type"]): ExpressionNode["op"] {
    switch (type) {
      case "plus":
        return "add";
      case "minus":
        return "sub";
      case "star":
        return "mul";
      case "slash":
        return "div";
      case "percent":
        return "mod";
      case "lshift":
        return "lshift";
      case "rshift":
        return "rshift";
      case "amp":
        return "and";
      case "caret":
        return "xor";
      case "pipe":
        return "or";
      default:
        throw new Error(`Unsupported operator in expression (line ${this.line})`);
    }
  }

  private toUnaryOp(type: Token["type"]): "plus" | "minus" | "bitnot" {
    switch (type) {
      case "plus":
        return "plus" as const;
      case "minus":
        return "minus" as const;
      case "tilde":
        return "bitnot" as const;
      default:
        throw new Error(`Unsupported unary operator (line ${this.line})`);
    }
  }
}
