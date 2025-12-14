import type { MacroKind } from "./MacroParser";
import { getRendererApi, type PseudoOpsOverride } from "../../shared/bridge";

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

export interface MacroSymbolDocumentation {
  symbol: string;
  description: string;
}

interface MacroSymbolDocEntry extends MacroSymbolDocumentation {
  kinds: MacroKind[];
}

const macroSymbolDocs: MacroSymbolDocEntry[] = [
  { kinds: ["RG"], symbol: "RGn", description: "Substitute the register from source token n." },
  { kinds: ["NR"], symbol: "NRn", description: "Substitute the next higher register after the one in token n." },
  { kinds: ["OP"], symbol: "OPn", description: "Substitute the raw text of token n." },
  {
    kinds: ["IMM"],
    symbol: "IMM",
    description: "Substitute the first immediate token from the source statement (or the last token if none found).",
  },
  { kinds: ["LL"], symbol: "LLn", description: "Low-order 16 bits of the label address in token n." },
  { kinds: ["LL"], symbol: "LLnU", description: "Unsigned low-order 16 bits of the label address in token n." },
  { kinds: ["LL"], symbol: "LLnPm", description: "Low-order 16 bits of the label address in token n after adding m (1–4)." },
  {
    kinds: ["LH"],
    symbol: "LHn",
    description: "High-order 16 bits of the label address in token n; add 1 if address bit 15 is 1.",
  },
  {
    kinds: ["LH"],
    symbol: "LHnPm",
    description: "High-order 16 bits of the label address in token n after adding m (1–4); then add 1 if bit 15 is 1.",
  },
  { kinds: ["VL"], symbol: "VLn", description: "Low-order 16 bits of the 32-bit value in token n." },
  { kinds: ["VL"], symbol: "VLnU", description: "Unsigned low-order 16 bits of the 32-bit value in token n." },
  { kinds: ["VL"], symbol: "VLnPm", description: "Low-order 16 bits of the 32-bit value in token n after adding m (1–4)." },
  {
    kinds: ["VL"],
    symbol: "VLnPmU",
    description: "Unsigned low-order 16 bits of the 32-bit value in token n after adding m (1–4).",
  },
  {
    kinds: ["VHL"],
    symbol: "VHLn",
    description: "High-order 16 bits of the 32-bit value in token n; pair with VLnU when combining halves.",
  },
  {
    kinds: ["VH"],
    symbol: "VHn",
    description: "High-order 16 bits of the 32-bit value in token n; add 1 if the value's bit 15 is 1.",
  },
  {
    kinds: ["VHL"],
    symbol: "VHLnPm",
    description: "High-order 16 bits of the 32-bit value in token n after adding m (1–4); pair with VLnU when combining halves.",
  },
  {
    kinds: ["VH"],
    symbol: "VHnPm",
    description: "High-order 16 bits of the 32-bit value in token n after adding m (1–4); then add 1 if bit 15 is 1.",
  },
  {
    kinds: ["LLP"],
    symbol: "LLP",
    description: "Low-order 16 bits of a label-plus-immediate expression (immediate added before truncation).",
  },
  {
    kinds: ["LLP"],
    symbol: "LLPU",
    description: "Unsigned low-order 16 bits of a label-plus-immediate expression (immediate added before truncation).",
  },
  {
    kinds: ["LLPP"],
    symbol: "LLPPm",
    description: "Low-order 16 bits of a label-plus-immediate expression after applying the m (1–4) addend before truncation.",
  },
  { kinds: ["LHPA"], symbol: "LHPA", description: "High-order 16 bits of a label-plus-immediate expression." },
  {
    kinds: ["LHPN"],
    symbol: "LHPN",
    description: "High-order 16 bits of a label-plus-immediate expression used by la; do not add 1 for bit 15 because ori resolves it.",
  },
  {
    kinds: ["LHPA"],
    symbol: "LHPAPm",
    description: "High-order 16 bits of a label-plus-immediate expression after applying the m (1–4) addend.",
  },
  { kinds: ["LHL"], symbol: "LHL", description: "High-order 16 bits from the label address in token 2 of an la statement." },
  { kinds: ["LAB"], symbol: "LAB", description: "Substitute the textual label from the last token of the source statement." },
  { kinds: ["S32"], symbol: "S32", description: "Substitute 32 minus the constant in the last token (used by ror/rol)." },
  { kinds: ["DBNOP"], symbol: "DBNOP", description: "Insert a delayed-branching NOP when delayed branching is enabled." },
  {
    kinds: ["BROFF"],
    symbol: "BROFFnm",
    description: "Substitute n if delayed branching is disabled; substitute m if delayed branching is enabled (branch offsets in words).",
  },
  { kinds: ["COMPACT"], symbol: "COMPACT", description: "Separator between the default template and an optional 16-bit optimized template." },
];

