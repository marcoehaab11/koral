using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Koral.Application;

public sealed record RegistrationOption(string Id, string LabelAr, string LabelEn, string DetailAr = "", string DetailEn = "");
public sealed record RegistrationField(string Id, string LabelAr, string LabelEn, string Kind = "text",
    bool Required = true, bool Visible = true, string Rule = "any", int? Digits = null, bool Multiple = false,
    List<RegistrationOption>? Options = null);
public sealed record RegistrationSchema(Guid Revision, List<RegistrationField> Fields, List<RegistrationOption> Statuses);
public sealed record RegistrationAnswer(string Id, string LabelAr, string LabelEn, string Kind, string Value);
public sealed record RegistrationInput(Guid Revision, bool Consent, Dictionary<string, string[]>? Answers,
    Dictionary<string, string>? Details, string? BackingAudio, bool RecordingMixed);

public static class Registration
{
    public static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;
    public static RegistrationSchema Default() => new(Guid.Empty,
        [
            new("first-name", "الاسم الأول", "First name", Rule: "arabic"),
            new("second-name", "اسم الأب", "Father’s name", Rule: "arabic"),
            new("third-name", "اسم الجد", "Grandfather’s name", Rule: "arabic"),
            new("last-name", "اسم العائلة", "Family name", Rule: "arabic"),
            new("whatsapp", "رقم واتساب للتواصل", "WhatsApp number", Rule: "digits", Digits: 11),
            new("birth-date", "تاريخ الميلاد", "Date of birth", "date"),
            new("photo", "صورة شخصية", "Personal photo", "photo"),
            new("school", "المرحلة الدراسية التي انتهيت منها هذا العام", "School year completed this year", "choice", Options:
            [
                new("kg1","أولى حضانة","Kindergarten 1"), new("kg2","ثانية حضانة","Kindergarten 2"),
                new("p1","أولى ابتدائي","Primary 1"), new("p2","ثانية ابتدائي","Primary 2"),
                new("p3","ثالثة ابتدائي","Primary 3"), new("p4","رابعة ابتدائي","Primary 4"),
                new("p5","خامسة ابتدائي","Primary 5"), new("p6","سادسة ابتدائي","Primary 6"),
                new("m1","أولى إعدادي","Preparatory 1"), new("m2","ثانية إعدادي","Preparatory 2"),
                new("m3","ثالثة إعدادي","Preparatory 3"), new("s1","أولى ثانوي","Secondary 1"),
                new("s2","ثانية ثانوي","Secondary 2"), new("s3","ثالثة ثانوي","Secondary 3"),
                new("university","جامعيين","University","الكلية أو المعهد والمرحلة الدراسية","College or institute and year"),
                new("graduate","خريجين","Graduates")
            ]),
            new("previous","شاركت سابقًا مع كورال يوسف الصديق","Previously joined Youssef El-Seddik Choir","choice",
                Options: [new("yes","نعم","Yes"),new("no","لا","No")]),
            new("shirt","تيشيرت الكورال","Choir T-shirt","choice",
                Options: [new("fits","متاح والمقاس مناسب","Available and fits"),new("unavailable","غير متاح أو المقاس غير مناسب","Unavailable or does not fit")]),
            new("church","الكنيسة التي تواظب فيها على مدارس الأحد والاجتماعات","Church you regularly attend","choice",
                Options: [new("mary","العذراء مريم بتوريل – المنصورة","St Mary, Toreil – Mansoura"),new("other","أخرى","Other","اسم الكنيسة","Church name")]),
            new("talent","مواهب فنية إضافية","Additional artistic talent","choice", Options:
            [
                new("instrument","العزف","Playing an instrument","اسم الآلة","Instrument"),
                new("writing","تأليف ترانيم","Hymn writing"),new("composing","تلحين","Composing"),
                new("other","أخرى","Other","اذكر الموهبة","Describe your talent")
            ]),
            new("recording","المقطع الصوتي","Audio recording","recording")
        ],
        [new("new","جديد","New"),new("contacted","تم التواصل","Contacted"),new("audition","اختبار صوت","Audition"),
         new("accepted","مقبول","Accepted"),new("declined","لم يُقبل","Declined")]);

    private static bool Label(string? value) => value is { Length: <= 160 } && !string.IsNullOrWhiteSpace(value);
    private static bool Id(string? value) => value is not null && Regex.IsMatch(value, @"\A[a-z0-9-]{1,40}\z");
    private static bool Options(List<RegistrationOption>? options, int maximum) => options is not null &&
        options.Count is > 0 && options.Count <= maximum && options.All(x => x is not null && Id(x.Id) &&
            Label(x.LabelAr) && Label(x.LabelEn) && x.DetailAr is { Length: <= 160 } && x.DetailEn is { Length: <= 160 }) &&
        options.Select(x => x.Id).Distinct().Count() == options.Count;

    public static bool Valid(RegistrationSchema schema) =>
        schema.Fields is { Count: <= 40 } fields &&
        fields.All(x => x is not null && Id(x.Id) && Label(x.LabelAr) && Label(x.LabelEn) &&
            x.Kind is "text" or "choice" or "date" or "photo" or "recording" &&
            x.Rule is "any" or "arabic" or "digits" && (x.Rule != "digits" || x.Digits is >= 1 and <= 32) &&
            (x.Kind != "choice" || Options(x.Options, 40))) &&
        fields.Select(x => x.Id).Distinct().Count() == fields.Count &&
        fields.Where(x => x.Kind is "photo" or "recording").GroupBy(x => x.Kind).All(x => x.Count() == 1) &&
        Options(schema.Statuses, 30) && schema.Statuses.Any(x => x.Id == "new");

    public static bool TryAnswer(RegistrationField field, string[]? values, Dictionary<string, string>? details, out string answer)
    {
        answer = "";
        if (values is null or { Length: 0 } || values is [null or ""]) return !field.Required;
        if (values.Length > 40 || values.Any(x => x is null || x.Length > 300)) return false;
        if (field.Kind == "choice")
        {
            if ((!field.Multiple && values.Length != 1) || values.Distinct().Count() != values.Length) return false;
            var labels = new List<string>();
            foreach (var id in values)
            {
                var option = field.Options?.Find(x => x.Id == id);
                if (option is null) return false;
                if (option.DetailAr == "" && option.DetailEn == "") { labels.Add(option.LabelAr); continue; }
                var detail = details?.GetValueOrDefault(field.Id + "." + id)?.Trim();
                if (string.IsNullOrEmpty(detail) || detail.Length > 300) return false;
                labels.Add(option.LabelAr + " — " + detail);
            }
            answer = string.Join("، ", labels);
            return true;
        }
        if (values is not [var value]) return false;
        if (field.Kind == "date" )
        {
            if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var birth) ||
                birth.Year < 1900 || birth > DateOnly.FromDateTime(DateTime.UtcNow)) return false;
        }
        else if (field.Rule == "arabic" && (!Regex.IsMatch(value, @"\p{L}") ||
            !Regex.IsMatch(value, @"\A[\u0621-\u063A\u0641-\u0652\u0670\u0671-\u06D3 ]+\z"))) return false;
        else if (field.Rule == "digits" && (value.Length != field.Digits || !value.All(char.IsAsciiDigit))) return false;
        answer = value;
        return true;
    }
}
