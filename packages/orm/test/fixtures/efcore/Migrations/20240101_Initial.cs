using Microsoft.EntityFrameworkCore.Migrations;

public partial class Initial : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "Invoices",
            columns: table => new
            {
                Id = table.Column<int>(type: "int", nullable: false)
                    .Annotation("SqlServer:Identity", "1, 1"),
                Number = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                CustomerId = table.Column<int>(type: "int", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Invoices", x => x.Id);
                table.ForeignKey(
                    name: "FK_Invoices_Customers_CustomerId",
                    column: x => x.CustomerId,
                    principalTable: "Customers",
                    principalColumn: "Id");
            });
        migrationBuilder.AddColumn<string>(
            name: "Phone",
            table: "Customers",
            type: "nvarchar(max)",
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "Invoices");
    }
}
