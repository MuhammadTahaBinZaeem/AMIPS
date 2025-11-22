type BreakpointHit = { type: "address" | "instruction"; value: number };

export class BreakpointEngine {
  private readonly addressBreakpoints = new Set<number>();
  private readonly instructionBreakpoints = new Set<number>();
  private lastHit: BreakpointHit | null = null;

  setBreakpoint(address: number): void {
    this.addressBreakpoints.add(address | 0);
  }

  removeBreakpoint(address: number): void {
    this.addressBreakpoints.delete(address | 0);
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
}
