# Copilot Instructions

## Project Overview
- **Platform**: Raspberry Pi (ARM-compatible, including Pi Zero W)
- **Frontend**: Vanilla JavaScript, HTML, CSS
- **Backend**: Python/FastAPI
- **HTTP Server**: Uvicorn
- **Database**: SQLite (via stdlib `sqlite3`)
- **Caching**: `cachetools` / `functools.lru_cache`
- **Hosting**: Self-hosted on Raspberry Pi using Uvicorn + Caddy reverse proxy
- **Architecture**: No view framework (React, Vue, etc.), all runs locally

## Sonos Control Source
- **Hybrid Approach**: Use direct SoCo library for basic operations (discovery, playback, volume, grouping) and soco-cli HTTP API for macros and complex commands
- **SoCo Library**: Primary control for speaker discovery, playback controls, volume, track info, favorites, and queue
- **SoCo CLI**: Used for macro execution (leverages existing parser, parameter substitution, chained commands)

## Testing
- **Chrome DevTools MCP**: Available for browser-based testing and debugging
- Use the browser tools for inspecting frontend behavior, network requests, and console output

## Code Style Preferences

### General Philosophy
- **Fail fast**: Prefer things to fail when they don't work as intended
- **Simple fallbacks only**: Avoid long chains of fallbacks
- **Modern JavaScript**: Use modern ES6+ features (const/let, arrow functions, async/await)
- **Minimal comments**: Only comment complex logic

### Frontend (JavaScript)
- Use vanilla JavaScript only - no frameworks
- Fetch API for HTTP requests
- Use relative URLs for API calls when served by same host, or localhost URLs for development
- Implement both client-side and server-side validation
- Keep frontend lightweight for optimal performance on Raspberry Pi

### Backend (Python)
- Use async/await patterns with `asyncio`
- Use Pydantic models for request/response validation
- Use type hints throughout (Python 3.9+ style)
- Follow PEP 8 style guidelines
- Use `sqlite3` stdlib for database access
- Use `cachetools` or `functools.lru_cache` for caching
- Store files in local filesystem (configured data directory)
- **IMPORTANT**: Configuration via environment variables or `config.py`
- **IMPORTANT**: All file storage should use relative paths from a configurable base directory
- **IMPORTANT**: Pydantic models automatically use camelCase when configured (JavaScript expects camelCase)
- **IMPORTANT**: Run blocking I/O (like SoCo calls) in thread pool with `asyncio.to_thread()`

### Error Handling
- Follow standard best practices
- Let errors fail fast rather than creating complex fallback chains
- Use FastAPI's HTTPException for API errors
- Simple, straightforward error messages

## Documentation Requirements
- **JSDoc for JavaScript**: Document all functions with JSDoc comments
- **Docstrings for Python**: Use Google-style docstrings for all public functions and classes
- **README files**: Include when needed for complex features or modules

## Raspberry Pi Specifics
- Application runs entirely on the local device
- Frontend served via FastAPI/Starlette static file middleware
- Backend API runs on Uvicorn (port 5000)
- Caddy reverse proxy for HTTPS termination
- Use systemd service for auto-start on boot

## File Organization
- Backend code in `api-python/src/sndctl/`
- Frontend code in `wwwroot/` (served as static files)
- Data files in `data/` directory (configurable)
- Keep structure simple and logical

## Performance Considerations
- Raspberry Pi Zero W has very limited resources (512MB RAM, single core)
- Python is inherently cross-platform (no ARM compatibility issues)
- Target < 100MB RAM usage
- Target < 5 second startup time

## Key Reminders
1. This is vanilla JavaScript - no React, Vue, or other frameworks
2. Everything runs locally on Raspberry Pi - no cloud dependencies
3. Fail fast - don't over-engineer error handling
4. Both frontend and backend validation is required
5. Keep comments minimal (but use proper JSDoc/docstrings)
6. Use SQLite for data storage - it's file-based and perfect for Raspberry Pi
7. Implementing NEW backend API endpoints requires careful consideration - confirm before adding
8. Use relative paths for file storage, configurable via environment or config
9. Never commit secrets, database files, or the `data/` directory to git
10. Use camelCase for JSON properties sent to the frontend (JavaScript convention)
11. Use async/await properly - run blocking SoCo calls in thread pool
12. Optimize for limited resources (CPU, RAM) on Raspberry Pi
13. Chrome DevTools MCP is available for testing frontend functionality
 