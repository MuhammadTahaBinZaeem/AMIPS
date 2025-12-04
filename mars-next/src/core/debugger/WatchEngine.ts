import { MachineState } from "../state/MachineState";
import { resolveRegisterIdentifier } from "./registerAliases";

export type WatchKind = "register" | "memory" | "expression";
export type WatchIdentifier = string | number;

export interface WatchEvent {
  kind: WatchKind;
  identifier: WatchIdentifier;
  oldValue: number;
  newValue: number;
}

export interface WatchValue {
  key: string;
  kind: WatchKind;
  identifier: WatchIdentifier;
  value: number | undefined;
}

interface MemoryReader {
  read(address: number): number;
}

type WatchTarget = {
  key: string;
  kind: WatchKind;
  identifier: WatchIdentifier;
  readValue: () => number;
  lastValue?: number;
};

type ExpressionNode =
  | { type: "number"; value: number }
  | { type: "register"; name: string; index: number }
  | { type: "symbol"; name: string }
  | { type: "binary"; op: "+" | "-" | "*" | "/"; left: ExpressionNode; right: ExpressionNode }
  | { type: "unary"; op: "+" | "-"; expr: ExpressionNode }
  | { type: "deref"; expr: ExpressionNode };

export class WatchEngine {
  private readonly state: MachineState;
  private readonly memory?: MemoryReader;
  private readonly watches = new Map<string, WatchTarget>();
  private readonly pendingEvents: WatchEvent[] = [];
  private readonly stepSnapshot = new Map<string, number>();
  private symbolTable: Map<string, number> | null = null;

  constructor(state: MachineState, memory?: MemoryReader) {
    this.state = state;
    this.memory = memory;
  }

  addWatch(kind: WatchKind, identifier: WatchIdentifier): void {
    const target = this.createTarget(kind, identifier);
    target.lastValue = target.readValue();
    this.watches.set(target.key, target);
  }

  removeWatch(kind: WatchKind, identifier: WatchIdentifier): void {
    const key = `${kind}:${identifier}`;
    this.watches.delete(key);
  }

  clear(): void {
    this.watches.clear();
    this.stepSnapshot.clear();
    this.pendingEvents.length = 0;
  }

  hasWatches(): boolean {
    return this.watches.size > 0;
  }

  beginStep(): void {
    this.stepSnapshot.clear();
    for (const watch of this.watches.values()) {
      this.stepSnapshot.set(watch.key, watch.readValue());
    }
  }

  completeStep(): void {
    for (const watch of this.watches.values()) {
      const before = this.stepSnapshot.get(watch.key);
      const current = watch.readValue();

      if (before !== undefined && before !== current) {
        this.pendingEvents.push({
          kind: watch.kind,
          identifier: watch.identifier,
          oldValue: before,
          newValue: current,
        });
      }

      watch.lastValue = current;
    }

    this.stepSnapshot.clear();
  }

  getWatchChanges(): WatchEvent[] {
    const events = [...this.pendingEvents];
    this.pendingEvents.length = 0;
    return events;
  }

  peekWatchChanges(): WatchEvent[] {
    return [...this.pendingEvents];
  }

  setSymbolTable(symbols: Map<string, number> | Record<string, number> | null): void {
    if (!symbols) {
      this.symbolTable = null;
      return;
    }

    this.symbolTable = symbols instanceof Map ? new Map(symbols) : new Map(Object.entries(symbols));
  }

  getWatchValues(): WatchValue[] {
    return Array.from(this.watches.values()).map((watch) => ({
      key: watch.key,
      kind: watch.kind,
      identifier: watch.identifier,
      value: watch.lastValue,
    }));
  }

  private createTarget(kind: WatchKind, identifier: WatchIdentifier): WatchTarget {
    if (kind === "register") {
      const { index, normalized } = this.normalizeRegister(identifier);
      return {
        key: `${kind}:${index}`,
        kind,
        identifier: normalized,
        readValue: () => this.state.getRegister(index),
      };
    }

    if (kind === "memory") {
      if (!this.memory) {
        throw new Error("Memory watches require a memory instance");
      }

      const address = this.normalizeAddress(identifier);
      return {
        key: `${kind}:${address}`,
        kind,
        identifier: address,
        readValue: () => this.memory!.read(address),
      };
    }

    if (typeof identifier !== "string") {
      throw new Error("Expression watches require a string expression");
    }

    const expression = identifier.trim();
    if (!expression) {
      throw new Error("Expression watches cannot be empty");
    }

    const ast = this.parseExpression(expression);
    return {
      key: `${kind}:${expression}`,
      kind,
      identifier: expression,
      readValue: () => this.evaluateExpression(ast),
    };
  }

  private normalizeRegister(identifier: WatchIdentifier): { index: number; normalized: string } {
    return resolveRegisterIdentifier(identifier);
  }

  private normalizeAddress(identifier: WatchIdentifier): number {
    if (typeof identifier === "number") {
      return identifier | 0;
    }

    if (/^0x[0-9a-f]+$/i.test(identifier)) {
      return Number.parseInt(identifier, 16) | 0;
    }

    if (/^\d+$/.test(identifier)) {
      return Number.parseInt(identifier, 10) | 0;
    }

    if (this.symbolTable?.has(identifier)) {
      return this.symbolTable.get(identifier)! | 0;
    }

    throw new Error(`Unknown memory identifier: ${identifier}`);
  }

