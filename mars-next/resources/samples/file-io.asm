# File I/O sample using syscalls 13-16.

.data
filepath: .asciiz "baseline-file.txt"
message: .asciiz "File I/O sample\n"
message_end:
buffer: .space 64

.text
main:
    # open for write (flag 1)
    la $a0, filepath
    li $a1, 1
    li $a2, 0
    li $v0, 13
    syscall
    move $s0, $v0

    # write the message
    move $a0, $s0
    la $a1, message
    li $a2, 16
    li $v0, 15
    syscall

    # close
    move $a0, $s0
    li $v0, 16
    syscall

    # reopen for read (flag 0)
    la $a0, filepath
    li $a1, 0
    li $a2, 0
    li $v0, 13
    syscall
    move $s1, $v0

    # read into buffer
    move $a0, $s1
    la $a1, buffer
    li $a2, 64
    li $v0, 14
    syscall
    move $t0, $v0        # bytes read

    # null-terminate at buffer + bytes_read
    la $t1, buffer
    add $t1, $t1, $t0
    sb $zero, 0($t1)

    # echo buffer
    li $v0, 4
    la $a0, buffer
    syscall

    li $v0, 10
    syscall
