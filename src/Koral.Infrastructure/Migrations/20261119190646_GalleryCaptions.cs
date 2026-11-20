using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Koral.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class GalleryCaptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CaptionAr",
                table: "Gallery",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CaptionEn",
                table: "Gallery",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CaptionAr",
                table: "Gallery");

            migrationBuilder.DropColumn(
                name: "CaptionEn",
                table: "Gallery");
        }
    }
}
