using Koral.Application;
using Koral.Domain;
using Koral.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Koral.Api;

public static class RecruitmentEndpoints
{
    private const int MaxRecordingBytes = 8 * 1024 * 1024;
    private const int MaxPhotoBytes = 5 * 1024 * 1024;
    private const string Recordings = "auditions";
    private const string Photos = "applicant-photos";
    private static readonly BackingTrack DefaultBacking = new("/media/audition-backing-v1.mp3", "Audition backing track");
    private sealed record BackingTrack(string Url, string Title);

    public static void MapRecruitment(this WebApplication app)
    {
        app.MapGet("/api/join/backing", Backing);
        app.MapGroup("/api/join").WithCsrf(false).MapPost("/", Submit).RequireRateLimiting("recruitment")
            .WithMetadata(new RequestSizeLimitAttribute(MaxRecordingBytes + MaxPhotoBytes + 65_536));

        var admin = app.MapGroup("/api/admin/applications").RequireAuthorization("Owner").WithCsrf();
        admin.MapGet("/", List);
        admin.MapGet("/{id:int}", Detail);
        admin.MapGet("/{id:int}/recording", Recording);
        admin.MapGet("/{id:int}/photo", Photo);
        admin.MapGet("/export", ApplicationExport.Download);
        admin.MapPut("/{id:int}", Update);
        admin.MapDelete("/{id:int}", Delete);
    }

    private static async Task<BackingTrack> Backing(KoralDb db, CancellationToken ct) =>
        await db.ChoirGroups.Where(x => x.Accepting && x.RecruitmentEnabled && x.BackingAudio != "")
            .OrderBy(x => x.Id).Select(x => new BackingTrack(x.BackingAudio, x.BackingTitle)).FirstOrDefaultAsync(ct)
        ?? DefaultBacking;