  private parseExpression(expression: string): ExpressionNode {
    const tokens = this.tokenizeExpression(expression);
    let position = 0;

    const peek = () => tokens[position] ?? null;
    const consume = () => tokens[position++] ?? null;

    const parsePrimary = (): ExpressionNode => {
      const token = consume();
      if (!token) throw new Error("Unexpected end of expression");

      if (token.type === "number") return { type: "number", value: token.value };

      if (token.type === "identifier") {
        if (token.kind === "register") return { type: "register", name: token.raw, index: token.index };
        return { type: "symbol", name: token.raw };
      }

      if (token.type === "paren" && token.value === "(") {
        const expr = parseExpression();
        const closing = consume();
        if (!closing || closing.type !== "paren" || closing.value !== ")") {
          throw new Error("Expected closing parenthesis");
        }
        return expr;
      }

      throw new Error(`Unexpected token in expression: ${token.raw}`);
    };

    const parseUnary = (): ExpressionNode => {
      const token = peek();
      if (!token) throw new Error("Unexpected end of expression");

      if (token.type === "operator" && (token.value === "+" || token.value === "-" || token.value === "*")) {
        consume();
        if (token.value === "*") {
          return { type: "deref", expr: parseUnary() };
        }
        return { type: "unary", op: token.value, expr: parseUnary() };
      }

      return parsePrimary();
    };

    const parseTerm = (): ExpressionNode => {
      let node = parseUnary();
      while (true) {
        const token = peek();
        if (token && token.type === "operator" && (token.value === "*" || token.value === "/")) {
          consume();
          node = { type: "binary", op: token.value, left: node, right: parseUnary() };
          continue;
        }
        break;
      }
      return node;
    };

    const parseExpression = (): ExpressionNode => {
      let node = parseTerm();
      while (true) {
        const token = peek();
        if (token && token.type === "operator" && (token.value === "+" || token.value === "-")) {
          consume();
          node = { type: "binary", op: token.value, left: node, right: parseTerm() };
          continue;
        }
        break;
      }
      return node;
    };

    const result = parseExpression();
    if (peek()) {
      throw new Error(`Unexpected token at end of expression: ${peek()!.raw}`);
    }
    return result;
  }

  private evaluateExpression(ast: ExpressionNode): number {
    switch (ast.type) {
      case "number":
        return ast.value | 0;
      case "register":
        return this.state.getRegister(ast.index);
      case "symbol": {
        if (!this.symbolTable?.has(ast.name)) {
          throw new Error(`Unknown symbol: ${ast.name}`);
        }
        return this.symbolTable.get(ast.name)! | 0;
      }
      case "unary": {
        const value = this.evaluateExpression(ast.expr);
        return ast.op === "-" ? (-value | 0) : value | 0;
      }
      case "binary": {
        const left = this.evaluateExpression(ast.left);
        const right = this.evaluateExpression(ast.right);
        switch (ast.op) {
          case "+":
            return (left + right) | 0;
          case "-":
            return (left - right) | 0;
          case "*":
            return (left * right) | 0;
          case "/":
            if (right === 0) throw new Error("Division by zero in watch expression");
            return (left / right) | 0;
        }
        return 0;
      }
      case "deref": {
        if (!this.memory) throw new Error("Memory access in expression requires a memory instance");
        const address = this.evaluateExpression(ast.expr);
        return this.memory.read(address);
      }
    }
  }

  private tokenizeExpression(expression: string): Array<
    | { type: "number"; raw: string; value: number }
    | { type: "identifier"; raw: string; kind: "register" | "symbol"; index: number }
    | { type: "operator"; raw: string; value: "+" | "-" | "*" | "/" }
    | { type: "paren"; raw: string; value: "(" | ")" }
  > {
    const tokens: Array<
      | { type: "number"; raw: string; value: number }
      | { type: "identifier"; raw: string; kind: "register" | "symbol"; index: number }
      | { type: "operator"; raw: string; value: "+" | "-" | "*" | "/" }
      | { type: "paren"; raw: string; value: "(" | ")" }
    > = [];

    let index = 0;
    const nextChar = () => expression[index] ?? "";

    const isIdentifierStart = (char: string) => /[A-Za-z_$]/.test(char);
    const isIdentifierPart = (char: string) => /[A-Za-z0-9_$]/.test(char);

    while (index < expression.length) {
      const char = nextChar();
      if (char === " " || char === "\t" || char === "\n") {
        index += 1;
        continue;
      }

      if (char === "+" || char === "-" || char === "*" || char === "/") {
        tokens.push({ type: "operator", raw: char, value: char });
        index += 1;
        continue;
      }

      if (char === "(" || char === ")") {
        tokens.push({ type: "paren", raw: char, value: char });
        index += 1;
        continue;
      }

      if (/[0-9]/.test(char)) {
        const start = index;
        index += 1;
        while (/[0-9a-fA-Fx]/.test(nextChar())) index += 1;
        const raw = expression.slice(start, index);
        const value = raw.startsWith("0x") || raw.startsWith("0X") ? Number.parseInt(raw, 16) : Number.parseInt(raw, 10);
        if (Number.isNaN(value)) throw new Error(`Invalid numeric literal: ${raw}`);
        tokens.push({ type: "number", raw, value: value | 0 });
        continue;
      }

      if (isIdentifierStart(char)) {
        const start = index;
        index += 1;
        while (isIdentifierPart(nextChar())) index += 1;
        const raw = expression.slice(start, index);
        if (raw.startsWith("$")) {
          const { index: registerIndex } = this.normalizeRegister(raw.slice(1));
          tokens.push({ type: "identifier", raw, kind: "register", index: registerIndex });
          continue;
        }

        const registerLookup = (() => {
          try {
            return this.normalizeRegister(raw);
          } catch {
            return null;
          }
        })();

        if (registerLookup) {
          tokens.push({ type: "identifier", raw, kind: "register", index: registerLookup.index });
        } else {
          tokens.push({ type: "identifier", raw, kind: "symbol", index: -1 });
        }
        continue;
      }

      throw new Error(`Unrecognized token in expression: ${char}`);
    }

    return tokens;
  }
}
