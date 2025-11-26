import type { ReadFileSync } from "node:fs";

export interface PseudoOpDefinition {
  /** Example syntax split into tokens (operator is token 0; parentheses are tokens, commas are not). */
  tokens: string[];
  /** Raw example syntax text. */
  example: string;
  /** One or more basic-instruction templates for expanding the pseudo-op. */
  templates: string[];
  /** Optional descriptive text that may follow the templates. */
  description?: string;
}

export type PseudoOpTable = Map<string, PseudoOpDefinition[]>;

let cachedPseudoOps: PseudoOpTable | null = null;

/**
 * Load and parse the bundled PseudoOps.txt resource into a table keyed by mnemonic.
 */
export function loadPseudoOpTable(): PseudoOpTable {
  if (cachedPseudoOps) return cachedPseudoOps;

  const fs = require("fs") as typeof import("fs");
  const resolvedPath = resolvePseudoOpsPath(fs);
  const contents = fs.readFileSync(resolvedPath, "utf8");
  cachedPseudoOps = parsePseudoOpsFile(contents);
  return cachedPseudoOps;
}

/**
 * Parse the contents of PseudoOps.txt into a lookup table. Each line contains an
 * example pseudo-instruction followed by one or more templates separated by tabs.
 */
export function parsePseudoOpsFile(contents: string): PseudoOpTable {
  const table: PseudoOpTable = new Map();

  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith("#") || /^\s/.test(line)) continue;
    const parsed = parsePseudoOpLine(line);
    if (!parsed) continue;

    const existing = table.get(parsed.mnemonic) ?? [];
    existing.push({
      tokens: parsed.tokens,
      example: parsed.example,
      templates: parsed.templates,
      description: parsed.description,
    });
    table.set(parsed.mnemonic, existing);
  }

  return table;
}

function parsePseudoOpLine(line: string):
  | { mnemonic: string; tokens: string[]; example: string; templates: string[]; description?: string }
  | null {
  const parts = line
    .split("\t")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length < 2) return null;

  const [example, ...rest] = parts;
  const tokens = tokenizeExample(example);
  if (tokens.length === 0) return null;

  const templates: string[] = [];
  let description: string | undefined;

  for (const segment of rest) {
    if (segment.startsWith("#")) {
      description = segment.substring(1);
      break;
    }
    templates.push(segment);
  }

  if (templates.length === 0) return null;

  return {
    mnemonic: tokens[0]?.toLowerCase(),
    tokens,
    example,
    templates,
    description,
  };
}

function tokenizeExample(example: string): string[] {
  const spaced = example.replace(/,/g, " ").replace(/\(/g, " ( ").replace(/\)/g, " ) ");
  return spaced
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function resolvePseudoOpsPath(fs: { existsSync: (path: string) => boolean; readFileSync: ReadFileSync }): string {
  const pathModule = require("path") as typeof import("path");
  const candidates: string[] = [];

  if (typeof __dirname !== "undefined") {
    candidates.push(pathModule.resolve(__dirname, "../../../resources/PseudoOps.txt"));
  }

  candidates.push(pathModule.resolve(process.cwd(), "resources", "PseudoOps.txt"));

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (found) return found;

  throw new Error("PseudoOps.txt not found. Checked: " + candidates.join(", "));
}
