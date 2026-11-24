using System.Text.Encodings.Web;
using System.Text.Json;
using System.Xml.Linq;
using Koral.Application;
using Koral.Infrastructure;

namespace Koral.Api;

public static class Pages
{
    public static void MapPages(this WebApplication app)
    {
        app.MapGet("/robots.txt", (HttpContext http, IConfiguration config, IWebHostEnvironment env) =>
            Results.Text($"User-agent: *\nDisallow: /ADMIN\nDisallow: /api/\nSitemap: {Origin(http, config, env)}/sitemap.xml\n", "text/plain"));
        app.MapGet("/sitemap.xml", async (Catalog catalog, HttpContext http, IConfiguration config, IWebHostEnvironment env) =>
        {
            var settings = await catalog.Settings();
            var paths = new List<string> { "/", "/about", "/albums", "/songs", "/gallery", "/join" };
            if (settings.Members) paths.Add("/members");
            if (settings.Events) paths.Add("/events");
            foreach (var resource in new[] { "albums", "songs" })
            {
                for (var page = 1; ; page++)
                {
                    var rows = await catalog.List(resource, false, null, page, 100);
                    paths.AddRange(rows.Items.Select(x => $"/{resource}/{x.Slug}"));
                    if (page * 100 >= rows.Total) break;
                }
            }
            XNamespace ns = "http://www.sitemaps.org/schemas/sitemap/0.9";
            var origin = Origin(http, config, env);
            return Results.Text(new XElement(ns + "urlset", paths.Select(path => new XElement(ns + "url", new XElement(ns + "loc", origin + path)))).ToString(), "application/xml");
        });
        app.MapFallback(async (HttpContext http, Catalog catalog, IWebHostEnvironment env, IConfiguration config) =>
        {
            if (http.Request.Path.StartsWithSegments("/api") || http.Request.Path.StartsWithSegments("/uploads") ||
                Path.HasExtension(http.Request.Path.Value)) return Results.NotFound();
            var file = Path.Combine(env.ContentRootPath, "wwwroot", "index.html");
            if (!File.Exists(file)) return Results.NotFound();
            var html = await File.ReadAllTextAsync(file);
            var path = http.Request.Path.Value ?? "/";
            var parts = path.Trim('/').Split('/');
            var resource = parts[0].ToLowerInvariant();
            var settings = await catalog.Settings();
            var profile = await catalog.Profile();
            var admin = resource == "admin";
            var arabic = settings.DefaultLanguage == "ar";
            var valid = path == "/" || (parts.Length == 1 && resource is "about" or "albums" or "songs" or "gallery" or "search" or "join") ||
                (parts.Length == 1 && (resource == "members" && settings.Members || resource == "events" && settings.Events)) || admin;
            Content? item = null;
            if (parts.Length == 2 && resource is "albums" or "songs")
            {
                item = await catalog.Detail(resource, parts[1]);
                valid = item is not null;
            }
            var site = Choose(arabic ? settings.TitleAr : settings.TitleEn, arabic ? profile.NameAr : profile.NameEn);
            var pageTitle = item is not null ? (arabic ? item.TitleAr : item.TitleEn) : resource switch
            {
                "about" => arabic ? "عن الكورال" : "About",
                "albums" => arabic ? "الألبومات" : "Albums",
                "songs" => arabic ? "الأغاني" : "Songs",
                "gallery" => arabic ? "المعرض" : "Gallery",
                "join" => arabic ? "انضم للكورال" : "Join the choir",
                "members" => arabic ? "الأعضاء" : "Members",
                "events" => arabic ? "الفعاليات" : "Events",
                "search" => arabic ? "البحث" : "Search",
                "admin" => arabic ? "الاستوديو" : "Studio",
                _ => ""
            };
            var title = string.IsNullOrWhiteSpace(pageTitle) ? site : pageTitle + " | " + site;
            var description = Choose(item is null ? "" : arabic ? item.DescriptionAr : item.DescriptionEn,
                Choose(arabic ? settings.DescriptionAr : settings.DescriptionEn, arabic ? profile.IntroAr : profile.IntroEn));
            if (resource == "join") description = arabic ? "الاشتراك في كورال يوسف الصديق" : "Registration for Youssef El-Seddik Choir";
            var origin = Origin(http, config, env);
            var url = origin + path;
            var image = Choose(item?.Image, profile.Cover);
            var encode = HtmlEncoder.Default;
            var head = $"<title>{encode.Encode(title)}</title><meta name=\"description\" content=\"{encode.Encode(description)}\">";
            if (admin || resource == "search" || !valid) head += "<meta name=\"robots\" content=\"noindex\">";
            else
            {
                head += $"<link rel=\"canonical\" href=\"{encode.Encode(url)}\"><meta property=\"og:url\" content=\"{encode.Encode(url)}\">";
                head += $"<meta property=\"og:title\" content=\"{encode.Encode(title)}\"><meta property=\"og:description\" content=\"{encode.Encode(description)}\">";
                head += $"<meta property=\"og:type\" content=\"website\"><meta property=\"og:image\" content=\"{encode.Encode(origin + Choose(image, "/media/choir.webp"))}\">";
                if (item is not null)
                {
                    var schema = new Dictionary<string, object> { ["@context"] = "https://schema.org", ["@type"] = resource == "albums" ? "MusicAlbum" : "MusicRecording",
                        ["name"] = arabic ? item.TitleAr : item.TitleEn, ["url"] = url };
                    if (item.Date is { } date) schema["datePublished"] = date.ToString("yyyy-MM-dd");
                    head += $"<script type=\"application/ld+json\">{JsonSerializer.Serialize(schema)}</script>";
                }
            }
            if (!string.IsNullOrEmpty(settings.Favicon))
                html = html.Replace("/media/mark.svg", encode.Encode(settings.Favicon));
            html = html.Replace("<title>Koral Choir</title>", head).Replace("lang=\"en\"", arabic ? "lang=\"ar\" dir=\"rtl\"" : "lang=\"en\" dir=\"ltr\"");
            return Results.Content(html, "text/html; charset=utf-8", statusCode: valid ? 200 : 404);
        });
    }
    static string Choose(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback : value;
    static string Origin(HttpContext http, IConfiguration config, IWebHostEnvironment env) =>
        config["Hosting:PublicUrl"]?.TrimEnd('/') ?? (env.IsDevelopment() ? $"{http.Request.Scheme}://{http.Request.Host}" : throw new InvalidOperationException("Set Hosting__PublicUrl."));
}
