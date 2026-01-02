using System.Text.Json;
using SonosSoundHub.Models;

namespace SonosSoundHub.Services;

/// <summary>
/// Service to execute commands via the soco-cli HTTP API.
/// Uses a semaphore to serialize requests - soco-cli cannot handle concurrent requests properly.
/// </summary>
public class SonosCommandService
{
    private readonly HttpClient _httpClient;
    private readonly SocoCliService _socoCliService;
    private readonly ILogger<SonosCommandService> _logger;
    
    /// <summary>
    /// Semaphore to ensure only one request to soco-cli at a time.
    /// soco-cli's HTTP API can mix up responses when handling concurrent requests.
    /// </summary>
    private static readonly SemaphoreSlim _requestLock = new(1, 1);

    private static async Task<string> ReadBodySafeAsync(HttpResponseMessage response)
    {
        try
        {
            return await response.Content.ReadAsStringAsync();
        }
        catch
        {
            return "<unable to read response body>";
        }
    }

    public SonosCommandService(
        HttpClient httpClient,
        SocoCliService socoCliService,
        ILogger<SonosCommandService> logger)
    {
        _httpClient = httpClient;
        _socoCliService = socoCliService;
        _logger = logger;
    }

    /// <summary>
    /// Gets the list of speakers
    /// </summary>
    public async Task<List<string>> GetSpeakersAsync()
    {
        await _socoCliService.EnsureServerRunningAsync();
        await _requestLock.WaitAsync();

        try
        {
            var url = $"{_socoCliService.ServerUrl}/speakers";
            var response = await _httpClient.GetAsync(url);
            if (!response.IsSuccessStatusCode)
            {
                var body = await ReadBodySafeAsync(response);
                _logger.LogError(
                    "soco-cli request failed: GET {Url} => {StatusCode} {ReasonPhrase}. Body: {Body}",
                    url,
                    (int)response.StatusCode,
                    response.ReasonPhrase,
                    body);
                return new List<string>();
            }

            var content = await response.Content.ReadAsStringAsync();
            var result = JsonSerializer.Deserialize<JsonElement>(content);
            
            if (result.TryGetProperty("speakers", out var speakers))
            {
                return speakers.EnumerateArray()
                    .Select(s => s.GetString() ?? string.Empty)
                    .Where(s => !string.IsNullOrEmpty(s))
                    .ToList();
            }

            return new List<string>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get speakers");
            return new List<string>();
        }
        finally
        {
            _requestLock.Release();
        }
    }

    /// <summary>
    /// Triggers speaker rediscovery
    /// </summary>
    public async Task<List<string>> RediscoverSpeakersAsync()
    {
        await _socoCliService.EnsureServerRunningAsync();
        await _requestLock.WaitAsync();

        try
        {
            var url = $"{_socoCliService.ServerUrl}/rediscover";
            var response = await _httpClient.GetAsync(url);
            if (!response.IsSuccessStatusCode)
            {
                var body = await ReadBodySafeAsync(response);
                _logger.LogError(
                    "soco-cli request failed: GET {Url} => {StatusCode} {ReasonPhrase}. Body: {Body}",
                    url,
                    (int)response.StatusCode,
                    response.ReasonPhrase,
                    body);
                return new List<string>();
            }

            var content = await response.Content.ReadAsStringAsync();
            var result = JsonSerializer.Deserialize<JsonElement>(content);
            
            if (result.TryGetProperty("speakers_discovered", out var speakers))
            {
                return speakers.EnumerateArray()
                    .Select(s => s.GetString() ?? string.Empty)
                    .Where(s => !string.IsNullOrEmpty(s))
                    .ToList();
            }

            return new List<string>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to rediscover speakers");
            return new List<string>();
        }
        finally
        {
            _requestLock.Release();
        }
    }

