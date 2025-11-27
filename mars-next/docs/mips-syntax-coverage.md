# MIPS syntax coverage in mars-next

The legacy simulator defines 139 unique instruction mnemonics in `InstructionSet.java`. The TypeScript decoder in `src/core/cpu/Instructions/index.ts` currently implements **99** of those mnemonics; **40** remain unimplemented (see below). Counts come from diffing the legacy Java instruction names against the decoded instruction names in the TypeScript implementation.

## Implemented instruction mnemonics (99)
`add`, `addi`, `addiu`, `addu`, `and`, `andi`, `beq`, `bgez`, `bgezal`, `bgtz`, `blez`, `bltz`, `bltzal`, `bne`, `break`, `clo`, `clz`, `cvt.d.s`, `cvt.d.w`, `cvt.s.d`, `cvt.s.w`, `cvt.w.d`, `cvt.w.s`, `div`, `divu`, `eret`, `j`, `jal`, `jalr`, `jr`, `lb`, `lbu`, `ldc1`, `lh`, `lhu`, `ll`, `lui`, `lw`, `lwc1`, `lwl`, `lwr`, `madd`, `maddu`, `mfc0`, `mfc1`, `mfhi`, `mflo`, `movn`, `movz`, `msub`, `msubu`, `mtc0`, `mtc1`, `mthi`, `mtlo`, `mul`, `mult`, `multu`, `neg.d`, `neg.s`, `nop`, `nor`, `or`, `ori`, `sb`, `sc`, `sdc1`, `sh`, `sll`, `sllv`, `slt`, `slti`, `sltiu`, `sltu`, `sra`, `srav`, `srl`, `srlv`, `sub`, `subu`, `sw`, `swc1`, `swl`, `swr`, `syscall`, `teq`, `teqi`, `tge`, `tgei`, `tgeiu`, `tgeu`, `tlt`, `tlti`, `tltiu`, `tltu`, `tne`, `tnei`, `xor`, `xori`.

## Missing instruction mnemonics (40)
`abs.d`, `abs.s`, `add.d`, `add.s`, `bc1f`, `bc1t`, `c.eq.d`, `c.eq.s`, `c.le.d`, `c.le.s`, `c.lt.d`, `c.lt.s`, `ceil.w.d`, `ceil.w.s`, `div.d`, `div.s`, `floor.w.d`, `floor.w.s`, `mov.d`, `mov.s`, `movf`, `movf.d`, `movf.s`, `movn.d`, `movn.s`, `movt`, `movt.d`, `movt.s`, `movz.d`, `movz.s`, `mul.d`, `mul.s`, `round.w.d`, `round.w.s`, `sqrt.d`, `sqrt.s`, `sub.d`, `sub.s`, `trunc.w.d`, `trunc.w.s`.

## Pseudo-instruction coverage
All 83 pseudo-op mnemonics from `resources/PseudoOps.txt` are parsed and expanded by the assembler, mirroring the legacy PseudoOps table. Gaps that still block full feature parity are summarized alongside renderer/tooling differences in [`docs/legacy-comparison.md`](legacy-comparison.md).

## Directive and expression support
The assembler parser recognizes `.text`, `.data`, `.ktext`, `.kdata`, `.word`, `.byte`, `.half`, `.float`, `.double`, `.ascii`, `.asciiz`, `.space`, `.align`, `.globl`, `.extern`, `.eqv`, and `.set`. Directive arguments can be raw numbers, labels, or arithmetic/bitwise expressions, and memory operands accept computed or label-backed offsets.