    private static async Task<IResult> Submit(HttpRequest request, KoralDb db, IMediaStorage storage, CancellationToken ct)
    {
        RegistrationInput? input;
        IFormFile? file = null, photo = null;
        try
        {
            if (request.HasFormContentType)
            {
                var form = await request.ReadFormAsync(ct);
                var payload = form["application"].ToString();
                if (payload.Length > 49_152 || form.Files.Count > 2) return Results.BadRequest();
                input = JsonSerializer.Deserialize<RegistrationInput>(payload, Registration.Json);
                file = form.Files.GetFile("recording");
                photo = form.Files.GetFile("photo");
                if (form.Files.Count != (file is null ? 0 : 1) + (photo is null ? 0 : 1)) return Results.BadRequest();
            }
            else if (request.HasJsonContentType())
            {
                var size = request.HttpContext.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpMaxRequestBodySizeFeature>();
                if (size is { IsReadOnly: false }) size.MaxRequestBodySize = 49_152;
                input = await request.ReadFromJsonAsync<RegistrationInput>(ct);
            }
            else return Results.StatusCode(415);
        }
        catch (JsonException) { return Results.BadRequest(); }
        catch (InvalidDataException) { return Results.BadRequest(); }
        catch (BadHttpRequestException e) { return Results.StatusCode(e.StatusCode); }
        if (input is null) return Results.BadRequest();

        var schema = await RegistrationEndpoints.Schema(db, ct);
        var fields = schema.Fields.Where(x => x.Visible).ToList();
        if (input.Revision != schema.Revision || fields.Count == 0)
            return Results.Problem("The registration form changed. Reload it and try again.", statusCode: 409);
        var errors = new Dictionary<string, string[]>();
        var answers = new List<RegistrationAnswer>();
        if (!input.Consent) errors["consent"] = ["Consent is required."];
        foreach (var field in fields)
        {
            if (field.Kind is "recording" or "photo")
            {
                if (field.Required && (field.Kind == "photo" ? photo : file) is null)
                    errors[field.Id] = ["Attach the required file."];
                continue;
            }
            var values = input.Answers?.GetValueOrDefault(field.Id)?.Select(x => x?.Trim() ?? "").ToArray();
            if (!Registration.TryAnswer(field, values, input.Details, out var answer))
                errors[field.Id] = ["Check this field and any required details."];
            else if (answer != "") answers.Add(new(field.Id, field.LabelAr, field.LabelEn, field.Kind, answer));
        }
        if (errors.Count > 0) return Results.ValidationProblem(errors);
        var photoField = fields.Find(x => x.Kind == "photo");
        var recordingField = fields.Find(x => x.Kind == "recording");
        if ((photo is not null && photoField is null) || (file is not null && recordingField is null)) return Results.BadRequest();
        var backing = await Backing(db, ct);
        if (!string.IsNullOrEmpty(input.BackingAudio) && (file is null || input.BackingAudio != backing.Url))
            return Results.Problem("The backing track has changed. Refresh and record again.", statusCode: 409);
        var recordedWithBacking = file is not null && input.BackingAudio == backing.Url;

        var now = DateTimeOffset.UtcNow;
        var row = new ChoirApplication
        {
            Name = string.Join(' ', answers.Where(x => x.Id is "first-name" or "second-name" or "third-name" or "last-name")
                .OrderBy(x => Array.IndexOf(new[] { "first-name", "second-name", "third-name", "last-name" }, x.Id)).Select(x => x.Value)),
            NormalizedEmail = "registration:" + Guid.NewGuid().ToString("N"),
            Phone = answers.Find(x => x.Id == "whatsapp")?.Value ?? "",
            BackingAudio = recordedWithBacking ? backing.Url : "",
            BackingTitle = recordedWithBacking ? backing.Title : "",
            RecordedWithBacking = recordedWithBacking,
            RecordingMixed = recordedWithBacking && input.RecordingMixed,
            Revision = Guid.NewGuid(), CreatedAt = now, UpdatedAt = now
        };
        if (row.Name.Length > 120) row.Name = row.Name[..120];
        if (row.Phone.Length > 30) row.Phone = row.Phone[..30];
        var recordingFormat = await Identify(file, MaxRecordingBytes, AudioFormat, ct);
        var photoFormat = await Identify(photo, MaxPhotoBytes, ImageFormat, ct);
        if (file is not null && recordingFormat is null || photo is not null && photoFormat is null)
            return Results.Problem("Use a supported photo or recording within the size limit.", statusCode: 415);
        try
        {
            if (file is not null && recordingFormat is { } audio)
            {
                row.RecordingType = audio.Type;
                row.RecordingName = await SaveAttachment(file, Recordings, audio.Extension, storage, ct);
                answers.Add(new(recordingField!.Id, recordingField.LabelAr, recordingField.LabelEn, "recording", row.RecordingName));
            }
            if (photo is not null && photoFormat is { } image)
            {
                row.PhotoType = image.Type;
                row.PhotoName = await SaveAttachment(photo, Photos, image.Extension, storage, ct);
                answers.Add(new(photoField!.Id, photoField.LabelAr, photoField.LabelEn, "photo", row.PhotoName));
            }
            row.FormAnswers = JsonSerializer.Serialize(answers, Registration.Json);
            db.ChoirApplications.Add(row);
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            if (row.RecordingName != "") storage.Remove(Recordings, row.RecordingName);
            if (row.PhotoName != "") storage.Remove(Photos, row.PhotoName);
            throw;
        }
        return Results.NoContent();
    }

    private static async Task<string> SaveAttachment(IFormFile file, string bucket, string extension, IMediaStorage storage, CancellationToken ct)
    {
        var name = Guid.NewGuid().ToString("N") + extension;
        await using var stream = file.OpenReadStream();
        await storage.Write(bucket, name, stream, ct);
        return name;
    }

    private delegate (string Extension, string Type)? DetectFormat(ReadOnlySpan<byte> header);
    private static async Task<(string Extension, string Type)?> Identify(IFormFile? file, int limit, DetectFormat detect, CancellationToken ct)
    {
        if (file is null || file.Length < 12 || file.Length > limit) return null;
        await using var stream = file.OpenReadStream();
        var header = new byte[12];
        await stream.ReadExactlyAsync(header, ct);
        return detect(header);
    }

