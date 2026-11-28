using System.Text.Json;
using Koral.Application;
using Koral.Domain;
using Koral.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Koral.Api;

internal static class RegistrationEndpoints
{
    private static RegistrationSchema Decode(RegistrationForm? row) => row is null ? Registration.Default() :
        JsonSerializer.Deserialize<RegistrationSchema>(row.Fields, Registration.Json)! with { Revision = row.Revision };

    internal static async Task<RegistrationSchema> Schema(KoralDb db, CancellationToken ct) =>
        Decode(await db.RegistrationForms.AsNoTracking().SingleOrDefaultAsync(x => x.Id == 1, ct));

    internal static List<RegistrationAnswer> Answers(ChoirApplication row) =>
        JsonSerializer.Deserialize<List<RegistrationAnswer>>(row.FormAnswers, Registration.Json) ?? [];

    internal static void MapRegistration(this WebApplication app)
    {
        app.MapGet("/api/join/form", async (KoralDb db, Catalog catalog, HttpContext http, CancellationToken ct) =>
        {
            http.Response.Headers.CacheControl = "no-cache";
            if (!(await catalog.Settings()).HomeJoin) return Results.NotFound();
            var schema = await Schema(db, ct);
            return Results.Ok(new { schema.Revision, Fields = schema.Fields.Where(x => x.Visible) });
        });
        var editor = app.MapGroup("/api/admin/registration-form").RequireAuthorization("Owner").WithCsrf();
        editor.MapGet("/", Schema);
        editor.MapPut("/", Save);
    }

    private static async Task<IResult> Save(RegistrationSchema input, KoralDb db, Catalog catalog, HttpContext http, CancellationToken ct)
    {
        if (!Registration.Valid(input))
            return Results.Problem("Check the field labels, rules and choice lists. Keep the initial status.", statusCode: 400);
        var row = await db.RegistrationForms.FindAsync([1], ct);
        if (input.Revision != (row?.Revision ?? Guid.Empty))
            return Results.Problem("The form changed. Reload it before saving.", statusCode: 409);
        var old = Decode(row);
        var removed = old.Statuses.Select(x => x.Id).Except(input.Statuses.Select(x => x.Id)).ToList();
        if (removed.Count > 0 && await db.ChoirApplications.AnyAsync(x => removed.Contains(x.Status), ct))
            return Results.Problem("A removed status is still used by applications. Move those applications to another status first.", statusCode: 409);
        if (row is null) db.RegistrationForms.Add(row = new RegistrationForm { Id = 1 });
        row.Revision = Guid.NewGuid();
        var result = input with { Revision = row.Revision };
        row.Fields = JsonSerializer.Serialize(result, Registration.Json);
        catalog.Audit(Sessions.Actor(http), "update", "registration-form");
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Problem("The form changed. Reload it before saving.", statusCode: 409);
        }
        catch (DbUpdateException e) when (e.InnerException is SqlException { Number: 2601 or 2627 })
        {
            return Results.Problem("The form changed. Reload it before saving.", statusCode: 409);
        }
        return Results.Ok(result);
    }
}
