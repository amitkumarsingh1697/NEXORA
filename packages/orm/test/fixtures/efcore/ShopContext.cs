using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Shop.Data;

public class ShopContext : DbContext
{
    public DbSet<Customer> Customers { get; set; } = null!;
    public DbSet<Order> Orders => Set<Order>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Order>().ToTable("purchase_orders");
    }
}

public class Customer
{
    public int Id { get; set; }

    [Required, MaxLength(254)]
    public string Email { get; set; } = "";

    public string? Nickname { get; set; }

    [NotMapped]
    public string Display => Email;

    public List<Order> Orders { get; set; } = new();
}

[Table("orders_v2")]
public class Order
{
    [Key]
    public Guid OrderNumber { get; set; }

    public int CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;

    [Column("total_amount", TypeName = "decimal(10,2)")]
    public decimal Total { get; set; }

    public DateTime? ShippedAt { get; set; }
}
