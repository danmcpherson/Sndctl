using Microsoft.EntityFrameworkCore;

/// <summary>
/// Database context for the application
/// </summary>
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<SampleItem> SampleItems { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Seed some sample data
        modelBuilder.Entity<SampleItem>().HasData(
            new SampleItem { Id = 1, Name = "Raspberry Pi 5", Description = "Latest Raspberry Pi model" },
            new SampleItem { Id = 2, Name = "Raspberry Pi 4", Description = "Previous generation" },
            new SampleItem { Id = 3, Name = "Raspberry Pi Zero", Description = "Compact version" }
        );
    }
}

/// <summary>
/// Sample entity for testing
/// </summary>
public class SampleItem
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
}
