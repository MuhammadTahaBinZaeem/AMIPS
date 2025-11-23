# MIPS syntax coverage in mars-next

The legacy simulator defines 139 unique instruction mnemonics in `InstructionSet.java`, while `mars-next` currently decodes 48. The comparison below was produced by collecting mnemonic names from `legacy/mars/mips/instructions/InstructionSet.java` and `mars-next/src/core/cpu/Instructions/index.ts` and then diffing the two sets.

## Fully implemented instruction mnemonics

The following instructions have been fully ported from the legacy simulator and execute with matching behavior:

- Arithmetic and logic: `add`, `addu`, `sub`, `and`, `or`, `slt`, `mul`
- Immediate arithmetic and logic: `addi`, `addiu`, `andi`, `ori`, `lui`, `slti`
- Shifts: `sll`
- Byte/halfword/word memory access: `lb`, `lbu`, `lh`, `lhu`, `lw`, `sb`, `sh`, `sw`
- Control flow: `beq`, `bne`, `bgez`, `bgezal`, `bgtz`, `blez`, `bltz`, `bltzal`, `j`, `jal`, `jr`, `bc1f`, `bc1t`
- System and no-ops: `syscall`, `break`, and the implicit `nop` encoding
- Integer division and bit counting: `div`, `divu`, `clo`, `clz`
- Floating point arithmetic and comparisons: `abs.s`, `abs.d`, `add.s`, `add.d`, `c.eq.s`, `c.eq.d`, `c.le.s`, `c.le.d`, `c.lt.s`, `c.lt.d`, `div.s`, `div.d`
- Floating point conversions and rounding to word: `ceil.w.s`, `ceil.w.d`, `cvt.d.s`, `cvt.d.w`, `cvt.s.d`, `cvt.s.w`, `cvt.w.d`, `cvt.w.s`

## Missing instruction mnemonics

eret
floor.w.d
floor.w.s
jalr
ldc1
ll
lwc1
lwl
lwr
madd  
maddu  
mfc0  
mfc1  
mfhi  
mflo  
mov.d  
mov.s  
movf  
movf.d  
movf.s  
movn  
movn.d  
movn.s  
movt  
movt.d  
movt.s
movz
movz.d
movz.s
msub
msubu  
mtc0  
mtc1  
mthi  
mtlo  
mul.d  
mul.s  
mult  
multu  
neg.d
neg.s
nor
round.w.d
round.w.s
sc
sdc1
sllv
sltiu
sltu
sqrt.d
sqrt.s
sra
srav
srl
srlv
sub.d
sub.s
subu
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
