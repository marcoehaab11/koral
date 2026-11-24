namespace Koral.Domain;

public sealed class ChoirApplication
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string NormalizedEmail { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Voice { get; set; } = "unsure";
    public string Experience { get; set; } = "";
    public string Status { get; set; } = "new";
    public string Notes { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid Revision { get; set; }
    public int? GroupId { get; set; }
    public ChoirGroup? Group { get; set; }
    public int FormerGroupId { get; set; }
    public string GroupNameEn { get; set; } = "";
    public string GroupNameAr { get; set; } = "";
    public string RecordingName { get; set; } = "";
    public string RecordingType { get; set; } = "";
    public string BackingAudio { get; set; } = "";
    public string BackingTitle { get; set; } = "";
    public bool RecordedWithBacking { get; set; }
    public bool RecordingMixed { get; set; }
    public string FormAnswers { get; set; } = "[]";
    public string PhotoName { get; set; } = "";
    public string PhotoType { get; set; } = "";
}

public sealed class RegistrationForm
{
    public int Id { get; set; }
    public Guid Revision { get; set; }
    public string Fields { get; set; } = "[]";
}

public sealed class ChoirGroup
{
    public int Id { get; set; }
    public string NameEn { get; set; } = "";
    public string NameAr { get; set; } = "";
    public bool Accepting { get; set; }
    public int? CatalogSlot { get; set; }
    public bool RecruitmentEnabled { get; set; } = true;
    public bool RecordingRequired { get; set; }
    public string BackingAudio { get; set; } = "";
    public string BackingTitle { get; set; } = "";
    public List<Album> Albums { get; set; } = [];
}
