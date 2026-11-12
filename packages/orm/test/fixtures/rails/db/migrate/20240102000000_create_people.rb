class CreatePeople < ActiveRecord::Migration[7.1]
  def change
    create_table :people, id: false do |t|
      t.primary_key :code, :string
      t.belongs_to :user, foreign_key: { to_table: :users }
      t.text :bio
      t.timestamps
    end
    add_column :users, :age, :integer, null: true
    add_reference :line_items, :person, foreign_key: true, type: :string
    create_join_table :users, :people
  end
end
