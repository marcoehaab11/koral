# Koral Choir

Koral is a bilingual choir website and content management system. Visitors browse albums, recordings, lyrics, photos, people and performances. Staff publish content from Studio at `/ADMIN`. A fresh database starts with an empty catalog.

## Youssef El-Seddik Choir catalog

With the site running and a Super Admin account available, run the content import from PowerShell 7:

```powershell
./scripts/Import-ChoirCatalog.ps1 -Development -IncludePreview
```

For a hosted installation, pass `-BaseUrl https://your-domain.example` and sign in with its Super Admin when prompted. Omit `-Development` and `-IncludePreview` for real catalog content only. The preview switch adds the labeled demo album and generated sample audio. The import applies the choir profile and site settings and skips existing album and hymn slugs.

The catalog manifest and artwork are in `content/youssef-el-seddik/`. The collection groups individually verified recordings from the choir’s accounts. The 2006, 2008, and 2010 archive entries use newly drawn covers based on the supplied crest, and do not assign tracks without a documented track list. The public site uses the original platform links and embedded players for available recordings.

The public player stays open while navigating the public site. **Play full album** queues all published tracks with a playable source in album order. By default it uses a directly uploaded audio file, then SoundCloud, YouTube, or Spotify. Visitors can switch between available playback sources. Browser autoplay rules and provider restrictions can require pressing play inside an embed. Links without a supported in-site player remain available from the hymn page.

## Architecture

- `frontend/` contains React, TypeScript, Vite, React Router, TanStack Query, React Hook Form, Zod, Lucide and Framer Motion.
- `src/Koral.Domain/` contains catalog, publication, media and audit models.
- `src/Koral.Application/` contains DTOs, FluentValidation rules and the storage interface.
- `src/Koral.Infrastructure/` implements the SQL Server catalog, EF Core migrations, ASP.NET Identity persistence and local media storage.
- `src/Koral.Api/` exposes same-origin public and staff endpoints, serves the built React app, and generates metadata and sitemaps. It uses Identity cookies, request antiforgery, login rate limits, Serilog, Problem Details, and Swagger in Development.
- `frontend/tests/` contains Playwright tests using Chrome, the same ASP.NET application, and SQL Server. The tests use a generated three-second MP3 tone and temporary test records.

Normalized relations include optional song-to-album and gallery-to-category references. Deleting those parents retains child records. Song links cascade when a song is deleted. Profile and site-wide settings are singleton documents whose embedded fields are read and written together. Media metadata lives in SQL Server and file bytes live on the host filesystem.

## Run locally

Install .NET 10 SDK, Node.js 22.12+ (or a supported newer Node), npm, PowerShell, and SQL Server with a login that can create the local database. The built-in development connection uses Windows integrated authentication against the default local SQL Server instance and creates `KoralDev`. Set `ConnectionStrings__Koral` first if you use another instance or login.

```powershell
dotnet tool restore
npm.cmd --prefix frontend ci
$env:ASPNETCORE_ENVIRONMENT = 'Development'
dotnet run --project src/Koral.Api --no-launch-profile --urls http://localhost:5066
```

In another terminal:

```powershell
npm.cmd --prefix frontend run dev
```

