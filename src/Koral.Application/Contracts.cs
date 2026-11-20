using FluentValidation;

namespace Koral.Application;

public sealed record Platform(string PlatformName = "", string Url = "", string Label = "", string Icon = "", int Sort = 0);
public sealed record Content(
    int Id = 0, string TitleEn = "", string TitleAr = "", string DescriptionEn = "", string DescriptionAr = "",
    string Image = "", bool Published = false, bool Featured = false, int Sort = 0, string Slug = "",
    DateTimeOffset? Date = null, int? AlbumId = null, string Audio = "", string LyricsEn = "", string LyricsAr = "",
    string Composer = "", string Lyricist = "", string Arranger = "", string Conductor = "", int? Duration = null,
    List<Platform>? Links = null, int? CategoryId = null, string Video = "", string PositionEn = "", string PositionAr = "",
    DateTimeOffset? End = null, string Location = "", string Registration = "", string Status = "scheduled",
    int TrackCount = 0, string AlbumTitleEn = "", string AlbumTitleAr = "", string AlbumSlug = "", DateTimeOffset? UpdatedAt = null,
    string CaptionEn = "", string CaptionAr = "");
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
    bool HomeFeaturedSongs = false);
public sealed record Page<T>(List<T> Items, int Total, int PageNumber, int PageSize);
public sealed record Activity(string Actor, string Action, string Resource, int? EntryId, DateTimeOffset At);
public sealed record Account(string Email, string Password);
public sealed record PasswordChange(string Current, string Password);
public sealed record UserInput(string Email, string Password, string Role);
public sealed record OrderInput(List<int> Ids);

public static class InputRules
{
    public static bool SafeUrl(string? value) => Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && (uri.Scheme is "http" or "https") && string.IsNullOrEmpty(uri.UserInfo);
    public static bool Media(string? value) => value is not null && (value.Length == 0 ||
        System.Text.RegularExpressions.Regex.IsMatch(value, @"^/uploads/(choir|albums|songs|gallery|members|audio|events)/[a-f0-9]{32}\.(jpg|png|webp|mp3|mp4)$"));
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
            RuleFor(x => x.Slug).NotEmpty().MaximumLength(160).Matches(@"^[a-z0-9]+(-[a-z0-9]+)*$");
        if (resource == "songs")
        {
            RuleFor(x => x.Audio).Must(x => InputRules.Media(x) && (x.Length == 0 || x.StartsWith("/uploads/audio/"))).WithMessage("Select an uploaded audio file.");
            RuleFor(x => x.LyricsEn).NotNull().MaximumLength(30000);
            RuleFor(x => x.LyricsAr).NotNull().MaximumLength(30000);
            RuleFor(x => x.Duration).InclusiveBetween(1, 86400);
            RuleFor(x => x.Composer).NotNull().MaximumLength(180);
            RuleFor(x => x.Lyricist).NotNull().MaximumLength(180);
            RuleFor(x => x.Arranger).NotNull().MaximumLength(180);
            RuleFor(x => x.Conductor).NotNull().MaximumLength(180);
            RuleForEach(x => x.Links).NotNull().SetValidator(new PlatformValidator());
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
}
public sealed class PlatformValidator : AbstractValidator<Platform>
{
    public PlatformValidator()
    {
        RuleFor(x => x.PlatformName).NotEmpty().MaximumLength(60);
        RuleFor(x => x.Url).MaximumLength(2048).Must(InputRules.SafeUrl).WithMessage("Use an HTTP or HTTPS URL.");
        RuleFor(x => x.Label).NotNull().MaximumLength(120);
        RuleFor(x => x.Icon).NotNull().MaximumLength(40);
    }
}
public interface IMediaStorage
{
    Task Write(string bucket, string name, Stream stream, CancellationToken cancellationToken);
    Stream? Open(string bucket, string name);
    void Remove(string bucket, string name);
}
