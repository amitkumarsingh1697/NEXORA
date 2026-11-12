library(dplyr)
require("tidyr")
source("helpers.R")
run <- function(x, y = 2, ...) {
  z <- helper(x)
  dplyr::filter(z, y > 1)
}
Person <- setRefClass("Person", fields = list(name = "character"), methods = list(greet = function() cat(name)))
setClass("Shape", representation("VIRTUAL"))
setGeneric("area", function(obj) standardGeneric("area"))
setMethod("area", "Circle", function(obj) pi)
f = function(a) a + 1