    /// <summary>
    /// Executes a command on a speaker
    /// </summary>
    public async Task<SocoCliResponse> ExecuteCommandAsync(string speaker, string action, params string[] args)
    {
        await _socoCliService.EnsureServerRunningAsync();
        await _requestLock.WaitAsync();

        try
        {
            var url = $"{_socoCliService.ServerUrl}/{Uri.EscapeDataString(speaker)}/{Uri.EscapeDataString(action)}";
            
            if (args.Length > 0)
            {
                var encodedArgs = args.Select(Uri.EscapeDataString);
                url += "/" + string.Join("/", encodedArgs);
            }

            _logger.LogDebug("Executing command: {Url}", url);

            var response = await _httpClient.GetAsync(url);
            if (!response.IsSuccessStatusCode)
            {
                var body = await ReadBodySafeAsync(response);
                _logger.LogError(
                    "soco-cli request failed: GET {Url} => {StatusCode} {ReasonPhrase}. Body: {Body}",
                    url,
                    (int)response.StatusCode,
                    response.ReasonPhrase,
                    body);
                return new SocoCliResponse
                {
                    Speaker = speaker,
                    Action = action,
                    Args = args,
                    ExitCode = (int)response.StatusCode,
                    ErrorMsg = $"HTTP {(int)response.StatusCode} {response.ReasonPhrase}"
                };
            }

            var content = await response.Content.ReadAsStringAsync();
            var result = JsonSerializer.Deserialize<SocoCliResponse>(content, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            return result ?? new SocoCliResponse { ErrorMsg = "Failed to parse response" };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to execute command: {Speaker} {Action}", speaker, action);
            return new SocoCliResponse
            {
                Speaker = speaker,
                Action = action,
                Args = args,
                ExitCode = -1,
                ErrorMsg = ex.Message
            };
        }
        finally
        {
            _requestLock.Release();
        }
    }

    /// <summary>
    /// Checks if an error message indicates the speaker is offline/unreachable
    /// </summary>
    private static bool IsTimeoutOrConnectionError(string? errorMsg)
    {
        if (string.IsNullOrEmpty(errorMsg))
            return false;

        var lowerError = errorMsg.ToLowerInvariant();
        return lowerError.Contains("timed out") ||
               lowerError.Contains("timeout") ||
               lowerError.Contains("connection refused") ||
               lowerError.Contains("unreachable") ||
               lowerError.Contains("no route to host") ||
               lowerError.Contains("network is unreachable") ||
               lowerError.Contains("connecttimeouterror") ||
               lowerError.Contains("max retries exceeded");
    }

    /// <summary>
    /// Gets detailed information about a speaker
    /// </summary>
    public async Task<Speaker> GetSpeakerInfoAsync(string speakerName)
    {
        var speaker = new Speaker { Name = speakerName };

        try
        {
            // Get volume first as a connectivity check
            var volumeResponse = await ExecuteCommandAsync(speakerName, "volume");
            
            // Check if this is a timeout/connection error indicating offline speaker
            if (volumeResponse.ExitCode != 0 && IsTimeoutOrConnectionError(volumeResponse.ErrorMsg))
            {
                speaker.IsOffline = true;
                speaker.ErrorMessage = "Speaker is offline or unreachable";
                _logger.LogWarning("Speaker {Speaker} appears to be offline: {Error}", speakerName, volumeResponse.ErrorMsg);
                return speaker;
            }
            
            if (volumeResponse.ExitCode == 0 && int.TryParse(volumeResponse.Result, out var volume))
            {
                speaker.Volume = volume;
            }

            // Get mute status
            var muteResponse = await ExecuteCommandAsync(speakerName, "mute");
            if (muteResponse.ExitCode != 0 && IsTimeoutOrConnectionError(muteResponse.ErrorMsg))
            {
                speaker.IsOffline = true;
                speaker.ErrorMessage = "Speaker is offline or unreachable";
                return speaker;
            }
            if (muteResponse.ExitCode == 0)
            {
                speaker.IsMuted = muteResponse.Result.ToLower() == "on";
            }

            // Get playback state
            var stateResponse = await ExecuteCommandAsync(speakerName, "playback");
            if (stateResponse.ExitCode != 0 && IsTimeoutOrConnectionError(stateResponse.ErrorMsg))
            {
                speaker.IsOffline = true;
                speaker.ErrorMessage = "Speaker is offline or unreachable";
                return speaker;
            }
            if (stateResponse.ExitCode == 0)
            {
                speaker.PlaybackState = stateResponse.Result;
            }

            // Get current track
            var trackResponse = await ExecuteCommandAsync(speakerName, "track");
            if (trackResponse.ExitCode != 0 && IsTimeoutOrConnectionError(trackResponse.ErrorMsg))
            {
                speaker.IsOffline = true;
                speaker.ErrorMessage = "Speaker is offline or unreachable";
                return speaker;
            }
            if (trackResponse.ExitCode == 0)
            {
                speaker.CurrentTrack = trackResponse.Result;
            }

            // Get battery level (for portable speakers like Roam/Move)
            var batteryResponse = await ExecuteCommandAsync(speakerName, "battery");
            if (batteryResponse.ExitCode == 0 && !string.IsNullOrEmpty(batteryResponse.Result))
            {
                // Battery response format is typically just a number like "85"
                if (int.TryParse(batteryResponse.Result.Trim().Replace("%", ""), out var batteryLevel))
                {
                    speaker.BatteryLevel = batteryLevel;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get speaker info for {Speaker}", speakerName);
            
            // Check if the exception indicates a timeout/connection issue
            if (IsTimeoutOrConnectionError(ex.Message))
            {
                speaker.IsOffline = true;
                speaker.ErrorMessage = "Speaker is offline or unreachable";
            }
        }

        return speaker;
    }
}
