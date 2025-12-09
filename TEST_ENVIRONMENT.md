# Sonos Sound Hub - Test Environment

## Overview

This is a simple test environment for the Sonos Sound Hub, configured to run on a Raspberry Pi using:
- **Backend**: ASP.NET Core Web API (.NET 8)
- **Database**: SQLite (file-based)
- **Frontend**: Vanilla JavaScript, HTML, CSS
- **Caching**: In-memory caching

## Quick Start

### Running Locally

1. **Build the project:**
   ```bash
   cd api
   dotnet build
   ```

2. **Run the application:**
   ```bash
   dotnet run
   ```

3. **Open in browser:**
   - Navigate to `http://localhost:5000` (or the port shown in terminal)
   - You should see the test environment with sample data

### Using VS Code Tasks

- Press `Ctrl+Shift+B` to build
- Press `F5` to run with debugging
- Use the "run" task to start the application

## Project Structure

```
api/
├── Controllers/
│   └── SampleController.cs    # Sample REST API controller
├── wwwroot/
│   ├── index.html              # Frontend UI
│   └── app.js                  # Frontend JavaScript
├── AppDbContext.cs             # Entity Framework DbContext
├── Program.cs                  # Application entry point
├── appsettings.json            # Configuration
└── api.csproj                  # Project file
```

## Features

### API Endpoints

- `GET /api/sample` - Get all sample items
- `GET /api/sample/{id}` - Get a specific item
- `POST /api/sample` - Create a new item
- `PUT /api/sample/{id}` - Update an item
- `DELETE /api/sample/{id}` - Delete an item

### Frontend

- View all items from the database
- Add new items via a form
- Responsive design
- Connection status indicator

## Configuration

Configuration is stored in `appsettings.json`:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Data Source=data/app.db"
  },
  "DataDirectory": "data"
}
```

## Database

The SQLite database is automatically created on first run in the `data/` directory. Sample data is seeded automatically.

## Next Steps

You can now start building your Sonos Sound Hub features:

1. Add new controllers for your API endpoints
2. Create database models and add them to `AppDbContext`
3. Extend the frontend with new pages and features
4. Configure for Raspberry Pi deployment

## Raspberry Pi Deployment

To deploy to a Raspberry Pi:

1. Publish the application:
   ```bash
   dotnet publish -c Release -o ./publish
   ```

2. Copy the `publish` folder to your Raspberry Pi

3. Run on Raspberry Pi:
   ```bash
   cd publish
   dotnet api.dll
   ```

4. (Optional) Set up as a systemd service for auto-start

## Development Notes

- SQLite database file: `data/app.db`
- Static files served from: `wwwroot/`
- All API responses use camelCase for JavaScript compatibility
- The application is ARM-compatible and ready for Raspberry Pi
