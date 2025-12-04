# Floating-point sample covering single/double operations and printing.

.data
val1: .float 1.5
val2: .float 2.25
val3: .float -4.0
valD1: .double 3.0
valD2: .double -1.25
newline: .asciiz "\n"

.text
main:
    l.s $f0, val1
    l.s $f1, val2
    add.s $f2, $f0, $f1     # 3.75

    l.s $f3, val3
    mul.s $f4, $f2, $f3     # -15.0

    l.d $f6, valD1
    l.d $f8, valD2
    add.d $f10, $f6, $f8    # 1.75

    # print results
    mov.s $f12, $f2
    li $v0, 2               # print_float
    syscall

    li $v0, 4
    la $a0, newline
    syscall

    mov.s $f12, $f4
    li $v0, 2
    syscall

    li $v0, 4
    la $a0, newline
    syscall

    mov.d $f12, $f10
    li $v0, 3               # print_double
    syscall

    li $v0, 10
    syscall
