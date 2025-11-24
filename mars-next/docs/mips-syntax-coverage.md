# MIPS syntax coverage in mars-next

The legacy simulator defines 139 unique instruction mnemonics in `InstructionSet.java`, while `mars-next` currently decodes 52 of them. The comparison below was produced by collecting mnemonic names from `legacy/mars/mips/instructions/InstructionSet.java` and `mars-next/src/core/cpu/Instructions/index.ts` and then diffing the two sets. The legacy tree also defines 83 pseudo-instruction templates in `PseudoOps.txt`; only 17 of those pseudo mnemonics are currently expanded by `mars-next`.

## Fully implemented instruction mnemonics

The following instructions have been fully ported from the legacy simulator and execute with matching behavior:

- Control flow: `beq`, `bne`, `j`, `jal`, `jalr`, `jr`
- System and no-ops: `syscall`, `break`, `eret`, and the implicit `nop` encoding
- Immediate and load addressing: `lui`
- Integer division and bit counting: `div`, `divu`, `clo`, `clz`
- Shifts: `sll`, `sllv`, `srl`, `srlv`, `sra`, `srav`
- Byte/halfword/word memory access: `ll`, `lwl`, `lwr`, `lw`, `sh`, `sw`, `swl`, `swr`, `sc`
- Floating-point memory access: `lwc1`, `ldc1`, `swc1`, `sdc1`
- HI/LO and coprocessor transfers: `mfhi`, `mflo`, `mthi`, `mtlo`, `mfc0`, `mfc1`, `mtc0`, `mtc1`
- Conditional moves: `movn`, `movz`
- Floating point arithmetic and conversions: `neg.s`, `neg.d`, `cvt.d.s`, `cvt.d.w`, `cvt.s.d`, `cvt.s.w`, `cvt.w.d`, `cvt.w.s`

## Missing instruction mnemonics

The following mnemonics from the legacy simulator are still missing:

`abs.d`, `abs.s`, `add`, `add.d`, `add.s`, `addi`, `addiu`, `addu`, `and`, `andi`, `bc1f`, `bc1t`, `bgez`, `bgezal`, `bgtz`, `blez`, `bltz`, `bltzal`, `c.eq.d`, `c.eq.s`, `c.le.d`, `c.le.s`, `c.lt.d`, `c.lt.s`, `ceil.w.d`, `ceil.w.s`, `div.d`, `div.s`, `floor.w.d`, `floor.w.s`, `lb`, `lbu`, `lh`, `lhu`, `madd`, `maddu`, `mov.d`, `mov.s`, `movf`, `movf.d`, `movf.s`, `movn.d`, `movn.s`, `movt`, `movt.d`, `movt.s`, `movz.d`, `movz.s`, `msub`, `msubu`, `mul`, `mul.d`, `mul.s`, `mult`, `multu`, `nor`, `or`, `ori`, `round.w.d`, `round.w.s`, `sb`, `slt`, `slti`, `sltiu`, `sltu`, `sqrt.d`, `sqrt.s`, `sub`, `sub.d`, `sub.s`, `subu`, `teq`, `teqi`, `tge`, `tgei`, `tgeiu`, `tgeu`, `tlt`, `tlti`, `tltiu`, `tltu`, `tne`, `tnei`, `trunc.w.d`, `trunc.w.s`, `xor`, `xori`.

## Missing pseudo-instruction mnemonics

`mars-next` currently expands only 17 of the 83 pseudo-ops listed in `legacy/PseudoOps.txt`. The following pseudo-instruction mnemonics are still missing:

`abs`, `add`, `addi`, `addiu`, `addu`, `and`, `andi`, `b`, `beqz`, `bge`, `bgeu`, `bgt`, `bgtu`, `ble`, `bleu`, `blt`, `bltu`, `bnez`, `l.d`, `l.s`, `la`, `lb`, `lbu`, `ld`, `lh`, `lhu`, `li`, `mfc1.d`, `move`, `mtc1.d`, `mul`, `mulo`, `mulou`, `mulu`, `neg`, `negu`, `not`, `or`, `ori`, `rem`, `remu`, `rol`, `ror`, `s.d`, `s.s`, `sb`, `sd`, `seq`, `sge`, `sgeu`, `sgt`, `sgtu`, `sle`, `sleu`, `sne`, `sub`, `subi`, `subiu`, `subu`, `ulh`, `ulhu`, `ulw`, `ush`, `usw`, `xor`, `xori`.

## Assembler directive and macro coverage

The assembler now recognizes a broader directive subset: `.text`, `.data`, `.ktext`, `.kdata`, `.word`, `.byte`, `.half`, `.float`, `.double`, `.ascii`, `.asciiz`, `.space`, `.align`, `.globl`, `.extern`, `.eqv`, `.set`, file inclusion via `.include`, and macro definitions via `.macro`/`.end_macro` with parameterized expansion. Directive arguments now accept arithmetic and bitwise expressions across data layout directives and `.eqv` definitions. Memory operands for load/store instructions also accept label-backed or computed offsets in addition to raw immediates.
