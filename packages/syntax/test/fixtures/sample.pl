package App::Cart;
use strict;
use parent 'App::Base';
use List::Util qw(sum);
require App::Store;
our @ISA = ('App::Thing');
sub new { my ($class, %args) = @_; return bless {}, $class; }
sub total { my ($self, $x) = @_; my $s = App::Store->new(); $s->save($x); return sum(@_) + helper($x); }
1;
