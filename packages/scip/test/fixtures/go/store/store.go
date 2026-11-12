package store

import "strings"

// Item is a stored item.
type Item struct{ Name string }

// Store keeps items.
type Store struct{ items []Item }

// Add stores an item under its upper-cased name.
func (s *Store) Add(name string) {
	s.items = append(s.items, Item{Name: strings.ToUpper(name)})
}

// Count returns how many items are stored.
func (s *Store) Count() int { return len(s.items) }
