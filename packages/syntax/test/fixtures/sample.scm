(import (scheme base) (srfi 1))
(define (run x . rest) (helper x) (display x))
(define answer 42)
(define-record-type point (make-point x y) point? (x point-x))
