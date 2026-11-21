using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Koral.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ChoirGroupsAndAuditions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ChoirApplications_NormalizedEmail",
                table: "ChoirApplications");

            migrationBuilder.AddColumn<string>(
                name: "BackingAudio",
                table: "ChoirApplications",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "BackingTitle",
                table: "ChoirApplications",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "GroupId",
                table: "ChoirApplications",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RecordedWithBacking",
                table: "ChoirApplications",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "RecordingName",
                table: "ChoirApplications",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "RecordingType",
                table: "ChoirApplications",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "AlbumPlatformLink",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    AlbumId = table.Column<int>(type: "int", nullable: false),
                    Platform = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Url = table.Column<string>(type: "nvarchar(2048)", maxLength: 2048, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Sort = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AlbumPlatformLink", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AlbumPlatformLink_Albums_AlbumId",
                        column: x => x.AlbumId,
                        principalTable: "Albums",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ChoirGroups",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    NameEn = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    NameAr = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Accepting = table.Column<bool>(type: "bit", nullable: false),
                    RecordingRequired = table.Column<bool>(type: "bit", nullable: false),
                    BackingAudio = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BackingTitle = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChoirGroups", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AlbumChoirGroup",
                columns: table => new
                {
                    AlbumsId = table.Column<int>(type: "int", nullable: false),
                    GroupsId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AlbumChoirGroup", x => new { x.AlbumsId, x.GroupsId });
                    table.ForeignKey(
                        name: "FK_AlbumChoirGroup_Albums_AlbumsId",
                        column: x => x.AlbumsId,
                        principalTable: "Albums",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AlbumChoirGroup_ChoirGroups_GroupsId",
                        column: x => x.GroupsId,
                        principalTable: "ChoirGroups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ChoirApplications_GroupId",
                table: "ChoirApplications",
                column: "GroupId");

            migrationBuilder.CreateIndex(
                name: "IX_ChoirApplications_NormalizedEmail_GroupId",
                table: "ChoirApplications",
                columns: new[] { "NormalizedEmail", "GroupId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AlbumChoirGroup_GroupsId",
                table: "AlbumChoirGroup",
                column: "GroupsId");

            migrationBuilder.CreateIndex(
                name: "IX_AlbumPlatformLink_AlbumId",
                table: "AlbumPlatformLink",
                column: "AlbumId");

            migrationBuilder.AddForeignKey(
                name: "FK_ChoirApplications_ChoirGroups_GroupId",
                table: "ChoirApplications",
                column: "GroupId",
                principalTable: "ChoirGroups",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ChoirApplications_ChoirGroups_GroupId",
                table: "ChoirApplications");

            migrationBuilder.DropTable(
                name: "AlbumChoirGroup");

            migrationBuilder.DropTable(
                name: "AlbumPlatformLink");

            migrationBuilder.DropTable(
                name: "ChoirGroups");

            migrationBuilder.DropIndex(
                name: "IX_ChoirApplications_GroupId",
                table: "ChoirApplications");

            migrationBuilder.DropIndex(
                name: "IX_ChoirApplications_NormalizedEmail_GroupId",
                table: "ChoirApplications");

            migrationBuilder.DropColumn(
                name: "BackingAudio",
                table: "ChoirApplications");

            migrationBuilder.DropColumn(
                name: "BackingTitle",
                table: "ChoirApplications");

            migrationBuilder.DropColumn(
                name: "GroupId",
                table: "ChoirApplications");

            migrationBuilder.DropColumn(
                name: "RecordedWithBacking",
                table: "ChoirApplications");

            migrationBuilder.DropColumn(
                name: "RecordingName",
                table: "ChoirApplications");

            migrationBuilder.DropColumn(
                name: "RecordingType",
                table: "ChoirApplications");

            migrationBuilder.CreateIndex(
                name: "IX_ChoirApplications_NormalizedEmail",
                table: "ChoirApplications",
                column: "NormalizedEmail",
                unique: true);
        }
    }
}
