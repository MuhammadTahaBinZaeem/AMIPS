// Generated from legacy/mars/mips/instructions/InstructionSet.java
//
// This catalog preserves the syntax and descriptive text for each legacy
// mnemonic to aid porting and UI work. It is metadata only—the assembler and
// CPU execution paths still depend on their own opcode tables and do not yet
// consume this list.
export interface LegacyMnemonicForm { syntax: string; description: string; }
export interface LegacyMnemonic { mnemonic: string; forms: LegacyMnemonicForm[]; }
export const LEGACY_MNEMONICS: LegacyMnemonic[] = [
  { mnemonic: "nop", forms: [
    { syntax: "nop", description: "Null operation : machine code is all zeroes" },
  ] },
  { mnemonic: "add", forms: [
    { syntax: "add $t1,$t2,$t3", description: "Addition with overflow : set $t1 to ($t2 plus $t3)" },
  ] },
  { mnemonic: "sub", forms: [
    { syntax: "sub $t1,$t2,$t3", description: "Subtraction with overflow : set $t1 to ($t2 minus $t3)" },
  ] },
  { mnemonic: "addi", forms: [
    { syntax: "addi $t1,$t2,-100", description: "Addition immediate with overflow : set $t1 to ($t2 plus signed 16-bit immediate)" },
  ] },
  { mnemonic: "addu", forms: [
    { syntax: "addu $t1,$t2,$t3", description: "Addition unsigned without overflow : set $t1 to ($t2 plus $t3), no overflow" },
  ] },
  { mnemonic: "subu", forms: [
    { syntax: "subu $t1,$t2,$t3", description: "Subtraction unsigned without overflow : set $t1 to ($t2 minus $t3), no overflow" },
  ] },
  { mnemonic: "addiu", forms: [
    { syntax: "addiu $t1,$t2,-100", description: "Addition immediate unsigned without overflow : set $t1 to ($t2 plus signed 16-bit immediate), no overflow" },
  ] },
  { mnemonic: "mult", forms: [
    { syntax: "mult $t1,$t2", description: "Multiplication : Set hi to high-order 32 bits, lo to low-order 32 bits of the product of $t1 and $t2 (use mfhi to access hi, mflo to access lo)" },
  ] },
  { mnemonic: "multu", forms: [
    { syntax: "multu $t1,$t2", description: "Multiplication unsigned : Set HI to high-order 32 bits, LO to low-order 32 bits of the product of unsigned $t1 and $t2 (use mfhi to access HI, mflo to access LO)" },
  ] },
  { mnemonic: "mul", forms: [
    { syntax: "mul $t1,$t2,$t3", description: "Multiplication without overflow  : Set HI to high-order 32 bits, LO and $t1 to low-order 32 bits of the product of $t2 and $t3 (use mfhi to access HI, mflo to access LO)" },
  ] },
  { mnemonic: "madd", forms: [
    { syntax: "madd $t1,$t2", description: "Multiply add : Multiply $t1 by $t2 then increment HI by high-order 32 bits of product, increment LO by low-order 32 bits of product (use mfhi to access HI, mflo to access LO)" },
  ] },
  { mnemonic: "maddu", forms: [
    { syntax: "maddu $t1,$t2", description: "Multiply add unsigned : Multiply $t1 by $t2 then increment HI by high-order 32 bits of product, increment LO by low-order 32 bits of product, unsigned (use mfhi to access HI, mflo to access LO)" },
  ] },
  { mnemonic: "msub", forms: [
    { syntax: "msub $t1,$t2", description: "Multiply subtract : Multiply $t1 by $t2 then decrement HI by high-order 32 bits of product, decrement LO by low-order 32 bits of product (use mfhi to access HI, mflo to access LO)" },
  ] },
  { mnemonic: "msubu", forms: [
    { syntax: "msubu $t1,$t2", description: "Multiply subtract unsigned : Multiply $t1 by $t2 then decrement HI by high-order 32 bits of product, decement LO by low-order 32 bits of product, unsigned (use mfhi to access HI, mflo to access LO)" },
  ] },
  { mnemonic: "div", forms: [
    { syntax: "div $t1,$t2", description: "Division with overflow : Divide $t1 by $t2 then set LO to quotient and HI to remainder (use mfhi to access HI, mflo to access LO)" },
  ] },
  { mnemonic: "divu", forms: [
    { syntax: "divu $t1,$t2", description: "Division unsigned without overflow : Divide unsigned $t1 by $t2 then set LO to quotient and HI to remainder (use mfhi to access HI, mflo to access LO)" },
  ] },
  { mnemonic: "mfhi", forms: [
    { syntax: "mfhi $t1", description: "Move from HI register : Set $t1 to contents of HI (see multiply and divide operations)" },
  ] },
  { mnemonic: "mflo", forms: [
    { syntax: "mflo $t1", description: "Move from LO register : Set $t1 to contents of LO (see multiply and divide operations)" },
  ] },
  { mnemonic: "mthi", forms: [
    { syntax: "mthi $t1", description: "Move to HI registerr : Set HI to contents of $t1 (see multiply and divide operations)" },
  ] },
  { mnemonic: "mtlo", forms: [
    { syntax: "mtlo $t1", description: "Move to LO register : Set LO to contents of $t1 (see multiply and divide operations)" },
  ] },
  { mnemonic: "and", forms: [
    { syntax: "and $t1,$t2,$t3", description: "Bitwise AND : Set $t1 to bitwise AND of $t2 and $t3" },
  ] },
  { mnemonic: "or", forms: [
    { syntax: "or $t1,$t2,$t3", description: "Bitwise OR : Set $t1 to bitwise OR of $t2 and $t3" },
  ] },
  { mnemonic: "andi", forms: [
    { syntax: "andi $t1,$t2,100", description: "Bitwise AND immediate : Set $t1 to bitwise AND of $t2 and zero-extended 16-bit immediate" },
  ] },
  { mnemonic: "ori", forms: [
    { syntax: "ori $t1,$t2,100", description: "Bitwise OR immediate : Set $t1 to bitwise OR of $t2 and zero-extended 16-bit immediate" },
  ] },
  { mnemonic: "nor", forms: [
    { syntax: "nor $t1,$t2,$t3", description: "Bitwise NOR : Set $t1 to bitwise NOR of $t2 and $t3" },
  ] },
  { mnemonic: "xor", forms: [
    { syntax: "xor $t1,$t2,$t3", description: "Bitwise XOR (exclusive OR) : Set $t1 to bitwise XOR of $t2 and $t3" },
  ] },
  { mnemonic: "xori", forms: [
    { syntax: "xori $t1,$t2,100", description: "Bitwise XOR immediate : Set $t1 to bitwise XOR of $t2 and zero-extended 16-bit immediate" },
  ] },
  { mnemonic: "sll", forms: [
    { syntax: "sll $t1,$t2,10", description: "Shift left logical : Set $t1 to result of shifting $t2 left by number of bits specified by immediate" },
  ] },
  { mnemonic: "sllv", forms: [
    { syntax: "sllv $t1,$t2,$t3", description: "Shift left logical variable : Set $t1 to result of shifting $t2 left by number of bits specified by value in low-order 5 bits of $t3" },
  ] },
  { mnemonic: "srl", forms: [
    { syntax: "srl $t1,$t2,10", description: "Shift right logical : Set $t1 to result of shifting $t2 right by number of bits specified by immediate" },
  ] },
  { mnemonic: "sra", forms: [
    { syntax: "sra $t1,$t2,10", description: "Shift right arithmetic : Set $t1 to result of sign-extended shifting $t2 right by number of bits specified by immediate" },
  ] },
  { mnemonic: "srav", forms: [
    { syntax: "srav $t1,$t2,$t3", description: "Shift right arithmetic variable : Set $t1 to result of sign-extended shifting $t2 right by number of bits specified by value in low-order 5 bits of $t3" },
  ] },
  { mnemonic: "srlv", forms: [
    { syntax: "srlv $t1,$t2,$t3", description: "Shift right logical variable : Set $t1 to result of shifting $t2 right by number of bits specified by value in low-order 5 bits of $t3" },
  ] },
  { mnemonic: "lw", forms: [
    { syntax: "lw $t1,-100($t2)", description: "Load word : Set $t1 to contents of effective memory word address" },
  ] },
  { mnemonic: "ll", forms: [
    { syntax: "ll $t1,-100($t2)", description: "Load linked : Paired with Store Conditional (sc) to perform atomic read-modify-write.  Treated as equivalent to Load Word (lw) because MARS does not simulate multiple processors." },
  ] },
  { mnemonic: "lwl", forms: [
    { syntax: "lwl $t1,-100($t2)", description: "Load word left : Load from 1 to 4 bytes left-justified into $t1, starting with effective memory byte address and continuing through the low-order byte of its word" },
  ] },
  { mnemonic: "lwr", forms: [
    { syntax: "lwr $t1,-100($t2)", description: "Load word right : Load from 1 to 4 bytes right-justified into $t1, starting with effective memory byte address and continuing through the high-order byte of its word" },
  ] },
  { mnemonic: "sw", forms: [
    { syntax: "sw $t1,-100($t2)", description: "Store word : Store contents of $t1 into effective memory word address" },
  ] },
  { mnemonic: "sc", forms: [
    { syntax: "sc $t1,-100($t2)", description: "Store conditional : Paired with Load Linked (ll) to perform atomic read-modify-write.  Stores $t1 value into effective address, then sets $t1 to 1 for success.  Always succeeds because MARS does not simulate multiple processors." },
  ] },
  { mnemonic: "swl", forms: [
    { syntax: "swl $t1,-100($t2)", description: "Store word left : Store high-order 1 to 4 bytes of $t1 into memory, starting with effective byte address and continuing through the low-order byte of its word" },
  ] },
  { mnemonic: "swr", forms: [
    { syntax: "swr $t1,-100($t2)", description: "Store word right : Store low-order 1 to 4 bytes of $t1 into memory, starting with high-order byte of word containing effective byte address and continuing through that byte address" },
  ] },
  { mnemonic: "lui", forms: [
    { syntax: "lui $t1,100", description: "Load upper immediate : Set high-order 16 bits of $t1 to 16-bit immediate and low-order 16 bits to 0" },
  ] },
  { mnemonic: "beq", forms: [
    { syntax: "beq $t1,$t2,label", description: "Branch if equal : Branch to statement at label's address if $t1 and $t2 are equal" },
  ] },
  { mnemonic: "bne", forms: [
    { syntax: "bne $t1,$t2,label", description: "Branch if not equal : Branch to statement at label's address if $t1 and $t2 are not equal" },
  ] },
  { mnemonic: "bgez", forms: [
    { syntax: "bgez $t1,label", description: "Branch if greater than or equal to zero : Branch to statement at label's address if $t1 is greater than or equal to zero" },
  ] },
  { mnemonic: "bgezal", forms: [
    { syntax: "bgezal $t1,label", description: "Branch if greater then or equal to zero and link : If $t1 is greater than or equal to zero, then set $ra to the Program Counter and branch to statement at label's address" },
  ] },
  { mnemonic: "bgtz", forms: [
    { syntax: "bgtz $t1,label", description: "Branch if greater than zero : Branch to statement at label's address if $t1 is greater than zero" },
  ] },
  { mnemonic: "blez", forms: [
    { syntax: "blez $t1,label", description: "Branch if less than or equal to zero : Branch to statement at label's address if $t1 is less than or equal to zero" },
  ] },
  { mnemonic: "bltz", forms: [
    { syntax: "bltz $t1,label", description: "Branch if less than zero : Branch to statement at label's address if $t1 is less than zero" },
  ] },
  { mnemonic: "bltzal", forms: [
    { syntax: "bltzal $t1,label", description: "Branch if less than zero and link : If $t1 is less than or equal to zero, then set $ra to the Program Counter and branch to statement at label's address" },
  ] },
  { mnemonic: "slt", forms: [
    { syntax: "slt $t1,$t2,$t3", description: "Set less than : If $t2 is less than $t3, then set $t1 to 1 else set $t1 to 0" },
  ] },
  { mnemonic: "sltu", forms: [
    { syntax: "sltu $t1,$t2,$t3", description: "Set less than unsigned : If $t2 is less than $t3 using unsigned comparision, then set $t1 to 1 else set $t1 to 0" },
  ] },
  { mnemonic: "slti", forms: [
    { syntax: "slti $t1,$t2,-100", description: "Set less than immediate : If $t2 is less than sign-extended 16-bit immediate, then set $t1 to 1 else set $t1 to 0" },
  ] },
  { mnemonic: "sltiu", forms: [
    { syntax: "sltiu $t1,$t2,-100", description: "Set less than immediate unsigned : If $t2 is less than  sign-extended 16-bit immediate using unsigned comparison, then set $t1 to 1 else set $t1 to 0" },
  ] },
  { mnemonic: "movn", forms: [
    { syntax: "movn $t1,$t2,$t3", description: "Move conditional not zero : Set $t1 to $t2 if $t3 is not zero" },
  ] },
  { mnemonic: "movz", forms: [
    { syntax: "movz $t1,$t2,$t3", description: "Move conditional zero : Set $t1 to $t2 if $t3 is zero" },
  ] },
  { mnemonic: "movf", forms: [
    { syntax: "movf $t1,$t2", description: "Move if FP condition flag 0 false : Set $t1 to $t2 if FPU (Coprocessor 1) condition flag 0 is false (zero)" },
    { syntax: "movf $t1,$t2,1", description: "Move if specified FP condition flag false : Set $t1 to $t2 if FPU (Coprocessor 1) condition flag specified by the immediate is false (zero)" },
  ] },
  { mnemonic: "movt", forms: [
    { syntax: "movt $t1,$t2", description: "Move if FP condition flag 0 true : Set $t1 to $t2 if FPU (Coprocessor 1) condition flag 0 is true (one)" },
    { syntax: "movt $t1,$t2,1", description: "Move if specfied FP condition flag true : Set $t1 to $t2 if FPU (Coprocessor 1) condition flag specified by the immediate is true (one)" },
  ] },
  { mnemonic: "break", forms: [
    { syntax: "break 100", description: "Break execution with code : Terminate program execution with specified exception code" },
    { syntax: "break", description: "Break execution : Terminate program execution with exception" },
  ] },
  { mnemonic: "syscall", forms: [
    { syntax: "syscall", description: "Issue a system call : Execute the system call specified by value in $v0" },
  ] },
  { mnemonic: "j", forms: [
    { syntax: "j target", description: "Jump unconditionally : Jump to statement at target address" },
  ] },
  { mnemonic: "jr", forms: [
    { syntax: "jr $t1", description: "Jump register unconditionally : Jump to statement whose address is in $t1" },
  ] },
  { mnemonic: "jal", forms: [
    { syntax: "jal target", description: "Jump and link : Set $ra to Program Counter (return address) then jump to statement at target address" },
  ] },
  { mnemonic: "jalr", forms: [
    { syntax: "jalr $t1,$t2", description: "Jump and link register : Set $t1 to Program Counter (return address) then jump to statement whose address is in $t2" },
    { syntax: "jalr $t1", description: "Jump and link register : Set $ra to Program Counter (return address) then jump to statement whose address is in $t1" },
  ] },
  { mnemonic: "lb", forms: [
    { syntax: "lb $t1,-100($t2)", description: "Load byte : Set $t1 to sign-extended 8-bit value from effective memory byte address" },
  ] },
  { mnemonic: "lh", forms: [
    { syntax: "lh $t1,-100($t2)", description: "Load halfword : Set $t1 to sign-extended 16-bit value from effective memory halfword address" },
  ] },
  { mnemonic: "lhu", forms: [
    { syntax: "lhu $t1,-100($t2)", description: "Load halfword unsigned : Set $t1 to zero-extended 16-bit value from effective memory halfword address" },
  ] },
  { mnemonic: "lbu", forms: [
    { syntax: "lbu $t1,-100($t2)", description: "Load byte unsigned : Set $t1 to zero-extended 8-bit value from effective memory byte address" },
  ] },
  { mnemonic: "sb", forms: [
    { syntax: "sb $t1,-100($t2)", description: "Store byte : Store the low-order 8 bits of $t1 into the effective memory byte address" },
  ] },
  { mnemonic: "sh", forms: [
    { syntax: "sh $t1,-100($t2)", description: "Store halfword : Store the low-order 16 bits of $t1 into the effective memory halfword address" },
  ] },
  { mnemonic: "clo", forms: [
    { syntax: "clo $t1,$t2", description: "Count number of leading ones : Set $t1 to the count of leading one bits in $t2 starting at most significant bit position" },
  ] },
  { mnemonic: "clz", forms: [
    { syntax: "clz $t1,$t2", description: "Count number of leading zeroes : Set $t1 to the count of leading zero bits in $t2 starting at most significant bit positio" },
  ] },
  { mnemonic: "mfc0", forms: [
    { syntax: "mfc0 $t1,$8", description: "Move from Coprocessor 0 : Set $t1 to the value stored in Coprocessor 0 register $8" },
  ] },
  { mnemonic: "mtc0", forms: [
    { syntax: "mtc0 $t1,$8", description: "Move to Coprocessor 0 : Set Coprocessor 0 register $8 to value stored in $t1" },
  ] },
  { mnemonic: "add.s", forms: [
    { syntax: "add.s $f0,$f1,$f3", description: "Floating point addition single precision : Set $f0 to single-precision floating point value of $f1 plus $f3" },
  ] },
  { mnemonic: "sub.s", forms: [
    { syntax: "sub.s $f0,$f1,$f3", description: "Floating point subtraction single precision : Set $f0 to single-precision floating point value of $f1  minus $f3" },
  ] },
  { mnemonic: "mul.s", forms: [
    { syntax: "mul.s $f0,$f1,$f3", description: "Floating point multiplication single precision : Set $f0 to single-precision floating point value of $f1 times $f3" },
  ] },
  { mnemonic: "div.s", forms: [
    { syntax: "div.s $f0,$f1,$f3", description: "Floating point division single precision : Set $f0 to single-precision floating point value of $f1 divided by $f3" },
  ] },
  { mnemonic: "sqrt.s", forms: [
    { syntax: "sqrt.s $f0,$f1", description: "Square root single precision : Set $f0 to single-precision floating point square root of $f1" },
  ] },
  { mnemonic: "floor.w.s", forms: [
    { syntax: "floor.w.s $f0,$f1", description: "Floor single precision to word : Set $f0 to 32-bit integer floor of single-precision float in $f1" },
  ] },
  { mnemonic: "ceil.w.s", forms: [
    { syntax: "ceil.w.s $f0,$f1", description: "Ceiling single precision to word : Set $f0 to 32-bit integer ceiling of single-precision float in $f1" },
  ] },
  { mnemonic: "round.w.s", forms: [
    { syntax: "round.w.s $f0,$f1", description: "Round single precision to word : Set $f0 to 32-bit integer round of single-precision float in $f1" },
  ] },
  { mnemonic: "trunc.w.s", forms: [
    { syntax: "trunc.w.s $f0,$f1", description: "Truncate single precision to word : Set $f0 to 32-bit integer truncation of single-precision float in $f1" },
  ] },
  { mnemonic: "add.d", forms: [
    { syntax: "add.d $f2,$f4,$f6", description: "Floating point addition double precision : Set $f2 to double-precision floating point value of $f4 plus $f6" },
  ] },
  { mnemonic: "sub.d", forms: [
    { syntax: "sub.d $f2,$f4,$f6", description: "Floating point subtraction double precision : Set $f2 to double-precision floating point value of $f4 minus $f6" },
  ] },
  { mnemonic: "mul.d", forms: [
    { syntax: "mul.d $f2,$f4,$f6", description: "Floating point multiplication double precision : Set $f2 to double-precision floating point value of $f4 times $f6" },
  ] },
  { mnemonic: "div.d", forms: [
    { syntax: "div.d $f2,$f4,$f6", description: "Floating point division double precision : Set $f2 to double-precision floating point value of $f4 divided by $f6" },
  ] },
  { mnemonic: "sqrt.d", forms: [
    { syntax: "sqrt.d $f2,$f4", description: "Square root double precision : Set $f2 to double-precision floating point square root of $f4" },
  ] },
  { mnemonic: "floor.w.d", forms: [
    { syntax: "floor.w.d $f1,$f2", description: "Floor double precision to word : Set $f1 to 32-bit integer floor of double-precision float in $f2" },
  ] },
  { mnemonic: "ceil.w.d", forms: [
    { syntax: "ceil.w.d $f1,$f2", description: "Ceiling double precision to word : Set $f1 to 32-bit integer ceiling of double-precision float in $f2" },
  ] },
  { mnemonic: "round.w.d", forms: [
    { syntax: "round.w.d $f1,$f2", description: "Round double precision to word : Set $f1 to 32-bit integer round of double-precision float in $f2" },
  ] },
  { mnemonic: "trunc.w.d", forms: [
    { syntax: "trunc.w.d $f1,$f2", description: "Truncate double precision to word : Set $f1 to 32-bit integer truncation of double-precision float in $f2" },
  ] },
  { mnemonic: "bc1t", forms: [
    { syntax: "bc1t label", description: "Branch if FP condition flag 0 true (BC1T, not BCLT) : If Coprocessor 1 condition flag 0 is true (one) then branch to statement at label's address" },
    { syntax: "bc1t 1,label", description: "Branch if specified FP condition flag true (BC1T, not BCLT) : If Coprocessor 1 condition flag specified by immediate is true (one) then branch to statement at label's address" },
  ] },
  { mnemonic: "bc1f", forms: [
    { syntax: "bc1f label", description: "Branch if FP condition flag 0 false (BC1F, not BCLF) : If Coprocessor 1 condition flag 0 is false (zero) then branch to statement at label's address" },
    { syntax: "bc1f 1,label", description: "Branch if specified FP condition flag false (BC1F, not BCLF) : If Coprocessor 1 condition flag specified by immediate is false (zero) then branch to statement at label's address" },
  ] },
  { mnemonic: "c.eq.s", forms: [
    { syntax: "c.eq.s $f0,$f1", description: "Compare equal single precision : If $f0 is equal to $f1, set Coprocessor 1 condition flag 0 true else set it false" },
    { syntax: "c.eq.s 1,$f0,$f1", description: "Compare equal single precision : If $f0 is equal to $f1, set Coprocessor 1 condition flag specied by immediate to true else set it to false" },
  ] },
  { mnemonic: "c.le.s", forms: [
    { syntax: "c.le.s $f0,$f1", description: "Compare less or equal single precision : If $f0 is less than or equal to $f1, set Coprocessor 1 condition flag 0 true else set it false" },
    { syntax: "c.le.s 1,$f0,$f1", description: "Compare less or equal single precision : If $f0 is less than or equal to $f1, set Coprocessor 1 condition flag specified by immediate to true else set it to false" },
  ] },
  { mnemonic: "c.lt.s", forms: [
    { syntax: "c.lt.s $f0,$f1", description: "Compare less than single precision : If $f0 is less than $f1, set Coprocessor 1 condition flag 0 true else set it false" },
    { syntax: "c.lt.s 1,$f0,$f1", description: "Compare less than single precision : If $f0 is less than $f1, set Coprocessor 1 condition flag specified by immediate to true else set it to false" },
  ] },
  { mnemonic: "c.eq.d", forms: [
    { syntax: "c.eq.d $f2,$f4", description: "Compare equal double precision : If $f2 is equal to $f4 (double-precision), set Coprocessor 1 condition flag 0 true else set it false" },
    { syntax: "c.eq.d 1,$f2,$f4", description: "Compare equal double precision : If $f2 is equal to $f4 (double-precision), set Coprocessor 1 condition flag specified by immediate to true else set it to false" },
  ] },
  { mnemonic: "c.le.d", forms: [
    { syntax: "c.le.d $f2,$f4", description: "Compare less or equal double precision : If $f2 is less than or equal to $f4 (double-precision), set Coprocessor 1 condition flag 0 true else set it false" },
    { syntax: "c.le.d 1,$f2,$f4", description: "Compare less or equal double precision : If $f2 is less than or equal to $f4 (double-precision), set Coprocessor 1 condition flag specfied by immediate true else set it false" },
  ] },
  { mnemonic: "c.lt.d", forms: [
    { syntax: "c.lt.d $f2,$f4", description: "Compare less than double precision : If $f2 is less than $f4 (double-precision), set Coprocessor 1 condition flag 0 true else set it false" },
    { syntax: "c.lt.d 1,$f2,$f4", description: "Compare less than double precision : If $f2 is less than $f4 (double-precision), set Coprocessor 1 condition flag specified by immediate to true else set it to false" },
  ] },
  { mnemonic: "abs.s", forms: [
    { syntax: "abs.s $f0,$f1", description: "Floating point absolute value single precision : Set $f0 to absolute value of $f1, single precision" },
  ] },
  { mnemonic: "abs.d", forms: [
    { syntax: "abs.d $f2,$f4", description: "Floating point absolute value double precision : Set $f2 to absolute value of $f4, double precision" },
  ] },
  { mnemonic: "cvt.d.s", forms: [
    { syntax: "cvt.d.s $f2,$f1", description: "Convert from single precision to double precision : Set $f2 to double precision equivalent of single precision value in $f1" },
  ] },
  { mnemonic: "cvt.d.w", forms: [
    { syntax: "cvt.d.w $f2,$f1", description: "Convert from word to double precision : Set $f2 to double precision equivalent of 32-bit integer value in $f1" },
  ] },
  { mnemonic: "cvt.s.d", forms: [
    { syntax: "cvt.s.d $f1,$f2", description: "Convert from double precision to single precision : Set $f1 to single precision equivalent of double precision value in $f2" },
  ] },
  { mnemonic: "cvt.s.w", forms: [
    { syntax: "cvt.s.w $f0,$f1", description: "Convert from word to single precision : Set $f0 to single precision equivalent of 32-bit integer value in $f2" },
  ] },
  { mnemonic: "cvt.w.d", forms: [
    { syntax: "cvt.w.d $f1,$f2", description: "Convert from double precision to word : Set $f1 to 32-bit integer equivalent of double precision value in $f2" },
  ] },
  { mnemonic: "cvt.w.s", forms: [
    { syntax: "cvt.w.s $f0,$f1", description: "Convert from single precision to word : Set $f0 to 32-bit integer equivalent of single precision value in $f1" },
  ] },
  { mnemonic: "mov.d", forms: [
    { syntax: "mov.d $f2,$f4", description: "Move floating point double precision : Set double precision $f2 to double precision value in $f4" },
  ] },
  { mnemonic: "movf.d", forms: [
    { syntax: "movf.d $f2,$f4", description: "Move floating point double precision : If condition flag 0 false, set double precision $f2 to double precision value in $f4" },
    { syntax: "movf.d $f2,$f4,1", description: "Move floating point double precision : If condition flag specified by immediate is false, set double precision $f2 to double precision value in $f4" },
  ] },
  { mnemonic: "movt.d", forms: [
    { syntax: "movt.d $f2,$f4", description: "Move floating point double precision : If condition flag 0 true, set double precision $f2 to double precision value in $f4" },
    { syntax: "movt.d $f2,$f4,1", description: "Move floating point double precision : If condition flag specified by immediate is true, set double precision $f2 to double precision value in $f4e" },
  ] },
  { mnemonic: "movn.d", forms: [
    { syntax: "movn.d $f2,$f4,$t3", description: "Move floating point double precision : If $t3 is not zero, set double precision $f2 to double precision value in $f4" },
  ] },
  { mnemonic: "movz.d", forms: [
    { syntax: "movz.d $f2,$f4,$t3", description: "Move floating point double precision : If $t3 is zero, set double precision $f2 to double precision value in $f4" },
  ] },
  { mnemonic: "mov.s", forms: [
    { syntax: "mov.s $f0,$f1", description: "Move floating point single precision : Set single precision $f0 to single precision value in $f1" },
  ] },
  { mnemonic: "movf.s", forms: [
    { syntax: "movf.s $f0,$f1", description: "Move floating point single precision : If condition flag 0 is false, set single precision $f0 to single precision value in $f1" },
    { syntax: "movf.s $f0,$f1,1", description: "Move floating point single precision : If condition flag specified by immediate is false, set single precision $f0 to single precision value in $f1e" },
  ] },
  { mnemonic: "movt.s", forms: [
    { syntax: "movt.s $f0,$f1", description: "Move floating point single precision : If condition flag 0 is true, set single precision $f0 to single precision value in $f1e" },
    { syntax: "movt.s $f0,$f1,1", description: "Move floating point single precision : If condition flag specified by immediate is true, set single precision $f0 to single precision value in $f1e" },
  ] },
  { mnemonic: "movn.s", forms: [
    { syntax: "movn.s $f0,$f1,$t3", description: "Move floating point single precision : If $t3 is not zero, set single precision $f0 to single precision value in $f1" },
  ] },
  { mnemonic: "movz.s", forms: [
    { syntax: "movz.s $f0,$f1,$t3", description: "Move floating point single precision : If $t3 is zero, set single precision $f0 to single precision value in $f1" },
  ] },
  { mnemonic: "mfc1", forms: [
    { syntax: "mfc1 $t1,$f1", description: "Move from Coprocessor 1 (FPU) : Set $t1 to value in Coprocessor 1 register $f1" },
  ] },
  { mnemonic: "mtc1", forms: [
    { syntax: "mtc1 $t1,$f1", description: "Move to Coprocessor 1 (FPU) : Set Coprocessor 1 register $f1 to value in $t1" },
  ] },
  { mnemonic: "neg.d", forms: [
    { syntax: "neg.d $f2,$f4", description: "Floating point negate double precision : Set double precision $f2 to negation of double precision value in $f4" },
  ] },
  { mnemonic: "neg.s", forms: [
    { syntax: "neg.s $f0,$f1", description: "Floating point negate single precision : Set single precision $f0 to negation of single precision value in $f1" },
  ] },
  { mnemonic: "lwc1", forms: [
    { syntax: "lwc1 $f1,-100($t2)", description: "Load word into Coprocessor 1 (FPU) : Set $f1 to 32-bit value from effective memory word address" },
  ] },
  { mnemonic: "ldc1", forms: [
    { syntax: "ldc1 $f2,-100($t2)", description: "Load double word Coprocessor 1 (FPU)) : Set $f2 to 64-bit value from effective memory doubleword address" },
  ] },
  { mnemonic: "swc1", forms: [
    { syntax: "swc1 $f1,-100($t2)", description: "Store word from Coprocesor 1 (FPU) : Store 32 bit value in $f1 to effective memory word address" },
  ] },
  { mnemonic: "sdc1", forms: [
    { syntax: "sdc1 $f2,-100($t2)", description: "Store double word from Coprocessor 1 (FPU)) : Store 64 bit value in $f2 to effective memory doubleword address" },
  ] },
  { mnemonic: "teq", forms: [
    { syntax: "teq $t1,$t2", description: "Trap if equal : Trap if $t1 is equal to $t2" },
  ] },
  { mnemonic: "teqi", forms: [
    { syntax: "teqi $t1,-100", description: "Trap if equal to immediate : Trap if $t1 is equal to sign-extended 16 bit immediate" },
  ] },
  { mnemonic: "tne", forms: [
    { syntax: "tne $t1,$t2", description: "Trap if not equal : Trap if $t1 is not equal to $t2" },
  ] },
  { mnemonic: "tnei", forms: [
    { syntax: "tnei $t1,-100", description: "Trap if not equal to immediate : Trap if $t1 is not equal to sign-extended 16 bit immediate" },
  ] },
  { mnemonic: "tge", forms: [
    { syntax: "tge $t1,$t2", description: "Trap if greater or equal : Trap if $t1 is greater than or equal to $t2" },
  ] },
  { mnemonic: "tgeu", forms: [
    { syntax: "tgeu $t1,$t2", description: "Trap if greater or equal unsigned : Trap if $t1 is greater than or equal to $t2 using unsigned comparision" },
  ] },
  { mnemonic: "tgei", forms: [
    { syntax: "tgei $t1,-100", description: "Trap if greater than or equal to immediate : Trap if $t1 greater than or equal to sign-extended 16 bit immediate" },
  ] },
  { mnemonic: "tgeiu", forms: [
    { syntax: "tgeiu $t1,-100", description: "Trap if greater or equal to immediate unsigned : Trap if $t1 greater than or equal to sign-extended 16 bit immediate, unsigned comparison" },
  ] },
  { mnemonic: "tlt", forms: [
    { syntax: "tlt $t1,$t2", description: "Trap if less than: Trap if $t1 less than $t2" },
  ] },
  { mnemonic: "tltu", forms: [
    { syntax: "tltu $t1,$t2", description: "Trap if less than unsigned : Trap if $t1 less than $t2, unsigned comparison" },
  ] },
  { mnemonic: "tlti", forms: [
    { syntax: "tlti $t1,-100", description: "Trap if less than immediate : Trap if $t1 less than sign-extended 16-bit immediate" },
  ] },
  { mnemonic: "tltiu", forms: [
    { syntax: "tltiu $t1,-100", description: "Trap if less than immediate unsigned : Trap if $t1 less than sign-extended 16-bit immediate, unsigned comparison" },
  ] },
  { mnemonic: "eret", forms: [
    { syntax: "eret", description: "Exception return : Set Program Counter to Coprocessor 0 EPC register value, set Coprocessor Status register bit 1 (exception level) to zero" },
  ] },
];
