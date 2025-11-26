import { DEFAULT_TEXT_BASE } from "../state/MachineState";
import {
  IncludeProcessor,
  type IncludeProcessOptions,
  type IncludeResolver,
  type ProcessedSource,
} from "./IncludeProcessor";
import { Lexer } from "./Lexer";
import { MacroExpander } from "./MacroExpander";
import { ExpressionNode, InstructionNode, Operand, Parser, ProgramAst, Segment } from "./Parser";
import { loadPseudoOpTable, type PseudoOpTable } from "./PseudoOps";

export type RelocationType = "MIPS_32" | "MIPS_26" | "MIPS_PC16" | "MIPS_HI16" | "MIPS_LO16";

export interface RelocationRecord {
  segment: Segment;
  offset: number;
  symbol: string;
  type: RelocationType;
  addend?: number;
}

export interface SymbolTableEntry {
  name: string;
  address: number;
  segment?: Segment | null;
}

export interface BinaryImage {
  textBase: number;
  dataBase: number;
  text: number[]; // machine words
  data: number[]; // bytes
  dataWords: number[]; // data values aligned to 4 bytes where applicable
  ktextBase: number;
  kdataBase: number;
  ktext: number[]; // kernel machine words
  kdata: number[]; // kernel data bytes
  kdataWords: number[]; // kernel data values aligned to 4 bytes
  symbols: Record<string, number>;
  relocations: RelocationRecord[];
  symbolTable: SymbolTableEntry[];
  globalSymbols?: string[];
  externSymbols?: string[];
  undefinedSymbols?: string[];
  littleEndian?: boolean;
  sourceMap?: SourceMapEntry[];
}

const DEFAULT_DATA_BASE = 0x10010000;
const DEFAULT_KTEXT_BASE = 0x80000000;
const DEFAULT_KDATA_BASE = 0x90000000;

type SymbolTable = Map<string, number>;

interface SymbolTableBuildResult {
  symbols: SymbolTable;
  externSymbols: Set<string>;
  globalSymbols: Set<string>;
  undefinedSymbols: Set<string>;
}

interface RelocationContext {
  segment: Segment;
  offset: number;
  relocations: RelocationRecord[];
}

interface NormalizedInstruction {
  name: string;
  operands: Operand[];
  line: number;
}

export interface SourceLocation {
  file: string;
  line: number;
}

export interface SourceMapEntry {
  address: number;
  line: number;
  file: string;
  segment: Segment;
  segmentIndex: number;
}

export interface AssemblerOptions extends IncludeProcessOptions {
  includeResolver?: IncludeResolver | null;
}

export class Assembler {
  private readonly lexer = new Lexer();
  private readonly parser = new Parser();
  private readonly macroExpander = new MacroExpander(this.lexer);
  private readonly pseudoOpTable: PseudoOpTable;

  private readonly includeProcessor: IncludeProcessor;
  private readonly defaultIncludeOptions: IncludeProcessOptions;

  constructor(options: AssemblerOptions = {}) {
    const includeResolver = options.includeResolver ?? options.resolver ?? null;
    this.includeProcessor = new IncludeProcessor(this.lexer, includeResolver);
    this.defaultIncludeOptions = {
      baseDir: options.baseDir,
      sourceName: options.sourceName,
      ...(includeResolver !== null && includeResolver !== undefined ? { resolver: includeResolver } : {}),
    };
    this.pseudoOpTable = loadPseudoOpTable();
  }

  getPseudoOpTable(): PseudoOpTable {
    return this.pseudoOpTable;
  }

  assemble(source: string, options: AssemblerOptions = {}): BinaryImage {
    const includeOptions: IncludeProcessOptions = {
      baseDir: options.baseDir ?? this.defaultIncludeOptions.baseDir,
      sourceName: options.sourceName ?? this.defaultIncludeOptions.sourceName,
    };

    const resolver = options.includeResolver ?? options.resolver ?? this.defaultIncludeOptions.resolver;
    if (resolver !== undefined) {
      includeOptions.resolver = resolver;
    }

    const withIncludes = this.includeProcessor.process(source, includeOptions);
    const expanded = this.macroExpander.expand(withIncludes.source);
    const lexed = this.lexer.tokenize(expanded);
    const ast = this.parser.parse(lexed);
    const { symbols, externSymbols, globalSymbols, undefinedSymbols } = this.buildSymbolTable(ast);
    const resolveLocation = this.createLocationResolver(withIncludes, expanded, includeOptions.sourceName);
    const { text, data, dataWords, ktext, kdata, kdataWords, relocations, sourceMap } = this.emit(
      ast,
      symbols,
      resolveLocation,
    );

    return {
      textBase: DEFAULT_TEXT_BASE,
      dataBase: DEFAULT_DATA_BASE,
      ktextBase: DEFAULT_KTEXT_BASE,
      kdataBase: DEFAULT_KDATA_BASE,
      text,
      data,
      ktext,
      kdata,
      dataWords,
      kdataWords,
      symbols: Object.fromEntries(symbols),
      relocations,
      symbolTable: this.buildSymbolTableEntries(symbols, {
        textBase: DEFAULT_TEXT_BASE,
        textLength: text.length,
        dataBase: DEFAULT_DATA_BASE,
        dataLength: data.length,
        ktextBase: DEFAULT_KTEXT_BASE,
        ktextLength: ktext.length,
        kdataBase: DEFAULT_KDATA_BASE,
        kdataLength: kdata.length,
      }),
      globalSymbols: Array.from(globalSymbols).filter((name) => symbols.has(name)),
      externSymbols: Array.from(externSymbols),
      undefinedSymbols: Array.from(undefinedSymbols),
      sourceMap,
    };
  }

