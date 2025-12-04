import fs from "fs";
import path from "path";

interface InstructionEntry {
  name: string;
  format: string;
  description: string;
  operandLayout: string;
}

interface PseudoInstructionEntry extends InstructionEntry {
  templates: string[];
}

interface DirectiveEntry {
  name: string;
  description: string;
}

interface SyscallEntry {
  name: string;
  code: string;
  arguments: string;
  result: string;
}

interface MacroEntry {
  symbol: string;
  meaning: string;
}

interface HelpData {
  instructions: InstructionEntry[];
  pseudoinstructions: PseudoInstructionEntry[];
  directives: DirectiveEntry[];
  syscalls: SyscallEntry[];
  macros: MacroEntry[];
}

function readFile(relativePath: string): string {
  const absolutePath = path.resolve(__dirname, "..", relativePath);
  return fs.readFileSync(absolutePath, "utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseInstructions(source: string): InstructionEntry[] {
  const entries: InstructionEntry[] = [];
  const pattern = /new\s+BasicInstruction\(\s*"([^"]+)",\s*"([^"]*)",\s*BasicInstructionFormat\.([A-Z_]+)\s*,/gs;

  for (const match of source.matchAll(pattern)) {
    const [, example, description, rawFormat] = match;
    const [mnemonic, ...rest] = example.split(/\s+/, 2);
    const operandLayout = rest.length ? rest[0] : "";
    const format = rawFormat
      .replace("_FORMAT", "")
      .replace("I_BRANCH", "I-branch")
      .replace("R", "R")
      .replace("I", "I")
      .replace("J", "J");

    entries.push({
      name: mnemonic,
      format,
      description: description.trim(),
      operandLayout,
    });
  }

  return entries;
}

function parsePseudoOps(source: string): PseudoInstructionEntry[] {
  const entries: PseudoInstructionEntry[] = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("//")) continue;

    const parts = line.split("\t");
    if (parts.length === 0) continue;

    const example = parts[0].trim();
    const templates = parts
      .slice(1)
      .filter((segment) => segment && !segment.trimStart().startsWith("#"))
      .map((segment) => segment.trim());

    const descriptionPart = parts
      .slice(1)
      .find((segment) => segment.trimStart().startsWith("#"));

    const description = descriptionPart ? descriptionPart.trim().replace(/^#\s*/, "") : "";

    const [name, ...rest] = example.split(/\s+/, 2);
    const operandLayout = rest.length ? rest[0] : "";

    entries.push({
      name,
      format: "pseudo",
      description,
      operandLayout,
      templates,
    });
  }

  return entries;
}

function parseDirectives(source: string): DirectiveEntry[] {
  const entries: DirectiveEntry[] = [];
  const pattern = /new\s+Directives\(\s*"([^"]+)",\s*"([^"]*)"\s*\)/g;

  for (const match of source.matchAll(pattern)) {
    const [, name, description] = match;
    entries.push({ name, description });
  }

  return entries;
}

function parseSyscalls(source: string): SyscallEntry[] {
  const entries: SyscallEntry[] = [];
  const tableMatch = source.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return entries;

  const rows = tableMatch[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const cells = row.match(/<td[^>]*>[\s\S]*?<\/td>/gi);
    if (!cells || cells.length < 4) continue;

    const [nameCell, codeCell, argCell, resultCell] = cells.map((cell) => stripHtml(cell));
    if (!codeCell || codeCell.toLowerCase().includes("code in $v0")) continue;

    entries.push({
      name: nameCell,
      code: codeCell,
      arguments: argCell,
      result: resultCell,
    });
  }

  return entries;
}

function parseMacros(source: string): MacroEntry[] {
  const entries: MacroEntry[] = [];
  const pattern = /symbol:\s*"([^"]+)",\s*description:\s*"([^"]+)"/g;

  for (const match of source.matchAll(pattern)) {
    const [, symbol, meaning] = match;
    entries.push({ symbol, meaning });
  }

  return entries;
}

function main(): void {
  const instructionSource = readFile("../legacy/mars/mips/instructions/InstructionSet.java");
  const pseudoSource = readFile("../legacy/PseudoOps.txt");
  const directivesSource = readFile("../legacy/mars/assembler/Directives.java");
  const syscallsSource = readFile("../legacy/help/SyscallHelp.html");
  const macroSource = readFile("../mars-next/src/core/assembler/PseudoOps.ts");

  const data: HelpData = {
    instructions: parseInstructions(instructionSource),
    pseudoinstructions: parsePseudoOps(pseudoSource),
    directives: parseDirectives(directivesSource),
    syscalls: parseSyscalls(syscallsSource),
    macros: parseMacros(macroSource),
  };

  const outputPath = path.resolve(__dirname, "../src/features/help/resources/helpData.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

  console.log(`Wrote help data to ${outputPath}`);
}

main();
