import { BreakpointEngine, type SourceMapEntry } from "../../../core";

export function normalizeLineNumber(line: number): number {
  return Math.max(1, Math.floor(line));
}

export function resolveInstructionIndex(line: number, sourceMap?: SourceMapEntry[], file?: string): number | null {
  if (!sourceMap || sourceMap.length === 0) return line - 1;

  const targetFile = file ?? (sourceMap.some((entry) => entry.file === "<input>") ? "<input>" : sourceMap[0]?.file);

  const candidates = sourceMap
    .filter((entry) => entry.segment === "text" && entry.line === line && (targetFile === undefined || entry.file === targetFile))
    .sort((left, right) => (left.segmentIndex ?? 0) - (right.segmentIndex ?? 0));

  return candidates[0]?.segmentIndex ?? null;
}

export function toggleBreakpoint(
  line: number,
  existing: number[],
  engine?: BreakpointEngine,
  sourceMap?: SourceMapEntry[],
  file?: string,
): number[] {
  const normalized = normalizeLineNumber(line);
  const hasBreakpoint = existing.includes(normalized);
  const instructionIndex = resolveInstructionIndex(normalized, sourceMap, file);

  if (instructionIndex === null) return existing;

  if (hasBreakpoint) {
    engine?.removeInstructionBreakpoint(instructionIndex);
    return existing.filter((point) => point !== normalized);
  }

  engine?.setInstructionBreakpoint(instructionIndex);
  return [...existing, normalized].sort((a, b) => a - b);
}

export function clearBreakpoints(engine?: BreakpointEngine): void {
  engine?.clearAll();
}

export function seedBreakpoints(
  points: number[],
  engine?: BreakpointEngine,
  sourceMap?: SourceMapEntry[],
  file?: string,
): void {
  if (!engine) return;
  engine.clearAll();
  points.forEach((point) => {
    const index = resolveInstructionIndex(point, sourceMap, file);
    if (index !== null) {
      engine.setInstructionBreakpoint(index);
    }
  });
}