Open [the public site](http://localhost:5173/) or [Studio](http://localhost:5173/ADMIN). Vite forwards API and media requests to port 5066. [Swagger](http://localhost:5066/swagger) documents the development API. To test same-origin behavior without Vite, build and stage the frontend, then open http://localhost:5066 directly.

Development automatically applies migrations and creates `ADMIN@ADMIN.COM` with `Admin@123456` when no Super Admin exists. Production requires a configured email and a unique temporary password on first startup. Configure a password with at least 12 characters including uppercase, lowercase, a digit and a punctuation character. The first login requires a password change before content access. Remove bootstrap variables once that account is active. Studio staff accounts also require a password change on first use.

A Super Admin can manage profile, settings, staff accounts and the whole catalog. Content Editors can manage albums, songs, gallery and its categories, members and events. Public registration is disabled.

## Choir recruitment

Visitors can send a membership application at `/join`. Applications are stored in SQL Server and appear in **Join applications** at `/ADMIN/applications`. Only Super Admin accounts can see any applicant data. The inbox supports search, status filters, contact links, internal notes, and permanent deletion. The form creates no login accounts and sends no external messages. Repeated submissions for the same email do not create another record or overwrite the original request. Delete requests the choir no longer needs to retain.

## SQL Server and migrations

Run these from the repository root. From Development, the CLI uses the development default connection unless overridden. For production, use the intended database connection only for the operation.

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
dotnet ef database update --project src/Koral.Infrastructure --startup-project src/Koral.Api
New-Item -ItemType Directory -Force artifacts | Out-Null
dotnet ef migrations script --idempotent --project src/Koral.Infrastructure --startup-project src/Koral.Api --output artifacts/koral.sql
```

Use the idempotent script for reviews and manual releases. Take a backup first, connect to the correct database in SSMS, and run the script with a migration login. With ODBC `sqlcmd`, pass `-I` so the session enables quoted identifiers for Identity's filtered indexes. Development can apply upgrades automatically. Production defaults to explicit migration because ordinary runtime credentials may lack DDL access.

## Configuration

Use environment variables for credentials and host settings. See [the environment example](.env.example). The frontend needs no environment secrets or second host.

| Variable | Purpose |
| --- | --- |
| `ASPNETCORE_ENVIRONMENT` | Use `Production` in IIS. |
| `ConnectionStrings__Koral` | SQL Server connection string. Required outside Development. |
| `Hosting__PublicUrl` | Canonical HTTPS origin, with no path. Required on the host. |
| `Hosting__DisableHttpsRedirect` | Set `true` only when IIS already forces HTTPS. |
| `Bootstrap__Email`, `Bootstrap__Password` | First Super Admin, required once. |
| `Database__MigrateOnStartup` | Defaults to false outside Development. |
| `Media__Root` | Writable, persistent media directory. Defaults to `App_Data/media` relative to the application. |
| `Media__MaxUploadBytes` | Defaults to 25,000,000 bytes. Maximum configurable cap is 100,000,000 bytes, subject to host limits. |
| `Security__KeyPath` | Writable, private Data Protection key directory. Defaults to `App_Data/keys`. |

## Production build and MonsterASP.NET

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Publish.ps1
```

The script builds Vite, stages its output, and publishes the framework-dependent .NET 10 application to `artifacts/publish`. Upload the contents of this folder. Its top-level `web.config` activates IIS ASP.NET Core Module V2 and configures the IIS request ceiling. React Router deep links are handled by the application fallback.

1. Create an ASP.NET Core website and MSSQL database in the MonsterASP.NET Control Panel. Use a database compatible with the website’s hosting plan. Set up the domain, certificate and HTTPS redirect.
2. Use the local SQL connection string for the website. If applying migrations from your workstation, temporarily enable restricted remote access and use the remote connection string. Disable remote access again after the migration if it is no longer needed.
3. Set the production variables under **Scripting → Environment variables**. Configure the first administrator and a canonical HTTPS origin.
4. Use SFTP or Web Deploy to upload the publish output to the host website’s outer `wwwroot`. Keep the nested ASP.NET `wwwroot` directory intact. For Web Deploy, turn off removal of additional destination files or add a skip rule for `App_Data`. For SFTP or ZIP deployments, overlay the new files without deleting the persistent folders. Never package local `App_Data` with a release.
5. Use private, writable locations for media and keys. Start with the `App_Data` defaults if the site identity can write there. Verify this on the actual plan with a test upload, a restart, and a second deployment. If the host supplies a separately persistent writable path, configure it instead. Check actual website quota and inbound request limits in the account. The IIS config cannot raise an upstream provider limit. MP4 is accepted up to the configured cap, and a YouTube link is an alternative for larger videos.
6. Restart the application. On HTTPS, open `/ADMIN` and refresh it. Sign in, rotate the bootstrap password, test publish and playback, verify a byte-range response, and check `/sitemap.xml` against the public origin.

Official host documentation covers [.NET and IIS support](https://help.monsterasp.net/getting-started/first-steps/supported-technologies), [.NET 10 examples and disk quotas](https://help.monsterasp.net/getting-started/first-steps/create-first-website), [publishing options](https://help.monsterasp.net/getting-started/first-steps/publish-first-application), [SQL connection strings](https://help.monsterasp.net/databases/mssql/connection-string), [environment variables](https://help.monsterasp.net/websites/configuration/environment-variables) and [HTTPS](https://help.monsterasp.net/domains-https/https). Account-specific storage, quotas and upload limits require a deployed-site check.

## Media, backup and restore

Use JPG, PNG or WebP for artwork, MP3 for audio, and MP4 for gallery uploads. Files have generated names, a validated format header, and independent media metadata. Record changes replace the reference only after a completed upload. An unattached file or a file attached only to a draft requires a staff session. Playback uses byte-range responses.

Back up the SQL Server database and both `App_Data` directories as a matched set. Retain database and media backups securely, with restricted access to Data Protection keys. Restore them together before restarting the site. Confirm that links, playback, and password-protected access still work. Replaced and abandoned media remain private after their last public reference is removed. Retain these files through a rollback window before deleting them, and reconcile all content and profile references while writes are stopped.

## Tests and troubleshooting

```powershell
dotnet build
npm.cmd --prefix frontend run build
Push-Location frontend
npx.cmd playwright test
Pop-Location
```

The Playwright configuration uses installed Google Chrome and creates a fresh `KoralTest_*` SQL Server database per run. Port 5066 must be free. Test media and screenshots go to the ignored `artifacts` folder. Test databases are disposable and can be dropped from SQL Server after reviewing the run.

- **500 on startup:** Check the environment, database credentials, migration state, and write access for media and Data Protection. Inspect the application logs without enabling verbose logging indefinitely.
- **Admin loops back to sign-in:** Verify HTTPS, the browser’s cookie settings, that the key directory persists, and that the API resolves on the website’s own origin.
- **Upload fails:** Check the extension, media size, IIS and host caps, disk quota, and filesystem access. Test with a known-good small file first.
- **A public item returns 404:** Check its slug, publication status, and section visibility. Draft audio and images require an authenticated staff session.
- **The client has no route or yields a blank screen:** Verify that the publish directory contains its nested `wwwroot/index.html`, generated assets, and the top-level IIS `web.config`.

The default cover is an illustrative [concert photograph by Sam Moghadam](https://unsplash.com/photos/a-large-choir-and-musicians-perform-on-a-dark-stage-w1TkFlNKEos) under the [Unsplash License](https://unsplash.com/license). Replace it in Studio with the choir’s official image. No official logo, album, recordings, or member information were supplied.
