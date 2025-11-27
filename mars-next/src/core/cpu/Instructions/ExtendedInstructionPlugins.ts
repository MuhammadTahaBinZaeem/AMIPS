import { registerCloInstruction } from "./CloInstruction";
import { registerClzInstruction } from "./ClzInstruction";
import { registerExtInstruction } from "./ExtInstruction";
import { registerInsInstruction } from "./InsInstruction";
import { registerRorInstruction } from "./RorInstruction";
import { registerSebInstruction } from "./SebInstruction";
import { registerSehInstruction } from "./SehInstruction";

export function registerExtendedInstructionPlugins(): void {
  registerExtInstruction();
  registerInsInstruction();
  registerRorInstruction();
  registerSebInstruction();
  registerSehInstruction();
  registerClzInstruction();
  registerCloInstruction();
}
