.include "macros.inc"
.globl main
main:
    push rbp
    call helper
    jmp .done
helper:
    mov eax, 1
    ret
.done:
    ret
