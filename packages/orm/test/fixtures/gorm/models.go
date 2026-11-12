package models

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Email     string  `gorm:"size:254;uniqueIndex;not null"`
	Name      *string
	APIKey    string  `gorm:"column:api_key_v2"`
	Profile   Profile `gorm:"embedded;embeddedPrefix:profile_"`
	CompanyID uint
	Company   Company
	Orders    []Order
	Ignored   string `gorm:"-"`
}

type Profile struct {
	Bio string
}

type Company struct {
	ID   int
	Name string `gorm:"default:'acme'"`
}

type Order struct {
	OrderNo  string `gorm:"primaryKey;type:varchar(20)"`
	UserID   uint
	PlacedAt time.Time
}

func (Order) TableName() string { return "purchase_orders" }

func Migrate(db *gorm.DB) error {
	return db.AutoMigrate(&User{}, &Company{}, &Order{})
}
