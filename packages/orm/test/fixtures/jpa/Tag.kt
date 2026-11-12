package shop.model

import jakarta.persistence.*

@Entity
@Table(name = "tags")
class Tag(
    @Id @GeneratedValue val id: Long? = null,
    @Column(nullable = false, length = 40) val label: String,
    val note: String? = null,
)

object Invoices : org.jetbrains.exposed.sql.Table("invoices") {
    val id = integer("id").autoIncrement()
    val number = varchar("number", 30).uniqueIndex()
    val customerId = long("customer_id").references(Customers.id).nullable()
    override val primaryKey = PrimaryKey(id)
}

object Customers : LongIdTable("customers") {
    val email = varchar("email", 254)
}
