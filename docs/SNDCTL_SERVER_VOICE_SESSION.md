# Voice Session Endpoint Implementation for sndctl-server

This document describes the changes needed to add OpenAI ephemeral token generation to sndctl-server.

## Overview

The `/api/voice/session` endpoint allows devices to obtain short-lived OpenAI Realtime API tokens without storing the API key on the device. The server holds the permanent OpenAI API key and issues ephemeral tokens to authenticated devices **with an active voice subscription**.

## Subscription Model

Voice control is a premium feature that requires a subscription. The subscription status is stored on the `DeviceEntity`:

- **Not subscribed**: Device cannot use voice features
- **Subscribed**: Device can request ephemeral tokens

Users can subscribe at `https://sndctl.app/app/subscribe`.

## Architecture

```
┌─────────────┐       ┌───────────────────┐       ┌─────────────────┐       ┌──────────┐
│   Browser   │──────▶│  Raspberry Pi     │──────▶│  sndctl-server  │──────▶│  OpenAI  │
│  (voice.js) │       │  (local sndctl)   │       │  (Azure)        │       │   API    │
└─────────────┘       └───────────────────┘       └─────────────────┘       └──────────┘
      │                       │                          │                       │
      │  1. POST /api/voice/session                      │                       │
      │ ─────────────────────▶│                          │                       │
      │                       │  2. POST /api/voice/session                      │
      │                       │     + X-Device-Secret    │                       │
      │                       │ ─────────────────────────▶│                       │
      │                       │                          │  3. POST /v1/realtime/client_secrets
      │                       │                          │ ──────────────────────▶│
      │                       │                          │  4. Ephemeral token   │
      │                       │                          │◀────────────────────── │
      │                       │  5. Return token         │                       │
      │  6. Return token      │◀──────────────────────── │                       │
      │◀───────────────────── │                          │                       │
      │                                                                          │
      │  7. Connect to OpenAI Realtime API with ephemeral token                  │
      │ ────────────────────────────────────────────────────────────────────────▶│
```

## Files to Create/Modify

### 1. Device Entity: `api/Models/DeviceEntity.cs`

Add subscription fields to the existing `DeviceEntity`:

```csharp
/// <summary>
/// Voice subscription status.
/// </summary>
public string? Subscription { get; set; }

/// <summary>
/// When the subscription was activated.
/// </summary>
public DateTimeOffset? SubscriptionStartedAt { get; set; }

/// <summary>
/// When the subscription expires (null = no expiry / lifetime).
/// </summary>
public DateTimeOffset? SubscriptionExpiresAt { get; set; }
```

Add subscription status constants:

```csharp
/// <summary>
/// Subscription status constants.
/// </summary>
public static class SubscriptionStatus
{
    /// <summary>No active subscription.</summary>
    public const string None = "none";
    /// <summary>Active subscription.</summary>
    public const string Active = "active";
    /// <summary>Subscription expired.</summary>
    public const string Expired = "expired";
    /// <summary>Subscription cancelled but still valid until expiry.</summary>
    public const string Cancelled = "cancelled";
}
```

### 2. Configuration: `api/Configuration/AppSettings.cs`

Add the OpenAI API key property:

```csharp
namespace Api.Configuration;

public class AppSettings
{
    // ... existing properties ...

    /// <summary>
    /// OpenAI API key for voice assistant ephemeral token generation.
    /// </summary>
    public string OpenAiApiKey { get; set; } = string.Empty;
}
```

### 2. Program.cs Configuration

Add to the `Configure<AppSettings>` section in `Program.cs`:

```csharp
builder.Services.Configure<AppSettings>(options =>
{
    // ... existing configuration ...
    options.OpenAiApiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY") ?? "";
});
```

### 3. Request Model: `api/Models/Requests/VoiceSessionRequest.cs`

```csharp
using System.ComponentModel.DataAnnotations;

namespace Api.Models.Requests;

/// <summary>
/// Request to create an OpenAI Realtime API session.
/// </summary>
public class VoiceSessionRequest
{
    /// <summary>
    /// Device ID (12-character hex string).
    /// </summary>
    [Required]
    [RegularExpression(@"^[a-fA-F0-9]{12}$", ErrorMessage = "Device ID must be a 12-character hex string")]
    public string DeviceId { get; set; } = string.Empty;

    /// <summary>
    /// Voice to use for the assistant (e.g., "verse", "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer").
    /// </summary>
    public string Voice { get; set; } = "verse";

    /// <summary>
    /// System instructions for the voice assistant.
    /// </summary>
    public string? Instructions { get; set; }

    /// <summary>
    /// Tools (functions) available to the voice assistant.
    /// </summary>
    public List<object>? Tools { get; set; }
}
```

