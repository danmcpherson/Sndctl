using System.Diagnostics;
using System.Text.RegularExpressions;

namespace SonosSoundHub.Services;

/// <summary>
/// Service to manage the soco-cli HTTP API server process
/// </summary>
public class SocoCliService
{
    private readonly ILogger<SocoCliService> _logger;
    private readonly IConfiguration _configuration;
    private Process? _serverProcess;
    private DateTime? _startedAt;
    private readonly int _port;
    private readonly SemaphoreSlim _startLock = new(1, 1);
    private bool _isStarting;

    public SocoCliService(ILogger<SocoCliService> logger, IConfiguration configuration)
    {
        _logger = logger;
        _configuration = configuration;
        _port = _configuration.GetValue<int>("SocoCli:Port", 8000);
    }

    /// <summary>
    /// Gets the soco-cli server URL
    /// </summary>
    public string ServerUrl => $"http://localhost:{_port}";

    /// <summary>
    /// Checks if the soco-cli HTTP API server is running
    /// </summary>
    public bool IsRunning()
    {
        try
        {
            return _serverProcess != null && !_serverProcess.HasExited;
        }
        catch (InvalidOperationException)
        {
            // Process was never started or has been disposed
            return false;
        }
    }

    /// <summary>
    /// Resolves the full path to the sonos-http-api-server executable
    /// </summary>
    private string GetExecutablePath()
    {
        // Check common pipx installation locations
        var homeDir = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var possiblePaths = new[]
        {
            Path.Combine(homeDir, ".local", "bin", "sonos-http-api-server"),
            "/usr/local/bin/sonos-http-api-server",
            "/opt/homebrew/bin/sonos-http-api-server",
        };

        foreach (var path in possiblePaths)
        {
            if (File.Exists(path))
            {
                _logger.LogInformation("Found sonos-http-api-server at: {Path}", path);
                return path;
            }
        }

        // Return the command name and hope it's in PATH
        _logger.LogWarning("Could not find sonos-http-api-server in common locations, falling back to PATH");
        return "sonos-http-api-server";
    }

    /// <summary>
    /// Gets the current server status
    /// </summary>
    public Models.SocoServerStatus GetStatus()
    {
        return new Models.SocoServerStatus
        {
            IsRunning = IsRunning(),
            ProcessId = _serverProcess?.Id,
            ServerUrl = IsRunning() ? ServerUrl : null,
            StartedAt = _startedAt
        };
    }

    /// <summary>
    /// Starts the soco-cli HTTP API server
    /// </summary>
    public async Task<bool> StartServerAsync()
    {
        // Quick check without lock
        if (IsRunning())
        {
            return true;
        }

        // Acquire lock to prevent multiple simultaneous start attempts
        await _startLock.WaitAsync();
        try
        {
            // Double-check after acquiring lock
            if (IsRunning() || _isStarting)
            {
                _logger.LogInformation("Soco-CLI server is already running or starting");
                return true;
            }

            _isStarting = true;

            // Use the same path resolution approach as MacroService for consistency
            var dataDir = _configuration.GetValue<string>("DataDirectory") ?? "data";
            var absoluteMacrosPath = Path.GetFullPath(Path.Combine(dataDir, "macros.txt"));
            var useLocalCache = _configuration.GetValue<bool>("SocoCli:UseLocalCache", false);

            var arguments = $"--port {_port}";
            
            // Always pass the macros file path
            arguments += $" --macros \"{absoluteMacrosPath}\"";
            _logger.LogInformation("Using macros file: {MacrosPath}", absoluteMacrosPath);
            

            if (useLocalCache)
            {
                arguments += " --use-local-speaker-list";
            }

            var executablePath = GetExecutablePath();
            var startInfo = new ProcessStartInfo
            {
                FileName = executablePath,
                Arguments = arguments,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            _serverProcess = new Process { StartInfo = startInfo };
            
            _serverProcess.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    _logger.LogInformation("soco-cli: {Output}", e.Data);
                }
            };

            _serverProcess.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    _logger.LogWarning("soco-cli error: {Error}", e.Data);
                }
            };

            _serverProcess.Start();
            _serverProcess.BeginOutputReadLine();
            _serverProcess.BeginErrorReadLine();
            _startedAt = DateTime.UtcNow;

            _logger.LogInformation("Started soco-cli HTTP API server on port {Port} with executable {Path}", _port, executablePath);

            // Wait for the server to start and become responsive
            // Speaker discovery can take several seconds
            for (int i = 0; i < 10; i++)
            {
                await Task.Delay(1000);
                if (!IsRunning())
                {
                    _logger.LogError("soco-cli process exited unexpectedly");
                    return false;
                }
                
                // Try to connect to the server
                try
                {
                    using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
                    var response = await client.GetAsync($"http://localhost:{_port}/");
                    if (response.IsSuccessStatusCode)
                    {
                        _logger.LogInformation("soco-cli HTTP API server is now responsive");
                        return true;
                    }
                }
                catch
                {
                    // Server not ready yet, keep waiting
                    _logger.LogDebug("Waiting for soco-cli server to become responsive... ({Attempt}/10)", i + 1);
                }
            }

            _logger.LogWarning("soco-cli server started but may not be fully responsive yet");
            return IsRunning();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start soco-cli HTTP API server");
            return false;
        }
        finally
        {
            _isStarting = false;
            _startLock.Release();
        }
    }

    /// <summary>
    /// Stops the soco-cli HTTP API server
    /// </summary>
    public bool StopServer()
    {
        if (_serverProcess == null || _serverProcess.HasExited)
        {
            _logger.LogInformation("Soco-CLI server is not running");
            return true;
        }

        try
        {
            _serverProcess.Kill();
            _serverProcess.WaitForExit(5000);
            _serverProcess.Dispose();
            _serverProcess = null;
            _startedAt = null;

            _logger.LogInformation("Stopped soco-cli HTTP API server");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to stop soco-cli HTTP API server");
            return false;
        }
    }

    /// <summary>
    /// Ensures the server is running, starting it if necessary
    /// </summary>
    public async Task<bool> EnsureServerRunningAsync()
    {
        // If we're tracking a running process, we're good
        if (IsRunning())
        {
            return true;
        }

        // If server is currently starting, wait for it
        if (_isStarting)
        {
            _logger.LogDebug("Server is starting, waiting for completion...");
            
            // Wait for the startup to complete (up to 15 seconds)
            for (int i = 0; i < 150; i++)
            {
                await Task.Delay(100);
                if (IsRunning())
                {
                    return true;
                }
                if (!_isStarting)
                {
                    // Startup finished but server not running - failed to start
                    break;
                }
            }
            
            if (IsRunning())
            {
                return true;
            }
        }

        // Check if another instance is already responding on the port
        // (e.g., from a previous run that we lost track of)
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(1) };
            var response = await client.GetAsync($"http://localhost:{_port}/speakers");
            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("Found existing soco-cli server responding on port {Port}", _port);
                return true;
            }
        }
        catch
        {
            // No server responding, need to start one
        }

        return await StartServerAsync();
    }
}
