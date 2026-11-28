using Koral.Domain;
using Koral.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Koral.Api;

public static class ChoirGroups
{
    public static void MapChoirGroups(this WebApplication app)
    {
        app.MapGet("/api/choir-groups", (KoralDb db, CancellationToken ct) => List(db, false, ct));
        var admin = app.MapGroup("/api/admin/choir-groups").RequireAuthorization("Owner").WithCsrf();
        admin.MapGet("/", (KoralDb db, CancellationToken ct) => List(db, true, ct));
        admin.MapPost("/", (GroupInput input, KoralDb db, Catalog catalog, HttpContext http, CancellationToken ct) =>
            Save(null, input, db, catalog, http, ct));
        admin.MapPut("/{id:int}", (int id, GroupInput input, KoralDb db, Catalog catalog, HttpContext http, CancellationToken ct) =>
            Save(id, input, db, catalog, http, ct));
        admin.MapGet("/{id:int}/delete-impact", async (int id, KoralDb db, CancellationToken ct) =>
            await Impact(id, db, ct) is { } impact ? Results.Ok(impact) : Results.NotFound());
        admin.MapDelete("/{id:int}", Delete);
    }

    private static Task<List<GroupView>> List(KoralDb db, bool admin, CancellationToken ct) =>
        db.ChoirGroups.AsNoTracking().OrderBy(x => x.CatalogSlot ?? int.MaxValue).ThenBy(x => x.Id)
            .Select(x => new GroupView(x.Id, x.NameEn, x.NameAr, x.Accepting, x.RecordingRequired,
                admin || (x.RecruitmentEnabled && x.Accepting) ? x.BackingAudio : "",
                admin || (x.RecruitmentEnabled && x.Accepting) ? x.BackingTitle : "",
                x.CatalogSlot, x.RecruitmentEnabled, x.Image)).ToListAsync(ct);

    private static async Task<IResult> Save(int? id, GroupInput input, KoralDb db, Catalog catalog, HttpContext http, CancellationToken ct)
    {
        var en = input.NameEn?.Trim() ?? "";
        var ar = input.NameAr?.Trim() ?? "";
        var title = input.BackingTitle?.Trim() ?? "";
        var audio = input.BackingAudio ?? "";
        if (en.Length is < 1 or > 120 || ar.Length is < 1 or > 120 || title.Length > 180 ||
            (audio != "" && (title == "" || !audio.StartsWith("/uploads/audio/", StringComparison.Ordinal))))
            return Results.Problem("Enter both group names and select a valid backing track with a title.", statusCode: 400);

        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        if (input.CatalogSlot is < 0 or > 2)
            return Results.Problem("Select a valid catalogue position.", statusCode: 400);
        if (input.CatalogSlot is > 0 && await db.ChoirGroups.AnyAsync(x => x.Id != id && x.CatalogSlot == input.CatalogSlot, ct))
            return Results.Problem("This catalogue position is already assigned to a choir.", statusCode: 409);
        if (audio != "" && !await catalog.MediaExists(audio, "audio/"))
            return Results.Problem("Select a valid backing track.", statusCode: 400);
        if (input.Image is not null && !await catalog.MediaExists(input.Image, "image/"))
            return Results.Problem("Select a valid folder image.", statusCode: 400);
        var group = id is int key ? await db.ChoirGroups.FindAsync([key], ct) : new ChoirGroup();
        if (group is null) return Results.NotFound();
        (group.NameEn, group.NameAr, group.Accepting, group.RecordingRequired, group.BackingAudio, group.BackingTitle) =
            (en, ar, input.Accepting, input.RecordingRequired, audio, audio == "" ? "" : title);
        group.RecruitmentEnabled = input.RecruitmentEnabled ?? group.RecruitmentEnabled;
        group.Image = input.Image ?? group.Image;
        if (input.CatalogSlot.HasValue) group.CatalogSlot = input.CatalogSlot > 0 ? input.CatalogSlot : null;
        if (id is null) db.ChoirGroups.Add(group);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException e) when (e.InnerException is SqlException { Number: 2601 or 2627 })
        {
            return Results.Problem("This catalogue position is already assigned to a choir.", statusCode: 409);
        }
        catalog.Audit(Sessions.Actor(http), id is null ? "create" : "update", "choir-groups", group.Id);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Results.Ok(new GroupView(group.Id, en, ar, group.Accepting, group.RecordingRequired, audio, group.BackingTitle,
            group.CatalogSlot, group.RecruitmentEnabled, group.Image));
    }

    private static Task<GroupImpact?> Impact(int id, KoralDb db, CancellationToken ct) =>
        db.ChoirGroups.Where(g => g.Id == id).Select(g => new GroupImpact(g.Albums.Count,
            db.ChoirApplications.Count(x => x.GroupId == g.Id), g.BackingAudio != "")).SingleOrDefaultAsync(ct);

    private static async Task<IResult> Delete(int id, int? albums, int? applications, bool? backing,
        KoralDb db, Catalog catalog, HttpContext http, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var group = await db.ChoirGroups.FindAsync([id], ct);
        if (group is null) return Results.NotFound();
        var impact = await Impact(id, db, ct);
        if (impact is null || impact.Albums != albums || impact.Applications != applications || impact.Backing != backing)
            return Results.Problem("Review the affected albums, applications and backing track before deleting the group.", statusCode: 409);
        await db.ChoirApplications.Where(x => x.GroupId == id).ExecuteUpdateAsync(update => update
            .SetProperty(x => x.FormerGroupId, id).SetProperty(x => x.GroupId, (int?)null)
            .SetProperty(x => x.GroupNameEn, group.NameEn).SetProperty(x => x.GroupNameAr, group.NameAr)
            .SetProperty(x => x.Revision, Guid.NewGuid()), ct);
        db.ChoirGroups.Remove(group);
        catalog.Audit(Sessions.Actor(http), "delete", "choir-groups", id);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Results.NoContent();
    }

    private sealed record GroupImpact(int Albums, int Applications, bool Backing);
    public sealed record GroupInput(string NameEn, string NameAr, bool Accepting, bool RecordingRequired,
        string BackingAudio, string BackingTitle, bool? RecruitmentEnabled = null, int? CatalogSlot = null, string? Image = null);

    public sealed record GroupView(int Id, string NameEn, string NameAr, bool Accepting, bool RecordingRequired,
        string BackingAudio, string BackingTitle, int? CatalogSlot, bool RecruitmentEnabled, string Image);
}
