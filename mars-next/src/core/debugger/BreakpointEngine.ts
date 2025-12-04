import { MachineState } from "../state/MachineState";
import { resolveRegisterIdentifier } from "./registerAliases";

export type BreakpointHit = { type: "address" | "instruction"; value: number };
export type SymbolLookup = Map<string, number> | Record<string, number> | null | undefined;

export type BreakpointCondition = { kind: "registerEquals"; register: string | number; value: number };
export type BreakpointOptions = { once?: boolean; condition?: BreakpointCondition | null };
type BreakpointRule = Required<BreakpointOptions>;

export class BreakpointEngine {
  private readonly addressBreakpoints = new Map<number, BreakpointRule[]>();
  private readonly instructionBreakpoints = new Map<number, BreakpointRule[]>();
  private readonly lineBreakpoints = new Map<number, BreakpointRule[]>();
  private lastHit: BreakpointHit | null = null;
  private symbolTable: Map<string, number> | null = null;

  setBreakpoint(address: number, options: BreakpointOptions = {}): void {
    this.addRule(this.addressBreakpoints, address, options);
  }

  setBreakpointByLabel(label: string, options: BreakpointOptions = {}): number {
    const address = this.resolveSymbol(label);
    this.setBreakpoint(address, options);
    return address;
  }

  removeBreakpoint(address: number): void {
    this.addressBreakpoints.delete(address | 0);
  }

  removeBreakpointByLabel(label: string): void {
    const resolved = this.resolveSymbol(label);
    this.removeBreakpoint(resolved);
  }

  setInstructionBreakpoint(index: number, options: BreakpointOptions = {}): void {
    this.addRule(this.instructionBreakpoints, index, options);
  }

  removeInstructionBreakpoint(index: number): void {
    this.instructionBreakpoints.delete(index | 0);
  }

  setLineBreakpoint(line: number, options: BreakpointOptions = {}): void {
    const normalized = Math.max(1, Math.floor(line));
    this.addRule(this.lineBreakpoints, normalized, options);
  }

  removeLineBreakpoint(line: number): void {
    this.lineBreakpoints.delete(Math.max(1, Math.floor(line)));
  }

  checkForHit(programCounter: number, instructionIndex: number, state?: MachineState): boolean {
    if (this.evaluateBreakpoints(this.addressBreakpoints, "address", programCounter, state)) return true;
    if (this.evaluateBreakpoints(this.instructionBreakpoints, "instruction", instructionIndex, state)) return true;
    if (this.evaluateBreakpoints(this.lineBreakpoints, "instruction", instructionIndex + 1, state)) return true;

    return false;
  }

  shouldBreak(programCounter: number, instructionIndex: number, state?: MachineState): boolean {
    return this.checkForHit(programCounter, instructionIndex, state);
  }

  getHitBreakpoint(): number | null {
    return this.lastHit?.value ?? null;
  }

  getHitInfo(): BreakpointHit | null {
    return this.lastHit;
  }

  clearHit(): void {
    this.lastHit = null;
  }

  clearAll(): void {
    this.addressBreakpoints.clear();
    this.instructionBreakpoints.clear();
    this.lineBreakpoints.clear();
    this.clearHit();
  }

  setSymbolTable(symbols: SymbolLookup): void {
    if (!symbols) {
      this.symbolTable = null;
      return;
    }

    this.symbolTable = symbols instanceof Map ? new Map(symbols) : new Map(Object.entries(symbols));
  }

  getSymbolTable(): Map<string, number> | null {
    return this.symbolTable;
  }

  private addRule(store: Map<number, BreakpointRule[]>, rawTarget: number, options: BreakpointOptions): void {
    const target = rawTarget | 0;
    const rule = this.normalizeOptions(options);
    const existing = store.get(target) ?? [];
    store.set(target, [...existing, rule]);
  }

  private evaluateBreakpoints(
    store: Map<number, BreakpointRule[]>,
    type: BreakpointHit["type"],
    rawTarget: number,
    state?: MachineState,
  ): boolean {
    const target = rawTarget | 0;
    const rules = store.get(target);
    if (!rules || rules.length === 0) return false;

    for (const rule of rules) {
      if (!this.evaluateCondition(rule.condition, state)) continue;

      this.lastHit = { type, value: target };

      if (rule.once) {
        const remaining = rules.filter((entry) => entry !== rule);
        if (remaining.length === 0) {
          store.delete(target);
        } else {
          store.set(target, remaining);
        }
      }

      return true;
    }

    return false;
  }

  private normalizeOptions(options: BreakpointOptions): BreakpointRule {
    return {
      once: options.once ?? false,
      condition: options.condition ?? null,
    };
  }

  private evaluateCondition(condition: BreakpointRule["condition"], state?: MachineState): boolean {
    if (!condition) return true;
    if (!state) return false;

    if (condition.kind === "registerEquals") {
      const { index } = resolveRegisterIdentifier(condition.register);
      return state.getRegister(index) === (condition.value | 0);
    }

    return false;
  }

  private resolveSymbol(label: string): number {
    if (!this.symbolTable) {
      throw new Error(`No symbol table is loaded to resolve '${label}'`);
    }

    const address = this.symbolTable.get(label);
    if (address === undefined) {
      throw new Error(`Unknown symbol '${label}'`);
    }

    return address | 0;
  }
}
