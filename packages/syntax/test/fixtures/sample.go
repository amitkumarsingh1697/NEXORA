package cart

import (
	"fmt"
	st "example.com/shop/store"
)

type Item struct {
	SKU string
	Qty int
}

type Saver interface {
	Save(sku string) error
}

func (c *Cart) Add(sku string, qty int) (int, error) {
	c.check(sku)
	total := helper(qty)
	fmt.Println(sku)
	return total, nil
}

func helper(n int, rest ...string) int {
	st.Load("x")
	return n * 2
}
