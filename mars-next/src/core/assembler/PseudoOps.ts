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
  const pathModule = require("path") as typeof import("path");

  const builtInPath = resolvePseudoOpsPath(fs, pathModule);
  const builtInContents = fs.readFileSync(builtInPath, "utf8");
  const table = parsePseudoOpsFile(builtInContents);

  const userPath = resolveUserPseudoOpsPath(fs, pathModule);
  if (userPath) {
    const userContents = fs.readFileSync(userPath, "utf8");
    const userTable = isJsonPseudoOpFile(userPath)
      ? parsePseudoOpsJson(userContents)
      : parsePseudoOpsFile(userContents);
    mergePseudoOpTables(table, userTable);
  }

  cachedPseudoOps = table;
  return cachedPseudoOps;
}

/** Reset the cached pseudo-op table (intended for tests). */
export function resetPseudoOpCacheForTesting(): void {
  cachedPseudoOps = null;
}

/**
 * Re-read pseudo-op definitions from disk, including user overrides, replacing the cached table.
 */
export function reloadPseudoOpTable(): PseudoOpTable {
  cachedPseudoOps = null;
  return loadPseudoOpTable();
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

    addDefinition(table, parsed);
  }

  return table;
}

/**
 * Parse a JSON pseudo-op table. The JSON may be an object whose keys are mnemonics mapping to
 * one or more forms, or an array of objects containing at least `example` and `templates`.
 */
export function parsePseudoOpsJson(contents: string): PseudoOpTable {
  const parsed = JSON.parse(contents) as unknown;
  const table: PseudoOpTable = new Map();

  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      addJsonEntry(table, entry, undefined);
    }
  } else if (parsed && typeof parsed === "object") {
    for (const [mnemonic, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        for (const entry of value) addJsonEntry(table, entry, mnemonic);
      } else {
        addJsonEntry(table, value, mnemonic);
      }
    }
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

/**
 * Validate a pseudo-op definition file, throwing a descriptive error if any
 * non-comment line cannot be parsed into a definition.
 */
export function validatePseudoOpsText(contents: string): void {
  const errors: string[] = [];

  contents.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    const { body, description } = stripInlineComment(line);

    if (!body || /^\s*$/.test(body)) return;
    if (body.trimStart().startsWith("#")) return;

    if (/^\s/.test(body)) {
      errors.push(`Line ${lineNumber}: pseudo-op definitions must start in the first column.`);
      return;
    }

    const parsed = parsePseudoOpLine(body, description);
    if (!parsed) {
      errors.push(`Line ${lineNumber}: expected tab-separated example and template definitions.`);
    }
  });

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
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
  const templates: string[] = [];

  for (const segment of rest) {
    templates.push(segment);
  }

  return createDefinition(example, templates, descriptionFromComment);
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
function resolvePseudoOpsPath(
  fs: { existsSync: (path: string) => boolean; readFileSync: ReadFileSync },
  pathModule: typeof import("path"),
): string {
  const candidates: string[] = [];

  if (typeof __dirname !== "undefined") {
    candidates.push(pathModule.resolve(__dirname, "../../../resources/PseudoOps.txt"));
  }

  candidates.push(pathModule.resolve(process.cwd(), "resources", "PseudoOps.txt"));

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (found) return found;

  throw new Error("PseudoOps.txt not found. Checked: " + candidates.join(", "));
}

function resolveUserPseudoOpsPath(
  fs: { existsSync: (path: string) => boolean },
  pathModule: typeof import("path"),
): string | null {
  const candidates = [
    pathModule.resolve(process.cwd(), "PseudoOps.txt"),
    pathModule.resolve(process.cwd(), "PseudoOps.json"),
    pathModule.resolve(process.cwd(), "config", "PseudoOps.txt"),
    pathModule.resolve(process.cwd(), "config", "PseudoOps.json"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function mergePseudoOpTables(base: PseudoOpTable, overrides: PseudoOpTable): void {
  for (const [mnemonic, definitions] of overrides.entries()) {
    base.set(mnemonic, definitions);
  }
}

function isJsonPseudoOpFile(path: string): boolean {
  const pathModule = require("path") as typeof import("path");
  return pathModule.extname(path).toLowerCase() === ".json";
}

function addJsonEntry(table: PseudoOpTable, entry: unknown, mnemonicHint: string | undefined): void {
  if (!entry || typeof entry !== "object") return;

  const { example, templates, description } = entry as Partial<{
    example: string;
    templates: unknown;
    description?: string;
    mnemonic?: string;
  }>;

  if (!example || typeof example !== "string") return;
  if (!Array.isArray(templates)) return;

  const stringTemplates = templates.filter((template) => typeof template === "string") as string[];
  if (stringTemplates.length === 0) return;

  const definition = createDefinition(example, stringTemplates, description, mnemonicHint ?? (entry as { mnemonic?: string }).mnemonic);
  if (!definition) return;

  addDefinition(table, definition);
}

function createDefinition(
  example: string,
  templates: string[],
  description?: string,
  mnemonicHint?: string,
): { mnemonic: string; tokens: string[]; example: string; templates: string[]; description?: string } | null {
  const tokens = tokenizeExample(example);
  if (tokens.length === 0) return null;
  if (templates.length === 0) return null;

  const mnemonic = (mnemonicHint ?? tokens[0])?.toLowerCase();
  if (!mnemonic) return null;

  return { mnemonic, tokens, example, templates, description };
}

function addDefinition(table: PseudoOpTable, parsed: {
  mnemonic: string;
  tokens: string[];
  example: string;
  templates: string[];
  description?: string;
}): void {
  const existing = table.get(parsed.mnemonic) ?? [];
  existing.push({
    tokens: parsed.tokens,
    example: parsed.example,
    templates: parsed.templates,
    description: parsed.description,
  });
  table.set(parsed.mnemonic, existing);
}
