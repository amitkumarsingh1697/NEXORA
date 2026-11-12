defmodule MyApp.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  schema "users" do
    field :email, :string
    field :age, :integer, default: 0
    field :password, :string, virtual: true
    belongs_to :org, MyApp.Org
    has_many :posts, MyApp.Post
    many_to_many :roles, MyApp.Role, join_through: "users_roles"
    embeds_one :settings, MyApp.Settings
    timestamps()
  end
end

defmodule MyApp.Org do
  use Ecto.Schema
  @primary_key {:uuid, :binary_id, autogenerate: true}
  schema "orgs" do
    field :name, :string
  end
end
