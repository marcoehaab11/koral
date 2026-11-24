using FluentValidation;

namespace Koral.Application;

public sealed record Platform(string PlatformName = "", string Url = "", string Label = "", string Icon = "", int Sort = 0, bool Enabled = true);
public sealed record Content(
    int Id = 0, string TitleEn = "", string TitleAr = "", string DescriptionEn = "", string DescriptionAr = "",
    string Image = "", bool Published = false, bool Featured = false, int Sort = 0, string Slug = "",
    DateTimeOffset? Date = null, int? AlbumId = null, string Audio = "", string LyricsEn = "", string LyricsAr = "",
    string Composer = "", string Lyricist = "", string Arranger = "", string Conductor = "", int? Duration = null,
    List<Platform>? Links = null, int? CategoryId = null, string Video = "", string PositionEn = "", string PositionAr = "",
    DateTimeOffset? End = null, string Location = "", string Registration = "", string Status = "scheduled",
    int TrackCount = 0, string AlbumTitleEn = "", string AlbumTitleAr = "", string AlbumSlug = "", DateTimeOffset? UpdatedAt = null,
    string CaptionEn = "", string CaptionAr = "", List<int>? GroupIds = null);
public sealed record Profile(string NameEn = "Koral Choir", string NameAr = "كورال", string Logo = "", string Cover = "",
    string IntroEn = "", string IntroAr = "", string AboutEn = "", string AboutAr = "",
    int? Founded = null, string HistoryEn = "", string HistoryAr = "", string MissionEn = "", string MissionAr = "",
    string VisionEn = "", string VisionAr = "", string DirectorEn = "", string DirectorAr = "",
    string Email = "", string Phone = "", string AddressEn = "", string AddressAr = "", List<Platform>? Social = null,
    string CoverMobile = "", string AboutImage = "", string AboutImageAltEn = "", string AboutImageAltAr = "");
public sealed record Settings(string TitleEn = "", string TitleAr = "", string DescriptionEn = "", string DescriptionAr = "",
    string Favicon = "", string FooterEn = "", string FooterAr = "", string DefaultLanguage = "en",
    bool Members = true, bool Events = true, bool HomeAlbums = true, bool HomeSongs = true,
    bool HomeAbout = true, bool HomeGallery = true, bool HomeEvents = true, bool English = true, bool Arabic = true,
    bool HomeFeaturedSongs = false, bool HomeJoin = true);
public sealed record Page<T>(List<T> Items, int Total, int PageNumber, int PageSize);
public sealed record Activity(string Actor, string Action, string Resource, int? EntryId, DateTimeOffset At);
public sealed record Account(string Email, string Password);
public sealed record PasswordChange(string Current, string Password);
public sealed record UserInput(string Email, string Password, string Role);
public sealed record OrderInput(List<int> Ids);
public sealed record AlbumDeletion(int Tracks, int Groups, int Links);

public static class InputRules
{
    public static bool SafeUrl(string? value) => Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && (uri.Scheme is "http" or "https") && string.IsNullOrEmpty(uri.UserInfo);
    public static bool Media(string? value) => value is not null && (value.Length == 0 ||
        System.Text.RegularExpressions.Regex.IsMatch(value, @"^/uploads/(choir|albums|songs|gallery|members|audio|events)/[a-f0-9]{32}\.(jpg|png|webp|mp3|mp4)$"));
    public static bool SongAudio(string? value) => value == "" || (value is { Length: <= 2048 } &&
        (value.StartsWith("/uploads/audio/", StringComparison.Ordinal) && Media(value) && value.EndsWith(".mp3", StringComparison.Ordinal)
            || SafeUrl(value) && Uri.TryCreate(value, UriKind.Absolute, out var url) && url.Scheme == "https" &&
                url.AbsolutePath.EndsWith(".mp3", StringComparison.OrdinalIgnoreCase)));