  private buildSymbolTableEntries(
    symbols: SymbolTable,
    layout: {
      textBase: number;
      textLength: number;
      dataBase: number;
      dataLength: number;
      ktextBase: number;
      ktextLength: number;
      kdataBase: number;
      kdataLength: number;
    },
  ): SymbolTableEntry[] {
    const textEnd = layout.textBase + layout.textLength * 4;
    const dataEnd = layout.dataBase + layout.dataLength;
    const ktextEnd = layout.ktextBase + layout.ktextLength * 4;
    const kdataEnd = layout.kdataBase + layout.kdataLength;

    const resolveSegment = (address: number): Segment | null => {
      if (address >= layout.textBase && address < textEnd) return "text";
      if (address >= layout.dataBase && address < dataEnd) return "data";
      if (address >= layout.ktextBase && address < ktextEnd) return "ktext";
      if (address >= layout.kdataBase && address < kdataEnd) return "kdata";
      return null;
    };

    return Array.from(symbols.entries()).map(([name, address]) => ({
      name,
      address,
      segment: resolveSegment(address),
    }));
  }

  private createLocationResolver(
    processed: ProcessedSource,
    expanded: string,
    sourceName?: string,
  ): (line: number) => SourceLocation {
    const fallbackFile = sourceName ?? "<input>";
    const expandedLines = expanded.split(/\r?\n/);
    const locations = expandedLines.map((_, index) => processed.map[index] ?? { file: fallbackFile, line: index + 1 });
    return (line: number) => locations[line - 1] ?? { file: fallbackFile, line };
  }

