# MIPS syntax coverage in mars-next

The legacy simulator defines 139 unique instruction mnemonics in `InstructionSet.java`, while `mars-next` currently decodes 40. The comparison below was produced by collecting mnemonic names from `legacy/mars/mips/instructions/InstructionSet.java` and `mars-next/src/core/cpu/Instructions/index.ts` and then diffing the two sets.

## Fully implemented instruction mnemonics

The following instructions have been fully ported from the legacy simulator and execute with matching behavior:

- Arithmetic and logic: `add`, `addu`, `sub`, `and`, `or`, `slt`, `mul`
- Immediate arithmetic and logic: `addi`, `addiu`, `andi`, `ori`, `lui`, `slti`
- Shifts: `sll`
- Control flow: `beq`, `bne`, `bgez`, `bgezal`, `bgtz`, `blez`, `bltz`, `bltzal`, `j`, `jal`, `jr`, `bc1f`, `bc1t`
- System and no-ops: `syscall`, `break`, and the implicit `nop` encoding
- Floating point arithmetic and comparisons: `abs.s`, `abs.d`, `add.s`, `add.d`, `c.eq.s`, `c.eq.d`, `c.le.s`, `c.le.d`, `c.lt.s`, `c.lt.d`

## Missing instruction mnemonics

ceil.w.d
ceil.w.s
clo
clz
cvt.d.s  
cvt.d.w  
cvt.s.d  
cvt.s.w  
cvt.w.d  
cvt.w.s  
div  
div.d  
div.s  
divu  
eret  
floor.w.d
floor.w.s
jalr
lb
lbu
ldc1
lh
lhu
ll
lw
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
sb
sc
sdc1  
sh
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
sw
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

The new assembler only recognizes a minimal directive subset today: `.text`, `.data`, `.word`, and `.asciiz`. Legacy MARS ships a broader directive catalog that includes data layout helpers like `.byte`, `.half`, `.float`, `.double`, `.space`, `.align`, `.ascii`, and segment selectors such as `.kdata`/`.ktext`. It also exposes symbol utilities (`.globl`, `.extern`, `.eqv`, `.set`), macro tooling (`.macro`/`.end_macro`), and file inclusion via `.include`. None of those constructs are currently parsed or executed in `mars-next`, nor are legacy behaviors like macro expansion, directive-driven alignment, or expression evaluation supported.
