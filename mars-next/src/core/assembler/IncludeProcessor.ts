import { Lexer } from "./Lexer";

export type IncludeResolver = (absolutePath: string) => string;

export interface IncludeProcessOptions {
  baseDir?: string;
  resolver?: IncludeResolver | null;
}

const createDefaultResolver = (): IncludeResolver | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    return (absolutePath: string) => fs.readFileSync(absolutePath, "utf8");
  } catch {
    return null;
  }
};

const normalizeSeparators = (value: string): string => value.replace(/\\/g, "/");

const isAbsolutePath = (value: string): boolean => /^(?:[a-zA-Z]:[\\/]|\/)/.test(value);

const resolvePath = (baseDir: string | undefined, request: string): string => {
  if (!baseDir || isAbsolutePath(request)) {
    return request;
  }

  const normalizedBase = normalizeSeparators(baseDir).replace(/\/$/, "");
  return `${normalizedBase}/${request}`;
};

const parentDirectory = (absolutePath: string): string => {
  const normalized = normalizeSeparators(absolutePath);
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash < 0) return "";
  return absolutePath.slice(0, lastSlash);
};

export class IncludeProcessor {
  private readonly lexer: Lexer;
  private readonly defaultResolver: IncludeResolver | null;

  constructor(lexer: Lexer, resolver: IncludeResolver | null = null) {
    this.lexer = lexer;
    this.defaultResolver = resolver ?? createDefaultResolver();
  }

  process(source: string, options: IncludeProcessOptions = {}, seen: Set<string> = new Set()): string {
    const { baseDir, resolver = this.defaultResolver } = options;
    const lines = source.split(/\r?\n/);
    const lexed = this.lexer.tokenize(source);
    const output: string[] = [];

    for (let index = 0; index < lexed.length; index++) {
      const line = lexed[index];
      const first = line.tokens[0];

      if (first?.type === "directive" && String(first.raw).toLowerCase() === ".include") {
        const target = line.tokens[1];
        if (!target || target.type !== "string" || line.tokens.length !== 2) {
          throw new Error(`.include expects a single string literal argument (line ${line.line})`);
        }

        if (!resolver) {
          throw new Error(`.include encountered but no include resolver is configured (line ${line.line})`);
        }

        const resolvedPath = resolvePath(baseDir, String(target.value));
        if (seen.has(resolvedPath)) {
          throw new Error(`Recursive .include detected for '${target.value}' (line ${line.line})`);
        }

        seen.add(resolvedPath);
        const includedSource = resolver(resolvedPath);
        const nestedBase = parentDirectory(resolvedPath) || baseDir;
        const expanded = this.process(includedSource, { baseDir: nestedBase, resolver }, seen);
        output.push(...expanded.split(/\r?\n/));
        seen.delete(resolvedPath);
        continue;
      }

      output.push(lines[index] ?? "");
    }

    return output.join("\n");
  }
}
