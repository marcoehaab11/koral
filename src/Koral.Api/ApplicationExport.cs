using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Xml;
using Koral.Application;
using Koral.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Koral.Api;

internal static class ApplicationExport
{
    private const string Sheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private const string Relations = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private const string PackageRelations = "http://schemas.openxmlformats.org/package/2006/relationships";

    private static ITimeLimitedDataProtector AttachmentProtector(IDataProtectionProvider protection) =>
        protection.CreateProtector("Koral.ApplicationExport.Attachments.v1").ToTimeLimitedDataProtector();

    internal static async Task<IResult> Attachment(string token, IDataProtectionProvider protection, KoralDb db,
        IMediaStorage storage, HttpContext http, CancellationToken ct)
    {
        if (token.Length > 1024) return Results.NotFound();
        string claim;
        try { claim = AttachmentProtector(protection).Unprotect(token); }
        catch (CryptographicException) { return Results.NotFound(); }
        if (claim.Split(':') is not [var application, var kind, var name] || kind is not ("photo" or "recording") ||
            !int.TryParse(application, NumberStyles.None, CultureInfo.InvariantCulture, out var id)) return Results.NotFound();
        var row = await db.ChoirApplications.AsNoTracking().Where(x => x.Id == id)
            .Select(x => new { x.PhotoName, x.PhotoType, x.RecordingName, x.RecordingType }).SingleOrDefaultAsync(ct);
        if (row is null) return Results.NotFound();
        var (fileName, contentType, bucket) = kind == "photo" ? (row.PhotoName, row.PhotoType, "applicant-photos") :
            (row.RecordingName, row.RecordingType, "auditions");
        if (fileName == "" || name != fileName || storage.Open(bucket, fileName) is not Stream stream) return Results.NotFound();
        http.Response.Headers.CacheControl = "private, no-store";
        http.Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
        return Results.File(stream, contentType, fileName, enableRangeProcessing: true);
    }

