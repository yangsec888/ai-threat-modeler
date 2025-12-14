# AI Threat Modeler

AI-powered threat modeling application built for Application Security automation.

## 🚀 Quick Start

```bash
# Build and start all services
docker-compose up -d --build
```

Then:
1. Access the web dashboard at http://localhost:3000
2. Log in with default credentials: `admin` / `admin`
3. Navigate to **Settings** and configure your Anthropic API credentials
4. Change the default admin password

## 🐳 Docker Compose

### Services

| Service  | URL                     | Description           |
|----------|-------------------------|-----------------------|
| Frontend | http://localhost:3000   | Next.js web dashboard |
| Backend  | http://localhost:3001   | Express.js API server |

### Environment Configuration

The docker-compose setup uses default configurations. To customize:

1. **Backend API URL** - Modify the `NEXT_PUBLIC_API_URL` build arg in `docker-compose.yml`:
   ```yaml
   args:
     - NEXT_PUBLIC_API_URL=http://your-backend-url:3001/api
   ```

2. **Port Mapping** - Change the port mappings in `docker-compose.yml`:
   ```yaml
   ports:
     - "8080:3000"  # Frontend on port 8080
     - "8081:3001"  # Backend on port 8081
   ```

### Data Persistence

The following directories are mounted as volumes to persist data:

| Volume Path                           | Description                    |
|---------------------------------------|--------------------------------|
| `./backend/data`                      | SQLite database                |
| `./backend/uploads`                   | Uploaded files                 |
| `./backend/work_dir`                  | Working directory for analysis |
| `./backend/threat-modeling-reports`   | Generated threat model reports |
| `./backend/logs`                      | Backend application logs       |

### Common Commands

```bash
# Rebuild and restart a specific service
docker-compose up -d --build backend

# View logs for a specific service
docker-compose logs -f backend

# Stop and remove containers, networks
docker-compose down

# Stop and remove containers, networks, and volumes
docker-compose down -v

# Check service health status
docker-compose ps
```

## ✨ Features

### Web Dashboard
- **Threat Modeling** - Perform threat modeling analysis with ZIP file upload support
  - Uses built-in `threat_modeler` role with YAML configuration
  - Upload repository as ZIP file for analysis
  - View comprehensive threat model reports
  - Export Risk Registry to Excel (CSV format)
  - Real-time job status tracking
- **Chat Interface** - Interactive chat with persistent conversation history
  - Uses `appsec-agent` CLI in interactive mode
  - Maintains conversation context across multiple messages
  - Session management with automatic cleanup after 60 minutes
  - Type `/end` to explicitly end conversation and start fresh
  - Supports multiple simultaneous user sessions

### Authentication System
- **User Registration & Login** - Secure user account management
- **JWT Authentication** - Token-based session management
- **Password Security** - Bcrypt password hashing
- **Default Admin User** - Pre-configured admin account (username: `admin`, password: `admin`)
- **Password Change Reminder** - Security reminder for users with default passwords
- **Protected Routes** - All API endpoints require authentication

### Settings Management
- **Database-First Configuration** - All API credentials stored securely in database
  - Configure Anthropic API key and base URL through admin settings panel
  - Encrypted storage with automatic key management
  - No environment variables required for API credentials
- **Claude Output Token Limits** - Configure `CLAUDE_CODE_MAX_OUTPUT_TOKENS` to handle large responses
  - Default: 32,000 tokens
  - Range: 1 to 1,000,000 tokens
  - Prevents "response exceeded token maximum" errors
- **Admin-Only Access** - Settings restricted to users with Admin role

### Database
- **SQLite Database** - Local user storage (no external database required)
- **Automatic Migration** - Database schema updates automatically

### Export & Reporting
- **Excel Export** - Export Risk Registry data to Excel-compatible CSV format
- **Risk Registry Parser** - Intelligent parsing of markdown-formatted risk reports
- **Date Formatting** - Timezone-aware date display throughout the application

## 📁 Project Structure

```
threat-model-ai/
├── backend/              # Express.js API server
│   ├── src/
│   │   ├── db/          # Database setup and models
│   │   ├── models/      # User model
│   │   ├── routes/      # API routes (auth, threat-modeling, etc.)
│   │   ├── middleware/  # Authentication middleware
│   │   └── init/        # Initialization scripts
│   ├── data/            # SQLite database (created automatically)
│   └── package.json
├── frontend/            # Next.js React application
│   ├── app/             # Next.js app directory
│   ├── components/      # React components
│   ├── contexts/        # React contexts (AuthContext)
│   ├── lib/             # API client and utilities
│   ├── utils/           # Utility functions (date, risk parser)
│   └── package.json
├── src/
│   └── index.ts         # Main entry point (example code)
├── dist/                # Compiled JavaScript (after build)
├── package.json         # Root package.json
├── tsconfig.json        # TypeScript configuration
├── README.md            # This file
├── SETUP.md             # Web Dashboard setup guide
└── CHANGELOG.md         # Version history and changes
```

## 💡 Next Steps

1. **Initial Setup** - Follow the setup instructions in [SETUP.md](./SETUP.md) to get started
   - Configure environment variables for backend and frontend
   - Set up the database and default admin user
   - Install and build dependencies

2. **Configure Settings** - Set up your Anthropic API credentials
   - Log in to the web dashboard (default: `admin`/`admin`)
   - Navigate to Settings and configure:
     - Anthropic API Key
     - Anthropic Base URL (if using custom endpoint)
     - Claude Code Max Output Tokens (default: 32,000)

3. **Start Using the Application**
   - **Threat Modeling**: Upload ZIP files of repositories for comprehensive threat analysis
   - **Chat Interface**: Interact with the agent directly through the chat interface

4. **Customize Workflows** (Advanced)
   - Extend the API routes for additional job types
   - Add custom report parsers for specialized output formats

5. **Production Deployment**
   - Change default admin password
   - Configure secure JWT secret
   - Set up proper database backups
   - Configure production environment variables
   - **Docker Deployment**: See [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md) for containerization and AWS deployment guide

## 📖 Documentation

- [SETUP.md](./SETUP.md) - Web Dashboard setup and configuration guide
- [API_DOCUMENTATION.md](./backend/API_DOCUMENTATION.md) - Complete API documentation with OpenAPI/Swagger
- [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk)

### API Documentation

The backend API is fully documented using OpenAPI 3.0 specification:

- **Interactive Documentation**: Visit `http://localhost:3001/api-docs` when the server is running
- **OpenAPI Spec**: Available at `backend/openapi.yaml`
- **Complete Guide**: See [API_DOCUMENTATION.md](./backend/API_DOCUMENTATION.md) for detailed usage instructions

Features:
- Try out API endpoints directly from the browser
- Complete request/response schemas
- Authentication examples with JWT tokens
- Role-based access control documentation
- Generate client SDKs in multiple languages

## 🧪 Testing

The project includes comprehensive test suites for both backend and frontend.

### Running Tests

**Run all tests:**
```bash
npm test
```

**Run backend tests only:**
```bash
cd backend && npm test
```

**Run frontend tests only:**
```bash
cd frontend && npm test
```

### Test Coverage

- **Backend**: Comprehensive test coverage for authentication, models, routes, and middleware
- **Frontend**: Tests for API client, contexts, utilities, and components
- **CLI Integration**: Tests for `agent-run` CLI execution and error handling
- **Total**: All tests passing ✅

See [SETUP.md](./SETUP.md) for more details on testing.

