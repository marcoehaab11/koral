using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Koral.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AlbumChoirCatalogue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CatalogSlot",
                table: "ChoirGroups",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RecruitmentEnabled",
                table: "ChoirGroups",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "Enabled",
                table: "AlbumPlatformLink",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateIndex(
                name: "IX_ChoirGroups_CatalogSlot",
                table: "ChoirGroups",
                column: "CatalogSlot",
                unique: true,
                filter: "[CatalogSlot] IS NOT NULL");

            migrationBuilder.Sql("""
                EXEC(N'
                    INSERT INTO dbo.ChoirGroups
                        (NameEn, NameAr, Accepting, RecordingRequired, BackingAudio, BackingTitle, CatalogSlot, RecruitmentEnabled)
                    VALUES
                        (N''Senior Choir'', N''الكورال الكبير'', 0, 0, N'''', N'''', 1, 0),
                        (N''Junior Choir'', N''الكورال الصغير'', 0, 0, N'''', N'''', 2, 0);
                ');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                EXEC(N'
                    DELETE choir FROM dbo.ChoirGroups AS choir
                    WHERE choir.CatalogSlot IN (1, 2) AND choir.RecruitmentEnabled = 0
                        AND choir.NameEn IN (N''Senior Choir'', N''Junior Choir'')
                        AND choir.NameAr IN (N''الكورال الكبير'', N''الكورال الصغير'')
                        AND NOT EXISTS (SELECT 1 FROM dbo.AlbumChoirGroup WHERE GroupsId = choir.Id)
                        AND NOT EXISTS (SELECT 1 FROM dbo.ChoirApplications WHERE GroupId = choir.Id);
                ');
                """);
            migrationBuilder.DropIndex(
                name: "IX_ChoirGroups_CatalogSlot",
                table: "ChoirGroups");

            migrationBuilder.DropColumn(
                name: "CatalogSlot",
                table: "ChoirGroups");

            migrationBuilder.DropColumn(
                name: "RecruitmentEnabled",
                table: "ChoirGroups");

            migrationBuilder.DropColumn(
                name: "Enabled",
                table: "AlbumPlatformLink");
        }
    }
}