const documentedMacroKinds = new Set<MacroKind>();
const allMacroKinds: MacroKind[] = [
  "COMPACT",
  "DBNOP",
  "BROFF",
  "LAB",
  "LHL",
  "IMM",
  "RG",
  "NR",
  "OP",
  "LLP",
  "LLPP",
  "LL",
  "LHPA",
  "LHPN",
  "LH",
  "VH",
  "VHL",
  "VL",
  "S32",
];

for (const entry of macroSymbolDocs) {
  entry.kinds.forEach((kind) => documentedMacroKinds.add(kind));
}

const undocumentedKinds = allMacroKinds.filter((kind) => !documentedMacroKinds.has(kind));
if (undocumentedKinds.length > 0) {
  throw new Error(`Missing macro symbol documentation for kinds: ${undocumentedKinds.join(", ")}`);
}

export type PseudoOpTable = Map<string, PseudoOpDefinition[]>;

let cachedPseudoOps: PseudoOpTable | null = null;
let cachedPseudoOpDocumentation: PseudoOpDocumentation[] | null = null;
let cachedBundledPseudoOpsText: string | null = null;

/**
 * Load and parse the bundled PseudoOps.txt resource into a table keyed by mnemonic.
 */
export function loadPseudoOpTable(): PseudoOpTable {
  if (cachedPseudoOps) return cachedPseudoOps;

  const rendererApi = getRendererApi();
  const snapshot = rendererApi?.loadPseudoOpsFile?.();
  const baseContents = snapshot?.contents ?? loadBundledPseudoOpsFromDisk();

  if (!baseContents) {
    throw new Error("PseudoOps.txt could not be loaded.");
  }

  const table = parsePseudoOpsFile(baseContents);

  const override = rendererApi?.loadUserPseudoOpsOverride?.() ?? loadUserPseudoOpsOverrideFromDisk();
  if (override && (!snapshot || override.path !== snapshot.sourcePath)) {
    const userTable = override.isJson ? parsePseudoOpsJson(override.contents) : parsePseudoOpsFile(override.contents);
    mergePseudoOpTables(table, userTable);
  }

  cachedPseudoOps = table;
  return cachedPseudoOps;
}

/** Reset the cached pseudo-op table (intended for tests). */
export function resetPseudoOpCacheForTesting(): void {
  cachedPseudoOps = null;
  cachedPseudoOpDocumentation = null;
}

/**
 * Re-read pseudo-op definitions from disk, including user overrides, replacing the cached table.
 */
export function reloadPseudoOpTable(): PseudoOpTable {
  cachedPseudoOps = null;
  cachedPseudoOpDocumentation = null;

  const table = loadPseudoOpTable();
  cachedPseudoOpDocumentation = buildPseudoOpDocumentation(table);
  return table;
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
 * Cached accessor for pseudo-op documentation, suitable for help tabs.
 */
export function getPseudoOpDocumentation(): PseudoOpDocumentation[] {
  if (cachedPseudoOpDocumentation) return cachedPseudoOpDocumentation;

  cachedPseudoOpDocumentation = buildPseudoOpDocumentation();
  return cachedPseudoOpDocumentation;
}

export function getMacroSymbolDocumentation(): MacroSymbolDocumentation[] {
  return macroSymbolDocs.map(({ kinds: _ignored, ...entry }) => ({ ...entry }));
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
function mergePseudoOpTables(base: PseudoOpTable, overrides: PseudoOpTable): void {
  for (const [mnemonic, definitions] of overrides.entries()) {
    base.set(mnemonic, definitions);
  }
}

function isJsonPseudoOpFile(path: string): boolean {
  return path.toLowerCase().endsWith(".json");
}

function loadBundledPseudoOpsFromDisk(): string {
  if (cachedBundledPseudoOpsText !== null) return cachedBundledPseudoOpsText;
  if (typeof require === "undefined") return "";

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require("path") as typeof import("path");

    const candidates = [
      path.resolve(typeof __dirname !== "undefined" ? __dirname : process.cwd(), "../../../resources/PseudoOps.txt"),
      path.resolve(process.cwd(), "resources", "PseudoOps.txt"),
    ];

    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (found) {
      cachedBundledPseudoOpsText = fs.readFileSync(found, "utf8");
      return cachedBundledPseudoOpsText;
    }
  } catch {
    // fall through to empty string
  }

  cachedBundledPseudoOpsText = "";
  return cachedBundledPseudoOpsText;
}

function loadUserPseudoOpsOverrideFromDisk(): PseudoOpsOverride | null {
  if (typeof require === "undefined") return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require("path") as typeof import("path");

    const candidates = [
      path.resolve(process.cwd(), "PseudoOps.txt"),
      path.resolve(process.cwd(), "PseudoOps.json"),
      path.resolve(process.cwd(), "config", "PseudoOps.txt"),
      path.resolve(process.cwd(), "config", "PseudoOps.json"),
    ];

    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (found) {
      const contents = fs.readFileSync(found, "utf8");
      return { path: found, contents, isJson: found.toLowerCase().endsWith(".json") };
    }
  } catch {
    // ignore
  }

  return null;
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
