# AI Threat Modeler - Setup Guide

This guide covers detailed setup instructions for running AI Threat Modeler in development and production environments.

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | >= 18.0.0 | Runtime environment |
| npm | >= 9.0.0 | Package manager |
| Git | Any recent | Version control |

### Optional Software

| Software | Version | Purpose |
|----------|---------|---------|
| Docker | >= 20.0 | Containerized deployment |
| Docker Compose | >= 2.0 | Multi-container orchestration |

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd ai-threat-modeler
```

### 2. Install Dependencies

Install dependencies for all packages:

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..
```

Or use the convenience script:

```bash
npm run install:all
```

### 3. Build the Application

```bash
# Build backend
cd backend && npm run build && cd ..

# Build frontend
cd frontend && npm run build && cd ..
```

## Environment Configuration

### Backend Environment

Create `backend/.env` file (optional - most settings are configured via the web UI):

```bash
# Server Configuration
PORT=3001
NODE_ENV=development

# JWT Secret (generate a secure random string for production)
JWT_SECRET=your-secure-jwt-secret-change-in-production

# Log Level (debug, info, warn, error)
LOG_LEVEL=info
```

> **Note**: Anthropic API credentials are configured through the Settings page in the web UI, not environment variables. This provides encrypted storage in the database.

### Frontend Environment

Create `frontend/.env.local` file:

```bash
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

For production, update this to your backend server URL:

```bash
NEXT_PUBLIC_API_URL=https://your-backend-domain.com/api
```

## Database Setup

### SQLite Database

The application uses SQLite for data storage. The database is automatically created on first run.

**Database location**: `backend/data/users.db`

### Automatic Migrations

Database schema migrations run automatically when the backend starts. This includes:
- User table creation
- Threat modeling jobs table
- Settings table with encryption key
- Role-based access control columns

### Default Admin User

On first startup, a default admin user is created:

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin` |
| Role | `Admin` |

⚠️ **Security Warning**: Change the default admin password immediately after first login!

### Database Backup

Backup your database regularly:

```bash
cd backend
npm run backup:db
```

Backups are stored in `backend/data/backups/` with timestamps.

## Running the Application

### Development Mode

**Start both services:**

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

**Access points:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- API Documentation: http://localhost:3001/api-docs

### Production Mode

**Build and start:**

```bash
# Build both
cd backend && npm run build && cd ..
cd frontend && npm run build && cd ..

# Start backend
cd backend && npm start

# Start frontend (in another terminal)
cd frontend && npm start
```

### Docker Deployment

See [Docker Compose section in README.md](./README.md#-docker-compose) for containerized deployment.

```bash
docker-compose up -d --build
```

## Initial Configuration

### Step 1: Login

1. Open http://localhost:3000
2. Login with default credentials: `admin` / `admin`

### Step 2: Configure API Settings

1. Navigate to **Settings** (gear icon in sidebar)
2. Configure the following:

| Setting | Description | Example |
|---------|-------------|---------|
| Anthropic API Key | Your Claude API key | `sk-ant-api...` |
| Anthropic Base URL | API endpoint (default works for most users) | `https://api.anthropic.com` |
| Claude Code Max Output Tokens | Max response size (increase if you get truncation errors) | `32000` |

3. Click **Save Settings**

### Step 3: Change Admin Password

1. Click on your username in the sidebar
2. Select **Change Password**
3. Enter a strong, unique password

### Step 4: Create Additional Users (Optional)

Admins can create users with different roles:

| Role | Permissions |
|------|-------------|
| Admin | Full access - settings, user management, all features |
| Operator | Can run threat modeling jobs and use chat |
| Auditor | Read-only access to view reports |

## Logging

### Backend Logs

Logs are written to `backend/logs/`:

| File | Content |
|------|---------|
| `app-YYYY-MM-DD.log` | All application logs (JSON format) |
| `error-YYYY-MM-DD.log` | Error-only logs |

**Log rotation:**
- Daily rotation
- 14-day retention for app logs
- 30-day retention for error logs

**View logs:**

```bash
# Tail live logs
tail -f backend/logs/app-$(date +%Y-%m-%d).log

# Parse JSON logs
cat backend/logs/app-$(date +%Y-%m-%d).log | jq .
```

### Frontend Logs

Frontend runs in the browser - logs appear in browser DevTools console (F12 → Console tab).

## Testing

### Run All Tests

```bash
npm test
```

### Backend Tests

```bash
cd backend
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

**Test database**: Tests use a separate database (`backend/data/users.test.db`) to avoid affecting production data.

### Frontend Tests

```bash
cd frontend
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

### Test Coverage

View coverage reports:
- Backend: `backend/coverage/lcov-report/index.html`
- Frontend: `frontend/coverage/lcov-report/index.html`

## Troubleshooting

### Common Issues

#### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::3001
```

**Solution**: Kill the process using the port:

```bash
lsof -ti:3001 | xargs kill -9
```

#### Database Locked

```
Error: SQLITE_BUSY: database is locked
```

**Solution**: Ensure only one instance of the backend is running. Stop any duplicate processes.

#### TypeScript Compilation Errors

```
Cannot find module '../lib/tsc.js'
```

**Solution**: Reinstall dependencies:

```bash
rm -rf node_modules && npm install
```

#### Next.js Cache Corruption

```
TypeError: Cannot read properties of undefined (reading 'call')
```

**Solution**: Clear the Next.js cache:

```bash
cd frontend && rm -rf .next && npm run dev
```

#### API Key Not Working

**Symptoms**: "Anthropic API key not configured" errors

**Solution**:
1. Go to Settings in the web UI
2. Re-enter your API key
3. Click Save
4. Verify the key is valid at https://console.anthropic.com

#### Chat Session Issues

**Symptoms**: Chat not responding or session lost

**Solutions**:
1. Type `/end` to reset the session
2. Click "End Session" button
3. Refresh the page
4. Check backend logs for errors

### Getting Help

1. Check the logs in `backend/logs/`
2. Review the [API Documentation](./backend/API_DOCUMENTATION.md)
3. Open an issue on the repository

## Security Recommendations

### Production Checklist

- [ ] Change default admin password
- [ ] Generate a strong JWT_SECRET (at least 32 characters)
- [ ] Use HTTPS in production
- [ ] Configure proper CORS origins
- [ ] Set up regular database backups
- [ ] Review and rotate encryption keys periodically
- [ ] Enable rate limiting for API endpoints
- [ ] Monitor logs for suspicious activity

### Generating Secure Secrets

```bash
# Generate a secure JWT secret
openssl rand -hex 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

