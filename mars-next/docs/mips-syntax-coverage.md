# MIPS syntax coverage in mars-next

The legacy simulator defines 139 unique instruction mnemonics in `InstructionSet.java`, while `mars-next` currently decodes 106. The comparison below was produced by collecting mnemonic names from `legacy/mars/mips/instructions/InstructionSet.java` and `mars-next/src/core/cpu/Instructions/index.ts` and then diffing the two sets.

## Fully implemented instruction mnemonics

The following instructions have been fully ported from the legacy simulator and execute with matching behavior:

- Arithmetic and logic: `add`, `addu`, `sub`, `subu`, `and`, `or`, `nor`, `slt`, `sltu`, `mul`, `madd`, `maddu`, `mult`, `multu`
- HI/LO register operations: `mfhi`, `mflo`, `mthi`, `mtlo`, `msub`, `msubu`
- Immediate arithmetic and logic: `addi`, `addiu`, `andi`, `ori`, `lui`, `slti`, `sltiu`
- Shifts: `sll`, `sllv`, `srl`, `srlv`, `sra`, `srav`
- Byte/halfword/word memory access: `lb`, `lbu`, `lh`, `lhu`, `ll`, `lwl`, `lwr`, `lw`, `sb`, `sh`, `sw`, `sc`
- Floating-point memory access: `lwc1`, `ldc1`, `sdc1`
- Control flow: `beq`, `bne`, `bgez`, `bgezal`, `bgtz`, `blez`, `bltz`, `bltzal`, `j`, `jal`, `jalr`, `jr`, `bc1f`, `bc1t`
- System and no-ops: `syscall`, `break`, `eret`, and the implicit `nop` encoding
- Integer division and bit counting: `div`, `divu`, `clo`, `clz`
- Floating point arithmetic and comparisons: `abs.s`, `abs.d`, `add.s`, `add.d`, `c.eq.s`, `c.eq.d`, `c.le.s`, `c.le.d`, `c.lt.s`, `c.lt.d`, `div.s`, `div.d`, `mul.s`, `mul.d`, `sub.s`, `sub.d`, `sqrt.s`, `sqrt.d`, `neg.s`, `neg.d`
- Floating point conversions, moves, and rounding to word: `ceil.w.s`, `ceil.w.d`, `cvt.d.s`, `cvt.d.w`, `cvt.s.d`, `cvt.s.w`, `cvt.w.d`, `cvt.w.s`, `floor.w.d`, `floor.w.s`, `mov.d`, `mov.s`, `round.w.d`, `round.w.s`
- Floating point conditional moves: `movf.d`, `movf.s`, `movn.d`, `movn.s`, `movt.d`, `movt.s`, `movz.d`, `movz.s`
- Register transfers and conditional moves: `mfc0`, `mfc1`, `mtc0`, `mtc1`, `movf`, `movn`, `movt`, `movz`

## Missing instruction mnemonics

swc1
swl
swr
teq
teqi
tge
tgei
tgeiu
tgeu
tlt
tlti
tltiu
tltu
tne
tnei
trunc.w.d
trunc.w.s
xor
xori

## Assembler directive and macro coverage

The assembler now recognizes a broader directive subset: `.text`, `.data`, `.ktext`, `.kdata`, `.word`, `.byte`, `.half`, `.float`, `.double`, `.ascii`, `.asciiz`, `.space`, `.align`, `.globl`, `.extern`, `.eqv`, `.set`, file inclusion via `.include`, and macro definitions via `.macro`/`.end_macro` with parameterized expansion. Directive arguments now accept arithmetic and bitwise expressions across data layout directives and `.eqv` definitions. Memory operands for load/store instructions also accept label-backed or computed offsets in addition to raw immediates.
