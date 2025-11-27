import { Lexer, LexedLine, Token } from "./Lexer";

interface MacroLine {
  tokens: Token[];
}

interface MacroDefinition {
  name: string;
  params: string[];
  body: MacroLine[];
  labels: Set<string>;
  definedAt: number;
}

interface ProcessFrameLine {
  kind: "line";
  line: LexedLine;
}

interface ProcessFramePop {
  kind: "pop";
}

type ProcessFrame = ProcessFrameLine | ProcessFramePop;

export class MacroProcessor {
  private readonly lexer: Lexer;
  private macros: MacroDefinition[] = [];
  private counter = 0;
  private readonly callStack: number[] = [];

  constructor(lexer: Lexer) {
    this.lexer = lexer;
  }

  process(lines: LexedLine[]): string[] {
    this.macros = [];
    this.counter = 0;
    this.callStack.length = 0;

    const output: string[] = [];
    const stack: ProcessFrame[] = lines.map((line) => ({ kind: "line", line })).reverse();

    while (stack.length) {
      const frame = stack.pop() as ProcessFrame;
      if (frame.kind === "pop") {
        this.callStack.pop();
        continue;
      }

      const line = frame.line;
      if (this.isMacroDirective(line.tokens, ".macro")) {
        const macro = this.parseMacroDefinition(line, stack);
        this.macros.push(macro);
        continue;
      }

      const macroCall = this.matchingMacro(line.tokens);
      if (macroCall) {
        const { macro, startIndex } = macroCall;
        const args = this.splitArguments(line.tokens.slice(startIndex + 1));
        const labelPrefix = this.tokensToText(line.tokens.slice(0, startIndex));
        const suffix = this.nextSuffix();

        if (this.callStack.includes(line.line)) {
          const history = [...this.callStack, line.line].join("->");
          throw new Error(`Detected a macro expansion loop at line ${line.line} (${history})`);
        }

        const substitutedLines = macro.body.map((bodyLine) => this.substituteLine(bodyLine, macro, args, suffix));
        const combinedLines = labelPrefix && substitutedLines.length > 0
          ? [`${labelPrefix} ${substitutedLines[0]}`, ...substitutedLines.slice(1)]
          : substitutedLines;
        const lexedExpansion = this.lexer.tokenize(combinedLines.join("\n"));

        this.callStack.push(line.line);
        stack.push({ kind: "pop" });
        for (let i = lexedExpansion.length - 1; i >= 0; i--) {
          stack.push({ kind: "line", line: lexedExpansion[i] });
        }
        continue;
      }

      output.push(this.reconstructLine(line.tokens));
    }

    return output;
  }

  private parseMacroDefinition(header: LexedLine, stack: ProcessFrame[]): MacroDefinition {
    const nameToken = header.tokens[1];
    if (!nameToken || nameToken.type !== "identifier") {
      throw new Error(`.macro must be followed by a name (line ${header.line})`);
    }

    const params = this.parseParameters(header.tokens.slice(2), header.line);
    const body: MacroLine[] = [];
    const labels = new Set<string>();
    let depth = 0;

    while (stack.length) {
      const frame = stack.pop() as ProcessFrame;
      if (frame.kind === "pop") {
        throw new Error(`Missing .end_macro for macro '${nameToken.raw}' starting at line ${header.line}`);
      }
      const line = frame.line;

      if (this.isMacroDirective(line.tokens, ".macro")) {
        depth++;
        body.push({ tokens: line.tokens });
        continue;
      }

      if (this.isMacroDirective(line.tokens, ".end_macro")) {
        if (depth === 0) {
          return { name: String(nameToken.raw), params, body, labels, definedAt: header.line };
        }
        depth--;
        body.push({ tokens: line.tokens });
        continue;
      }

      if (line.tokens[0]?.type === "identifier" && line.tokens[1]?.type === "colon") {
        labels.add(String(line.tokens[0].raw));
      }
      body.push({ tokens: line.tokens });
    }

    throw new Error(`Missing .end_macro for macro '${nameToken.raw}' starting at line ${header.line}`);
  }

  private matchingMacro(tokens: Token[]): { macro: MacroDefinition; startIndex: number } | undefined {
    let startIndex = 0;
    while (
      startIndex + 1 < tokens.length &&
      tokens[startIndex]?.type === "identifier" &&
      tokens[startIndex + 1]?.type === "colon"
    ) {
      startIndex += 2;
    }

    const nameToken = tokens[startIndex];
    if (!nameToken || nameToken.type !== "identifier") return undefined;

    const args = this.splitArguments(tokens.slice(startIndex + 1));
    let match: MacroDefinition | undefined;
    for (const macro of this.macros) {
      if (macro.name === nameToken.raw && macro.params.length === args.length) {
        if (!match || macro.definedAt >= match.definedAt) {
          match = macro;
        }
      }
    }
    return match ? { macro: match, startIndex } : undefined;
  }

  private parseParameters(tokens: Token[], line: number): string[] {
    const args = this.splitArguments(tokens);
    const params: string[] = [];
    for (const argTokens of args) {
      if (argTokens.length !== 1 || !this.tokenIsMacroParameter(argTokens[0])) {
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

  private isMacroDirective(tokens: Token[], name: string): boolean {
    const first = tokens[0];
    return Boolean(first && first.type === "directive" && String(first.raw).toLowerCase() === name);
  }

  private substituteLine(line: MacroLine, macro: MacroDefinition, args: Token[][], suffix: string): string {
    const paramMap = new Map<string, string>();
    macro.params.forEach((param, index) => {
      paramMap.set(param, this.tokensToText(args[index] ?? []));
    });

    let source = this.reconstructLine(line.tokens);
    for (let i = line.tokens.length - 1; i >= 0; i--) {
      const token = line.tokens[i];
      if (paramMap.has(token.raw)) {
        source = this.replaceToken(source, token.raw, paramMap.get(token.raw) as string);
      } else if (macro.labels.has(token.raw)) {
        source = this.replaceToken(source, token.raw, `${token.raw}${suffix}`);
      }
    }

    return source;
  }

  private reconstructLine(tokens: Token[]): string {
    if (tokens.length === 0) return "";
    let line = String(tokens[0].raw);
    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];
      const prev = tokens[i - 1];
      const needsSpace = !this.isPunctuation(token) && !this.isOpenPunctuation(prev) && !this.isClosePunctuation(token);
      line += `${needsSpace ? " " : ""}${token.raw}`;
    }
    return line;
  }

  private tokensToText(tokens: Token[]): string {
    return tokens.map((token) => token.raw).join("");
  }

  private nextSuffix(): string {
    return `_M${this.counter++}`;
  }

  private replaceToken(source: string, token: string, substitute: string): string {
    const pos = source.indexOf(token);
    return pos < 0 ? source : `${source.substring(0, pos)}${substitute}${source.substring(pos + token.length)}`;
  }

  private isPunctuation(token: Token): boolean {
    return ["comma", "colon", "rparen"].includes(token.type);
  }

  private isOpenPunctuation(token: Token): boolean {
    return token.type === "lparen";
  }

  private isClosePunctuation(token: Token): boolean {
    return token.type === "rparen";
  }

  private tokenIsMacroParameter(token: Token): boolean {
    return token.type === "identifier" || token.type === "register";
  }
}
