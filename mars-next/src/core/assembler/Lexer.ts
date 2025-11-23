export type TokenType =
  | "identifier"
  | "directive"
  | "register"
  | "number"
  | "string"
  | "comma"
  | "colon"
  | "lparen"
  | "rparen"
  | "plus"
  | "minus"
  | "star"
  | "slash"
  | "percent"
  | "amp"
  | "pipe"
  | "caret"
  | "tilde"
  | "lshift"
  | "rshift";

export interface Token {
  type: TokenType;
  value: string | number;
  line: number;
  column: number;
  raw: string;
}

export interface LexedLine {
  line: number;
  tokens: Token[];
}

export class Lexer {
  tokenize(source: string): LexedLine[] {
    const lines = source.split(/\r?\n/);
    const lexed: LexedLine[] = [];

    lines.forEach((text, index) => {
      const lineNumber = index + 1;
      const tokens = this.tokenizeLine(text, lineNumber);
      lexed.push({ line: lineNumber, tokens });
    });

    return lexed;
  }

  private tokenizeLine(text: string, lineNumber: number): Token[] {
    const cleaned = this.stripComment(text);
    const tokens: Token[] = [];

    let i = 0;
    while (i < cleaned.length) {
      const char = cleaned[i];
      if (/\s/.test(char)) {
        i++;
        continue;
      }

      const column = i + 1;

      if (char === ",") {
        tokens.push({ type: "comma", value: ",", line: lineNumber, column, raw: "," });
        i++;
        continue;
      }

      if (char === ":") {
        tokens.push({ type: "colon", value: ":", line: lineNumber, column, raw: ":" });
        i++;
        continue;
      }

      if (char === "(") {
        tokens.push({ type: "lparen", value: "(", line: lineNumber, column, raw: "(" });
        i++;
        continue;
      }

      if (char === ")") {
        tokens.push({ type: "rparen", value: ")", line: lineNumber, column, raw: ")" });
        i++;
        continue;
      }

      if (char === "\"") {
        const { literal, length } = this.readString(cleaned, i + 1, lineNumber, column);
        tokens.push({ type: "string", value: literal, line: lineNumber, column, raw: cleaned.slice(i, i + length + 2) });
        i += length + 2;
        continue;
      }

      if (char === "$") {
        const { token, length } = this.readWordToken("register", cleaned, i + 1, lineNumber, column);
        tokens.push(token);
        i += length + 1;
        continue;
      }

      if (char === ".") {
        const { token, length } = this.readWordToken("directive", cleaned, i + 1, lineNumber, column);
        tokens.push(token);
        i += length + 1;
        continue;
      }

      if (this.isNumberStart(cleaned, i)) {
        const { token, length } = this.readNumber(cleaned, i, lineNumber, column);
        tokens.push(token);
        i += length;
        continue;
      }

      if (char === "+") {
        tokens.push({ type: "plus", value: "+", line: lineNumber, column, raw: "+" });
        i++;
        continue;
      }

      if (char === "-") {
        tokens.push({ type: "minus", value: "-", line: lineNumber, column, raw: "-" });
        i++;
        continue;
      }

      if (char === "*") {
        tokens.push({ type: "star", value: "*", line: lineNumber, column, raw: "*" });
        i++;
        continue;
      }

      if (char === "%") {
        tokens.push({ type: "percent", value: "%", line: lineNumber, column, raw: "%" });
        i++;
        continue;
      }

      if (char === "&") {
        tokens.push({ type: "amp", value: "&", line: lineNumber, column, raw: "&" });
        i++;
        continue;
      }

      if (char === "|") {
        tokens.push({ type: "pipe", value: "|", line: lineNumber, column, raw: "|" });
        i++;
        continue;
      }

      if (char === "^") {
        tokens.push({ type: "caret", value: "^", line: lineNumber, column, raw: "^" });
        i++;
        continue;
      }

      if (char === "~") {
        tokens.push({ type: "tilde", value: "~", line: lineNumber, column, raw: "~" });
        i++;
        continue;
      }

      if (char === "<" && cleaned[i + 1] === "<") {
        tokens.push({ type: "lshift", value: "<<", line: lineNumber, column, raw: "<<" });
        i += 2;
        continue;
      }

      if (char === ">" && cleaned[i + 1] === ">") {
        tokens.push({ type: "rshift", value: ">>", line: lineNumber, column, raw: ">>" });
        i += 2;
        continue;
      }

      if (char === "/") {
        tokens.push({ type: "slash", value: "/", line: lineNumber, column, raw: "/" });
        i++;
        continue;
      }

      if (/[A-Za-z_%]/.test(char)) {
        const { token, length } = this.readWordToken("identifier", cleaned, i, lineNumber, column);
        tokens.push(token);
        i += length;
        continue;
      }

      throw new Error(`Unexpected character '${char}' at line ${lineNumber}, column ${column}`);
    }

    return tokens;
  }

  private isNumberStart(text: string, index: number): boolean {
    if (/[0-9]/.test(text[index] ?? "")) return true;
    if (text[index] === "." && /[0-9]/.test(text[index + 1] ?? "")) return true;
    if (text[index] === "-" && /[0-9.]/.test(text[index + 1] ?? "")) return true;
    return false;
  }

  private stripComment(text: string): string {
    let inString = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === "\"") {
        inString = !inString;
        continue;
      }

      if (!inString && char === "#") {
        return text.slice(0, i);
      }

      if (!inString && char === "/" && text[i + 1] === "/") {
        return text.slice(0, i);
      }
    }
    return text;
  }

  private readString(text: string, start: number, line: number, column: number): { literal: string; length: number } {
    let i = start;
    let literal = "";

    while (i < text.length) {
      const char = text[i];
      if (char === "\\") {
        const next = text[i + 1];
        switch (next) {
          case "n":
            literal += "\n";
            break;
          case "t":
            literal += "\t";
            break;
          case "\\":
            literal += "\\";
            break;
          case "\"":
            literal += "\"";
            break;
          case "0":
            literal += "\0";
            break;
          default:
            literal += next;
        }
        i += 2;
        continue;
      }

      if (char === "\"") {
        return { literal, length: i - start };
      }

      literal += char;
      i++;
    }

    throw new Error(`Unterminated string starting at line ${line}, column ${column}`);
  }

  private readWordToken(
    type: "identifier" | "directive" | "register",
    text: string,
    start: number,
    line: number,
    column: number,
  ): { token: Token; length: number } {
    let i = start;
    while (i < text.length && /[A-Za-z0-9_.$%]/.test(text[i])) i++;
    const raw = text.slice(start - (type === "identifier" ? 0 : 1), i);
    const value = text.slice(start, i);
    return {
      token: { type, value, line, column, raw },
      length: i - start,
    };
  }

  private readNumber(text: string, start: number, line: number, column: number): { token: Token; length: number } {
    const match = text.slice(start).match(/^[-]?(?:0x[0-9A-Fa-f]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (!match) {
      throw new Error(`Invalid number at line ${line}, column ${column}`);
    }

    const raw = match[0];
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      throw new Error(`Invalid number '${raw}' at line ${line}, column ${column}`);
    }

    return {
      token: { type: "number", value: numeric, line, column, raw },
      length: raw.length,
    };
  }
}
