using Koral.Application;
using Koral.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Koral.Api;

public static class ContentEndpoints
{
    public static void MapContent(this WebApplication app)
    {
        app.MapGet("/api", () => new { service = "Koral" });
        app.MapGet("/api/choir", (Catalog catalog) => catalog.Profile());
        app.MapGet("/api/settings", (Catalog catalog) => catalog.Settings());
        foreach (var resource in Catalog.Resources)
        {
            app.MapGet("/api/" + resource, async (Catalog catalog, string? q, int? page, int? size, bool? featured,
                int? album, int? category, int? year, string? order, bool? upcoming, int? group) =>
            {
                if (await Disabled(resource, catalog)) return Results.NotFound();
                return Results.Ok(await catalog.List(resource, false, q, page ?? 1, size ?? 12, featured, album, category, year, order, upcoming, group));
            });
        }
        foreach (var resource in new[] { "albums", "songs" })
            app.MapGet("/api/" + resource + "/{slug}", async (string slug, Catalog catalog) =>
                await catalog.Detail(resource, slug) is { } item ? Results.Ok(item) : Results.NotFound());
        app.MapGet("/api/albums/{slug}/tracks", async (string slug, Catalog catalog) =>
            await catalog.AlbumTracks(slug) is { } tracks ? Results.Ok(tracks) : Results.NotFound());

        app.MapGet("/api/search", async (Catalog catalog, string? q) =>
        {
            var result = new Dictionary<string, Page<Content>>();
            if (!string.IsNullOrWhiteSpace(q))
                foreach (var resource in new[] { "albums", "songs", "members", "events" })
                    if (!await Disabled(resource, catalog)) result[resource] = await catalog.List(resource, false, q, 1, 12);
            return Results.Ok(result);
        });

        var admin = app.MapGroup("/api/admin").RequireAuthorization("Staff").WithCsrf();
        admin.MapGet("/dashboard", (Catalog catalog, HttpContext http) => catalog.Dashboard(http.User.IsInRole("SuperAdmin")));
        admin.MapGet("/choir", (Catalog catalog) => catalog.Profile()).RequireAuthorization("Owner");
        admin.MapGet("/settings", (Catalog catalog) => catalog.Settings()).RequireAuthorization("Owner");
        admin.MapPut("/choir", async (Profile input, Catalog catalog, HttpContext http) =>
        {
            if (string.IsNullOrWhiteSpace(input.NameEn) || string.IsNullOrWhiteSpace(input.NameAr) ||
                !await catalog.MediaExists(input.Logo, "image/") || !await catalog.MediaExists(input.Cover, "image/") ||
                !await catalog.MediaExists(input.CoverMobile, "image/") || !await catalog.MediaExists(input.AboutImage, "image/") ||
                input.AboutImageAltEn is not { Length: <= 300 } || input.AboutImageAltAr is not { Length: <= 300 } ||
                (input.Email != "" && !System.Net.Mail.MailAddress.TryCreate(input.Email, out _)) ||
                (input.Social ?? []).Any(x => x is null || !new PlatformValidator().Validate(x).IsValid))
                return Results.Problem("Check the choir name, images, email, and social links.", statusCode: 400);
            await catalog.SaveProfile(input, Sessions.Actor(http));
            return Results.Ok(input);
        }).RequireAuthorization("Owner");
        admin.MapPut("/settings", async (Settings input, Catalog catalog, HttpContext http) =>
        {
            if (input.DefaultLanguage is not ("en" or "ar") || (input.DefaultLanguage == "en" && !input.English) ||
                (input.DefaultLanguage == "ar" && !input.Arabic) || !await catalog.MediaExists(input.Favicon, "image/") ||
                input.AnnouncementTitleEn is not { Length: <= 160 } || input.AnnouncementTitleAr is not { Length: <= 160 } ||
                input.AnnouncementBodyEn is not { Length: <= 4000 } || input.AnnouncementBodyAr is not { Length: <= 4000 } ||
                input.AnnouncementImage is null || !await catalog.MediaExists(input.AnnouncementImage, "image/"))
                return Results.Problem("Enable the default language and select a valid favicon.", statusCode: 400);
            await catalog.SaveSettings(input, Sessions.Actor(http));
            return Results.Ok(input);
        }).RequireAuthorization("Owner");
        foreach (var resource in Catalog.Resources)
        {
            var group = admin.MapGroup("/" + resource);
            group.MapGet("/", (Catalog catalog, string? q, int? page, int? size, int? album) =>
                catalog.List(resource, true, q, page ?? 1, size ?? 20, album: album, order: album is null ? "updated" : null));
            group.MapGet("/{id:int}", async (Catalog catalog, int id) =>
                await catalog.Get(resource, id) is { } item ? Results.Ok(item) : Results.NotFound());
            group.MapPost("/", (Catalog catalog, Content input, HttpContext http) => Save(catalog, resource, null, input, http));
            group.MapPut("/{id:int}", (Catalog catalog, int id, Content input, HttpContext http) => Save(catalog, resource, id, input, http));
            group.MapDelete("/{id:int}", async (Catalog catalog, int id, int? tracks, int? groups, int? links, HttpContext http) =>
            {
                var confirmed = tracks.HasValue && groups.HasValue && links.HasValue ? new AlbumDeletion(tracks.Value, groups.Value, links.Value) : null;
                return await catalog.Delete(resource, id, Sessions.Actor(http), confirmed) switch
                {
                    204 => Results.NoContent(),
                    409 => Results.Problem("Review which tracks, groups and links are affected before deleting the album.", statusCode: 409),
                    _ => Results.NotFound()
                };
            });
        }
        admin.MapGet("/albums/{id:int}/delete-impact", async (Catalog catalog, int id) =>
            await catalog.AlbumDeleteImpact(id) is { } impact ? Results.Ok(impact) : Results.NotFound());
        admin.MapDelete("/songs/{id:int}/audio", DeleteSongAudio);
        admin.MapPut("/albums/{id:int}/order", async (Catalog catalog, int id, OrderInput input, HttpContext http) =>
            await catalog.Get("albums", id) is not null && input.Ids is not null && await catalog.Order(id, input.Ids, Sessions.Actor(http))
                ? Results.NoContent() : Results.Problem("The tracklist changed. Reload before reordering.", statusCode: 409));
        var tracks = admin.MapGroup("/albums/{id:int}/tracks");
        tracks.MapPut("/{songId:int}", (Catalog catalog, int id, int songId, HttpContext http) => SetTrack(catalog, id, songId, true, http));
        tracks.MapDelete("/{songId:int}", (Catalog catalog, int id, int songId, HttpContext http) => SetTrack(catalog, id, songId, false, http));
    }

