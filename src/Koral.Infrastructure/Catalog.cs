using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Koral.Application;
using Koral.Domain;
using Microsoft.EntityFrameworkCore;

namespace Koral.Infrastructure;

public sealed class Catalog(KoralDb db, IMediaStorage storage)
{
    public async Task<Profile> Profile() => Decode(await db.Profiles.Where(x => x.Id == 1).Select(x => x.Data).SingleOrDefaultAsync(), new Profile());
    public async Task<Settings> Settings() => Decode(await db.Settings.Where(x => x.Id == 1).Select(x => x.Data).SingleOrDefaultAsync(), new Settings());
    private static T Decode<T>(string? value, T fallback) => value is null ? fallback : JsonSerializer.Deserialize<T>(value) ?? fallback;
    public async Task SaveProfile(Profile input, string actor)
    {
        var entity = await db.Profiles.FindAsync(1);
        if (entity is null) db.Profiles.Add(entity = new ChoirProfile { Id = 1 });
        entity.Data = JsonSerializer.Serialize(input);
        entity.UpdatedAt = DateTimeOffset.UtcNow;
        Audit(actor, "update", "choir");
        await db.SaveChangesAsync();
    }
    public async Task SaveSettings(Settings input, string actor)
    {
        var entity = await db.Settings.FindAsync(1);
        if (entity is null) db.Settings.Add(entity = new SiteSetting { Id = 1 });
        entity.Data = JsonSerializer.Serialize(input);
        entity.UpdatedAt = DateTimeOffset.UtcNow;
        Audit(actor, "update", "settings");
        await db.SaveChangesAsync();
    }
    public void Audit(string actor, string action, string resource, int? id = null) =>
        db.Audit.Add(new AuditLog { Actor = actor, Action = action, Resource = resource, EntryId = id });

    public static readonly string[] Resources = ["albums", "songs", "gallery", "categories", "members", "events"];
    private IQueryable<Entry> Query(string resource, bool admin)
    {
        IQueryable<Entry> q = resource switch
        {
            "albums" => db.Albums.Include(x => x.Songs).Include(x => x.Links).Include(x => x.Groups).AsSplitQuery(),
            "songs" => db.Songs.Include(x => x.Album).Include(x => x.Links),
            "gallery" => db.Gallery.Include(x => x.Category), "categories" => db.Categories, "members" => db.Members, "events" => db.Events,
            _ => throw new ArgumentException("Unknown resource.")
        };
        return admin ? q : q.Where(x => x.Published);
    }
    private Content Map(Entry e, bool admin)
    {
        var item = new Content(e.Id, e.TitleEn, e.TitleAr, e.DescriptionEn, e.DescriptionAr, e.Image,
            e.Published, e.Featured, e.Sort, UpdatedAt: e.UpdatedAt);
        return e switch
        {
            Album a => item with { Slug = a.Slug, Date = a.Date, TrackCount = a.Songs.Count(s => admin || s.Published),
                Links = a.Links.Where(l => admin || (l.Enabled && !string.IsNullOrWhiteSpace(l.Url)))
                    .OrderBy(l => l.Sort).ThenBy(l => l.Id)
                    .Select(l => new Platform(l.Platform, l.Url, l.Label, Sort: l.Sort, Enabled: l.Enabled)).ToList(),
                GroupIds = a.Groups.Select(g => g.Id).Order().ToList() },
            Song s => item with {
                Slug = s.Slug, Date = s.Date, AlbumId = admin || s.Album?.Published == true ? s.AlbumId : null,
                AlbumTitleEn = admin || s.Album?.Published == true ? s.Album?.TitleEn ?? "" : "",
                AlbumTitleAr = admin || s.Album?.Published == true ? s.Album?.TitleAr ?? "" : "",
                AlbumSlug = admin || s.Album?.Published == true ? s.Album?.Slug ?? "" : "",
                Audio = admin ? s.Audio : PublicAudio(s.Audio), LyricsEn = s.LyricsEn, LyricsAr = s.LyricsAr,
                Composer = s.Composer, Lyricist = s.Lyricist,
                Arranger = s.Arranger, Conductor = s.Conductor, Duration = s.Duration,
                Links = s.Links.OrderBy(l => l.Sort).ThenBy(l => l.Id)
                    .Select(l => new Platform(l.Platform, l.Url, l.Label, l.Icon, l.Sort, l.Enabled))
                    .Where(l => admin || InputRules.TrackSource(l)).ToList()
            },
            GalleryItem g => item with { CategoryId = admin || g.Category?.Published == true ? g.CategoryId : null,
                Video = g.Video, CaptionEn = g.CaptionEn, CaptionAr = g.CaptionAr },
            ChoirMember m => item with { PositionAr = m.PositionAr, PositionEn = m.PositionEn },
            Event ev => item with { Date = ev.Date, End = ev.End, Status = ev.Status, Location = ev.Location, Registration = ev.Registration },
            _ => item
        };
    }