    public static bool TrackSource(Platform link)
    {
        if (!link.Enabled || !SafeUrl(link.Url) || !Uri.TryCreate(link.Url, UriKind.Absolute, out var url)) return false;
        var parts = url.AbsolutePath.Trim('/').Split('/');
        static bool VideoId(string id) => System.Text.RegularExpressions.Regex.IsMatch(id, @"^[a-zA-Z0-9_-]{11}$");
        return link.PlatformName.Trim().ToLowerInvariant() switch
        {
            "youtube" when url.Host == "youtu.be" => parts.Length == 1 && VideoId(parts[0]),
            "youtube" when url.Host is "youtube.com" or "www.youtube.com" or "m.youtube.com" or "music.youtube.com" =>
                (parts is ["watch"] && url.Query.TrimStart('?').Split('&').Any(q => q.StartsWith("v=") && VideoId(q[2..]))) ||
                (parts is ["shorts" or "live" or "embed", var video] && VideoId(video)),
            "soundcloud" or "sound cloud" => (url.Host is "soundcloud.com" or "www.soundcloud.com" or "m.soundcloud.com") &&
                parts is [var artist, var track] && artist is not ("" or "discover" or "search" or "charts" or "you" or "pages") &&
                track is not ("" or "tracks" or "sets" or "albums" or "likes" or "reposts" or "popular-tracks" or "followers" or "following"),
            "anghami" => (url.Host is "play.anghami.com" or "www.anghami.com" or "anghami.com") &&
                parts.Length >= 2 && parts[^2] == "song" && parts[^1] != "",
            "spotify" => url.Host == "open.spotify.com" && parts.Length >= 2 && parts[^2] == "track" &&
                System.Text.RegularExpressions.Regex.IsMatch(parts[^1], @"^[a-zA-Z0-9]{22}$"),
            _ => false
        };
    }
}
public sealed class ContentValidator : AbstractValidator<Content>
{
    public ContentValidator(string resource)
    {
        RuleFor(x => x.TitleEn).NotEmpty().MaximumLength(180);
        RuleFor(x => x.TitleAr).NotEmpty().MaximumLength(180);
        RuleFor(x => x.DescriptionEn).NotNull().MaximumLength(15000);
        RuleFor(x => x.DescriptionAr).NotNull().MaximumLength(15000);
        RuleFor(x => x.Image).Must(InputRules.Media).WithMessage("Select an uploaded image.");
        RuleFor(x => x.Sort).InclusiveBetween(0, 100000);
        if (resource is "albums" or "songs")
            RuleFor(x => x.Slug).NotEmpty().MaximumLength(160).Matches(@"^[a-z0-9]+(-[a-z0-9]+)*$")
                .When(x => resource == "songs" || !string.IsNullOrWhiteSpace(x.Slug));
        if (resource == "albums")
        {
            RuleFor(x => x.GroupIds).Must(ids => ids is null || (ids.Count <= 50 && ids.All(id => id > 0)));
            RuleFor(x => x.Links).Must(links => links is null || links.Count <= 12);
            RuleForEach(x => x.Links).NotNull().SetValidator(new PlatformValidator(allowHiddenWithoutUrl: true))
                .Must(IsAlbumLink).WithMessage("Use a full album or playlist link for this platform.");
        }
        if (resource == "songs")
        {
            RuleFor(x => x.Audio).Must(InputRules.SongAudio).WithMessage("Upload an MP3 or enter a direct HTTPS .mp3 URL.");
            RuleFor(x => x.LyricsEn).NotNull().MaximumLength(30000);
            RuleFor(x => x.LyricsAr).NotNull().MaximumLength(30000);
            RuleFor(x => x.Duration).InclusiveBetween(1, 86400);
            RuleFor(x => x.Composer).NotNull().MaximumLength(180);
            RuleFor(x => x.Lyricist).NotNull().MaximumLength(180);
            RuleFor(x => x.Arranger).NotNull().MaximumLength(180);
            RuleFor(x => x.Conductor).NotNull().MaximumLength(180);
            RuleForEach(x => x.Links).NotNull().SetValidator(new PlatformValidator(allowHiddenWithoutUrl: true));
        }
        if (resource == "gallery")
        {
            RuleFor(x => x.Video).Must(x => InputRules.Media(x) || InputRules.SafeUrl(x)).WithMessage("Enter a valid video URL.");
            RuleFor(x => x.CaptionEn).NotNull().MaximumLength(300);
            RuleFor(x => x.CaptionAr).NotNull().MaximumLength(300);
            RuleFor(x => x.Image).NotEmpty().When(x => x.Published && string.IsNullOrEmpty(x.Video))
                .WithMessage("Add a photo or video before publishing.");
        }
        if (resource == "members")
        {
            RuleFor(x => x.PositionEn).NotNull().MaximumLength(180);
            RuleFor(x => x.PositionAr).NotNull().MaximumLength(180);
        }
        if (resource == "events")
        {
            RuleFor(x => x.Date).NotNull();
            RuleFor(x => x.End).Must((x, end) => end is null || end >= x.Date).WithMessage("End must be after start.");
            RuleFor(x => x.Status).Must(x => x is "scheduled" or "cancelled" or "postponed");
            RuleFor(x => x.Location).NotNull().MaximumLength(240);
            RuleFor(x => x.Registration).Must(x => x == "" || InputRules.SafeUrl(x)).WithMessage("Enter a valid registration URL.");
        }
    }

    private static bool IsAlbumLink(Platform? link)
    {
        if (link is { Enabled: false } && string.IsNullOrWhiteSpace(link.Url)) return true;
        if (link is null || !Uri.TryCreate(link.Url, UriKind.Absolute, out var url) || url.Scheme != "https")
            return false;
        var parts = url.AbsolutePath.Trim('/').Split('/');
        var platform = link.PlatformName?.Trim().ToLowerInvariant();
        return platform switch
        {
            "spotify" => url.Host == "open.spotify.com" && parts.Length >= 2 &&
                parts[^2] is "album" or "playlist",
            "youtube" => url.Host is "www.youtube.com" or "youtube.com" or "music.youtube.com" &&
                parts[^1] == "playlist" && url.Query.TrimStart('?').Split('&').Any(q => q.StartsWith("list=") && q.Length > 5),
            "soundcloud" or "sound cloud" => url.Host is "soundcloud.com" or "www.soundcloud.com" &&
                parts.Length == 3 && parts[1] == "sets",
            "anghami" => url.Host is "play.anghami.com" or "www.anghami.com" &&
                parts.Length >= 2 && parts[^2] is "album" or "playlist",
            _ => true,
        };
    }
}
public sealed class PlatformValidator : AbstractValidator<Platform>
{
    public PlatformValidator(bool allowHiddenWithoutUrl = false)
    {
        RuleFor(x => x.PlatformName).NotEmpty().MaximumLength(60);
        RuleFor(x => x.Url).MaximumLength(2048)
            .Must((link, url) => InputRules.SafeUrl(url) || (allowHiddenWithoutUrl && !link.Enabled && string.IsNullOrWhiteSpace(url)))
            .WithMessage("Use an HTTP or HTTPS URL.");
        RuleFor(x => x.Label).NotNull().MaximumLength(120);
        RuleFor(x => x.Icon).NotNull().MaximumLength(40);
    }
}
public interface IMediaStorage
{
    Task Write(string bucket, string name, Stream stream, CancellationToken cancellationToken);
    bool Exists(string bucket, string name);
    Stream? Open(string bucket, string name);
    void Remove(string bucket, string name);
}
