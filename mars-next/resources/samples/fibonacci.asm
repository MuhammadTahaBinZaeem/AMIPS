# Fibonacci.asm - prints the first twelve Fibonacci numbers.
# Source: http://www.cs.missouristate.edu/MARS/ (adapted from the MARS sample program).

.data
label: .asciiz "Fibonacci numbers:\n"
newline: .asciiz "\n"

.text
main:
    li $v0, 4
    la $a0, label
    syscall

    li $t0, 0          # first number
    li $t1, 1          # second number
    li $t2, 12         # how many numbers to print

print_loop:
    move $a0, $t0
    li $v0, 1          # print_int
    syscall

    li $v0, 4
    la $a0, newline
    syscall

    add $t3, $t0, $t1  # next = previous + current
    move $t0, $t1
    move $t1, $t3

    addi $t2, $t2, -1
    bgtz $t2, print_loop

    li $v0, 10         # exit
    syscall
