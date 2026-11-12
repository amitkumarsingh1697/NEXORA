ActiveRecord::Schema[7.1].define(version: 2024_01_01_000000) do
  enable_extension "plpgsql"

  create_table "users", force: :cascade do |t|
    t.string "email", limit: 254, null: false
    t.string "name"
    t.decimal "balance", precision: 10, scale: 2, default: "0.0"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
  end

  create_table "line_items", id: :uuid, force: :cascade do |t|
    t.references "user", null: false, foreign_key: true
    t.integer "quantity", default: 1
  end

  add_foreign_key "line_items", "users"
end
