import { resolveRegisterIdentifier } from "../../../core/debugger/registerAliases";
import { type WatchSpec } from "../types";

export function getWatchKey(spec: WatchSpec, symbols?: Record<string, number>): string {
  if (spec.kind === "register") {
    const identifier = spec.identifier.startsWith("$") ? spec.identifier.slice(1) : spec.identifier;
    try {
      const { index } = resolveRegisterIdentifier(identifier);
      return `${spec.kind}:${index}`;
    } catch {
      // Fall through to a best-effort key when the identifier is malformed.
    }
  }

  if (spec.kind === "memory") {
    const trimmed = spec.identifier.trim();
    if (/^0x[0-9a-f]+$/i.test(trimmed)) return `${spec.kind}:${Number.parseInt(trimmed, 16) | 0}`;
    if (/^\d+$/.test(trimmed)) return `${spec.kind}:${Number.parseInt(trimmed, 10) | 0}`;
    if (symbols && trimmed in symbols) return `${spec.kind}:${symbols[trimmed] | 0}`;
  }

  return `${spec.kind}:${spec.identifier}`;
}
