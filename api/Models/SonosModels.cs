namespace SonosSoundHub.Models;

/// <summary>
/// Represents a Sonos speaker on the network
/// </summary>
public class Speaker
{
    public string Name { get; set; } = string.Empty;
    public string Ip { get; set; } = string.Empty;
    public bool IsCoordinator { get; set; }
    public string? GroupName { get; set; }
    public int? Volume { get; set; }
    public bool? IsMuted { get; set; }
    public string? CurrentTrack { get; set; }
    public string? PlaybackState { get; set; }
    /// <summary>
    /// Battery level percentage (0-100) for portable speakers like Roam/Move. Null if not a portable speaker.
    /// </summary>
    public int? BatteryLevel { get; set; }
    /// <summary>
    /// Indicates if the speaker is offline or unreachable.
    /// </summary>
    public bool IsOffline { get; set; }
    /// <summary>
    /// Error message if the speaker is offline or has communication issues.
    /// </summary>
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// Response from soco-cli HTTP API
/// </summary>
public class SocoCliResponse
{
    public string Speaker { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string[] Args { get; set; } = Array.Empty<string>();
    public int ExitCode { get; set; }
    public string Result { get; set; } = string.Empty;
    public string ErrorMsg { get; set; } = string.Empty;
}

/// <summary>
/// Status of the soco-cli HTTP API server
/// </summary>
public class SocoServerStatus
{
    public bool IsRunning { get; set; }
    public int? ProcessId { get; set; }
    public string? ServerUrl { get; set; }
    public DateTime? StartedAt { get; set; }
}

/// <summary>
/// Request to execute a command
/// </summary>
public class SonosCommandRequest
{
    public string Speaker { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public List<string> Args { get; set; } = new();
}

/// <summary>
/// Represents a Sonos macro
/// </summary>
public class Macro
{
    public string Name { get; set; } = string.Empty;
    public string Definition { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Category { get; set; }
    public bool IsFavorite { get; set; }
    public List<MacroParameter> Parameters { get; set; } = new();
}

/// <summary>
/// Parameter definition for a macro
/// </summary>
public class MacroParameter
{
    public int Position { get; set; } // 1-12
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Type { get; set; } = "string"; // string, speaker, volume, etc.
    public string? DefaultValue { get; set; }
}

/// <summary>
/// Request to execute a macro
/// </summary>
public class MacroExecuteRequest
{
    public string MacroName { get; set; } = string.Empty;
    public List<string> Arguments { get; set; } = new();
}

/// <summary>
/// Current track information
/// </summary>
public class TrackInfo
{
    public string Title { get; set; } = string.Empty;
    public string Artist { get; set; } = string.Empty;
    public string Album { get; set; } = string.Empty;
    public string? AlbumArtUri { get; set; }
    public string? Duration { get; set; }
    public string? Position { get; set; }
}

/// <summary>
/// Represents a numbered list item (favorites, playlists)
/// </summary>
public class ListItem
{
    public int Number { get; set; }
    public string Name { get; set; } = string.Empty;
}

/// <summary>
/// Represents a queue item with full track info
/// </summary>
public class QueueItem
{
    public int Number { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Artist { get; set; } = string.Empty;
    public string Album { get; set; } = string.Empty;
    public bool IsCurrent { get; set; }
}

/// <summary>
/// Request to add a share link to the queue
/// </summary>
public class ShareLinkRequest
{
    public string Url { get; set; } = string.Empty;
}
