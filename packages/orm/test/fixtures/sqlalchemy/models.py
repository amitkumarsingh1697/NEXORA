from typing import Optional
from sqlalchemy import Column, ForeignKey, Integer, String, Table, MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
metadata = MetaData()


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    nickname: Mapped[Optional[str]]
    posts: Mapped[list["Post"]] = relationship(back_populates="author")


class Post(Base):
    __tablename__ = "posts"
    id = Column(Integer, primary_key=True)
    author_id = Column("author", Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, server_default="")


class AuditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    message = db.Column(db.String(200), nullable=False)


tags = Table(
    "tags",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("post_id", ForeignKey("posts.id")),
)