    private string PublicAudio(string audio)
    {
        if (!InputRules.SongAudio(audio)) return "";
        return audio.StartsWith('/') && !storage.Exists("audio", audio.Split('/')[3]) ? "" : audio;
    }

    public async Task<Page<Content>> List(string resource, bool admin, string? search, int page, int size,
        bool? featured = null, int? album = null, int? category = null, int? year = null, string? order = null, bool? upcoming = null,
        int? group = null)
    {
        page = Math.Clamp(page, 1, 1000000);
        size = Math.Clamp(size, 1, 100);
        var q = Query(resource, admin).AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            q = q.Where(x => x.TitleAr.Contains(term) || x.TitleEn.Contains(term) || x.DescriptionAr.Contains(term) || x.DescriptionEn.Contains(term));
        }
        if (featured == true) q = q.Where(x => x.Featured);
        if (album.HasValue && resource == "songs") q = q.OfType<Song>().Where(x => x.AlbumId == album);
        if (group.HasValue && resource == "albums") q = q.OfType<Album>().Where(x => x.Groups.Any(g => g.Id == group));
        if (category.HasValue && resource == "gallery")
            q = q.OfType<GalleryItem>().Where(x => x.CategoryId == category && (admin || x.Category!.Published));
        if (year is >= 1 and <= 9999 && resource == "albums") q = q.OfType<Album>().Where(x => x.Date!.Value.Year == year);
        if (upcoming.HasValue && resource == "events")
        {
            var now = DateTimeOffset.UtcNow;
            q = q.OfType<Event>().Where(x => upcoming.Value == ((x.End ?? x.Date) >= now));
        }
        var total = await q.CountAsync();
        IOrderedQueryable<Entry> ordered = (resource, order) switch
        {
            ("songs", "latest") => q.OfType<Song>().OrderByDescending(x => x.Date ?? x.CreatedAt),
            ("events", "date") => q.OfType<Event>().OrderBy(x => x.Date),
            ("events", "latest") => q.OfType<Event>().OrderByDescending(x => x.Date),
            (_, "latest") => q.OrderByDescending(x => x.CreatedAt),
            (_, "updated") => q.OrderByDescending(x => x.UpdatedAt),
            _ => q.OrderBy(x => x.Sort)
        };
        var rows = await ordered.ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToListAsync();
        return new(rows.Select(x => Map(x, admin)).ToList(), total, page, size);
    }

    public async Task<Content?> Detail(string resource, string slug)
    {
        var q = Query(resource, false).AsNoTracking();
        Entry? entry = resource == "albums"
            ? await q.OfType<Album>().FirstOrDefaultAsync(x => x.Slug == slug)
            : await q.OfType<Song>().FirstOrDefaultAsync(x => x.Slug == slug);
        return entry is null ? null : Map(entry, false);
    }
    public async Task<Content?> Get(string resource, int id)
    {
        var entry = await Query(resource, true).AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        return entry is null ? null : Map(entry, true);
    }
    public async Task<List<Content>?> AlbumTracks(string slug)
    {
        var id = await db.Albums.Where(x => x.Slug == slug && x.Published).Select(x => (int?)x.Id).SingleOrDefaultAsync();
        if (id is null) return null;
        var tracks = await db.Songs.AsNoTracking().Include(x => x.Album).Include(x => x.Links)
            .Where(x => x.AlbumId == id && x.Published).OrderBy(x => x.Sort).ThenBy(x => x.Id).ToListAsync();
        return tracks.Select(x => Map(x, false)).ToList();
    }
    public async Task<bool> MediaExists(string path, string kind)
    {
        if (path == "") return true;
        if (!InputRules.Media(path)) return false;
        var parts = path.Split('/');
        var name = parts[3];
        return await db.Media.AnyAsync(x => x.Bucket == parts[2] && x.Name == name && x.ContentType.StartsWith(kind));
    }
    private async Task<string> GenerateAlbumSlug(string title)
    {
        var normalized = string.Concat(title.Normalize(NormalizationForm.FormD)
            .Where(character => char.GetUnicodeCategory(character) != UnicodeCategory.NonSpacingMark));
        var stem = Regex.Replace(normalized.ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');
        if (stem.Length > 150) stem = stem[..150].TrimEnd('-');
        if (stem == "") stem = "album";

        var prefix = stem + "-";
        var occupied = (await db.Albums.Where(album => album.Slug == stem || album.Slug.StartsWith(prefix))
            .Select(album => album.Slug).ToListAsync()).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var candidate = stem;
        for (var suffix = 2; occupied.Contains(candidate); suffix++)
            candidate = prefix + suffix.ToString(CultureInfo.InvariantCulture);
        return candidate;
    }
    public async Task<(Content? Row, string? Error, bool Missing)> Save(string resource, int? id, Content input, string actor)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        Entry? entry = id.HasValue ? await Query(resource, true).FirstOrDefaultAsync(x => x.Id == id) : resource switch
        {
            "albums" => new Album(), "songs" => new Song(), "gallery" => new GalleryItem(),
            "categories" => new GalleryCategory(), "members" => new ChoirMember(), "events" => new Event(), _ => null
        };
        if (entry is null) return (null, null, true);
        if (!await MediaExists(input.Image, "image/")) return (null, "image", false);
        switch (entry)
        {
            case Album a:
                var slug = input.Slug;
                if (string.IsNullOrWhiteSpace(slug))
                    slug = id.HasValue ? a.Slug : await GenerateAlbumSlug(input.TitleEn);
                else if (await db.Albums.AnyAsync(x => x.Id != id && x.Slug == slug))
                    return (null, "slug", false);
                if (input.GroupIds is not null)
                {
                    var groupIds = input.GroupIds.Distinct().ToArray();
                    var groups = await db.ChoirGroups.Where(g => groupIds.Contains(g.Id)).ToListAsync();
                    if (groups.Count != groupIds.Length) return (null, "groupIds", false);
                    a.Groups = groups;
                }
                if (input.Links is not null)
                {
                    a.Links.Clear();
                    foreach (var link in input.Links) a.Links.Add(new AlbumPlatformLink
                        { Platform = link.PlatformName.Trim(), Url = link.Url?.Trim() ?? "", Label = link.Label,
                            Sort = link.Sort, Enabled = link.Enabled });
                }
                (a.Slug, a.Date) = (slug, input.Date);
                break;
            case Song s:
                if (await db.Songs.AnyAsync(x => x.Id != id && x.Slug == input.Slug)) return (null, "slug", false);
                if (input.AlbumId is int album && !await db.Albums.AnyAsync(x => x.Id == album)) return (null, "albumId", false);
                if (input.Audio.StartsWith('/') && !await MediaExists(input.Audio, "audio/")) return (null, "audio", false);
                (s.Slug, s.Date, s.AlbumId, s.Audio, s.LyricsEn, s.LyricsAr) =
                    (input.Slug, input.Date, input.AlbumId, input.Audio, input.LyricsEn, input.LyricsAr);
                (s.Composer, s.Lyricist, s.Arranger, s.Conductor, s.Duration) =
                    (input.Composer, input.Lyricist, input.Arranger, input.Conductor, input.Duration);
                if (input.Links is not null)
                {
                    if (input.Links.Any(l => l.Enabled && !InputRules.TrackSource(l) &&
                        !s.Links.Any(existing => existing.Enabled && existing.Platform == l.PlatformName && existing.Url == l.Url)))
                        return (null, "links", false);
                    s.Links.Clear();
                    foreach (var l in input.Links) s.Links.Add(new SongPlatformLink
                        { Platform = l.PlatformName.Trim(), Url = l.Url?.Trim() ?? "", Label = l.Label, Icon = l.Icon, Sort = l.Sort, Enabled = l.Enabled });
                }
                break;
            case GalleryItem g:
                if (input.CategoryId is int category && !await db.Categories.AnyAsync(x => x.Id == category)) return (null, "categoryId", false);
                if (input.Video.StartsWith('/') && !await MediaExists(input.Video, "video/")) return (null, "video", false);
                (g.CategoryId, g.Video, g.CaptionEn, g.CaptionAr) = (input.CategoryId, input.Video, input.CaptionEn, input.CaptionAr);
                break;
            case ChoirMember m:
                (m.PositionEn, m.PositionAr) = (input.PositionEn, input.PositionAr);
                break;
            case Event ev:
                (ev.Date, ev.End, ev.Location, ev.Registration, ev.Status) = (input.Date, input.End, input.Location, input.Registration, input.Status);
                break;
        }
        (entry.TitleEn, entry.TitleAr, entry.DescriptionEn, entry.DescriptionAr) =
            (input.TitleEn.Trim(), input.TitleAr.Trim(), input.DescriptionEn, input.DescriptionAr);
        (entry.Image, entry.Published, entry.Featured, entry.Sort, entry.UpdatedAt) =
            (input.Image, input.Published, input.Featured, input.Sort, DateTimeOffset.UtcNow);
        if (!id.HasValue) db.Add(entry);
        await db.SaveChangesAsync();
        Audit(actor, id.HasValue ? "update" : "create", resource, entry.Id);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return (Map(entry, true), null, false);
    }
    public Task<AlbumDeletion?> AlbumDeleteImpact(int id) => db.Albums.Where(x => x.Id == id)
        .Select(x => new AlbumDeletion(x.Songs.Count, x.Groups.Count, x.Links.Count)).SingleOrDefaultAsync();

    public async Task<int> Delete(string resource, int id, string actor, AlbumDeletion? confirmed)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
        var entity = await Query(resource, true).FirstOrDefaultAsync(x => x.Id == id);
        if (entity is null) return 404;
        if (entity is Album album)
        {
            var actual = new AlbumDeletion(album.Songs.Count, album.Groups.Count, album.Links.Count);
            if (actual != new AlbumDeletion(0, 0, 0) && actual != confirmed) return 409;
        }
        db.Remove(entity);
        Audit(actor, "delete", resource, id);
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return 204;
    }
    public async Task<bool> Order(int album, List<int> ids, string actor)
    {
        var rows = await db.Songs.Where(x => x.AlbumId == album).ToListAsync();
        if (rows.Count != ids.Count || !rows.Select(x => x.Id).ToHashSet().SetEquals(ids)) return false;
        for (var i = 0; i < ids.Count; i++)
        {
            var song = rows.Single(x => x.Id == ids[i]);
            song.Sort = i;
            song.UpdatedAt = DateTimeOffset.UtcNow;
        }
        Audit(actor, "reorder", "songs", album);
        await db.SaveChangesAsync();
        return true;
    }
    public async Task<bool> SetTrack(int albumId, int songId, bool attach, string actor)
    {
        if (!await db.Albums.AnyAsync(x => x.Id == albumId)) return false;
        var song = await db.Songs.FindAsync(songId);
        if (song is null || (!attach && song.AlbumId != albumId)) return false;
        if (attach && song.AlbumId == albumId) return true;
        song.AlbumId = attach ? albumId : null;
        if (attach)
        {
            var last = await db.Songs.Where(x => x.AlbumId == albumId).MaxAsync(x => (int?)x.Sort);
            song.Sort = Math.Min((last ?? -1) + 1, 100000);
        }
        song.UpdatedAt = DateTimeOffset.UtcNow;
        Audit(actor, attach ? "assign" : "unassign", "songs", songId);
        await db.SaveChangesAsync();
        return true;
    }
    public async Task<object> Dashboard(bool includeAudit)
    {
        var now = DateTimeOffset.UtcNow;
        return new
        {
            albums = await db.Albums.CountAsync(), songs = await db.Songs.CountAsync(),
            published = await db.Songs.CountAsync(x => x.Published), drafts = await db.Songs.CountAsync(x => !x.Published),
            gallery = await db.Gallery.CountAsync(),
            upcoming = await db.Events.CountAsync(x => x.Published && (x.End ?? x.Date) >= now && x.Status != "cancelled"),
            recent = await db.Audit.OrderByDescending(x => x.At).Where(x => x.EntryId != null && x.Action == "create")
                .Take(8).Select(x => new Activity("", x.Action, x.Resource, x.EntryId, x.At)).ToListAsync(),
            activity = includeAudit ? await db.Audit.OrderByDescending(x => x.At).Take(12)
                .Select(x => new Activity(x.Actor, x.Action, x.Resource, x.EntryId, x.At)).ToListAsync() : []
        };
    }
}
