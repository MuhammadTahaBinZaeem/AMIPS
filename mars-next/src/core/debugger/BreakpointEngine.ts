type BreakpointHit = { type: "address" | "instruction"; value: number };
export type SymbolLookup = Map<string, number> | Record<string, number> | null | undefined;

export class BreakpointEngine {
  private readonly addressBreakpoints = new Set<number>();
  private readonly instructionBreakpoints = new Set<number>();
  private lastHit: BreakpointHit | null = null;
  private symbolTable: Map<string, number> | null = null;

  setBreakpoint(address: number): void {
    this.addressBreakpoints.add(address | 0);
  }

  setBreakpointByLabel(label: string): number {
    const address = this.resolveSymbol(label);
    this.setBreakpoint(address);
    return address;
  }

  removeBreakpoint(address: number): void {
    this.addressBreakpoints.delete(address | 0);
  }

  removeBreakpointByLabel(label: string): void {
    const resolved = this.resolveSymbol(label);
    this.removeBreakpoint(resolved);
  }

  setInstructionBreakpoint(index: number): void {
    this.instructionBreakpoints.add(index | 0);
  }

  removeInstructionBreakpoint(index: number): void {
    this.instructionBreakpoints.delete(index | 0);
  }

  checkForHit(programCounter: number, instructionIndex: number): boolean {
    if (this.addressBreakpoints.has(programCounter | 0)) {
      this.lastHit = { type: "address", value: programCounter | 0 };
      return true;
    }

    if (this.instructionBreakpoints.has(instructionIndex | 0)) {
      this.lastHit = { type: "instruction", value: instructionIndex | 0 };
      return true;
    }

    return false;
  }

  getHitBreakpoint(): number | null {
    return this.lastHit?.value ?? null;
  }

  clearHit(): void {
    this.lastHit = null;
  }

  clearAll(): void {
    this.addressBreakpoints.clear();
    this.instructionBreakpoints.clear();
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
