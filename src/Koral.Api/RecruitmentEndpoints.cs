using Koral.Application;
using Koral.Domain;
using Koral.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Koral.Api;

public static class RecruitmentEndpoints
{
    private const int MaxRecordingBytes = 8 * 1024 * 1024;
    private const string Recordings = "auditions";

    public static void MapRecruitment(this WebApplication app)
    {
        app.MapGroup("/api/join").WithCsrf(false).MapPost("/", Submit).RequireRateLimiting("recruitment")
            .WithMetadata(new RequestSizeLimitAttribute(MaxRecordingBytes + 32_768));

        var admin = app.MapGroup("/api/admin/applications").RequireAuthorization("Owner").WithCsrf();
        admin.MapGet("/", List);
        admin.MapGet("/{id:int}", Detail);
        admin.MapGet("/{id:int}/recording", Recording);
        admin.MapPut("/{id:int}", Update);
        admin.MapDelete("/{id:int}", Delete);
    }

    private static async Task<IResult> Submit(HttpRequest request, KoralDb db, IMediaStorage storage, CancellationToken ct)
    {
        JoinInput? input;
        IFormFile? file = null;
        try
        {
            if (request.HasFormContentType)
            {
                var form = await request.ReadFormAsync(ct);
                var payload = form["application"].ToString();
                if (payload.Length > 16_384 || form.Files.Count > 1) return Results.BadRequest();
                input = JsonSerializer.Deserialize<JoinInput>(payload, JsonSerializerOptions.Web);
                file = form.Files.GetFile("recording");
                if (form.Files.Count != (file is null ? 0 : 1)) return Results.BadRequest();
            }
            else if (request.HasJsonContentType())
            {
                var size = request.HttpContext.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpMaxRequestBodySizeFeature>();
                if (size is { IsReadOnly: false }) size.MaxRequestBodySize = 16_384;
                input = await request.ReadFromJsonAsync<JoinInput>(ct);
            }
            else return Results.StatusCode(415);
        }
        catch (JsonException) { return Results.BadRequest(); }
        catch (InvalidDataException) { return Results.BadRequest(); }
        catch (BadHttpRequestException e) { return Results.StatusCode(e.StatusCode); }
        if (input is null) return Results.BadRequest();

        input = input with { Name = input.Name?.Trim() ?? "", Email = input.Email?.Trim() ?? "", Phone = input.Phone?.Trim() ?? "",
            Experience = input.Experience?.Trim() ?? "" };
        var validation = await Recruitment.Validate.ValidateAsync(input, ct);
        if (!validation.IsValid)
            return Results.ValidationProblem(validation.Errors.GroupBy(x => x.PropertyName)
                .ToDictionary(x => System.Text.Json.JsonNamingPolicy.CamelCase.ConvertName(x.Key), x => x.Select(e => e.ErrorMessage).ToArray()));

        var group = input.GroupId is int id
            ? await db.ChoirGroups.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.Accepting, ct) : null;
        if (group is null && (input.GroupId.HasValue || await db.ChoirGroups.AnyAsync(ct)))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["groupId"] = ["Choose a choir group that is open for applications."] });
        if (file is null && group?.RecordingRequired == true)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["recording"] = ["Add a voice recording for this group."] });
        if (input.RecordedWithBacking && (file is null || group?.BackingAudio is not { Length: > 0 } || input.BackingAudio != group.BackingAudio))
            return Results.Problem("The backing track has changed. Refresh and record again.", statusCode: 409);

        var now = DateTimeOffset.UtcNow;
        var row = new ChoirApplication
        {
            Name = input.Name, Email = input.Email, NormalizedEmail = input.Email.ToUpperInvariant(),
            Phone = input.Phone, Voice = input.Voice, Experience = input.Experience,
            GroupId = group?.Id, BackingAudio = file is null ? "" : group?.BackingAudio ?? "",
            BackingTitle = file is null ? "" : group?.BackingTitle ?? "", RecordedWithBacking = input.RecordedWithBacking,
            Revision = Guid.NewGuid(), CreatedAt = now, UpdatedAt = now
        };
        if (file is not null)
        {
            if (file.Length < 12 || file.Length > MaxRecordingBytes) return Results.StatusCode(413);
            await using var stream = file.OpenReadStream();
            var header = new byte[12];
            await stream.ReadExactlyAsync(header, ct);
            var format = AudioFormat(header);
            if (format is null) return Results.StatusCode(415);
            row.RecordingType = format.Value.Type;
            row.RecordingName = Guid.NewGuid().ToString("N") + format.Value.Extension;
            stream.Position = 0;
            await storage.Write(Recordings, row.RecordingName, stream, ct);
        }
        db.ChoirApplications.Add(row);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException error) when (error.InnerException is SqlException { Number: 2601 or 2627 })
        {
            if (row.RecordingName != "") storage.Remove(Recordings, row.RecordingName);
        }
        catch
        {
            if (row.RecordingName != "") storage.Remove(Recordings, row.RecordingName);
            throw;
        }
        return Results.NoContent();
    }

    private static (string Extension, string Type)? AudioFormat(ReadOnlySpan<byte> header)
    {
        if (header.StartsWith(new byte[] { 0x1a, 0x45, 0xdf, 0xa3 })) return (".webm", "audio/webm");
        if (header.StartsWith("OggS"u8)) return (".ogg", "audio/ogg");
        if (header[4..8].SequenceEqual("ftyp"u8)) return (".m4a", "audio/mp4");
        if (header.StartsWith("RIFF"u8) && header[8..].SequenceEqual("WAVE"u8)) return (".wav", "audio/wav");
        if (header.StartsWith("ID3"u8) || (header[0] == 0xff && (header[1] & 0xe0) == 0xe0 &&
            (header[1] & 0x06) != 0 && (header[2] & 0xf0) is not (0 or 0xf0))) return (".mp3", "audio/mpeg");
        return null;
    }

    private static async Task<IResult> Recording(int id, KoralDb db, IMediaStorage storage, HttpContext http, CancellationToken ct)
    {
        var file = await db.ChoirApplications.AsNoTracking().Where(x => x.Id == id && x.RecordingName != "")
            .Select(x => new { x.RecordingName, x.RecordingType }).SingleOrDefaultAsync(ct);
        if (file is null || storage.Open(Recordings, file.RecordingName) is not Stream stream) return Results.NotFound();
        http.Response.Headers.CacheControl = "private, no-store";
        return Results.File(stream, file.RecordingType, enableRangeProcessing: true);
    }

    private static async Task<Page<ApplicationSummary>> List(KoralDb db, string? q, string? status, int? page, int? group, CancellationToken ct)
    {
        const int size = 20;
        var number = Math.Clamp(page ?? 1, 1, 1_000_000);
        var rows = db.ChoirApplications.AsNoTracking();
        if (Recruitment.Statuses.Contains(status)) rows = rows.Where(x => x.Status == status);
        if (group.HasValue) rows = group == 0 ? rows.Where(x => x.GroupId == null) : rows.Where(x => x.GroupId == group);
        var term = (q ?? "").Trim();
        if (term.Length > 120) term = term[..120];
        if (term.Length > 0) rows = rows.Where(x => x.Name.Contains(term) || x.Email.Contains(term) || x.Phone.Contains(term));
        var count = await rows.CountAsync(ct);
        var items = await rows.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
            .Skip((number - 1) * size).Take(size)
            .Select(x => new ApplicationSummary(x.Id, x.Name, x.Email, x.Phone, x.Voice, x.Status, x.CreatedAt,
                x.GroupId, x.Group == null ? "" : x.Group.NameEn, x.Group == null ? "" : x.Group.NameAr)).ToListAsync(ct);
        return new(items, count, number, size);
    }

    private static ApplicationDetail Map(ChoirApplication row) =>
        new(new(row.Id, row.Name, row.Email, row.Phone, row.Voice, row.Status, row.CreatedAt,
                row.GroupId, row.Group?.NameEn ?? "", row.Group?.NameAr ?? ""),
            row.Experience, row.Notes, row.Revision, row.UpdatedAt, row.RecordingName == "" ? "" : $"/api/admin/applications/{row.Id}/recording",
            row.BackingAudio, row.BackingTitle, row.RecordedWithBacking);

    private static async Task<IResult> Detail(int id, KoralDb db, CancellationToken ct) =>
        await db.ChoirApplications.AsNoTracking().Include(x => x.Group).SingleOrDefaultAsync(x => x.Id == id, ct) is { } row
            ? Results.Ok(Map(row)) : Results.NotFound();

    private static async Task<IResult> Update(int id, ApplicationUpdate input, KoralDb db, Catalog catalog, HttpContext http, CancellationToken ct)
    {
        if (!Recruitment.Statuses.Contains(input.Status) || input.Notes is not { Length: <= 4000 })
            return Results.Problem("Select a status and enter no more than 4,000 characters in notes.", statusCode: 400);

        var row = await db.ChoirApplications.Include(x => x.Group).SingleOrDefaultAsync(x => x.Id == id, ct);
        if (row is null) return Results.NotFound();
        if (row.Revision != input.Revision) return Conflict();
        row.Status = input.Status;
        row.Notes = input.Notes.Trim();
        row.UpdatedAt = DateTimeOffset.UtcNow;
        row.Revision = Guid.NewGuid();
        catalog.Audit(Sessions.Actor(http), "update", "applications", id);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Conflict(); }
        return Results.Ok(Map(row));
    }

    private static async Task<IResult> Delete(int id, KoralDb db, Catalog catalog, IMediaStorage storage, HttpContext http, CancellationToken ct)
    {
        var row = await db.ChoirApplications.FindAsync([id], ct);
        if (row is null) return Results.NotFound();
        db.Remove(row);
        catalog.Audit(Sessions.Actor(http), "delete", "applications", id);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Conflict(); }
        if (row.RecordingName != "") storage.Remove(Recordings, row.RecordingName);
        return Results.NoContent();
    }

    private static IResult Conflict() => Results.Problem("This application changed. Reopen it before saving.", statusCode: 409);
}
