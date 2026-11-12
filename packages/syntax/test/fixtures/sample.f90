module cart_mod
  use iso_fortran_env, only: int32
  implicit none
  type, extends(base) :: cart
    integer :: total
  contains
    procedure :: add => cart_add
  end type cart
contains
  function cart_add(self, x) result(r)
    class(cart), intent(in) :: self
    integer, intent(in) :: x
    integer :: r
    r = helper(x)
    call self%save(x)
  end function cart_add
  subroutine reset(c, n)
    type(cart) :: c
    integer, optional :: n
    call log_msg("x")
  end subroutine reset
end module cart_mod
program main
  use cart_mod
  call reset(c)
end program main
