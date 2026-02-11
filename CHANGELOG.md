# Changelog

All notable changes to AI Threat Modeler will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-12-14

### Added
- **File-based logging**: Backend now writes structured JSON logs to `backend/logs/` using Winston
  - Daily log rotation with 14-day retention for app logs, 30-day for error logs
  - Separate error log files (`error-YYYY-MM-DD.log`)
  - HTTP request logging via Morgan middleware
- **Chat persistence**: Chat conversations now persist in localStorage
  - Messages restored when navigating back to chat
  - Responses saved immediately (survives page navigation during API calls)
- **SETUP.md**: Comprehensive setup guide with installation, configuration, and troubleshooting
- **CHANGELOG.md**: This file to track project changes

### Changed
- **Renamed project**: "Threat Model AI" → "AI Threat Modeler" globally across all files
- **Report path resolver**: Reports now work in both dev and Docker environments
  - Resolves absolute Docker paths (`/app/...`) to local paths in dev mode
  - Handles relative and absolute paths seamlessly

### Fixed
- **Docker volume permissions**: Fixed EACCES errors for logs, data, uploads directories
- **Chat session loss**: Fixed issue where navigating away lost the last API response
- **Dockerfile**: Added `logs` directory creation for containerized deployments

### Removed
- **Unused frontend/logs directory**: Removed as frontend runs in browser (no file logging)

## [1.0.0] - 2025-12-13

### Added
- Initial release of AI Threat Modeler
- **Threat Modeling**: Upload ZIP files or provide Git URLs for AI-powered security analysis
- **Chat Interface**: Interactive chat with Claude for security questions
- **User Management**: Role-based access control (Admin, Operator, Auditor)
- **Report Generation**: Data flow diagrams, threat models, and risk registries
- **Settings Panel**: Configure Anthropic API credentials with encrypted storage
- **Docker Support**: Production-ready Docker Compose deployment
- **API Documentation**: OpenAPI/Swagger documentation at `/api-docs`
