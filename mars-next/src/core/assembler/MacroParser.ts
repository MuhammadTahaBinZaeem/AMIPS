export type MacroKind =
  | "COMPACT"
  | "DBNOP"
  | "BROFF"
  | "LAB"
  | "LHL"
  | "IMM"
  | "RG"
  | "NR"
  | "OP"
  | "LLP"
  | "LLPP"
  | "LL"
  | "LHPA"
  | "LHPN"
  | "LH"
  | "VH"
  | "VHL"
  | "VL"
  | "S32";

export interface ParsedMacro {
  kind: MacroKind;
  raw: string;
  index?: number;
  addend?: number;
  unsigned?: boolean;
  enabledOffset?: number;
  disabledOffset?: number;
}

export const macroPattern = /(COMPACT|DBNOP|BROFF\d+|[A-Z]{2,}[A-Z0-9]+)/g;

export function parseMacro(raw: string): ParsedMacro | undefined {
  if (raw === "COMPACT") return { kind: "COMPACT", raw };
  if (raw === "DBNOP") return { kind: "DBNOP", raw };
  if (raw === "LAB") return { kind: "LAB", raw };
  if (raw === "LHL") return { kind: "LHL", raw };
  if (raw === "IMM") return { kind: "IMM", raw };

  if (raw.startsWith("BROFF")) {
    const offsets = raw.slice(5);
    const disabledOffset = Number(offsets.slice(0, -1));
    const enabledOffset = Number(offsets.at(-1));
    if (offsets.length >= 2 && Number.isFinite(disabledOffset) && Number.isFinite(enabledOffset)) {
      return { kind: "BROFF", raw, enabledOffset, disabledOffset };
    }
  }

  if (raw.startsWith("LLPP") && isDigit(raw[4] ?? "")) {
    return { kind: "LLPP", raw, addend: Number(raw[4]) };
  }

  if (raw.startsWith("LHPAP") && isDigit(raw.at(-1) ?? "")) {
    return { kind: "LHPA", raw, addend: Number(raw.at(-1)) };
  }

  const unsigned = raw.endsWith("U");
  const unsignedTrimmed = unsigned ? raw.slice(0, -1) : raw;
  const { base, addend } = stripAddend(unsignedTrimmed);

  if (base === "LLP") return { kind: "LLP", raw, addend, unsigned };
  if (base === "LHPA") return { kind: "LHPA", raw, addend };
  if (base === "LHPN") return { kind: "LHPN", raw };

  const { prefix, index } = splitPrefix(base);
  if (index === undefined) return undefined;

  switch (prefix) {
    case "RG":
      return { kind: "RG", raw, index };
    case "NR":
      return { kind: "NR", raw, index };
    case "OP":
      return { kind: "OP", raw, index };
    case "LL":
      return { kind: "LL", raw, index, addend, unsigned };
    case "LH":
      return { kind: "LH", raw, index, addend };
    case "VH":
      return { kind: "VH", raw, index, addend };
    case "VHL":
      return { kind: "VHL", raw, index, addend };
    case "VL":
      return { kind: "VL", raw, index, addend, unsigned };
    case "S":
      if (base === "S32") return { kind: "S32", raw };
      break;
    default:
      break;
  }

  return undefined;
}

function stripAddend(value: string): { base: string; addend: number } {
  const penultimate = value.length - 2;
  if (
    value.lastIndexOf("P") === penultimate &&
    isDigit(value.at(-1) ?? "") &&
    isDigit(value[penultimate - 1] ?? "")
  ) {
    return { base: value.slice(0, penultimate), addend: Number(value.at(-1)) };
  }

  return { base: value, addend: 0 };
}

function splitPrefix(value: string): { prefix: string; index?: number } {
  let pivot = value.length;
  for (let i = 0; i < value.length; i++) {
    if (isDigit(value[i] ?? "")) {
      pivot = i;
      break;
    }
  }

  const prefix = value.slice(0, pivot);
  const indexString = value.slice(pivot);
  const index = indexString ? Number(indexString) : undefined;

  return Number.isFinite(index) ? { prefix, index } : { prefix };
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}
