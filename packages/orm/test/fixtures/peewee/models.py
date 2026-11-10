from peewee import Model, CharField, ForeignKeyField, SqliteDatabase

db = SqliteDatabase("app.db")


class BaseModel(Model):
    class Meta:
        database = db


class Author(BaseModel):
    name = CharField(max_length=80, unique=True)


class BookItem(BaseModel):
    title = CharField(null=True)
    author = ForeignKeyField(Author, backref="books")

    class Meta:
        table_name = "books"