### 4. Response Model: `api/Models/Responses/VoiceSessionResponse.cs`

```csharp
using System.Text.Json.Serialization;

namespace Api.Models.Responses;

/// <summary>
/// Response containing an ephemeral OpenAI session token.
/// </summary>
public class VoiceSessionResponse
{
    /// <summary>
    /// The client secret for connecting to OpenAI Realtime API.
    /// </summary>
    [JsonPropertyName("client_secret")]
    public ClientSecret? ClientSecret { get; set; }

    /// <summary>
    /// The session configuration.
    /// </summary>
    [JsonPropertyName("session")]
    public object? Session { get; set; }
}

/// <summary>
/// OpenAI client secret.
/// </summary>
public class ClientSecret
{
    /// <summary>
    /// The ephemeral token value (starts with "ek_").
    /// </summary>
    [JsonPropertyName("value")]
    public string Value { get; set; } = string.Empty;

    /// <summary>
    /// Expiration timestamp (Unix epoch seconds).
    /// </summary>
    [JsonPropertyName("expires_at")]
    public long ExpiresAt { get; set; }
}
```

### 5. Status Response Model: `api/Models/Responses/VoiceStatusResponse.cs`

```csharp
using System.Text.Json.Serialization;

namespace Api.Models.Responses;

/// <summary>
/// Response for voice subscription status check.
/// </summary>
public class VoiceStatusResponse
{
    /// <summary>
    /// Whether voice is enabled for this device.
    /// </summary>
    [JsonPropertyName("enabled")]
    public bool Enabled { get; set; }

    /// <summary>
    /// Subscription status: "none", "active", "expired", "cancelled".
    /// </summary>
    [JsonPropertyName("subscription")]
    public string Subscription { get; set; } = "none";

    /// <summary>
    /// When the subscription expires (ISO 8601), or null if no expiry.
    /// </summary>
    [JsonPropertyName("expiresAt")]
    public DateTimeOffset? ExpiresAt { get; set; }

    /// <summary>
    /// URL to subscribe or manage subscription.
    /// </summary>
    [JsonPropertyName("subscribeUrl")]
    public string SubscribeUrl { get; set; } = "https://sndctl.app/app/subscribe";

    /// <summary>
    /// Human-readable message about the subscription status.
    /// </summary>
    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;
}
```

### 6. Status Function: `api/Functions/VoiceStatusFunction.cs`

