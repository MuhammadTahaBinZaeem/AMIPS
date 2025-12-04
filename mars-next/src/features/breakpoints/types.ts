export type BreakpointConditionSpec = {
  kind: "registerEquals";
  register: string;
  value: number;
};

export interface BreakpointSpec {
  id: string;
  spec: string;
  condition?: BreakpointConditionSpec | null;
  oneShot?: boolean;
}

export type NewBreakpointSpec = Omit<BreakpointSpec, "id">;

export type WatchKind = "register" | "memory" | "expression";

export interface WatchSpec {
  kind: WatchKind;
  identifier: string;
}
