export interface BreakpointState {
  points: number[];
}

export const initialBreakpointState: BreakpointState = {
  points: [],
};

export function isBreakpoint(state: BreakpointState, line: number): boolean {
  return state.points.includes(line);
}

export function addBreakpoint(state: BreakpointState, line: number): BreakpointState {
  if (isBreakpoint(state, line)) return state;
  return { points: [...state.points, line].sort((a, b) => a - b) };
}

export function removeBreakpoint(state: BreakpointState, line: number): BreakpointState {
  if (!isBreakpoint(state, line)) return state;
  return { points: state.points.filter((point) => point !== line) };
}
