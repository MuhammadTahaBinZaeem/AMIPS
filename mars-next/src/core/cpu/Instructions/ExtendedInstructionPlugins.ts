import { registerCloInstruction } from "./CloInstruction";
import { registerClzInstruction } from "./ClzInstruction";
import { registerDextInstruction } from "./DextInstruction";
import { registerDinsInstruction } from "./DinsInstruction";
import { registerDsll32Instruction } from "./Dsll32Instruction";
import { registerDsrl32Instruction } from "./Dsrl32Instruction";
import { registerExtInstruction } from "./ExtInstruction";
import { registerInsInstruction } from "./InsInstruction";
import { registerRorInstruction } from "./RorInstruction";
import { registerSebInstruction } from "./SebInstruction";
import { registerSehInstruction } from "./SehInstruction";
import { registerWsbhInstruction } from "./WsbhInstruction";

export function registerExtendedInstructionPlugins(): void {
  registerWsbhInstruction();
  registerDextInstruction();
  registerDinsInstruction();
  registerDsll32Instruction();
  registerDsrl32Instruction();
  registerExtInstruction();
  registerInsInstruction();
  registerRorInstruction();
  registerSebInstruction();
  registerSehInstruction();
  registerClzInstruction();
  registerCloInstruction();
}