    internal static async Task<IResult> Download(DateOnly? from, DateOnly? to, string? lang, KoralDb db, HttpContext http,
        IDataProtectionProvider protection, IConfiguration config, IWebHostEnvironment env, CancellationToken ct)
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
        var protector = AttachmentProtector(protection);
        var origin = Pages.Origin(http, config, env);
        var data = new MemoryStream();
        using (var zip = new ZipArchive(data, ZipArchiveMode.Create, leaveOpen: true))
        {
            WritePart(zip, "[Content_Types].xml", """
                <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                  <Default Extension="xml" ContentType="application/xml"/>
                  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
                  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
                </Types>
                """);
            WritePart(zip, "_rels/.rels", $"""<Relationships xmlns="{PackageRelations}"><Relationship Id="rId1" Type="{Relations}/officeDocument" Target="xl/workbook.xml"/></Relationships>""");
            WritePart(zip, "xl/workbook.xml", $"""<workbook xmlns="{Sheet}" xmlns:r="{Relations}"><bookViews><workbookView/></bookViews><sheets><sheet name="Applications" sheetId="1" r:id="rId1"/></sheets></workbook>""");
            WritePart(zip, "xl/_rels/workbook.xml.rels", $"""<Relationships xmlns="{PackageRelations}"><Relationship Id="rId1" Type="{Relations}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="{Relations}/styles" Target="styles.xml"/></Relationships>""");
            WritePart(zip, "xl/styles.xml", $"""
                <styleSheet xmlns="{Sheet}">
                  <fonts count="2"><font/><font><u/><color rgb="FF0563C1"/></font></fonts>
                  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
                  <borders count="1"><border/></borders>
                  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
                  <cellXfs count="2"><xf xfId="0" numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf xfId="0" numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/></cellXfs>
                  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
                </styleSheet>
                """);
            var links = new List<Hyperlink>();
            using (var part = zip.CreateEntry("xl/worksheets/sheet1.xml").Open())
            using (var xml = XmlWriter.Create(part))
            {
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
                WriteRow(xml, 1, title.Concat(columns.Select(x => x.Label)).Select(x => new Cell(x)), links);
                for (var i = 0; i < rows.Count; i++)
                {
                    ct.ThrowIfCancellationRequested();
                    var row = rows[i];
                    var previous = snapshots[i].ToDictionary(x => x.Id);
                    string Date(DateTimeOffset value) => TimeZoneInfo.ConvertTime(value, zone).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
                    string[] basics = [row.Id.ToString(CultureInfo.InvariantCulture), Date(row.CreatedAt), statuses.GetValueOrDefault(row.Status, row.Status),
                        row.Name, row.Email, row.Phone, row.Voice, ar ? row.Group?.NameAr ?? row.GroupNameAr : row.Group?.NameEn ?? row.GroupNameEn,
                        row.Experience, row.Notes, Date(row.UpdatedAt)];
                    Cell AttachmentCell(string kind, string name) => name == "" ? new("") : new(name,
                        origin + "/api/application-attachment/" + protector.Protect(
                            FormattableString.Invariant($"{row.Id}:{kind}:{name}"), TimeSpan.FromDays(7)));
                    var recording = AttachmentCell("recording", row.RecordingName);
                    var photo = AttachmentCell("photo", row.PhotoName);
                    var cells = basics.Select(x => new Cell(x)).Concat([recording, photo]).Concat(columns.Select(column =>
                        previous.TryGetValue(column.Id, out var answer) ? answer.Kind switch
                        {
                            "recording" => recording,
                            "photo" => photo,
                            _ => new Cell(answer.Value)
                        } : new Cell("")));
                    WriteRow(xml, i + 2, cells, links);
                }
                xml.WriteEndElement();
                if (links.Count > 0)
                {
                    xml.WriteStartElement("hyperlinks", Sheet);
                    foreach (var link in links)
                    {
                        xml.WriteStartElement("hyperlink", Sheet);
                        xml.WriteAttributeString("ref", link.Reference);
                        xml.WriteAttributeString("r", "id", Relations, link.Id);
                        xml.WriteEndElement();
                    }
                    xml.WriteEndElement();
                }
                xml.WriteEndElement();
            }
            if (links.Count > 0)
            {
                using var part = zip.CreateEntry("xl/worksheets/_rels/sheet1.xml.rels").Open();
                using var xml = XmlWriter.Create(part);
                xml.WriteStartElement("Relationships", PackageRelations);
                foreach (var link in links)
                {
                    xml.WriteStartElement("Relationship", PackageRelations);
                    xml.WriteAttributeString("Id", link.Id);
                    xml.WriteAttributeString("Type", Relations + "/hyperlink");
                    xml.WriteAttributeString("Target", link.Target);
                    xml.WriteAttributeString("TargetMode", "External");
                    xml.WriteEndElement();
                }
                xml.WriteEndElement();
            }
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

    private static void WriteRow(XmlWriter xml, int row, IEnumerable<Cell> values, List<Hyperlink> links)
    {
        xml.WriteStartElement("row", Sheet);
        var column = 0;
        foreach (var value in values)
        {
            var reference = CellReference(++column, row);
            xml.WriteStartElement("c", Sheet);
            xml.WriteAttributeString("r", reference);
            if (value.Target is not null) xml.WriteAttributeString("s", "1");
            xml.WriteAttributeString("t", "inlineStr");
            xml.WriteStartElement("is", Sheet);
            xml.WriteStartElement("t", Sheet);
            xml.WriteAttributeString("xml", "space", "http://www.w3.org/XML/1998/namespace", "preserve");
            xml.WriteString(string.Concat(value.Text.EnumerateRunes().Where(x => x.Value is 9 or 10 or 13 or >= 0x20 and <= 0xD7FF
                or >= 0xE000 and <= 0xFFFD or >= 0x10000).Select(x => x.ToString())));
            xml.WriteEndElement();
            if (value.Target is not null) links.Add(new(reference, "rId" + (links.Count + 1), value.Target));
            xml.WriteEndElement();
            xml.WriteEndElement();
        }
        xml.WriteEndElement();
    }

    private static string CellReference(int column, int row)
    {
        var letters = "";
        while (column > 0)
        {
            column--;
            letters = (char)('A' + column % 26) + letters;
            column /= 26;
        }
        return letters + row.ToString(CultureInfo.InvariantCulture);
    }

    private sealed record Cell(string Text, string? Target = null);
    private sealed record Hyperlink(string Reference, string Id, string Target);
    private sealed record Column(string Id, string Label);
}
