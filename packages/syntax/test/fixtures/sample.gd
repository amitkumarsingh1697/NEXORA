extends Node2D
class_name Player
const Store = preload("res://store.gd")
var speed: int = 10
func _ready() -> void:
	var s = Store.new()
	s.save(speed)
	move(helper(1))
func move(dist: float, fast := false) -> int:
	return 1
class Inner extends Object:
	func run():
		pass
