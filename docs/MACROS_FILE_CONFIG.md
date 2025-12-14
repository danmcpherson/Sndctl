# Macros File Configuration

## Problem
The application uses a `macros.txt` file that could be accessed from different locations, causing inconsistency:
- Source: `/api/data/macros.txt`
- Build output: `/api/bin/Debug/net8.0/data/macros.txt`

## Solution
The following changes ensure both the MacroService and SocoCliService always use the same `macros.txt` file:

### 1. Build Configuration (`api.csproj`)
The data directory is now automatically copied to the build output:

```xml
<ItemGroup>
  <Content Include="data\**\*">
    <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
    <CopyToPublishDirectory>PreserveNewest</CopyToPublishDirectory>
  </Content>
</ItemGroup>
```

### 2. Absolute Path Resolution
Both services use the same approach to resolve the macros file path:
- **MacroService**: Uses `Path.GetFullPath(Path.Combine(dataDir, "macros.txt"))`
- **SocoCliService**: Uses `Path.GetFullPath(Path.Combine(dataDir, "macros.txt"))`

This ensures both services always reference the same file, regardless of the current working directory.

### 3. Configuration (`appsettings.json`)
Only the DataDirectory needs to be configured:
```json
{
  "DataDirectory": "data",
  "SocoCli": {
    "Port": 8000
  }
}
```

Both services derive `macros.txt` from the DataDirectory automatically.

### 4. Git Configuration
The `data/` directory is excluded from git (except `.gitkeep`), and files are created automatically at runtime.

## Verification
To verify both services use the same file, check the logs at startup:
- MacroService logs: `"Created default macros file at {Path}"`
- SocoCliService logs: `"Using macros file: {MacrosPath}"`

Both should show the same absolute path.

## Best Practices
1. Configure only the `DataDirectory` setting - both services will derive the macros file path from it
2. The application will create the file automatically if it doesn't exist
3. When deployed, the data directory will be at the same relative location
4. On Raspberry Pi, consider symlinking to a persistent location if needed

## Production Configuration
When deploying to `/opt/sonos-sound-hub`, set the DataDirectory to an absolute path for clarity:
```json
{
  "DataDirectory": "/opt/sonos-sound-hub/data"
}
```

Or use a relative path (e.g., `"data"`) and ensure the application's working directory is correct.
