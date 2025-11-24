import { BreakpointEngine } from "../../../core";

export function normalizeLineNumber(line: number): number {
  return Math.max(1, Math.floor(line));
}

export function toggleBreakpoint(line: number, existing: number[], engine?: BreakpointEngine): number[] {
  const normalized = normalizeLineNumber(line);
  const hasBreakpoint = existing.includes(normalized);

  if (hasBreakpoint) {
    engine?.removeInstructionBreakpoint(normalized - 1);
    return existing.filter((point) => point !== normalized);
  }

  engine?.setInstructionBreakpoint(normalized - 1);
  return [...existing, normalized].sort((a, b) => a - b);
}

export function clearBreakpoints(engine?: BreakpointEngine): void {
  engine?.clearAll();
}

export function seedBreakpoints(points: number[], engine?: BreakpointEngine): void {
  if (!engine) return;
  engine.clearAll();
  points.forEach((point) => engine.setInstructionBreakpoint(point - 1));
}