    private static (string Extension, string Type)? ImageFormat(ReadOnlySpan<byte> header)
    {
        if (header.StartsWith(new byte[] { 255, 216, 255 })) return (".jpg", "image/jpeg");
        if (header.StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })) return (".png", "image/png");
        if (header.StartsWith("RIFF"u8) && header[8..].SequenceEqual("WEBP"u8)) return (".webp", "image/webp");
        return null;
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

    private static async Task<IResult> Photo(int id, KoralDb db, IMediaStorage storage, HttpContext http, CancellationToken ct)
    {
        var file = await db.ChoirApplications.AsNoTracking().Where(x => x.Id == id && x.PhotoName != "")
            .Select(x => new { x.PhotoName, x.PhotoType }).SingleOrDefaultAsync(ct);
        if (file is null || storage.Open(Photos, file.PhotoName) is not Stream stream) return Results.NotFound();
        http.Response.Headers.CacheControl = "private, no-store";
        return Results.File(stream, file.PhotoType);
    }

    private static async Task<Page<ApplicationSummary>> List(KoralDb db, string? q, string? status, int? page, int? group, CancellationToken ct)
    {
        const int size = 20;
        var number = Math.Clamp(page ?? 1, 1, 1_000_000);
        var rows = db.ChoirApplications.AsNoTracking();
        if (!string.IsNullOrEmpty(status) && status.Length <= 40) rows = rows.Where(x => x.Status == status);
        if (group.HasValue) rows = group == 0 ? rows.Where(x => x.GroupId == null) : rows.Where(x => x.GroupId == group);
        var term = (q ?? "").Trim();
        if (term.Length > 120) term = term[..120];
        if (term.Length > 0)
        {
            var digits = string.Concat(term.Where(char.IsDigit).Select(x => (char)('0' + (int)char.GetNumericValue(x))));
            var phoneQuery = digits.Length > 0 && term.All(x => char.IsDigit(x) || " +()-".Contains(x));
            foreach (var token in term.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries))
            {
                rows = rows.Where(x => EF.Functions.Collate(x.Name, "Arabic_100_CI_AI").Contains(token) ||
                    x.Email.Contains(token) || x.Phone.Contains(token) || phoneQuery &&
                    x.Phone.Replace(" ", "").Replace("-", "").Replace("(", "").Replace(")", "").Contains(digits));
            }
        }
        var count = await rows.CountAsync(ct);
        var items = await rows.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
            .Skip((number - 1) * size).Take(size)
            .Select(x => new ApplicationSummary(x.Id, x.Name, x.Email, x.Phone, x.Voice, x.Status, x.CreatedAt,
                x.GroupId, x.Group == null ? x.GroupNameEn : x.Group.NameEn,
                x.Group == null ? x.GroupNameAr : x.Group.NameAr)).ToListAsync(ct);
        return new(items, count, number, size);
    }

    private static ApplicationDetail Map(ChoirApplication row) =>
        new(new(row.Id, row.Name, row.Email, row.Phone, row.Voice, row.Status, row.CreatedAt,
                row.GroupId, row.Group?.NameEn ?? row.GroupNameEn, row.Group?.NameAr ?? row.GroupNameAr),
            row.Experience, row.Notes, row.Revision, row.UpdatedAt, row.RecordingName == "" ? "" : $"/api/admin/applications/{row.Id}/recording",
            row.BackingAudio, row.BackingTitle, row.RecordedWithBacking, row.RecordingMixed,
            row.PhotoName == "" ? "" : $"/api/admin/applications/{row.Id}/photo", RegistrationEndpoints.Answers(row));

    private static async Task<IResult> Detail(int id, KoralDb db, CancellationToken ct) =>
        await db.ChoirApplications.AsNoTracking().Include(x => x.Group).SingleOrDefaultAsync(x => x.Id == id, ct) is { } row
            ? Results.Ok(Map(row)) : Results.NotFound();

    private static async Task<IResult> Update(int id, ApplicationUpdate input, KoralDb db, Catalog catalog, HttpContext http, CancellationToken ct)
    {
        var statusOptions = (await RegistrationEndpoints.Schema(db, ct)).Statuses;
        if (!statusOptions.Any(x => x.Id == input.Status) || input.Notes is not { Length: <= 4000 })
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
        if (row.PhotoName != "") storage.Remove(Photos, row.PhotoName);
        return Results.NoContent();
    }

    private static IResult Conflict() => Results.Problem("This application changed. Reopen it before saving.", statusCode: 409);
}