```csharp
using Api.Models;
using Api.Models.Responses;
using Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace Api.Functions;

/// <summary>
/// Azure Function for checking voice subscription status.
/// </summary>
public class VoiceStatusFunction
{
    private readonly IDeviceService _deviceService;
    private readonly IAuditService _auditService;
    private readonly ILogger<VoiceStatusFunction> _logger;

    public VoiceStatusFunction(
        IDeviceService deviceService,
        IAuditService auditService,
        ILogger<VoiceStatusFunction> logger)
    {
        _deviceService = deviceService;
        _auditService = auditService;
        _logger = logger;
    }

    /// <summary>
    /// Checks if voice is enabled for a device.
    /// GET /api/voice/status?deviceId={deviceId}
    /// </summary>
    [Function("VoiceStatus")]
    public async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "voice/status")] HttpRequest req)
    {
        var requestId = Guid.NewGuid().ToString();
        var ipAddress = GetClientIpAddress(req);

        try
        {
            // Get device ID from query string
            var deviceId = req.Query["deviceId"].ToString()?.ToLowerInvariant();
            if (string.IsNullOrEmpty(deviceId))
            {
                return new BadRequestObjectResult(new ErrorResponse
                {
                    Error = "missing_device_id",
                    Message = "deviceId query parameter is required",
                    RequestId = requestId
                });
            }

            // Get device secret from header
            var deviceSecret = req.Headers["X-Device-Secret"].ToString();
            if (string.IsNullOrEmpty(deviceSecret))
            {
                return new UnauthorizedObjectResult(ErrorResponse.InvalidDeviceSecret(requestId));
            }

            // Look up device
            var device = await _deviceService.GetDeviceAsync(deviceId);
            if (device == null)
            {
                return new NotFoundObjectResult(ErrorResponse.DeviceNotFound(requestId));
            }

            // Validate device secret
            var isValidSecret = await _deviceService.ValidateSecretAsync(deviceId, deviceSecret);
            if (!isValidSecret)
            {
                return new UnauthorizedObjectResult(ErrorResponse.InvalidDeviceSecret(requestId));
            }

            // Check subscription status
            var isSubscribed = IsVoiceEnabled(device);
            var subscriptionStatus = device.Subscription ?? SubscriptionStatus.None;

            // Check for expiry
            if (subscriptionStatus == SubscriptionStatus.Active && 
                device.SubscriptionExpiresAt.HasValue && 
                device.SubscriptionExpiresAt.Value < DateTimeOffset.UtcNow)
            {
                subscriptionStatus = SubscriptionStatus.Expired;
            }

            var response = new VoiceStatusResponse
            {
                Enabled = isSubscribed,
                Subscription = subscriptionStatus,
                ExpiresAt = device.SubscriptionExpiresAt,
                SubscribeUrl = $"https://sndctl.app/app/subscribe?device={deviceId}",
                Message = isSubscribed 
                    ? "Voice control is enabled" 
                    : "Subscribe to enable voice control"
            };

            return new OkObjectResult(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking voice status (RequestId: {RequestId})", requestId);
            return new ObjectResult(ErrorResponse.InternalError(requestId))
            {
                StatusCode = StatusCodes.Status500InternalServerError
            };
        }
    }

    /// <summary>
    /// Checks if voice is enabled for a device based on subscription.
    /// </summary>
    private static bool IsVoiceEnabled(DeviceEntity device)
    {
        var subscription = device.Subscription ?? SubscriptionStatus.None;
        
        // Not subscribed
        if (subscription == SubscriptionStatus.None || subscription == SubscriptionStatus.Expired)
        {
            return false;
        }

        // Check expiry for active/cancelled subscriptions
        if (device.SubscriptionExpiresAt.HasValue && 
            device.SubscriptionExpiresAt.Value < DateTimeOffset.UtcNow)
        {
            return false;
        }

        return subscription == SubscriptionStatus.Active || 
               subscription == SubscriptionStatus.Cancelled; // Still valid until expiry
    }

    private static string GetClientIpAddress(HttpRequest req)
    {
        if (req.Headers.TryGetValue("X-Forwarded-For", out var forwardedFor))
        {
            var ip = forwardedFor.ToString().Split(',').FirstOrDefault()?.Trim();
            if (!string.IsNullOrEmpty(ip)) return ip;
        }
        return req.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }
}
```

### 7. Function: `api/Functions/VoiceSessionFunction.cs`

