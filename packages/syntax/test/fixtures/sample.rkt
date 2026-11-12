#lang racket
(require "cart.rkt" racket/list)
(provide run)
(define (run x [y 2]) (helper x) (send obj save x))
(define shape% (class object% (super-new) (define/public (area) 1)))
(struct point (x y))
