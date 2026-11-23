using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Koral.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TrackPlaybackAndMixedAuditions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ChoirApplications_NormalizedEmail_GroupId",
                table: "ChoirApplications");

            migrationBuilder.AddColumn<bool>(
                name: "Enabled",
                table: "Platforms",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<int>(
                name: "FormerGroupId",
                table: "ChoirApplications",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "GroupNameAr",
                table: "ChoirApplications",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "GroupNameEn",
                table: "ChoirApplications",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "RecordingMixed",
                table: "ChoirApplications",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_ChoirApplications_NormalizedEmail_GroupId_FormerGroupId",
                table: "ChoirApplications",
                columns: new[] { "NormalizedEmail", "GroupId", "FormerGroupId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ChoirApplications_NormalizedEmail_GroupId_FormerGroupId",
                table: "ChoirApplications");

            migrationBuilder.DropColumn(
                name: "Enabled",
                table: "Platforms");

            migrationBuilder.DropColumn(
                name: "FormerGroupId",
                table: "ChoirApplications");

            migrationBuilder.DropColumn(
                name: "GroupNameAr",
                table: "ChoirApplications");

            migrationBuilder.DropColumn(
                name: "GroupNameEn",
                table: "ChoirApplications");

            migrationBuilder.DropColumn(
                name: "RecordingMixed",
                table: "ChoirApplications");

            migrationBuilder.CreateIndex(
                name: "IX_ChoirApplications_NormalizedEmail_GroupId",
                table: "ChoirApplications",
                columns: new[] { "NormalizedEmail", "GroupId" },
                unique: true);
        }
    }
}
