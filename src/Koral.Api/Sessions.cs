using Koral.Application;
using Koral.Infrastructure;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Koral.Api;

public static class Sessions
{
    public static string Actor(HttpContext context) => context.User.Identity?.Name ?? "";
    public static async Task<object> Session(ApplicationUser user, UserManager<ApplicationUser> users) =>
        new { user.Email, user.MustChangePassword, roles = await users.GetRolesAsync(user) };

    public static RouteGroupBuilder WithCsrf(this RouteGroupBuilder routes, bool requireReady = true)
    {
        return routes.AddEndpointFilter(async (context, next) =>
        {
            var http = context.HttpContext;
            if (!HttpMethods.IsGet(http.Request.Method) && !HttpMethods.IsHead(http.Request.Method))
            {
                try { await http.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(http); }
                catch (AntiforgeryValidationException) { return Results.Problem("Refresh and try again.", statusCode: 400); }
            }
            if (requireReady)
            {
                var user = await http.RequestServices.GetRequiredService<UserManager<ApplicationUser>>().GetUserAsync(http.User);
                if (user is null) return Results.Unauthorized();
                if (user.MustChangePassword) return Results.Problem("Change your password first.", statusCode: 403);
            }
            return await next(context);
        });
    }
    public static void MapSessions(this WebApplication app)
    {
        var auth = app.MapGroup("/api/auth").WithCsrf(false);
        auth.MapGet("/csrf", (HttpContext http, IAntiforgery csrf) => new { token = csrf.GetAndStoreTokens(http).RequestToken });
        auth.MapGet("/me", async (HttpContext http, UserManager<ApplicationUser> users) =>
            await users.GetUserAsync(http.User) is { } user ? Results.Ok(await Session(user, users)) : Results.Unauthorized())
            .RequireAuthorization("Staff");
        auth.MapPost("/login", async (Account input, UserManager<ApplicationUser> users, SignInManager<ApplicationUser> signIn) =>
        {
            if (input.Email is not { Length: > 0 and <= 254 } || input.Password is not { Length: > 0 and <= 256 })
                return Results.Unauthorized();
            var user = await users.FindByEmailAsync(input.Email.Trim());
            if (user is null || !(await signIn.PasswordSignInAsync(user, input.Password, false, true)).Succeeded)
                return Results.Unauthorized();
            return Results.Ok(await Session(user, users));
        }).RequireRateLimiting("login");
        auth.MapPost("/logout", async (SignInManager<ApplicationUser> signIn) => { await signIn.SignOutAsync(); return Results.NoContent(); })
            .RequireAuthorization("Staff");
        auth.MapPost("/password", async (PasswordChange input, HttpContext http, UserManager<ApplicationUser> users,
            SignInManager<ApplicationUser> signIn, KoralDb db, Catalog catalog) =>
        {
            var user = await users.GetUserAsync(http.User);
            if (user is null) return Results.Unauthorized();
            if (input.Password is not { Length: >= 12 and <= 256 } || input.Current is not { Length: > 0 and <= 256 } || input.Password == input.Current)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["password"] = ["Use a different password of at least 12 characters."] });
            await using var transaction = await db.Database.BeginTransactionAsync();
            user.MustChangePassword = false;
            var changed = await users.ChangePasswordAsync(user, input.Current, input.Password);
            if (!changed.Succeeded) return Errors(changed);
            catalog.Audit(Actor(http), "change-password", "users");
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            await signIn.RefreshSignInAsync(user);
            return Results.Ok(await Session(user, users));
        }).RequireAuthorization("Staff").RequireRateLimiting("login");

        var admins = app.MapGroup("/api/admin/users").RequireAuthorization("Owner").WithCsrf();
        admins.MapGet("/", async (UserManager<ApplicationUser> users) =>
        {
            var accounts = await users.Users.OrderBy(x => x.Email).ToListAsync();
            var result = new List<object>();
            foreach (var account in accounts) result.Add(new { account.Id, account.Email, account.MustChangePassword, roles = await users.GetRolesAsync(account) });
            return result;
        });
        admins.MapPost("/", async (UserInput input, UserManager<ApplicationUser> users, KoralDb db, Catalog catalog, HttpContext http) =>
        {
            if (input.Role is not ("SuperAdmin" or "ContentEditor") || input.Password is not { Length: >= 12 and <= 256 } ||
                input.Email is not { Length: > 0 and <= 254 })
                return Results.Problem("Enter a valid email, password, and role.", statusCode: 400);
            await using var transaction = await db.Database.BeginTransactionAsync();
            var user = new ApplicationUser { Email = input.Email.Trim(), UserName = input.Email.Trim(), MustChangePassword = true };
            var created = await users.CreateAsync(user, input.Password);
            if (!created.Succeeded) return Errors(created);
            var assigned = await users.AddToRoleAsync(user, input.Role);
            if (!assigned.Succeeded) return Errors(assigned);
            catalog.Audit(Actor(http), "create", "users");
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Results.Ok(await Session(user, users));
        });
        admins.MapDelete("/{id}", async (string id, UserManager<ApplicationUser> users, KoralDb db, Catalog catalog, HttpContext http) =>
        {
            var user = await users.FindByIdAsync(id);
            if (user is null) return Results.NotFound();
            if (id == users.GetUserId(http.User)) return Results.Problem("You cannot remove your own account.", statusCode: 409);
            await using var transaction = await db.Database.BeginTransactionAsync();
            var deleted = await users.DeleteAsync(user);
            if (!deleted.Succeeded) return Errors(deleted);
            catalog.Audit(Actor(http), "delete", "users");
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Results.NoContent();
        });
    }
    public static IResult Errors(IdentityResult result) => Results.ValidationProblem(new Dictionary<string, string[]>
        { ["account"] = result.Errors.Select(x => x.Description).ToArray() });

    public static async Task Bootstrap(IServiceProvider services, IConfiguration configuration, bool development)
    {
        var roles = services.GetRequiredService<RoleManager<IdentityRole>>();
        var users = services.GetRequiredService<UserManager<ApplicationUser>>();
        foreach (var role in new[] { "SuperAdmin", "ContentEditor" })
            if (!await roles.RoleExistsAsync(role)) Ensure(await roles.CreateAsync(new IdentityRole(role)));
        if ((await users.GetUsersInRoleAsync("SuperAdmin")).Count > 0) return;
        var email = configuration["Bootstrap:Email"] ?? (development ? "ADMIN@ADMIN.COM" : null);
        var password = configuration["Bootstrap:Password"] ?? (development ? "Admin@123456" : null);
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password) ||
            (!development && password == "Admin@123456"))
            throw new InvalidOperationException("Configure unique Bootstrap credentials for the first administrator.");
        var db = services.GetRequiredService<KoralDb>();
        await using var transaction = await db.Database.BeginTransactionAsync();
        var user = new ApplicationUser { UserName = email, Email = email, MustChangePassword = !development };
        Ensure(await users.CreateAsync(user, password));
        Ensure(await users.AddToRoleAsync(user, "SuperAdmin"));
        await transaction.CommitAsync();
    }
    private static void Ensure(IdentityResult result)
    {
        if (!result.Succeeded) throw new InvalidOperationException("Identity initialization failed: " + string.Join(", ", result.Errors.Select(x => x.Code)));
    }
}
