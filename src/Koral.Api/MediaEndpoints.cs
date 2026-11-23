using Koral.Application;
using Koral.Domain;
using Koral.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Koral.Api;

public static class MediaEndpoints
{
    static readonly Dictionary<string, string> Types = new()
    {
        [".jpg"] = "image/jpeg", [".png"] = "image/png", [".webp"] = "image/webp",
        [".mp3"] = "audio/mpeg", [".mp4"] = "video/mp4"
    };
    public static void MapMedia(this WebApplication app, long max)
    {
        app.MapGroup("/api/admin/media").RequireAuthorization("Staff").WithCsrf()
            .MapPost("/{bucket}", async (string bucket, HttpContext http, IMediaStorage storage, KoralDb db, Catalog catalog) =>
            {
                if (bucket is not ("choir" or "albums" or "songs" or "gallery" or "members" or "audio" or "events")) return Results.NotFound();
                if (bucket == "choir" && !http.User.IsInRole("SuperAdmin")) return Results.Forbid();
                if (!http.Request.HasFormContentType) return Results.Problem("Upload a media file.", statusCode: 415);
                if (http.Request.ContentLength > max + 131072) return Results.Problem("File exceeds the configured limit.", statusCode: 413);
                IFormFile? file;
                try { file = (await http.Request.ReadFormAsync(http.RequestAborted)).Files.GetFile("file"); }
                catch (InvalidDataException) { return Results.Problem("Invalid upload or file exceeds the configured limit.", statusCode: 413); }
                catch (BadHttpRequestException ex) { return Results.Problem("The upload could not be read.", statusCode: ex.StatusCode); }
                if (file is null || file.Length < 12) return Results.Problem("Select a valid media file.", statusCode: 400);
                if (file.Length > max) return Results.Problem("File exceeds the configured limit.", statusCode: 413);
                var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (ext == ".jpeg") ext = ".jpg";
                if (!Types.TryGetValue(ext, out var type) || (bucket == "audio" ? ext != ".mp3"
                    : !type.StartsWith("image/") && !(bucket == "gallery" && ext == ".mp4"))) return Results.StatusCode(415);
                await using var stream = file.OpenReadStream();
                var bytes = new byte[12];
                await stream.ReadExactlyAsync(bytes, http.RequestAborted);
                if (!ValidHeader(ext, bytes)) return Results.Problem("The file content does not match its extension.", statusCode: 415);
                stream.Position = 0;
                var id = Guid.NewGuid();
                var name = id.ToString("N") + ext;
                await storage.Write(bucket, name, stream, http.RequestAborted);
                try
                {
                    db.Media.Add(new MediaAsset { Id = id, Bucket = bucket, Name = name, ContentType = type, Size = file.Length });
                    catalog.Audit(Sessions.Actor(http), "upload", bucket);
                    await db.SaveChangesAsync();
                }
                catch { storage.Remove(bucket, name); throw; }
                return Results.Ok(new { url = $"/uploads/{bucket}/{name}", size = file.Length, contentType = type });
            });
        app.MapMethods("/uploads/{bucket}/{name}", ["GET", "HEAD"], async (string bucket, string name, IMediaStorage storage, KoralDb db, HttpContext http) =>
        {
            var path = $"/uploads/{bucket}/{name}";
            if (!InputRules.Media(path)) return Results.NotFound();
            var asset = await db.Media.AsNoTracking().SingleOrDefaultAsync(x => x.Bucket == bucket && x.Name == name);
            if (asset is null) return Results.NotFound();
            var published = await IsPublic(db, bucket, path);
            if (!published)
            {
                if (!http.User.IsInRole("SuperAdmin") && !http.User.IsInRole("ContentEditor")) return Results.NotFound();
                var users = http.RequestServices.GetRequiredService<Microsoft.AspNetCore.Identity.UserManager<ApplicationUser>>();
                if (await users.GetUserAsync(http.User) is not { MustChangePassword: false }) return Results.NotFound();
            }
            var stream = storage.Open(bucket, name);
            if (stream is null) return Results.NotFound();
            http.Response.Headers.CacheControl = published ? "public, no-cache" : "private, no-store";
            return Results.File(stream, asset.ContentType, enableRangeProcessing: true);
        });
    }
    static async Task<bool> IsPublic(KoralDb db, string bucket, string path)
    {
        if (bucket == "choir")
        {
            var catalog = new Catalog(db);
            var profile = await catalog.Profile();
            var settings = await catalog.Settings();
            if (profile.Logo == path || profile.Cover == path || profile.CoverMobile == path ||
                profile.AboutImage == path || settings.Favicon == path) return true;
        }
        if (await db.Albums.AnyAsync(x => x.Published && x.Image == path)) return true;
        if (await db.Songs.AnyAsync(x => x.Published && (x.Image == path || x.Audio == path))) return true;
        if (bucket == "audio" && await db.ChoirGroups.AnyAsync(x => x.RecruitmentEnabled && x.Accepting && x.BackingAudio == path)) return true;
        if (await db.Gallery.AnyAsync(x => x.Published && (x.Image == path || x.Video == path))) return true;
        var visibility = await new Catalog(db).Settings();
        return (visibility.Members && await db.Members.AnyAsync(x => x.Published && x.Image == path)) ||
            (visibility.Events && await db.Events.AnyAsync(x => x.Published && x.Image == path));
    }
    static bool ValidHeader(string ext, ReadOnlySpan<byte> bytes) => ext switch
    {
        ".jpg" => bytes.StartsWith(new byte[] { 255, 216, 255 }),
        ".png" => bytes.StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
        ".webp" => bytes.StartsWith("RIFF"u8) && bytes[8..].SequenceEqual("WEBP"u8),
        ".mp3" => bytes.StartsWith("ID3"u8) || (bytes[0] == 255 && (bytes[1] & 224) == 224 && (bytes[1] & 6) != 0),
        ".mp4" => bytes[4..8].SequenceEqual("ftyp"u8),
        _ => false
    };
}
