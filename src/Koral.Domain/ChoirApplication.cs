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
}
