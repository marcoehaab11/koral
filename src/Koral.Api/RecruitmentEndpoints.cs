using Koral.Application;
using Koral.Domain;
using Koral.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Koral.Api;

public static class RecruitmentEndpoints
{
    public static void MapRecruitment(this WebApplication app)
    {
        app.MapGroup("/api/join").WithCsrf(false).MapPost("/", Submit).RequireRateLimiting("recruitment")
            .WithMetadata(new RequestSizeLimitAttribute(16_384));

        var admin = app.MapGroup("/api/admin/applications").RequireAuthorization("Owner").WithCsrf();
        admin.MapGet("/", List);
        admin.MapGet("/{id:int}", Detail);
        admin.MapPut("/{id:int}", Update);
        admin.MapDelete("/{id:int}", Delete);
    }

    private static async Task<IResult> Submit(JoinInput input, KoralDb db, CancellationToken ct)
    {
        input = input with { Name = input.Name?.Trim() ?? "", Email = input.Email?.Trim() ?? "", Phone = input.Phone?.Trim() ?? "",
            Experience = input.Experience?.Trim() ?? "" };
        var validation = await Recruitment.Validate.ValidateAsync(input, ct);
        if (!validation.IsValid)
            return Results.ValidationProblem(validation.Errors.GroupBy(x => x.PropertyName)
                .ToDictionary(x => System.Text.Json.JsonNamingPolicy.CamelCase.ConvertName(x.Key), x => x.Select(e => e.ErrorMessage).ToArray()));

        var now = DateTimeOffset.UtcNow;
        db.ChoirApplications.Add(new ChoirApplication
        {
            Name = input.Name, Email = input.Email, NormalizedEmail = input.Email.ToUpperInvariant(),
            Phone = input.Phone, Voice = input.Voice, Experience = input.Experience,
            Revision = Guid.NewGuid(), CreatedAt = now, UpdatedAt = now
        });
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException error) when (error.InnerException is SqlException { Number: 2601 or 2627 })
        {
            // Return the same response for existing applicants without replacing private CRM data.
        }
        return Results.NoContent();
    }

    private static async Task<Page<ApplicationSummary>> List(KoralDb db, string? q, string? status, int? page, CancellationToken ct)
    {
        const int size = 20;
        var number = Math.Clamp(page ?? 1, 1, 1_000_000);
        var rows = db.ChoirApplications.AsNoTracking();
        if (Recruitment.Statuses.Contains(status)) rows = rows.Where(x => x.Status == status);
        var term = (q ?? "").Trim();
        if (term.Length > 120) term = term[..120];
        if (term.Length > 0) rows = rows.Where(x => x.Name.Contains(term) || x.Email.Contains(term) || x.Phone.Contains(term));
        var count = await rows.CountAsync(ct);
        var items = await rows.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
            .Skip((number - 1) * size).Take(size)
            .Select(x => new ApplicationSummary(x.Id, x.Name, x.Email, x.Phone, x.Voice, x.Status, x.CreatedAt)).ToListAsync(ct);
        return new(items, count, number, size);
    }

    private static ApplicationDetail Map(ChoirApplication row) =>
        new(new(row.Id, row.Name, row.Email, row.Phone, row.Voice, row.Status, row.CreatedAt),
            row.Experience, row.Notes, row.Revision, row.UpdatedAt);

    private static async Task<IResult> Detail(int id, KoralDb db, CancellationToken ct) =>
        await db.ChoirApplications.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) is { } row
            ? Results.Ok(Map(row)) : Results.NotFound();

    private static async Task<IResult> Update(int id, ApplicationUpdate input, KoralDb db, Catalog catalog, HttpContext http, CancellationToken ct)
    {
        if (!Recruitment.Statuses.Contains(input.Status) || input.Notes is not { Length: <= 4000 })
            return Results.Problem("Select a status and enter no more than 4,000 characters in notes.", statusCode: 400);

        var row = await db.ChoirApplications.FindAsync([id], ct);
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

    private static async Task<IResult> Delete(int id, KoralDb db, Catalog catalog, HttpContext http, CancellationToken ct)
    {
        var row = await db.ChoirApplications.FindAsync([id], ct);
        if (row is null) return Results.NotFound();
        db.Remove(row);
        catalog.Audit(Sessions.Actor(http), "delete", "applications", id);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Conflict(); }
        return Results.NoContent();
    }

    private static IResult Conflict() => Results.Problem("This application changed. Reopen it before saving.", statusCode: 409);
}
