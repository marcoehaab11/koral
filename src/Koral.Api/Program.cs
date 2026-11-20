using System.Threading.RateLimiting;
using Koral.Api;
using Koral.Application;
using Koral.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Server.IIS;
using Microsoft.EntityFrameworkCore;
using Serilog;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;
var development = builder.Environment.IsDevelopment();
var connection = config.GetConnectionString("Koral") ?? (development
    ? "Server=localhost;Database=KoralDev;Integrated Security=true;TrustServerCertificate=true"
    : throw new InvalidOperationException("Set ConnectionStrings__Koral."));
var mediaRoot = Path.GetFullPath(config["Media:Root"] ?? "App_Data/media", builder.Environment.ContentRootPath);
var keyRoot = Path.GetFullPath(config["Security:KeyPath"] ?? "App_Data/keys", builder.Environment.ContentRootPath);
var maxUpload = Math.Clamp(config.GetValue("Media:MaxUploadBytes", 25_000_000L), 1_000_000L, 100_000_000L);
builder.Services.Configure<FormOptions>(x => x.MultipartBodyLengthLimit = maxUpload);
builder.Services.Configure<IISServerOptions>(x => x.MaxRequestBodySize = maxUpload + 131072);
builder.WebHost.ConfigureKestrel(x => x.Limits.MaxRequestBodySize = maxUpload + 131072);
builder.Services.AddSingleton<IMediaStorage>(_ => new LocalMediaStorage(mediaRoot));
builder.Services.AddDataProtection().SetApplicationName("Koral").PersistKeysToFileSystem(Directory.CreateDirectory(keyRoot));
builder.Services.AddDbContext<KoralDb>(x => x.UseSqlServer(connection));
builder.Services.AddScoped<Catalog>();
builder.Services.AddIdentity<ApplicationUser, IdentityRole>(x =>
{
    x.User.RequireUniqueEmail = true;
    x.Password.RequiredLength = 12;
    x.Lockout.MaxFailedAccessAttempts = 5;
    x.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
}).AddEntityFrameworkStores<KoralDb>().AddDefaultTokenProviders();
builder.Services.ConfigureApplicationCookie(x =>
{
    x.Cookie.Name = "Koral.Session";
    x.Cookie.HttpOnly = true;
    x.Cookie.SecurePolicy = development ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    x.Cookie.SameSite = SameSiteMode.Lax;
    x.ExpireTimeSpan = TimeSpan.FromHours(8);
    x.SlidingExpiration = false;
    x.Events.OnRedirectToLogin = c => { c.Response.StatusCode = 401; return Task.CompletedTask; };
    x.Events.OnRedirectToAccessDenied = c => { c.Response.StatusCode = 403; return Task.CompletedTask; };
});
builder.Services.AddAntiforgery(x =>
{
    x.HeaderName = "X-CSRF-TOKEN";
    x.Cookie.Name = "Koral.Csrf";
    x.Cookie.SecurePolicy = development ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
});
builder.Services.AddAuthorizationBuilder().AddPolicy("Staff", p => p.RequireRole("SuperAdmin", "ContentEditor"))
    .AddPolicy("Owner", p => p.RequireRole("SuperAdmin"));
builder.Services.AddRateLimiter(x =>
{
    x.RejectionStatusCode = 429;
    x.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 12, Window = TimeSpan.FromMinutes(1) }));
    x.AddPolicy("recruitment", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(10) }));
});
builder.Services.AddProblemDetails();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSerilog(x => x.MinimumLevel.Override("Microsoft.EntityFrameworkCore.Database.Command", Serilog.Events.LogEventLevel.Warning).WriteTo.Console());
var app = builder.Build();
app.UseExceptionHandler();
if (!development)
{
    app.UseHsts();
    if (!config.GetValue<bool>("Hosting:DisableHttpsRedirect")) app.UseHttpsRedirection();
}
app.Use(async (context, next) =>
{
    context.Response.Headers.XContentTypeOptions = "nosniff";
    context.Response.Headers.XFrameOptions = "DENY";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    if (context.Request.Path.StartsWithSegments("/api/admin") || context.Request.Path.StartsWithSegments("/api/auth"))
        context.Response.Headers.CacheControl = "no-store";
    await next();
});
app.UseSerilogRequestLogging();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
if (development) { app.UseSwagger(); app.UseSwaggerUI(); }
app.MapSessions();
app.MapContent();
app.MapRecruitment();
app.MapMedia(maxUpload);
app.MapPages();
if (!EF.IsDesignTime)
{
    await using var scope = app.Services.CreateAsyncScope();
    var services = scope.ServiceProvider;
    if (development || config.GetValue<bool>("Database:MigrateOnStartup"))
        await services.GetRequiredService<KoralDb>().Database.MigrateAsync();
    await Sessions.Bootstrap(services, config, development);
}
await app.RunAsync();
