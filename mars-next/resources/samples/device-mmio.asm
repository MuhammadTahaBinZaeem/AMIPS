# MMIO sample touching UART-style display and bitmap display buffers.

.text
main:
    # Prime display control and write 'A' to the data register.
    lui $t4, 0xffff
    ori $t4, $t4, 0x0008      # display base (control at 0, data at 4)
    li $t0, 0x1
    sw $t0, 0($t4)
    li $t2, 0x41
    sw $t2, 4($t4)

    # Paint first pixel of bitmap display red (ARGB: 0x00FF0000) and flush.
    lui $t5, 0xffff
    ori $t5, $t5, 0x1000      # bitmap base (control block then framebuffer)
    li $t6, 0x00FF0000
    sw $t6, 16($t5)           # framebuffer starts at offset 16
    li $t7, 1
    sw $t7, 12($t5)           # write to flush register

    li $v0, 10
    syscall
