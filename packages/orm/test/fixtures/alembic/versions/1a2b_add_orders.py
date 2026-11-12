import sqlalchemy as sa
from alembic import op


def upgrade():
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("note", sa.String(length=50)),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.add_column("users", sa.Column("age", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_orders_users", "orders", "users", ["user_id"], ["id"])