    static async Task<IResult> DeleteSongAudio(int id, string expected, KoralDb db, Catalog catalog, IMediaStorage storage, HttpContext http)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        var song = await db.Songs.FindAsync(id);
        if (song is null) return Results.NotFound();
        if (!expected.StartsWith("/uploads/audio/") || !InputRules.SongAudio(expected) || song.Audio != expected)
            return Results.Problem("The uploaded MP3 changed. Reload before deleting.", statusCode: 409);
        if (await db.Songs.AnyAsync(x => x.Id != id && x.Audio == expected) ||
            await db.ChoirGroups.AnyAsync(x => x.BackingAudio == expected) ||
            await db.ChoirApplications.AnyAsync(x => x.BackingAudio == expected))
            return Results.Problem("This file is shared. You can unlink it from the track instead.", statusCode: 409);
        var name = expected.Split('/')[3];
        var asset = await db.Media.SingleOrDefaultAsync(x => x.Bucket == "audio" && x.Name == name);
        if (asset is not null) db.Media.Remove(asset);
        song.Audio = "";
        song.UpdatedAt = DateTimeOffset.UtcNow;
        catalog.Audit(Sessions.Actor(http), "delete-audio", "songs", id);
        await db.SaveChangesAsync();
        try { storage.Remove("audio", name); }
        catch (IOException) { return Results.Problem("Could not remove the MP3. Try again.", statusCode: 503); }
        catch (UnauthorizedAccessException) { return Results.Problem("Could not remove the MP3. Check storage permissions.", statusCode: 503); }
        await tx.CommitAsync();
        return Results.NoContent();
    }
    static async Task<IResult> SetTrack(Catalog catalog, int album, int song, bool attach, HttpContext http)
    {
        try
        {
            return await catalog.SetTrack(album, song, attach, Sessions.Actor(http)) ? Results.NoContent() : Results.NotFound();
        }
        catch (DbUpdateException exception) when (exception.InnerException is SqlException { Number: 547 })
        {
            return Results.Problem("The album changed. Refresh and try again.", statusCode: 409);
        }
    }

    static async Task<bool> Disabled(string resource, Catalog catalog)
    {
        if (resource is not ("members" or "events")) return false;
        var settings = await catalog.Settings();
        return resource == "members" ? !settings.Members : !settings.Events;
    }
    static async Task<IResult> Save(Catalog catalog, string resource, int? id, Content input, HttpContext http)
    {
        var validation = await new ContentValidator(resource).ValidateAsync(input);
        if (!validation.IsValid)
            return Results.ValidationProblem(validation.Errors.GroupBy(e => e.PropertyName)
                .ToDictionary(g => char.ToLowerInvariant(g.Key[0]) + g.Key[1..], g => g.Select(e => e.ErrorMessage).ToArray()));
        try
        {
            var (row, error, missing) = await catalog.Save(resource, id, input, Sessions.Actor(http));
            if (missing) return Results.NotFound();
            if (error is not null)
                return Results.ValidationProblem(new Dictionary<string, string[]> { [error] = [error switch
                {
                    "slug" => "This slug is already in use.",
                    "links" => "Use a direct track link from YouTube, SoundCloud, Anghami or Spotify.",
                    _ => "Select an existing item."
                }] });
            return id.HasValue ? Results.Ok(row) : Results.Created($"/api/admin/{resource}/{row!.Id}", row);
        }
        catch (DbUpdateException exception) when (exception.InnerException is SqlException { Number: 2601 or 2627 or 547 })
        {
            return Results.Problem("This slug or relationship changed while saving. Review the form and try again.", statusCode: 409);
        }
    }
}
