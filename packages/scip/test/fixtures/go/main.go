package main

import (
	"fmt"

	"example.com/store/store"
)

func main() {
	s := &store.Store{}
	s.Add("a")
	fmt.Println(s.Count())
}
