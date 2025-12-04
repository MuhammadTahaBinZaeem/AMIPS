import { type WatchSpec } from "../types";

export interface WatchState {
  watches: WatchSpec[];
}

export const initialWatchState: WatchState = { watches: [] };

export function hasWatch(state: WatchState, spec: WatchSpec): boolean {
  return state.watches.some(
    (existing) => existing.kind === spec.kind && existing.identifier === spec.identifier,
  );
}

export function addWatch(state: WatchState, spec: WatchSpec): WatchState {
  if (hasWatch(state, spec)) return state;
  return { watches: [...state.watches, spec] };
}

export function removeWatch(state: WatchState, spec: WatchSpec): WatchState {
  if (!hasWatch(state, spec)) return state;
  return {
    watches: state.watches.filter(
      (existing) => !(existing.kind === spec.kind && existing.identifier === spec.identifier),
    ),
  };
}
