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

// Serve static files from wwwroot with cache control
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        // Disable caching for HTML, JS, CSS files to ensure updates are picked up
        var path = ctx.File.Name.ToLowerInvariant();
        if (path.EndsWith(".html") || path.EndsWith(".js") || path.EndsWith(".css") || path.EndsWith(".json"))
        {
            ctx.Context.Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
            ctx.Context.Response.Headers["Pragma"] = "no-cache";
            ctx.Context.Response.Headers["Expires"] = "0";
        }
        else
        {
            // Cache other assets (images, icons) for 1 day
            ctx.Context.Response.Headers["Cache-Control"] = "public, max-age=86400";
        }
    }
});

// API routes - must be BEFORE fallback
app.MapControllers();

// Simple version endpoint
app.MapGet("/api/version", () => 
{
    var version = typeof(Program).Assembly.GetName().Version?.ToString() ?? "unknown";
    var informationalVersion = typeof(Program).Assembly
        .GetCustomAttributes(typeof(System.Reflection.AssemblyInformationalVersionAttribute), false)
        .OfType<System.Reflection.AssemblyInformationalVersionAttribute>()
        .FirstOrDefault()?.InformationalVersion ?? version;
    // Strip git hash suffix (everything after +)
    var plusIndex = informationalVersion.IndexOf('+');
    if (plusIndex > 0)
    {
        informationalVersion = informationalVersion.Substring(0, plusIndex);
    }
    return Results.Ok(new { version = informationalVersion });
});

// Explicit route for mobile app - use MapFallbackToFile pattern for consistency
app.Map("/app", async context =>
{
    var fileProvider = app.Environment.WebRootFileProvider;
    var fileInfo = fileProvider.GetFileInfo("app.html");
    
    if (fileInfo.Exists)
    {
        // Prevent caching to ensure updates are picked up
        context.Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
        context.Response.Headers["Pragma"] = "no-cache";
        context.Response.Headers["Expires"] = "0";
        context.Response.ContentType = "text/html; charset=utf-8";
        await using var stream = fileInfo.CreateReadStream();
        await stream.CopyToAsync(context.Response.Body);
    }
    else
    {
        context.Response.StatusCode = 404;
        await context.Response.WriteAsync("Mobile app not found");
    }
});

// Fallback to index.html for SPA routing (only for non-API routes)
app.MapFallbackToFile("index.html");

app.Run();
