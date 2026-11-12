defmodule MyApp.Repo.Migrations.CreatePosts do
  use Ecto.Migration

  def change do
    create table(:posts) do
      add :title, :string, null: false, size: 120
      add :user_id, references(:users, on_delete: :delete_all)
      timestamps(type: :utc_datetime)
    end

    alter table(:users) do
      add :bio, :text
    end

    create unique_index(:posts, [:title])
  end
end