```csharp
using System.ComponentModel.DataAnnotations;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Api.Configuration;
using Api.Models;
using Api.Models.Requests;
using Api.Models.Responses;
using Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Api.Functions;

/// <summary>
/// Azure Function for generating OpenAI Realtime API ephemeral tokens.
/// </summary>
public class VoiceSessionFunction
{
    private readonly IDeviceService _deviceService;
    private readonly IRateLimitService _rateLimitService;
    private readonly IAuditService _auditService;
    private readonly AppSettings _settings;
    private readonly ILogger<VoiceSessionFunction> _logger;
    private readonly IHttpClientFactory _httpClientFactory;

    private static readonly string[] ValidVoices = 
        ["verse", "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer"];

    public VoiceSessionFunction(
        IDeviceService deviceService,
        IRateLimitService rateLimitService,
        IAuditService auditService,
        IOptions<AppSettings> settings,
        IHttpClientFactory httpClientFactory,
        ILogger<VoiceSessionFunction> logger)
    {
        _deviceService = deviceService;
        _rateLimitService = rateLimitService;
        _auditService = auditService;
        _settings = settings.Value;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>
    /// Creates an ephemeral OpenAI Realtime API session token.
    /// POST /api/voice/session
    /// </summary>
    [Function("VoiceSession")]
    public async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "voice/session")] HttpRequest req)
    {
        var requestId = Guid.NewGuid().ToString();
        var ipAddress = GetClientIpAddress(req);
        var userAgent = req.Headers.UserAgent.ToString();

        _logger.LogInformation("Voice session request from {IpAddress} (RequestId: {RequestId})", 
            ipAddress, requestId);

        try
        {
            // Check if OpenAI API key is configured
            if (string.IsNullOrEmpty(_settings.OpenAiApiKey))
            {
                _logger.LogError("OpenAI API key not configured on server");
                return new ObjectResult(new ErrorResponse
                {
                    Error = "service_unavailable",
                    Message = "Voice service is not configured",
                    RequestId = requestId
                })
                {
                    StatusCode = StatusCodes.Status503ServiceUnavailable
                };
            }

            // Check IP rate limit
            var ipLimit = await _rateLimitService.CheckIpLimitAsync(ipAddress);
            if (!ipLimit.IsAllowed)
            {
                return new ObjectResult(ErrorResponse.RateLimited(requestId, ipLimit.RetryAfterSeconds))
                {
                    StatusCode = StatusCodes.Status429TooManyRequests
                };
            }

            // Parse request
            VoiceSessionRequest? request;
            try
            {
                request = await req.ReadFromJsonAsync<VoiceSessionRequest>();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse voice session request");
                return new BadRequestObjectResult(ErrorResponse.InvalidRequest(requestId, "Invalid JSON body"));
            }

            if (request == null)
            {
                return new BadRequestObjectResult(ErrorResponse.InvalidRequest(requestId, "Request body is required"));
            }

            // Validate request
            var validationResults = new List<ValidationResult>();
            if (!Validator.TryValidateObject(request, new ValidationContext(request), validationResults, true))
            {
                var errors = string.Join("; ", validationResults.Select(v => v.ErrorMessage));
                return new BadRequestObjectResult(ErrorResponse.InvalidRequest(requestId, errors));
            }

            var deviceId = request.DeviceId.ToLowerInvariant();

            // Get device secret from header
            var deviceSecret = req.Headers["X-Device-Secret"].ToString();
            if (string.IsNullOrEmpty(deviceSecret))
            {
                await _auditService.LogFailureAsync(deviceId, "voice_session", ipAddress, requestId, 
                    "Missing device secret", userAgent);
                return new UnauthorizedObjectResult(ErrorResponse.InvalidDeviceSecret(requestId));
            }

            // Look up device
            var device = await _deviceService.GetDeviceAsync(deviceId);
            if (device == null)
            {
                await _auditService.LogFailureAsync(deviceId, "voice_session", ipAddress, requestId, 
                    "Device not found", userAgent);
                return new NotFoundObjectResult(ErrorResponse.DeviceNotFound(requestId));
            }

            // Validate device secret
            var isValidSecret = await _deviceService.ValidateSecretAsync(deviceId, deviceSecret);
            if (!isValidSecret)
            {
                await _auditService.LogFailureAsync(deviceId, "voice_session", ipAddress, requestId, 
                    "Invalid device secret", userAgent);
                return new UnauthorizedObjectResult(ErrorResponse.InvalidDeviceSecret(requestId));
            }

            // Check device status
            if (device.Status == DeviceStatus.Revoked)
            {
                await _auditService.LogFailureAsync(deviceId, "voice_session", ipAddress, requestId, 
                    "Device revoked", userAgent);
                return new ObjectResult(ErrorResponse.DeviceRevoked(requestId))
                {
                    StatusCode = StatusCodes.Status403Forbidden
                };
            }

            // Check voice subscription
            if (!IsVoiceEnabled(device))
            {
                await _auditService.LogFailureAsync(deviceId, "voice_session", ipAddress, requestId, 
                    "Voice not enabled", userAgent);
                return new ObjectResult(new ErrorResponse
                {
                    Error = "voice_not_enabled",
                    Message = "Subscribe to enable voice control",
                    RequestId = requestId
                })
                {
                    StatusCode = StatusCodes.Status403Forbidden
                };
            }

            // Check device-specific rate limit for voice sessions (more generous than cert renewal)
            // Allow 60 requests per hour per device
            var voiceRateKey = $"device:{deviceId}:voice";
            await _rateLimitService.RecordRequestAsync(voiceRateKey, 60);
            await _rateLimitService.RecordRequestAsync($"ip:{ipAddress}", 60);

            // Validate voice selection
            var voice = ValidVoices.Contains(request.Voice.ToLowerInvariant()) 
                ? request.Voice.ToLowerInvariant() 
                : "verse";

            // Build OpenAI request
            var openAiRequest = new
            {
                model = "gpt-4o-realtime-preview-2024-12-17",
                voice = voice,
                instructions = request.Instructions ?? GetDefaultInstructions(),
                tools = request.Tools ?? GetDefaultTools(),
                tool_choice = "auto",
                input_audio_transcription = new { model = "whisper-1" },
                turn_detection = new
                {
                    type = "server_vad",
                    threshold = 0.5,
                    prefix_padding_ms = 300,
                    silence_duration_ms = 500
                }
            };

            // Call OpenAI API
            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization = 
                new AuthenticationHeaderValue("Bearer", _settings.OpenAiApiKey);
            client.DefaultRequestHeaders.Accept.Add(
                new MediaTypeWithQualityHeaderValue("application/json"));

            var jsonContent = new StringContent(
                JsonSerializer.Serialize(openAiRequest),
                Encoding.UTF8,
                "application/json");

            var response = await client.PostAsync(
                "https://api.openai.com/v1/realtime/sessions", 
                jsonContent);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogError("OpenAI API error: {StatusCode} {Content}", 
                    response.StatusCode, errorContent);

                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                {
                    return new ObjectResult(new ErrorResponse
                    {
                        Error = "openai_auth_error",
                        Message = "OpenAI API authentication failed",
                        RequestId = requestId
                    })
                    {
                        StatusCode = StatusCodes.Status503ServiceUnavailable
                    };
                }

                return new ObjectResult(new ErrorResponse
                {
                    Error = "openai_error",
                    Message = "Failed to create OpenAI session",
                    RequestId = requestId
                })
                {
                    StatusCode = StatusCodes.Status502BadGateway
                };
            }

            var openAiResponse = await response.Content.ReadAsStringAsync();
            var sessionData = JsonSerializer.Deserialize<JsonElement>(openAiResponse);

            // Log success
            await _auditService.LogSuccessAsync(deviceId, "voice_session", ipAddress, requestId, userAgent);
            _logger.LogInformation("Voice session created for device {DeviceId}", deviceId);

            // Return the OpenAI response directly
            return new ContentResult
            {
                Content = openAiResponse,
                ContentType = "application/json",
                StatusCode = StatusCodes.Status200OK
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating voice session (RequestId: {RequestId})", requestId);
            return new ObjectResult(ErrorResponse.InternalError(requestId))
            {
                StatusCode = StatusCodes.Status500InternalServerError
            };
        }
    }

    private static string GetDefaultInstructions()
    {
        return """
            You are a helpful voice assistant for controlling a Sonos speaker system. You help users:

            - Play, pause, and control music playback
            - Adjust volume on speakers
            - Group and ungroup speakers
            - Play favorites, playlists, and radio stations
            - Run automation macros
            - Get information about what's playing

            Be concise and friendly in your responses. When executing commands, confirm what you did briefly.

            Speaker names in this system may include: Kitchen, Living Room, Bedroom, Office, Dining Room, etc.
            Users may refer to speakers casually - match to the closest speaker name.

            When users ask about macros, list them briefly. When they want to run one, use the run_macro function.

            Always respond conversationally and confirm actions you take.
            """;
    }

    private static List<object> GetDefaultTools()
    {
        // Return empty list - the device will provide its own tools
        return [];
    }

    /// <summary>
    /// Checks if voice is enabled for a device based on subscription.
    /// </summary>
    private static bool IsVoiceEnabled(DeviceEntity device)
    {
        var subscription = device.Subscription ?? SubscriptionStatus.None;
        
        // Not subscribed
        if (subscription == SubscriptionStatus.None || subscription == SubscriptionStatus.Expired)
        {
            return false;
        }

        // Check expiry for active/cancelled subscriptions
        if (device.SubscriptionExpiresAt.HasValue && 
            device.SubscriptionExpiresAt.Value < DateTimeOffset.UtcNow)
        {
            return false;
        }

        return subscription == SubscriptionStatus.Active || 
               subscription == SubscriptionStatus.Cancelled; // Still valid until expiry
    }

    private static string GetClientIpAddress(HttpRequest req)
    {
        if (req.Headers.TryGetValue("X-Forwarded-For", out var forwardedFor))
        {
            var ip = forwardedFor.ToString().Split(',').FirstOrDefault()?.Trim();
            if (!string.IsNullOrEmpty(ip))
            {
                return ip;
            }
        }

        return req.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }
}
```

