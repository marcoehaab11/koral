using Koral.Domain;
using Koral.Infrastructure;
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
    }

    private static Task<List<GroupView>> List(KoralDb db, bool admin, CancellationToken ct) =>
        db.ChoirGroups.AsNoTracking().OrderBy(x => x.Id).Select(x => new GroupView(x.Id, x.NameEn, x.NameAr,
            x.Accepting, x.RecordingRequired, admin || x.Accepting ? x.BackingAudio : "",
            admin || x.Accepting ? x.BackingTitle : "")).ToListAsync(ct);

    private static async Task<IResult> Save(int? id, GroupInput input, KoralDb db, Catalog catalog, HttpContext http, CancellationToken ct)
    {
        var en = input.NameEn?.Trim() ?? "";
        var ar = input.NameAr?.Trim() ?? "";
        var title = input.BackingTitle?.Trim() ?? "";
        var audio = input.BackingAudio ?? "";
        if (en.Length is < 1 or > 120 || ar.Length is < 1 or > 120 || title.Length > 180 ||
            (audio != "" && (title == "" || !audio.StartsWith("/uploads/audio/", StringComparison.Ordinal) ||
            !await catalog.MediaExists(audio, "audio/"))))
            return Results.Problem("Enter both group names and select a valid backing track with a title.", statusCode: 400);

        var group = id is int key ? await db.ChoirGroups.FindAsync([key], ct) : new ChoirGroup();
        if (group is null) return Results.NotFound();
        (group.NameEn, group.NameAr, group.Accepting, group.RecordingRequired, group.BackingAudio, group.BackingTitle) =
            (en, ar, input.Accepting, input.RecordingRequired, audio, audio == "" ? "" : title);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (id is null) db.ChoirGroups.Add(group);
        await db.SaveChangesAsync(ct);
        catalog.Audit(Sessions.Actor(http), id is null ? "create" : "update", "choir-groups", group.Id);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Results.Ok(new GroupView(group.Id, en, ar, group.Accepting, group.RecordingRequired, audio, group.BackingTitle));
    }

    public sealed record GroupInput(string NameEn, string NameAr, bool Accepting, bool RecordingRequired,
        string BackingAudio, string BackingTitle);

    public sealed record GroupView(int Id, string NameEn, string NameAr, bool Accepting, bool RecordingRequired,
        string BackingAudio, string BackingTitle);
}
