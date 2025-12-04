import helpDataJson from "../resources/helpData.json";

export type HelpTopic = "instructions" | "pseudoinstructions" | "directives" | "syscalls" | "macros" | "shortcuts";

export interface InstructionHelp {
  name: string;
  format: string;
  description: string;
  operandLayout: string;
}

export interface PseudoInstructionHelp extends InstructionHelp {
  templates: string[];
}

export interface DirectiveHelp {
  name: string;
  description: string;
}

export interface SyscallHelp {
  name: string;
  code: string;
  arguments: string;
  result: string;
}

export interface MacroHelp {
  symbol: string;
  meaning: string;
}

export interface ShortcutHelp {
  action: string;
  keys: string;
}

export interface HelpData {
  instructions: InstructionHelp[];
  pseudoinstructions: PseudoInstructionHelp[];
  directives: DirectiveHelp[];
  syscalls: SyscallHelp[];
  macros: MacroHelp[];
}

export interface HelpSelection {
  topic: HelpTopic;
  name?: string;
}

export interface HelpState {
  data: HelpData;
  shortcuts: ShortcutHelp[];
  selected: HelpSelection;
  searchQuery: string;
}

export type HelpAction =
  | { type: "setTopic"; topic: HelpTopic }
  | { type: "select"; topic: HelpTopic; name?: string }
  | { type: "search"; query: string };

const helpData: HelpData = helpDataJson;

const defaultShortcuts: ShortcutHelp[] = [
  { action: "Undo", keys: "Ctrl+Z / Cmd+Z" },
  { action: "Redo", keys: "Ctrl+Y / Cmd+Shift+Z" },
  { action: "Find", keys: "Ctrl+F / Cmd+F" },
  { action: "Replace", keys: "Ctrl+H / Cmd+Option+F" },
  { action: "Run Program", keys: "F5" },
  { action: "Open File", keys: "Ctrl+O / Cmd+O" },
  { action: "Save", keys: "Ctrl+S / Cmd+S" },
];

export const initialHelpState: HelpState = {
  data: helpData,
  shortcuts: defaultShortcuts,
  selected: {
    topic: "instructions",
    name: helpData.instructions[0]?.name,
  },
  searchQuery: "",
};

export function helpReducer(state: HelpState, action: HelpAction): HelpState {
  switch (action.type) {
    case "setTopic": {
      const nextName = getEntriesByTopic(state, action.topic)[0]?.name;
      return {
        ...state,
        selected: { topic: action.topic, name: nextName },
      };
    }
    case "select": {
      return {
        ...state,
        selected: { topic: action.topic, name: action.name },
      };
    }
    case "search": {
      return { ...state, searchQuery: action.query };
    }
    default:
      return state;
  }
}

export function getEntriesByTopic(state: HelpState, topic: HelpTopic): Array<InstructionHelp | PseudoInstructionHelp | DirectiveHelp | SyscallHelp | MacroHelp | ShortcutHelp> {
  switch (topic) {
    case "instructions":
      return state.data.instructions;
    case "pseudoinstructions":
      return state.data.pseudoinstructions;
    case "directives":
      return state.data.directives;
    case "syscalls":
      return state.data.syscalls;
    case "macros":
      return state.data.macros;
    case "shortcuts":
      return state.shortcuts;
  }
}

export function findEntry(state: HelpState, selection: HelpSelection):
  | InstructionHelp
  | PseudoInstructionHelp
  | DirectiveHelp
  | SyscallHelp
  | MacroHelp
  | ShortcutHelp
  | undefined {
  const entries = getEntriesByTopic(state, selection.topic);
  if (!selection.name && selection.topic === "shortcuts") return entries[0] as ShortcutHelp | undefined;
  return entries.find((entry) => "name" in entry && entry.name === selection.name);
}

export function filterEntries(entries: Array<InstructionHelp | PseudoInstructionHelp | DirectiveHelp | SyscallHelp | MacroHelp | ShortcutHelp>, query: string): typeof entries {
  if (!query.trim()) return entries;
  const lower = query.toLowerCase();
  return entries.filter((entry) => {
    if ("name" in entry && entry.name.toLowerCase().includes(lower)) return true;
    if ("description" in entry && (entry as InstructionHelp | PseudoInstructionHelp).description?.toLowerCase().includes(lower))
      return true;
    if ("meaning" in entry && (entry as MacroHelp).meaning.toLowerCase().includes(lower)) return true;
    if ("arguments" in entry && (entry as SyscallHelp).arguments.toLowerCase().includes(lower)) return true;
    if ("result" in entry && (entry as SyscallHelp).result.toLowerCase().includes(lower)) return true;
    if ((entry as ShortcutHelp).action?.toLowerCase().includes(lower)) return true;
    return false;
  });
}
