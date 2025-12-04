# Exercises console syscalls: print_string, read_int, print_int, print_hex, print_char.

.data
prompt: .asciiz "Enter a value: "
newline: .asciiz "\n"

.text
main:
    # prompt
    li $v0, 4
    la $a0, prompt
    syscall

    # read_int
    li $v0, 5
    syscall
    move $t0, $v0       # save input

    # echo in decimal
    move $a0, $t0
    li $v0, 1
    syscall

    # newline
    li $v0, 4
    la $a0, newline
    syscall

    # echo in hex
    move $a0, $t0
    li $v0, 34          # print_int_hex
    syscall

    # newline
    li $v0, 4
    la $a0, newline
    syscall

    # echo last byte as char
    andi $a0, $t0, 0xFF
    li $v0, 11          # print_char
    syscall

    li $v0, 10
    syscall