### 6. Register HttpClientFactory in `Program.cs`

Add this line after the existing service registrations:

```csharp
// Register HttpClientFactory for making HTTP calls to OpenAI
builder.Services.AddHttpClient();
```

## Environment Variables

Add to your Azure Static Web App or local.settings.json:

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key (starts with `sk-`) | `sk-proj-abc123...` |

## API Contract

### Check Voice Status

```http
GET /api/voice/status?deviceId=f16f67617363
X-Device-Secret: <64-character-hex-device-secret>
```

**Response (Success - 200):**
```json
{
  "enabled": true,
  "subscription": "active",
  "expiresAt": "2027-01-18T00:00:00Z",
  "subscribeUrl": "https://sndctl.app/app/subscribe?device=f16f67617363",
  "message": "Voice control is enabled"
}
```

**Response (Not Subscribed - 200):**
```json
{
  "enabled": false,
  "subscription": "none",
  "expiresAt": null,
  "subscribeUrl": "https://sndctl.app/app/subscribe?device=f16f67617363",
  "message": "Subscribe to enable voice control"
}
```

### Create Voice Session

```http
POST /api/voice/session
Content-Type: application/json
X-Device-Secret: <64-character-hex-device-secret>

{
  "deviceId": "f16f67617363",
  "voice": "verse",
  "instructions": "You are a helpful voice assistant...",
  "tools": [
    {
      "type": "function",
      "name": "play_pause",
      "description": "Toggle play/pause on a speaker",
      "parameters": {
        "type": "object",
        "properties": {
          "speaker": { "type": "string" }
        },
        "required": ["speaker"]
      }
    }
  ]
}
```