  private buildSymbolTable(ast: ProgramAst): SymbolTableBuildResult {
    let segment: Segment = "text";
    let textOffset = 0;
    let dataOffset = 0;
    let ktextOffset = 0;
    let kdataOffset = 0;
    const symbols: SymbolTable = new Map();
    const definedSymbols = new Set<string>();
    const externSymbols = new Set<string>();
    const globalSymbols = new Set<string>();
    const undefinedSymbols = new Set<string>();
    const eqvDefinitions = new Map<string, { value: Operand; line: number }>();
    const resolvedEqvSymbols = new Set<string>();
    const resolvingEqv = new Set<string>();

    const resolveEqv = (name: string, line: number): number => {
      const existing = symbols.get(name);
      if (existing !== undefined) return existing;

      const eqv = eqvDefinitions.get(name);
      if (eqv === undefined) {
        throw new Error(`Undefined label '${name}' (line ${line})`);
      }

      if (resolvingEqv.has(name)) {
        throw new Error(`Circular .eqv definition involving '${name}' (line ${eqv.line})`);
      }

      resolvingEqv.add(name);

      // Resolve and cache the .eqv value to make it visible during this pass.
      const resolved = this.resolveValue(eqv.value, symbols, eqv.line, resolveEqv);
      symbols.set(name, this.toInt32(resolved));
      undefinedSymbols.delete(name);
      resolvedEqvSymbols.add(name);
      definedSymbols.add(name);
      resolvingEqv.delete(name);
      return resolved;
    };

    const resolveValue = (operand: Operand, line: number): number =>
      this.resolveValue(operand, symbols, line, resolveEqv, externSymbols, undefinedSymbols);

    for (let i = 0; i < ast.nodes.length; i++) {
      const node = ast.nodes[i];

      if (
        (node.kind === "directive" || node.kind === "label") &&
        (segment === "data" || segment === "kdata")
      ) {
        const alignment = this.pendingDataAlignment(ast.nodes, i, node.kind === "directive");
        if (alignment !== null) {
          const currentOffset = segment === "data" ? dataOffset : kdataOffset;
          const padding = this.calculatePadding(currentOffset, alignment);
          if (segment === "data") dataOffset += padding;
          else kdataOffset += padding;
        }
      }

      switch (node.kind) {
        case "directive": {
          if (node.name === ".text") segment = "text";
          if (node.name === ".ktext") segment = "ktext";
          if (node.name === ".data") segment = "data";
          if (node.name === ".kdata") segment = "kdata";

          if (node.name === ".globl" || node.name === ".extern") {
            node.args.forEach((arg) => {
              if (arg.kind === "label") {
                if (node.name === ".globl") {
                  globalSymbols.add(arg.name);
                } else {
                  externSymbols.add(arg.name);
                  undefinedSymbols.add(arg.name);
                }
              }
            });
          }

          if (node.name === ".eqv") {
            const name = (node.args[0] as Operand & { kind: "label" }).name;
            if (definedSymbols.has(name) || eqvDefinitions.has(name)) {
              throw new Error(`Duplicate symbol '${name}' at line ${node.line}`);
            }
            eqvDefinitions.set(name, { value: node.args[1], line: node.line });
          }

          if (segment === "data" || segment === "kdata") {
            switch (node.name) {
              case ".byte":
                if (segment === "data") dataOffset += node.args.length;
                else kdataOffset += node.args.length;
                break;
              case ".half":
                if (segment === "data") dataOffset += 2 * node.args.length;
                else kdataOffset += 2 * node.args.length;
                break;
              case ".word":
              case ".float":
                if (segment === "data") dataOffset += 4 * node.args.length;
                else kdataOffset += 4 * node.args.length;
                break;
              case ".double":
                if (segment === "data") dataOffset += 8 * node.args.length;
                else kdataOffset += 8 * node.args.length;
                break;
              case ".ascii":
                if (segment === "data")
                  dataOffset += this.encodeString((node.args[0] as Operand & { kind: "string" }).value).length;
                else kdataOffset += this.encodeString((node.args[0] as Operand & { kind: "string" }).value).length;
                break;
              case ".asciiz":
                if (segment === "data")
                  dataOffset += this.encodeString((node.args[0] as Operand & { kind: "string" }).value).length + 1;
                else kdataOffset += this.encodeString((node.args[0] as Operand & { kind: "string" }).value).length + 1;
            break;
          case ".space":
            const spaceSize = resolveValue(node.args[0], node.line);
            if (!Number.isInteger(spaceSize) || spaceSize < 0) {
              throw new Error(`.space size must be a non-negative integer (line ${node.line})`);
            }
            if (segment === "data") dataOffset += spaceSize;
            else kdataOffset += spaceSize;
            break;
          case ".align": {
            const power = resolveValue(node.args[0], node.line) as number;
            if (!Number.isInteger(power) || power < 0) {
              throw new Error(`.align expects a non-negative integer (line ${node.line})`);
            }
            const alignment = Math.pow(2, power);
            if (!Number.isFinite(alignment) || alignment <= 0) {
              throw new Error(`Invalid alignment at line ${node.line}`);
            }
                const currentOffset = segment === "data" ? dataOffset : kdataOffset;
                const padding = this.calculatePadding(currentOffset, alignment);
                if (segment === "data") dataOffset += padding;
                else kdataOffset += padding;
                break;
              }
            }
          }
          break;
        }
        case "label": {
          const base =
            segment === "text"
              ? DEFAULT_TEXT_BASE
              : segment === "ktext"
                ? DEFAULT_KTEXT_BASE
                : segment === "kdata"
                  ? DEFAULT_KDATA_BASE
                  : DEFAULT_DATA_BASE;
          const offset =
            segment === "text"
              ? textOffset
              : segment === "ktext"
                ? ktextOffset
                : segment === "kdata"
                  ? kdataOffset
                  : dataOffset;
          const address = this.toUint32(base + offset);
          if (definedSymbols.has(node.name)) {
            throw new Error(`Duplicate label '${node.name}' at line ${node.line}`);
          }
          symbols.set(node.name, address | 0);
          definedSymbols.add(node.name);
          undefinedSymbols.delete(node.name);
          break;
        }
        case "instruction": {
          const expansion = this.expandInstruction(node);
          if (segment === "text") {
            textOffset += expansion.length * 4;
          } else if (segment === "ktext") {
            ktextOffset += expansion.length * 4;
          }
          break;
        }
      }
    }

    for (const [name, { value, line }] of eqvDefinitions) {
      if (symbols.has(name)) {
        if (resolvedEqvSymbols.has(name)) continue;
        throw new Error(`Duplicate symbol '${name}' at line ${line}`);
      }
      if (definedSymbols.has(name)) {
        throw new Error(`Duplicate symbol '${name}' at line ${line}`);
      }
      const resolved = this.resolveValue(value, symbols, line, resolveEqv);
      symbols.set(name, this.toInt32(resolved));
      undefinedSymbols.delete(name);
      resolvedEqvSymbols.add(name);
      definedSymbols.add(name);
    }

    for (const name of globalSymbols) {
      if (!definedSymbols.has(name) && !externSymbols.has(name)) {
        undefinedSymbols.add(name);
      }
    }

    return { symbols, externSymbols, globalSymbols, undefinedSymbols };
  }

