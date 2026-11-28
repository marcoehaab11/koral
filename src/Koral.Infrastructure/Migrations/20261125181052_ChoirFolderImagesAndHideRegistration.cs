using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Koral.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ChoirFolderImagesAndHideRegistration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                EXEC(N'UPDATE dbo.Settings
                    SET Data = JSON_MODIFY(Data, ''$.HomeJoin'', CONVERT(bit, 0))
                    WHERE Id = 1 AND ISJSON(Data) = 1;');
                """);
            migrationBuilder.AddColumn<string>(
                name: "Image",
                table: "ChoirGroups",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Image",
                table: "ChoirGroups");
        }
    }
}