**Response (Success - 200):**
```json
{
  "client_secret": {
    "value": "ek_68af296e8e408191a1120ab6383263c2",
    "expires_at": 1737200470
  },
  "session": {
    "type": "realtime",
    "object": "realtime.session",
    "id": "sess_C9CiUVUzUzYIssh3ELY1d",
    "model": "gpt-4o-realtime-preview-2024-12-17",
    "voice": "verse",
    "instructions": "...",
    "tools": [...],
    ...
  }
}
```

### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `invalid_request` | Missing or invalid request body |
| 400 | `missing_device_id` | deviceId query parameter missing (status endpoint) |
| 401 | `invalid_device_secret` | Missing or incorrect device secret |
| 403 | `device_revoked` | Device has been revoked |
| 403 | `voice_not_enabled` | Device does not have voice subscription |
| 404 | `device_not_found` | Device ID not registered |
| 429 | `rate_limited` | Too many requests |
| 502 | `openai_error` | OpenAI API call failed |
| 503 | `service_unavailable` | OpenAI API key not configured |

## Security Considerations

1. **Device Secret**: The 64-character hex secret is hashed with SHA256 before storage. Only the device knows the raw secret.

2. **Ephemeral Tokens**: OpenAI tokens expire after ~60 seconds and can only be used to establish a single WebSocket connection.

3. **Rate Limiting**: 
   - Per-device: 60 requests/hour (one session per minute)
   - Per-IP: Standard IP rate limiting

4. **Audit Logging**: All requests are logged with device ID, IP, and outcome.

5. **No API Key on Device**: The OpenAI API key never leaves the server.

## Testing

```bash
# Check voice status
curl -X GET "https://sndctl.app/api/voice/status?deviceId=f16f67617363" \
  -H "X-Device-Secret: your-64-char-device-secret"

# Create voice session
curl -X POST https://sndctl.app/api/voice/session \
  -H "Content-Type: application/json" \
  -H "X-Device-Secret: your-64-char-device-secret" \
  -d '{
    "deviceId": "f16f67617363",
    "voice": "verse"
  }'
```

## Deployment Checklist

- [ ] Add `OPENAI_API_KEY` to Azure Static Web App environment variables
- [ ] Add subscription fields to `DeviceEntity.cs`
- [ ] Add `SubscriptionStatus` constants
- [ ] Add `VoiceStatusFunction.cs` to `api/Functions/`
- [ ] Add `VoiceSessionFunction.cs` to `api/Functions/`
- [ ] Add `VoiceStatusResponse.cs` to `api/Models/Responses/`
- [ ] Add `VoiceSessionRequest.cs` to `api/Models/Requests/`
- [ ] Add `VoiceSessionResponse.cs` to `api/Models/Responses/`
- [ ] Update `AppSettings.cs` with `OpenAiApiKey` property
- [ ] Update `Program.cs` to load the env var and register `IHttpClientFactory`
- [ ] Deploy and test with a provisioned device
- [ ] Create subscription management UI at `/app/subscribe`
