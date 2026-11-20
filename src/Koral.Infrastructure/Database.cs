using Koral.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Koral.Infrastructure;

public sealed class ApplicationUser : IdentityUser
{
    public bool MustChangePassword { get; set; }
}
public sealed class KoralDb(DbContextOptions<KoralDb> options) : IdentityDbContext<ApplicationUser>(options)
{
    public DbSet<Album> Albums => Set<Album>();
    public DbSet<Song> Songs => Set<Song>();
    public DbSet<SongPlatformLink> Platforms => Set<SongPlatformLink>();
    public DbSet<GalleryItem> Gallery => Set<GalleryItem>();
    public DbSet<GalleryCategory> Categories => Set<GalleryCategory>();
    public DbSet<ChoirMember> Members => Set<ChoirMember>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<ChoirProfile> Profiles => Set<ChoirProfile>();
    public DbSet<SiteSetting> Settings => Set<SiteSetting>();
    public DbSet<AuditLog> Audit => Set<AuditLog>();
    public DbSet<MediaAsset> Media => Set<MediaAsset>();
    public DbSet<ChoirApplication> ChoirApplications => Set<ChoirApplication>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);
        var application = b.Entity<ChoirApplication>();
        application.Property(x => x.Name).HasMaxLength(120);
        application.Property(x => x.Email).HasMaxLength(254);
        application.Property(x => x.NormalizedEmail).HasMaxLength(254).UseCollation("Latin1_General_100_BIN2");
        application.Property(x => x.Phone).HasMaxLength(30);
        application.Property(x => x.Voice).HasMaxLength(16);
        application.Property(x => x.Status).HasMaxLength(16);
        application.Property(x => x.Experience).HasMaxLength(1500);
        application.Property(x => x.Notes).HasMaxLength(4000);
        application.Property(x => x.Revision).IsConcurrencyToken();
        application.HasIndex(x => x.NormalizedEmail).IsUnique();
        application.HasIndex(x => new { x.Status, x.CreatedAt });
        b.Entity<ChoirProfile>().Property(x => x.Id).ValueGeneratedNever();
        b.Entity<SiteSetting>().Property(x => x.Id).ValueGeneratedNever();
        Configure<Album>(b);
        Configure<Song>(b);
        Configure<GalleryCategory>(b);
        Configure<GalleryItem>(b);
        Configure<ChoirMember>(b);
        Configure<Event>(b);
        b.Entity<Album>().Property(x => x.Slug).HasMaxLength(160);
        b.Entity<Song>().Property(x => x.Slug).HasMaxLength(160);
        b.Entity<Album>().HasIndex(x => x.Slug).IsUnique();
        b.Entity<Song>().HasIndex(x => x.Slug).IsUnique();
        b.Entity<Song>().HasOne(x => x.Album).WithMany(x => x.Songs).HasForeignKey(x => x.AlbumId).OnDelete(DeleteBehavior.SetNull);
        b.Entity<Song>().HasMany(x => x.Links).WithOne().HasForeignKey(x => x.SongId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<GalleryItem>().HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.SetNull);
        b.Entity<Event>().HasIndex(x => x.Date);
        b.Entity<AuditLog>().HasIndex(x => x.At);
        b.Entity<MediaAsset>().Property(x => x.Name).HasMaxLength(48);
        b.Entity<MediaAsset>().HasIndex(x => x.Name).IsUnique();
    }
    private static void Configure<T>(ModelBuilder b) where T : Entry
    {
        var entity = b.Entity<T>();
        entity.HasBaseType((Type?)null);
        entity.Property(x => x.TitleEn).HasMaxLength(180);
        entity.Property(x => x.TitleAr).HasMaxLength(180);
        entity.HasIndex(x => new { x.Published, x.Sort });
    }
}
public sealed class LocalMediaStorage : Koral.Application.IMediaStorage
{
    private readonly string _root;
    public LocalMediaStorage(string root)
    {
        _root = Path.GetFullPath(root);
        Directory.CreateDirectory(_root);
    }
    private string FilePath(string bucket, string name)
    {
        if (bucket is not ("choir" or "albums" or "songs" or "gallery" or "members" or "audio" or "events")
            || !System.Text.RegularExpressions.Regex.IsMatch(name, @"^[a-f0-9]{32}\.(jpg|png|webp|mp3|mp4)$"))
            throw new ArgumentException("Invalid media path.");
        return Path.Combine(_root, bucket, name);
    }
    public async Task Write(string bucket, string name, Stream stream, CancellationToken cancellationToken)
    {
        var path = FilePath(bucket, name);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        try
        {
            await using var file = new FileStream(path + ".part", FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true);
            await stream.CopyToAsync(file, cancellationToken);
            await file.DisposeAsync();
            File.Move(path + ".part", path);
        }
        catch
        {
            File.Delete(path + ".part");
            throw;
        }
    }
    public Stream? Open(string bucket, string name)
    {
        var path = FilePath(bucket, name);
        return File.Exists(path) ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete, 65536, true) : null;
    }
    public void Remove(string bucket, string name) => File.Delete(FilePath(bucket, name));
}