  private emit(
    ast: ProgramAst,
    symbols: SymbolTable,
    resolveLocation: (line: number) => SourceLocation,
  ): {
    text: number[];
    data: number[];
    dataWords: number[];
    ktext: number[];
    kdata: number[];
    kdataWords: number[];
    relocations: RelocationRecord[];
    sourceMap: SourceMapEntry[];
  } {
    let segment: Segment = "text";
    let pc = DEFAULT_TEXT_BASE;
    const text: number[] = [];
    const ktext: number[] = [];
    const data: number[] = [];
    const kdata: number[] = [];
    const dataWords: number[] = [];
    const kdataWords: number[] = [];
    const relocations: RelocationRecord[] = [];
    let dataOffset = 0;
    let kdataOffset = 0;
    let textOffset = 0;
    let ktextOffset = 0;
    const sourceMap: SourceMapEntry[] = [];

    for (let i = 0; i < ast.nodes.length; i++) {
      const node = ast.nodes[i];

      if (
        (node.kind === "directive" || node.kind === "label") &&
        (segment === "data" || segment === "kdata")
      ) {
        const alignment = this.pendingDataAlignment(ast.nodes, i, node.kind === "directive");
        if (alignment !== null) {
          const target = segment === "data" ? data : kdata;
          const currentOffset = segment === "data" ? dataOffset : kdataOffset;
          const padding = this.calculatePadding(currentOffset, alignment);
          for (let pad = 0; pad < padding; pad++) target.push(0);
          if (segment === "data") dataOffset += padding;
          else kdataOffset += padding;
        }
      }

      if (node.kind === "directive") {
        switch (node.name) {
          case ".text":
            segment = "text";
            pc = this.toUint32(DEFAULT_TEXT_BASE + textOffset);
            continue;
          case ".ktext":
            segment = "ktext";
            pc = this.toUint32(DEFAULT_KTEXT_BASE + ktextOffset);
            continue;
          case ".data":
            segment = "data";
            continue;
          case ".kdata":
            segment = "kdata";
            continue;
          case ".word": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.word directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const targetWords = segment === "data" ? dataWords : kdataWords;
            const targetBytes = segment === "data" ? data : kdata;
            for (const arg of node.args) {
              if (arg.kind !== "immediate" && arg.kind !== "label" && arg.kind !== "expression") {
                throw new Error(`.word expects numeric arguments (line ${node.line})`);
              }
              const value = this.resolveValue(arg, symbols, node.line, undefined, undefined, undefined);
              if (arg.kind === "label") {
                this.recordRelocation(
                  { segment, offset: segment === "data" ? dataOffset : kdataOffset, relocations },
                  arg.name,
                  "MIPS_32",
                  0,
                );
              }
              targetWords.push(this.toInt32(value));
              this.pushWordBytes(value, targetBytes);
              if (segment === "data") dataOffset += 4;
              else kdataOffset += 4;
            }
            continue;
          }
          case ".byte": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.byte directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const target = segment === "data" ? data : kdata;
            for (const arg of node.args) {
              if (arg.kind !== "immediate" && arg.kind !== "label" && arg.kind !== "expression") {
                throw new Error(`.byte expects numeric arguments (line ${node.line})`);
              }
              const value = this.resolveValue(arg, symbols, node.line);
              target.push(value & 0xff);
              if (segment === "data") dataOffset += 1;
              else kdataOffset += 1;
            }
            continue;
          }
          case ".half": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.half directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const target = segment === "data" ? data : kdata;
            for (const arg of node.args) {
              if (arg.kind !== "immediate" && arg.kind !== "label" && arg.kind !== "expression") {
                throw new Error(`.half expects numeric arguments (line ${node.line})`);
              }
              const value = this.resolveValue(arg, symbols, node.line);
              this.pushHalfBytes(value, target);
              if (segment === "data") dataOffset += 2;
              else kdataOffset += 2;
            }
            continue;
          }
          case ".float": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.float directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const target = segment === "data" ? data : kdata;
            for (const arg of node.args) {
              if (arg.kind !== "immediate" && arg.kind !== "expression") {
                throw new Error(`.float expects numeric arguments (line ${node.line})`);
              }
              const value = this.resolveValue(arg, symbols, node.line);
              this.pushFloatBytes(value, target);
              if (segment === "data") dataOffset += 4;
              else kdataOffset += 4;
            }
            continue;
          }
          case ".double": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.double directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const target = segment === "data" ? data : kdata;
            for (const arg of node.args) {
              if (arg.kind !== "immediate" && arg.kind !== "expression") {
                throw new Error(`.double expects numeric arguments (line ${node.line})`);
              }
              const value = this.resolveValue(arg, symbols, node.line);
              this.pushDoubleBytes(value, target);
              if (segment === "data") dataOffset += 8;
              else kdataOffset += 8;
            }
            continue;
          }
          case ".asciiz": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.asciiz directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const literal = (node.args[0] as Operand & { kind: "string" }).value;
            const bytes = [...this.encodeString(literal), 0];
            const target = segment === "data" ? data : kdata;
            target.push(...bytes.map((b) => b & 0xff));
            if (segment === "data") dataOffset += bytes.length;
            else kdataOffset += bytes.length;
            continue;
          }
          case ".ascii": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.ascii directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const literal = (node.args[0] as Operand & { kind: "string" }).value;
            const bytes = this.encodeString(literal);
            const target = segment === "data" ? data : kdata;
            target.push(...bytes.map((b) => b & 0xff));
            if (segment === "data") dataOffset += bytes.length;
            else kdataOffset += bytes.length;
            continue;
          }
          case ".space": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.space directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const count = this.resolveValue(node.args[0], symbols, node.line);
            if (!Number.isInteger(count) || count < 0) {
              throw new Error(`.space size must be a non-negative integer (line ${node.line})`);
            }
            const target = segment === "data" ? data : kdata;
            for (let i = 0; i < count; i++) target.push(0);
            if (segment === "data") dataOffset += count;
            else kdataOffset += count;
            continue;
          }
          case ".align": {
            if (segment !== "data" && segment !== "kdata") {
              throw new Error(`.align directive encountered outside .data/.kdata at line ${node.line}`);
            }
            const power = this.resolveValue(node.args[0], symbols, node.line);
            if (!Number.isInteger(power) || power < 0) {
              throw new Error(`.align expects a non-negative integer (line ${node.line})`);
            }
            const alignment = Math.pow(2, power);
            if (!Number.isFinite(alignment) || alignment <= 0) {
              throw new Error(`Invalid alignment at line ${node.line}`);
            }
            const currentOffset = segment === "data" ? dataOffset : kdataOffset;
            const padding = this.calculatePadding(currentOffset, alignment);
            const target = segment === "data" ? data : kdata;
            for (let i = 0; i < padding; i++) target.push(0);
            if (segment === "data") dataOffset += padding;
            else kdataOffset += padding;
            continue;
          }
          case ".globl":
          case ".extern":
          case ".eqv":
          case ".set":
            continue;
          default:
            throw new Error(`Unsupported directive ${node.name} at line ${node.line}`);
        }
      }

      if (node.kind === "label") {
        continue;
      }

      if (node.kind === "instruction") {
        if (segment !== "text" && segment !== "ktext") {
          throw new Error(`Instruction in non-text segment at line ${node.line}`);
        }

        const normalized = this.expandInstruction(node);
        const targetText = segment === "ktext" ? ktext : text;
        for (const inst of normalized) {
          const relocationContext: RelocationContext = {
            segment,
            offset: segment === "text" ? textOffset : ktextOffset,
            relocations,
          };
          const encoded = this.encodeInstruction(inst, pc, symbols, relocationContext);
          const segmentIndex = targetText.length;
          targetText.push(encoded);
          const location = resolveLocation(inst.line);
          sourceMap.push({
            address: pc,
            segment,
            segmentIndex,
            line: location.line,
            file: location.file,
          });
          if (segment === "text") {
            textOffset += 4;
          } else {
            ktextOffset += 4;
          }
          pc = this.toUint32(pc + 4);
        }
      }
    }

    return {
      text: text.map((w) => this.toInt32(w)),
      data,
      dataWords: dataWords.map((w) => this.toInt32(w)),
      ktext: ktext.map((w) => this.toInt32(w)),
      kdata,
      kdataWords: kdataWords.map((w) => this.toInt32(w)),
      relocations,
      sourceMap,
    };
  }

  private directiveAlignment(name: string | null | undefined): number | null {
    switch (name) {
      case ".half":
        return 2;
      case ".word":
      case ".float":
        return 4;
      case ".double":
        return 8;
      default:
        return null;
    }
  }

  private pendingDataAlignment(nodes: ProgramAst["nodes"], index: number, includeCurrent: boolean): number | null {
    const start = includeCurrent ? index : index + 1;

    for (let i = start; i < nodes.length; i++) {
      const candidate = nodes[i];

      if (candidate.kind === "label") continue;

      if (candidate.kind === "directive") {
        const alignment = this.directiveAlignment(candidate.name);
        if (alignment !== null) return alignment;
        if (this.isNonEmittingDirective(candidate.name)) continue;
        return null;
      }

      return null;
    }

    return null;
  }

  private isNonEmittingDirective(name: string): boolean {
    return name === ".globl" || name === ".extern" || name === ".eqv" || name === ".set";
  }

  private recordRelocation(
    context: RelocationContext,
    symbol: string,
    type: RelocationType,
    addend?: number,
  ): void {
    const relocation: RelocationRecord = { segment: context.segment, offset: context.offset, symbol, type };
    if (addend !== undefined) relocation.addend = addend;
    context.relocations.push(relocation);
  }

  private calculatePadding(offset: number, alignment: number): number {
    return (alignment - (offset % alignment)) % alignment;
  }

  private resolveValue(
    operand: Operand,
    symbols: SymbolTable,
    line: number,
    eqvResolver?: (name: string, line: number) => number,
    externSymbols?: Set<string>,
    undefinedSymbols?: Set<string>,
  ): number {
    if (operand.kind === "immediate") return operand.value;
    if (operand.kind === "expression")
      return this.evaluateExpression(operand.expression, symbols, line, eqvResolver, externSymbols, undefinedSymbols);
    if (operand.kind === "label") {
      const value = symbols.get(operand.name);
      if (value !== undefined) return value;
      if (externSymbols?.has(operand.name)) {
        undefinedSymbols?.add(operand.name);
        return 0;
      }
      if (eqvResolver) return eqvResolver(operand.name, line);
      throw new Error(`Undefined label '${operand.name}' (line ${line})`);
    }
    throw new Error(`Unsupported operand for immediate value at line ${line}`);
  }

  private evaluateExpression(
    node: ExpressionNode,
    symbols: SymbolTable,
    line: number,
    eqvResolver?: (name: string, line: number) => number,
    externSymbols?: Set<string>,
    undefinedSymbols?: Set<string>,
  ): number {
    switch (node.type) {
      case "number":
        return node.value;
      case "symbol":
        return this.resolveValue(
          { kind: "label", name: node.name },
          symbols,
          line,
          eqvResolver,
          externSymbols,
          undefinedSymbols,
        );
      case "unary": {
        const value = this.evaluateExpression(node.argument, symbols, line, eqvResolver, externSymbols, undefinedSymbols);
        switch (node.op) {
          case "plus":
            return value;
          case "minus":
            return -value;
          case "bitnot":
            return ~this.toInt32(value);
        }
        break;
      }
      case "binary": {
        const left = this.evaluateExpression(node.left, symbols, line, eqvResolver, externSymbols, undefinedSymbols);
        const right = this.evaluateExpression(node.right, symbols, line, eqvResolver, externSymbols, undefinedSymbols);
        switch (node.op) {
          case "add":
            return left + right;
          case "sub":
            return left - right;
          case "mul":
            return left * right;
          case "div":
            if (right === 0) {
              throw new Error(`Division by zero in expression (line ${line})`);
            }
            return left / right;
          case "mod":
            if (right === 0) {
              throw new Error(`Division by zero in expression (line ${line})`);
            }
            return left % right;
          case "lshift":
            return this.toInt32(left) << (this.toInt32(right) & 0x1f);
          case "rshift":
            return this.toInt32(left) >> (this.toInt32(right) & 0x1f);
          case "and":
            return this.toInt32(left) & this.toInt32(right);
          case "xor":
            return this.toInt32(left) ^ this.toInt32(right);
          case "or":
            return this.toInt32(left) | this.toInt32(right);
        }
        break;
      }
    }
    throw new Error(`Unsupported expression at line ${line}`);
  }

  private expandLoadImmediate(
    target: Operand | undefined,
    immediate: Operand | undefined,
    line: number,
    instructionName: string,
  ): NormalizedInstruction[] {
    if (!target || target.kind !== "register") {
      throw new Error(`${instructionName} expects a destination register (line ${line})`);
    }

    if (!immediate || (immediate.kind !== "immediate" && immediate.kind !== "label")) {
      throw new Error(`${instructionName} expects an immediate value (line ${line})`);
    }

    const fits16 = immediate.kind === "immediate" && immediate.value >= -32768 && immediate.value <= 32767;
    if (fits16) {
      return [
        {
          name: "addi",
          operands: [target, { kind: "register", name: "$zero", register: 0 }, immediate],
          line,
        },
      ];
    }

    if (immediate.kind !== "immediate") {
      // Conservatively expand label immediates into two instructions to allow full address resolution.
      return [
        { name: "lui", operands: [target, immediate], line },
        { name: "ori", operands: [target, target, immediate], line },
      ];
    }

    const value = immediate.value >>> 0;
    const upper = (value >>> 16) & 0xffff;
    const lower = value & 0xffff;
    return [
      { name: "lui", operands: [target, { kind: "immediate", value: upper }], line },
      { name: "ori", operands: [target, target, { kind: "immediate", value: lower }], line },
    ];
  }

  private expandInstruction(instruction: InstructionNode): NormalizedInstruction[] {
    const { name, operands, line } = instruction;
    switch (name) {
      case "li": {
        const [dest, immediate] = operands;
        return this.expandLoadImmediate(dest, immediate, line, "li");
      }
      case "move": {
        const [dest, source] = operands;
        if (!dest || dest.kind !== "register" || !source || source.kind !== "register") {
          throw new Error(`move expects two register operands (line ${line})`);
        }
        return [{ name: "addu", operands: [dest, source, { kind: "register", name: "$zero", register: 0 }], line }];
      }
      case "muli": {
        const [dest, source, immediate] = operands;
        if (!dest || dest.kind !== "register" || !source || source.kind !== "register") {
          throw new Error(`muli expects two registers followed by an immediate (line ${line})`);
        }

        const atRegister: Operand = { kind: "register", name: "$at", register: 1 };
        const loadImmediate = this.expandLoadImmediate(atRegister, immediate, line, "muli");
        return [...loadImmediate, { name: "mul", operands: [dest, source, atRegister], line }];
      }
      case "nop":
        return [{ name: "sll", operands: [{ kind: "register", name: "$zero", register: 0 }, { kind: "register", name: "$zero", register: 0 }, { kind: "immediate", value: 0 }], line }];
      default:
        return [{ name, operands, line }];
    }
  }

  private encodeInstruction(
    instruction: NormalizedInstruction,
    pc: number,
    symbols: SymbolTable,
    context: RelocationContext,
  ): number {
    const { name, operands, line } = instruction;
    switch (name) {
      case "addi":
      case "addiu":
        this.expectOperands(name, operands, ["register", "register", "immediate|label"], line);
        return this.encodeI(
          name === "addi" ? 0x08 : 0x09,
          operands[1],
          operands[0],
          operands[2],
          line,
          symbols,
          context,
        );
      case "ori":
        this.expectOperands(name, operands, ["register", "register", "immediate|label"], line);
        return this.encodeOri(operands[1], operands[0], operands[2], line, symbols, context);
      case "lui":
        this.expectOperands(name, operands, ["register", "immediate|label"], line);
        return this.encodeLui(operands[0], operands[1], line, symbols, context);
      case "add":
        this.expectOperands(name, operands, ["register", "register", "register"], line);
        return this.encodeR(0x20, operands[1], operands[2], operands[0], line);
      case "addu":
        this.expectOperands(name, operands, ["register", "register", "register"], line);
        return this.encodeR(0x21, operands[1], operands[2], operands[0], line);
      case "mul":
        this.expectOperands(name, operands, ["register", "register", "register"], line);
        return this.encodeMul(operands[1], operands[2], operands[0], line);
      case "sub":
        this.expectOperands(name, operands, ["register", "register", "register"], line);
        return this.encodeR(0x22, operands[1], operands[2], operands[0], line);
      case "and":
        this.expectOperands(name, operands, ["register", "register", "register"], line);
        return this.encodeR(0x24, operands[1], operands[2], operands[0], line);
      case "or":
        this.expectOperands(name, operands, ["register", "register", "register"], line);
        return this.encodeR(0x25, operands[1], operands[2], operands[0], line);
      case "slt":
        this.expectOperands(name, operands, ["register", "register", "register"], line);
        return this.encodeR(0x2a, operands[1], operands[2], operands[0], line);
      case "sll":
        this.expectOperands(name, operands, ["register", "register", "immediate|label"], line);
        return this.encodeR(0x00, { kind: "register", name: "$zero", register: 0 }, operands[1], operands[0], line, operands[2]);
      case "slti":
        this.expectOperands(name, operands, ["register", "register", "immediate|label"], line);
        return this.encodeI(0x0a, operands[1], operands[0], operands[2], line, symbols, context);
      case "lb":
      case "lbu":
      case "lh":
      case "lhu":
      case "lw":
      case "sb":
      case "sh":
      case "sw": {
        this.expectOperands(name, operands, ["register", "memory"], line);
        const memory = operands[1] as Operand & { kind: "memory" };
        const opcodeMap: Record<string, number> = {
          lb: 0x20,
          lbu: 0x24,
          lh: 0x21,
          lhu: 0x25,
          lw: 0x23,
          sb: 0x28,
          sh: 0x29,
          sw: 0x2b,
        };
        return this.encodeMemoryInstruction(opcodeMap[name], operands[0], memory, line, symbols, context);
      }
      case "beq":
        this.expectOperands(name, operands, ["register", "register", "label|immediate"], line);
        return this.encodeBranch(0x04, operands[0], operands[1], operands[2], pc, symbols, context, line);
      case "bne":
        this.expectOperands(name, operands, ["register", "register", "label|immediate"], line);
        return this.encodeBranch(0x05, operands[0], operands[1], operands[2], pc, symbols, context, line);
      case "j":
        this.expectOperands(name, operands, ["label|immediate"], line);
        return this.encodeJump(0x02, operands[0], symbols, context, line);
      case "jal":
        this.expectOperands(name, operands, ["label|immediate"], line);
        return this.encodeJump(0x03, operands[0], symbols, context, line);
      case "jr":
        this.expectOperands(name, operands, ["register"], line);
        return this.encodeR(0x08, operands[0], { kind: "register", name: "$zero", register: 0 }, { kind: "register", name: "$zero", register: 0 }, line);
      case "syscall":
        return 0x0000000c;
      default:
        throw new Error(`Unknown instruction '${name}' at line ${line}`);
    }
  }

  private encodeR(funct: number, rs: Operand, rt: Operand, rd: Operand, line: number, shamtOperand?: Operand): number {
    const rsNum = this.requireRegister(rs, line);
    const rtNum = this.requireRegister(rt, line);
    const rdNum = this.requireRegister(rd, line);
    const shamt = shamtOperand ? this.requireImmediate(shamtOperand, line, 0, 31) : 0;
    return (rsNum << 21) | (rtNum << 16) | (rdNum << 11) | (shamt << 6) | (funct & 0x3f);
  }

  private encodeMul(rs: Operand, rt: Operand, rd: Operand, line: number): number {
    const rsNum = this.requireRegister(rs, line);
    const rtNum = this.requireRegister(rt, line);
    const rdNum = this.requireRegister(rd, line);
    return (0x1c << 26) | (rsNum << 21) | (rtNum << 16) | (rdNum << 11) | 0x02;
  }

  private encodeMemoryInstruction(
    opcode: number,
    rt: Operand,
    memory: Operand & { kind: "memory" },
    line: number,
    symbols: SymbolTable,
    context: RelocationContext,
  ): number {
    const baseRegister: Operand = { kind: "register", name: `$${memory.base}`, register: memory.base };
    return this.encodeI(opcode, baseRegister, rt, memory.offset, line, symbols, context);
  }

  private encodeI(
    opcode: number,
    rs: Operand,
    rt: Operand,
    immediate: Operand,
    line: number,
    symbols: SymbolTable,
    context: RelocationContext,
    signed = true,
  ): number {
    const rsNum = this.requireRegister(rs, line);
    const rtNum = this.requireRegister(rt, line);
    const immValue =
      immediate.kind === "label"
        ? this.resolveImmediateWithRelocation(immediate, symbols, line, context, "MIPS_LO16", signed)
        : this.resolveImmediate(immediate, symbols, line, signed);
    return (opcode << 26) | (rsNum << 21) | (rtNum << 16) | (immValue & 0xffff);
  }

  private encodeLui(
    rt: Operand,
    immediate: Operand,
    line: number,
    symbols: SymbolTable,
    context: RelocationContext,
  ): number {
    const rtNum = this.requireRegister(rt, line);
    const imm =
      immediate.kind === "label"
        ? this.resolveImmediateWithRelocation(immediate, symbols, line, context, "MIPS_HI16", false)
        : this.resolveImmediate(immediate, symbols, line, false);
    return (0x0f << 26) | (rtNum << 16) | (imm & 0xffff);
  }

  private encodeOri(
    rs: Operand,
    rt: Operand,
    immediate: Operand,
    line: number,
    symbols: SymbolTable,
    context: RelocationContext,
  ): number {
    const rsNum = this.requireRegister(rs, line);
    const rtNum = this.requireRegister(rt, line);
    const imm =
      immediate.kind === "label"
        ? this.resolveImmediateWithRelocation(immediate, symbols, line, context, "MIPS_LO16", false)
        : this.resolveImmediate(immediate, symbols, line, false);
    return (0x0d << 26) | (rsNum << 21) | (rtNum << 16) | (imm & 0xffff);
  }

  private encodeBranch(
    opcode: number,
    rs: Operand,
    rt: Operand,
    target: Operand,
    pc: number,
    symbols: SymbolTable,
    context: RelocationContext,
    line: number,
  ): number {
    const rsNum = this.requireRegister(rs, line);
    const rtNum = this.requireRegister(rt, line);
    if (target.kind === "label") {
      const address = this.toInt32(this.resolveLabelOrImmediate(target, symbols, line));
      const offset = ((address - (this.toInt32(pc) + 4)) / 4) | 0;
      this.recordRelocation(context, target.name, "MIPS_PC16", 0);
      return (opcode << 26) | (rsNum << 21) | (rtNum << 16) | (offset & 0xffff);
    }

    const address = this.toInt32(this.resolveLabelOrImmediate(target, symbols, line));
    const offset = ((address - (this.toInt32(pc) + 4)) / 4) | 0;
    if (offset < -32768 || offset > 32767) {
      throw new Error(`Branch target out of range at line ${line}`);
    }
    return (opcode << 26) | (rsNum << 21) | (rtNum << 16) | (offset & 0xffff);
  }

  private encodeJump(
    opcode: number,
    target: Operand,
    symbols: SymbolTable,
    context: RelocationContext,
    line: number,
  ): number {
    if (target.kind === "label") {
      const address = this.resolveLabelOrImmediate(target, symbols, line);
      const field = (address >>> 2) & 0x03ffffff;
      this.recordRelocation(context, target.name, "MIPS_26", 0);
      return (opcode << 26) | field;
    }

    const address = this.resolveLabelOrImmediate(target, symbols, line);
    const field = (address >>> 2) & 0x03ffffff;
    return (opcode << 26) | field;
  }

  private expectOperands(name: string, operands: Operand[], kinds: string[], line: number): void {
    if (operands.length !== kinds.length) {
      throw new Error(`${name} expects ${kinds.length} operand(s) (line ${line})`);
    }
    operands.forEach((operand, index) => {
      const expected = kinds[index];
      if (expected.includes("register") && operand.kind === "register") return;
      if (expected.includes("immediate") && (operand.kind === "immediate" || operand.kind === "expression")) return;
      if (expected.includes("label") && operand.kind === "label") return;
      if (expected.includes("memory") && operand.kind === "memory") return;
      throw new Error(`Unexpected operand for ${name} at position ${index + 1} (line ${line})`);
    });
  }

  private resolveImmediateWithRelocation(
    operand: Operand,
    symbols: SymbolTable,
    line: number,
    context: RelocationContext,
    type: RelocationType,
    signed: boolean,
  ): number {
    if (operand.kind === "label") {
      const value = this.resolveImmediate(operand, symbols, line, signed);
      this.recordRelocation(context, operand.name, type, 0);
      return value;
    }

    return this.resolveImmediate(operand, symbols, line, signed);
  }

  private resolveImmediate(operand: Operand, symbols: SymbolTable, line: number, signed: boolean): number {
    const value = this.resolveValue(operand, symbols, line);
    if (signed && (value < -32768 || value > 32767)) {
      throw new Error(`Immediate out of range at line ${line}`);
    }
    if (!signed && (value < 0 || value > 0xffff)) {
      throw new Error(`Immediate out of range at line ${line}`);
    }
    return value;
  }

  private resolveLabelOrImmediate(operand: Operand, symbols: SymbolTable, line: number): number {
    if (operand.kind === "immediate" || operand.kind === "label" || operand.kind === "expression") {
      return this.resolveValue(operand, symbols, line);
    }
    throw new Error(`Expected immediate or label at line ${line}`);
  }

  private requireRegister(operand: Operand, line: number): number {
    if (operand.kind !== "register") {
      throw new Error(`Expected register operand at line ${line}`);
    }
    return operand.register;
  }

  private requireImmediate(operand: Operand, line: number, min: number, max: number): number {
    if (operand.kind !== "immediate") {
      throw new Error(`Expected immediate operand at line ${line}`);
    }
    if (operand.value < min || operand.value > max) {
      throw new Error(`Immediate value out of range at line ${line}`);
    }
    return operand.value;
  }

  private encodeString(literal: string): Uint8Array {
    return new TextEncoder().encode(literal);
  }

  private toInt32(value: number): number {
    return value | 0;
  }

  private toUint32(value: number): number {
    return value >>> 0;
  }

  private pushHalfBytes(value: number, sink: number[]): void {
    const short = value & 0xffff;
    sink.push((short >>> 8) & 0xff, short & 0xff);
  }

  private pushWordBytes(value: number, sink: number[]): void {
    sink.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  }

  private pushFloatBytes(value: number, sink: number[]): void {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, value, false);
    sink.push(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  }

  private pushDoubleBytes(value: number, sink: number[]): void {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value, false);
    sink.push(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3),
      view.getUint8(4),
      view.getUint8(5),
      view.getUint8(6),
      view.getUint8(7),
    );
  }
}
