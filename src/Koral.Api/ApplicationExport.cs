using System.Globalization;
using System.IO.Compression;
using System.Xml;
using Koral.Application;
using Koral.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Koral.Api;

internal static class ApplicationExport
{
    private const string Sheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private const string Relations = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private const string PackageRelations = "http://schemas.openxmlformats.org/package/2006/relationships";

    internal static async Task<IResult> Download(DateOnly? from, DateOnly? to, string? lang, KoralDb db, HttpContext http, CancellationToken ct)
    {
        if (from > to || to == DateOnly.MaxValue) return Results.BadRequest("Invalid date range.");
        var ar = lang != "en";
        var zone = TimeZoneInfo.FindSystemTimeZoneById("Africa/Cairo");
        DateTimeOffset Utc(DateOnly day) => TimeZoneInfo.ConvertTimeToUtc(day.ToDateTime(TimeOnly.MinValue), zone);
        var query = db.ChoirApplications.AsNoTracking().Include(x => x.Group).AsQueryable();
        if (from is { } first) { var bound = Utc(first); query = query.Where(x => x.CreatedAt >= bound); }
        if (to is { } last) { var bound = Utc(last.AddDays(1)); query = query.Where(x => x.CreatedAt < bound); }
        var rows = await query.OrderBy(x => x.Id).ToListAsync(ct);
        var schema = await RegistrationEndpoints.Schema(db, ct);
        var snapshots = rows.Select(RegistrationEndpoints.Answers).ToArray();
        var columns = schema.Fields.Select(x => new Column(x.Id, ar ? x.LabelAr : x.LabelEn)).ToList();
        var known = columns.Select(x => x.Id).ToHashSet();
        foreach (var answer in snapshots.SelectMany(x => x))
            if (known.Add(answer.Id)) columns.Add(new(answer.Id, ar ? answer.LabelAr : answer.LabelEn));

        var title = ar
            ? new[] { "رقم الطلب", "تاريخ التقديم", "حالة الطلب", "الاسم الكامل", "البريد الإلكتروني", "رقم التواصل", "الطبقة الصوتية", "الفرقة", "الخبرة", "ملاحظات الأدمن", "آخر تحديث", "ملف التسجيل", "ملف الصورة" }
            : ["Application ID", "Submitted", "Status", "Full name", "Email", "Contact phone", "Voice part", "Group", "Experience", "Internal notes", "Updated", "Recording file", "Photo file"];
        var statuses = schema.Statuses.ToDictionary(x => x.Id, x => ar ? x.LabelAr : x.LabelEn);
        var data = new MemoryStream();
        using (var zip = new ZipArchive(data, ZipArchiveMode.Create, leaveOpen: true))
        {
            WritePart(zip, "[Content_Types].xml", """
                <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                  <Default Extension="xml" ContentType="application/xml"/>
                  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
                  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                </Types>
                """);
            WritePart(zip, "_rels/.rels", $"""<Relationships xmlns="{PackageRelations}"><Relationship Id="rId1" Type="{Relations}/officeDocument" Target="xl/workbook.xml"/></Relationships>""");
            WritePart(zip, "xl/workbook.xml", $"""<workbook xmlns="{Sheet}" xmlns:r="{Relations}"><bookViews><workbookView/></bookViews><sheets><sheet name="Applications" sheetId="1" r:id="rId1"/></sheets></workbook>""");
            WritePart(zip, "xl/_rels/workbook.xml.rels", $"""<Relationships xmlns="{PackageRelations}"><Relationship Id="rId1" Type="{Relations}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>""");
            using var part = zip.CreateEntry("xl/worksheets/sheet1.xml").Open();
            using var xml = XmlWriter.Create(part);
            xml.WriteStartElement("worksheet", Sheet);
            if (ar)
            {
                xml.WriteStartElement("sheetViews", Sheet);
                xml.WriteStartElement("sheetView", Sheet);
                xml.WriteAttributeString("workbookViewId", "0");
                xml.WriteAttributeString("rightToLeft", "1");
                xml.WriteEndElement();
                xml.WriteEndElement();
            }
            xml.WriteStartElement("sheetData", Sheet);
            WriteRow(xml, title.Concat(columns.Select(x => x.Label)));
            for (var i = 0; i < rows.Count; i++)
            {
                ct.ThrowIfCancellationRequested();
                var row = rows[i];
                var previous = snapshots[i].ToDictionary(x => x.Id, x => x.Value);
                string Date(DateTimeOffset value) => TimeZoneInfo.ConvertTime(value, zone).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
                string[] basics = [row.Id.ToString(CultureInfo.InvariantCulture), Date(row.CreatedAt), statuses.GetValueOrDefault(row.Status, row.Status),
                    row.Name, row.Email, row.Phone, row.Voice, ar ? row.Group?.NameAr ?? row.GroupNameAr : row.Group?.NameEn ?? row.GroupNameEn,
                    row.Experience, row.Notes, Date(row.UpdatedAt), row.RecordingName, row.PhotoName];
                WriteRow(xml, basics.Concat(columns.Select(x => previous.GetValueOrDefault(x.Id, ""))));
            }
            xml.WriteEndElement();
            xml.WriteEndElement();
        }
        data.Position = 0;
        http.Response.Headers.CacheControl = "private, no-store";
        return Results.File(data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "choir-applications.xlsx");
    }

    private static void WritePart(ZipArchive zip, string path, string content)
    {
        using var file = new StreamWriter(zip.CreateEntry(path).Open());
        file.Write(content);
    }

    private static void WriteRow(XmlWriter xml, IEnumerable<string> values)
    {
        xml.WriteStartElement("row", Sheet);
        foreach (var value in values)
        {
            xml.WriteStartElement("c", Sheet);
            xml.WriteAttributeString("t", "inlineStr");
            xml.WriteStartElement("is", Sheet);
            xml.WriteStartElement("t", Sheet);
            xml.WriteAttributeString("xml", "space", "http://www.w3.org/XML/1998/namespace", "preserve");
            xml.WriteString(string.Concat(value.EnumerateRunes().Where(x => x.Value is 9 or 10 or 13 or >= 0x20 and <= 0xD7FF
                or >= 0xE000 and <= 0xFFFD or >= 0x10000).Select(x => x.ToString())));
            xml.WriteEndElement();
            xml.WriteEndElement();
            xml.WriteEndElement();
        }
        xml.WriteEndElement();
    }

    private sealed record Column(string Id, string Label);
}
