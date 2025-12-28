using Microsoft.EntityFrameworkCore;
using SonosSoundHub.Services;

var baseDir = Path.GetDirectoryName(Environment.ProcessPath) ?? AppContext.BaseDirectory;
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = baseDir,
    WebRootPath = Path.Combine(baseDir, "wwwroot")
});

// Listen on all interfaces for Pi deployment (can be overridden by launchSettings.json in development)
if (builder.Environment.IsProduction())
{
    builder.WebHost.UseUrls("http://0.0.0.0:5000");
}

// Add services
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });

// Configure form options for file uploads
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 10 * 1024 * 1024; // 10 MB
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddMemoryCache();

// Add HttpClient for soco-cli communication
builder.Services.AddHttpClient<SonosCommandService>();
builder.Services.AddHttpClient<MacroService>();

// Add Sonos services
builder.Services.AddSingleton<SocoCliService>();
builder.Services.AddScoped<SonosCommandService>();
builder.Services.AddScoped<MacroService>();

// Configure SQLite
var dataDirectory = builder.Configuration["DataDirectory"] ?? "data";
if (!Directory.Exists(dataDirectory))
{
    Directory.CreateDirectory(dataDirectory);
}

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));

var app = builder.Build();

// Initialize database
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
}

// Configure middleware
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}

// Serve static files from wwwroot
app.UseStaticFiles();

// API routes - must be BEFORE fallback
app.MapControllers();

// Explicit route for mobile app
app.MapGet("/app", async context =>
{
    context.Response.ContentType = "text/html";
    var appPath = Path.Combine(app.Environment.WebRootPath, "app.html");
    await context.Response.SendFileAsync(appPath);
});

// Fallback to index.html for SPA routing (only for non-API routes)
app.MapFallbackToFile("index.html");

app.Run();
