import { MachineState } from "../state/MachineState";
import { resolveRegisterIdentifier } from "./registerAliases";

export type WatchKind = "register" | "memory";
export type WatchIdentifier = string | number;

export interface WatchEvent {
  kind: WatchKind;
  identifier: WatchIdentifier;
  oldValue: number;
  newValue: number;
}

interface MemoryReader {
  read(address: number): number;
}

type WatchTarget = {
  key: string;
  kind: WatchKind;
  identifier: WatchIdentifier;
  readValue: () => number;
  lastValue?: number;
};

export class WatchEngine {
  private readonly state: MachineState;
  private readonly memory?: MemoryReader;
  private readonly watches = new Map<string, WatchTarget>();
  private readonly pendingEvents: WatchEvent[] = [];
  private readonly stepSnapshot = new Map<string, number>();
  private symbolTable: Map<string, number> | null = null;

  constructor(state: MachineState, memory?: MemoryReader) {
    this.state = state;
    this.memory = memory;
  }

  addWatch(kind: WatchKind, identifier: WatchIdentifier): void {
    const target = this.createTarget(kind, identifier);
    target.lastValue = target.readValue();
    this.watches.set(target.key, target);
  }

  removeWatch(kind: WatchKind, identifier: WatchIdentifier): void {
    const key = `${kind}:${identifier}`;
    this.watches.delete(key);
  }

  clear(): void {
    this.watches.clear();
    this.stepSnapshot.clear();
    this.pendingEvents.length = 0;
  }

  beginStep(): void {
    this.stepSnapshot.clear();
    for (const watch of this.watches.values()) {
      this.stepSnapshot.set(watch.key, watch.readValue());
    }
  }

  completeStep(): void {
    for (const watch of this.watches.values()) {
      const before = this.stepSnapshot.get(watch.key);
      const current = watch.readValue();

      if (before !== undefined && before !== current) {
        this.pendingEvents.push({
          kind: watch.kind,
          identifier: watch.identifier,
          oldValue: before,
          newValue: current,
        });
      }

      watch.lastValue = current;
    }

    this.stepSnapshot.clear();
  }

  getWatchChanges(): WatchEvent[] {
    const events = [...this.pendingEvents];
    this.pendingEvents.length = 0;
    return events;
  }

  setSymbolTable(symbols: Map<string, number> | Record<string, number> | null): void {
    if (!symbols) {
      this.symbolTable = null;
      return;
    }

    this.symbolTable = symbols instanceof Map ? new Map(symbols) : new Map(Object.entries(symbols));
  }

  getWatchValues(): Array<{ key: string; kind: WatchKind; identifier: WatchIdentifier; value: number | undefined }> {
    return Array.from(this.watches.values()).map((watch) => ({
      key: watch.key,
      kind: watch.kind,
      identifier: watch.identifier,
      value: watch.lastValue,
    }));
  }

  private createTarget(kind: WatchKind, identifier: WatchIdentifier): WatchTarget {
    if (kind === "register") {
      const { index, normalized } = this.normalizeRegister(identifier);
      return {
        key: `${kind}:${index}`,
        kind,
        identifier: normalized,
        readValue: () => this.state.getRegister(index),
      };
    }

    if (!this.memory) {
      throw new Error("Memory watches require a memory instance");
    }

    const address = this.normalizeAddress(identifier);
    return {
      key: `${kind}:${address}`,
      kind,
      identifier: address,
      readValue: () => this.memory!.read(address),
    };
  }

  private normalizeRegister(identifier: WatchIdentifier): { index: number; normalized: string } {
    return resolveRegisterIdentifier(identifier);
  }

  private normalizeAddress(identifier: WatchIdentifier): number {
    if (typeof identifier === "number") {
      return identifier | 0;
    }

    if (/^0x[0-9a-f]+$/i.test(identifier)) {
      return Number.parseInt(identifier, 16) | 0;
    }

    if (/^\d+$/.test(identifier)) {
      return Number.parseInt(identifier, 10) | 0;
    }

    if (this.symbolTable?.has(identifier)) {
      return this.symbolTable.get(identifier)! | 0;
    }

    throw new Error(`Unknown memory identifier: ${identifier}`);
  }
}
