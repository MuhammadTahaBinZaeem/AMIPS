import { Lexer, LexedLine, Token } from "./Lexer";

interface MacroDefinition {
  name: string;
  params: string[];
  body: MacroLine[];
  labels: Set<string>;
  endIndex: number;
}

interface MacroLine {
  tokens: Token[];
}

export class MacroExpander {
  private readonly lexer: Lexer;
  private counter = 0;
  private readonly callStack: string[] = [];

  constructor(lexer = new Lexer()) {
    this.lexer = lexer;
  }

  expand(source: string): string {
    const lexed = this.lexer.tokenize(source);
    const macros: MacroDefinition[] = [];
    const remaining: LexedLine[] = [];

    for (let index = 0; index < lexed.length; index++) {
      const line = lexed[index];
      if (this.isMacroDirective(line.tokens, ".macro")) {
        const macro = this.parseMacro(macros, lexed, index);
        macros.push(macro);
        index = macro.endIndex;
        continue;
      }
      remaining.push(line);
    }

    const expandedLines = this.expandLines(remaining, macros);
    return expandedLines.join("\n");
  }

  private parseMacro(macros: MacroDefinition[], lexed: LexedLine[], startIndex: number): MacroDefinition {
    const header = lexed[startIndex];
    const nameToken = header.tokens[1];
    if (!nameToken || nameToken.type !== "identifier") {
      throw new Error(`.macro must be followed by a name (line ${header.line})`);
    }

    const params = this.parseParameters(header.tokens.slice(2), header.line);
    if (macros.some((macro) => macro.name === nameToken.raw && macro.params.length === params.length)) {
      throw new Error(`Duplicate macro declaration '${nameToken.raw}' at line ${header.line}`);
    }
    const body: MacroLine[] = [];
    const labels = new Set<string>();

    let index = startIndex + 1;
    while (index < lexed.length && !this.isMacroDirective(lexed[index].tokens, ".end_macro")) {
      const line = lexed[index];
      if (this.isMacroDirective(line.tokens, ".macro")) {
        throw new Error(`Nested macro definitions are not supported (line ${line.line})`);
      }
      body.push({ tokens: line.tokens });
      if (line.tokens[0]?.type === "identifier" && line.tokens[1]?.type === "colon") {
        labels.add(String(line.tokens[0].raw));
      }
      index++;
    }

    if (index >= lexed.length || !this.isMacroDirective(lexed[index].tokens, ".end_macro")) {
      throw new Error(`Missing .end_macro for macro '${nameToken.raw}' starting at line ${header.line}`);
    }

    return { name: String(nameToken.raw), params, body, labels, endIndex: index };
  }

  private parseParameters(tokens: Token[], line: number): string[] {
    const args = this.splitArguments(tokens);
    const params: string[] = [];
    for (const argTokens of args) {
      if (argTokens.length !== 1 || (argTokens[0].type !== "identifier" && argTokens[0].type !== "register")) {
        throw new Error(`Invalid macro parameter at line ${line}`);
      }
      params.push(String(argTokens[0].raw));
    }
    return params;
  }

  private splitArguments(tokens: Token[]): Token[][] {
    const args: Token[][] = [];
    let current: Token[] = [];
    const flush = () => {
      if (current.length > 0) {
        args.push(current);
        current = [];
      }
    };

    for (const token of tokens) {
      if (token.type === "comma") {
        flush();
        continue;
      }
      current.push(token);
    }
    flush();

    return args;
  }

  private matchingMacro(
    macros: MacroDefinition[],
    tokens: Token[],
  ): { macro: MacroDefinition; startIndex: number } | undefined {
    let startIndex = 0;

    while (
      startIndex + 1 < tokens.length &&
      tokens[startIndex]?.type === "identifier" &&
      tokens[startIndex + 1]?.type === "colon"
    ) {
      startIndex += 2; // Skip leading label definitions.
    }

    const nameToken = tokens[startIndex];
    if (!nameToken || nameToken.type !== "identifier") return undefined;

    const args = this.splitArguments(tokens.slice(startIndex + 1));
    const macro = macros.find((definition) => definition.name === nameToken.raw && definition.params.length === args.length);
    return macro ? { macro, startIndex } : undefined;
  }

  private expandLines(lines: LexedLine[], macros: MacroDefinition[]): string[] {
    const output: string[] = [];
    const stack: LexedLine[] = [...lines].reverse();

    while (stack.length) {
      const line = stack.pop() as LexedLine;
      const macroCall = this.matchingMacro(macros, line.tokens);
      if (macroCall) {
        const { macro, startIndex } = macroCall;
        const args = this.splitArguments(line.tokens.slice(startIndex + 1));
        if (args.length !== macro.params.length) {
          throw new Error(`.macro ${macro.name} expects ${macro.params.length} argument(s) (line ${line.line})`);
        }
        if (this.callStack.includes(macro.name)) {
          throw new Error(`Recursive macro expansion detected for '${macro.name}' (line ${line.line})`);
        }

        const suffix = `_M${this.counter++}`;
        let substituted = macro.body.map((bodyLine) => this.substituteLine(bodyLine, macro, args, suffix));
        const labelPrefix = this.tokensToText(line.tokens.slice(0, startIndex));
        if (labelPrefix && substituted.length > 0) {
          substituted = [`${labelPrefix} ${substituted[0]}`, ...substituted.slice(1)];
        }
        const lexedExpansion = this.lexer.tokenize(substituted.join("\n"));
        this.callStack.push(macro.name);
        const expanded = this.expandLines(lexedExpansion, macros);
        this.callStack.pop();
        output.push(...expanded);
        continue;
      }

      output.push(this.reconstructLine(line.tokens));
    }

    return output;
  }

  private isMacroDirective(tokens: Token[], name: string): boolean {
    const first = tokens[0];
    return Boolean(first && first.type === "directive" && String(first.raw).toLowerCase() === name);
  }

  private reconstructLine(tokens: Token[]): string {
    if (tokens.length === 0) return "";
    return tokens.map((token) => token.raw).join(" ");
  }

  private substituteLine(
    line: MacroLine,
    macro: MacroDefinition,
    args: Token[][],
    suffix: string,
  ): string {
    const paramMap = new Map<string, string>();
    macro.params.forEach((param, index) => {
      paramMap.set(param, this.tokensToText(args[index] ?? []));
    });

    const substituted = line.tokens.map((token) => {
      if (paramMap.has(token.raw)) {
        return paramMap.get(token.raw) as string;
      }
      if (macro.labels.has(token.raw)) {
        return `${token.raw}${suffix}`;
      }
      return token.raw;
    });

    return substituted.join(" ");
  }

  private tokensToText(tokens: Token[]): string {
    return tokens.map((token) => token.raw).join("");
  }
}
