namespace Koral.Application;

public sealed record ApplicationUpdate(string Status, string Notes, Guid Revision);
public sealed record ApplicationSummary(int Id, string Name, string Email, string Phone, string Voice, string Status, DateTimeOffset CreatedAt,
    int? GroupId, string GroupEn, string GroupAr);
public sealed record ApplicationDetail(ApplicationSummary Applicant, string Experience, string Notes, Guid Revision, DateTimeOffset UpdatedAt,
    string RecordingUrl, string BackingAudio, string BackingTitle, bool RecordedWithBacking, bool RecordingMixed,
    string PhotoUrl, List<RegistrationAnswer> Answers);
