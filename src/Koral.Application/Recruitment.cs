using FluentValidation;

namespace Koral.Application;

public sealed record JoinInput(string Name, string Email, string Phone, string Voice, string Experience, bool Consent,
    int? GroupId = null, string? BackingAudio = null, bool RecordedWithBacking = false, bool RecordingMixed = false);
public sealed record ApplicationUpdate(string Status, string Notes, Guid Revision);
public sealed record ApplicationSummary(int Id, string Name, string Email, string Phone, string Voice, string Status, DateTimeOffset CreatedAt,
    int? GroupId, string GroupEn, string GroupAr);
public sealed record ApplicationDetail(ApplicationSummary Applicant, string Experience, string Notes, Guid Revision, DateTimeOffset UpdatedAt,
    string RecordingUrl, string BackingAudio, string BackingTitle, bool RecordedWithBacking, bool RecordingMixed);

public static class Recruitment
{
    public static readonly string[] Voices = ["unsure", "soprano", "alto", "tenor", "bass", "other"];
    public static readonly string[] Statuses = ["new", "contacted", "audition", "accepted", "declined"];
    public static readonly JoinValidator Validate = new();
}

public sealed class JoinValidator : AbstractValidator<JoinInput>
{
    public JoinValidator()
    {
        RuleFor(x => x.Name).NotEmpty().Length(2, 120);
        RuleFor(x => x.Email).NotEmpty().MaximumLength(254)
            .Must(x => System.Net.Mail.MailAddress.TryCreate(x, out var address) && address.Address == x);
        RuleFor(x => x.Phone).NotNull().MaximumLength(30)
            .Matches(@"^(?:\+?[\p{Nd} ()-]{7,30})?$")
            .Must(x => x is not null && (x.Length == 0 || x.Count(char.IsDigit) is >= 7 and <= 15));
        RuleFor(x => x.Voice).Must(x => Recruitment.Voices.Contains(x));
        RuleFor(x => x.Experience).NotNull().MaximumLength(1500);
        RuleFor(x => x.Consent).Equal(true);
    }
}
