namespace Koral.Domain;

public abstract class Entry
{
    public int Id { get; set; }
    public string TitleEn { get; set; } = "";
    public string TitleAr { get; set; } = "";
    public string DescriptionEn { get; set; } = "";
    public string DescriptionAr { get; set; } = "";
    public string Image { get; set; } = "";
    public bool Published { get; set; }
    public bool Featured { get; set; }
    public int Sort { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class Album : Entry
{
    public string Slug { get; set; } = "";
    public DateTimeOffset? Date { get; set; }
    public List<Song> Songs { get; set; } = [];
    public List<AlbumPlatformLink> Links { get; set; } = [];
    public List<ChoirGroup> Groups { get; set; } = [];
}
public sealed class AlbumPlatformLink
{
    public int Id { get; set; }
    public int AlbumId { get; set; }
    public string Platform { get; set; } = "";
    public string Url { get; set; } = "";
    public string Label { get; set; } = "";
    public int Sort { get; set; }
    public bool Enabled { get; set; } = true;
}
public sealed class Song : Entry
{
    public string Slug { get; set; } = "";
    public DateTimeOffset? Date { get; set; }
    public int? AlbumId { get; set; }
    public Album? Album { get; set; }
    public string Audio { get; set; } = "";
    public string LyricsEn { get; set; } = "";
    public string LyricsAr { get; set; } = "";
    public string Composer { get; set; } = "";
    public string Lyricist { get; set; } = "";
    public string Arranger { get; set; } = "";
    public string Conductor { get; set; } = "";
    public int? Duration { get; set; }
    public List<SongPlatformLink> Links { get; set; } = [];
}
public sealed class SongPlatformLink
{
    public int Id { get; set; }
    public int SongId { get; set; }
    public string Platform { get; set; } = "";
    public string Url { get; set; } = "";
    public string Label { get; set; } = "";
    public string Icon { get; set; } = "";
    public int Sort { get; set; }
    public bool Enabled { get; set; } = true;
}
public sealed class GalleryCategory : Entry;
public sealed class GalleryItem : Entry
{
    public int? CategoryId { get; set; }
    public GalleryCategory? Category { get; set; }
    public string Video { get; set; } = "";
    public string CaptionEn { get; set; } = "";
    public string CaptionAr { get; set; } = "";
}
public sealed class ChoirMember : Entry
{
    public string PositionEn { get; set; } = "";
    public string PositionAr { get; set; } = "";
}
public sealed class Event : Entry
{
    public DateTimeOffset? Date { get; set; }
    public DateTimeOffset? End { get; set; }
    public string Location { get; set; } = "";
    public string Registration { get; set; } = "";
    public string Status { get; set; } = "scheduled";
}
public sealed class ChoirProfile
{
    public int Id { get; set; }
    public string Data { get; set; } = "{}";
    public DateTimeOffset UpdatedAt { get; set; }
}
public sealed class SiteSetting
{
    public int Id { get; set; }
    public string Data { get; set; } = "{}";
    public DateTimeOffset UpdatedAt { get; set; }
}
public sealed class AuditLog
{
    public long Id { get; set; }
    public string Actor { get; set; } = "";
    public string Action { get; set; } = "";
    public string Resource { get; set; } = "";
    public int? EntryId { get; set; }
    public DateTimeOffset At { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class MediaAsset
{
    public Guid Id { get; set; }
    public string Bucket { get; set; } = "";
    public string Name { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long Size { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
