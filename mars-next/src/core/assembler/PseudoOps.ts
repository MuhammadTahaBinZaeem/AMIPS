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

export interface PseudoOpDocumentation {
  mnemonic: string;
  forms: Array<{ syntax: string; expansions: string[]; description?: string }>;
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
    const { body, description } = stripInlineComment(line);
    if (!body || /^\s*$/.test(body) || body.trimStart().startsWith("#") || /^\s/.test(body)) continue;

    const parsed = parsePseudoOpLine(body, description);
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

/**
 * Convert the pseudo-op table into documentation entries suitable for help listings.
 */
export function buildPseudoOpDocumentation(table: PseudoOpTable = loadPseudoOpTable()): PseudoOpDocumentation[] {
  const docs: PseudoOpDocumentation[] = [];

  for (const [mnemonic, forms] of table.entries()) {
    docs.push({
      mnemonic,
      forms: forms.map((form) => ({
        syntax: form.example,
        expansions: groupTemplatesForDocs(form.templates),
        description: form.description,
      })),
    });
  }

  return docs.sort((a, b) => a.mnemonic.localeCompare(b.mnemonic));
}

function parsePseudoOpLine(
  line: string,
  descriptionFromComment?: string,
): { mnemonic: string; tokens: string[]; example: string; templates: string[]; description?: string } | null {
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
    templates.push(segment);
  }

  if (templates.length === 0) return null;

  description = descriptionFromComment ?? description;

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

function groupTemplatesForDocs(templates: string[]): string[] {
  const groups: string[][] = [];
  let current: string[] = [];

  for (const template of templates) {
    if (template.startsWith("COMPACT")) {
      if (current.length > 0) groups.push(current);
      current = [];
      const trimmed = template.replace(/^COMPACT\s*/, "").trim();
      if (trimmed.length > 0) current.push(trimmed);
      continue;
    }

    current.push(template);
  }

  if (current.length > 0) groups.push(current);

  return groups.map((group) => group.join("; "));
}

function stripInlineComment(line: string): { body: string; description?: string } {
  const hashIndex = line.indexOf("#");
  if (hashIndex === -1) return { body: line };

  return {
    body: line.substring(0, hashIndex),
    description: line.substring(hashIndex + 1).trim(),
  };
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
