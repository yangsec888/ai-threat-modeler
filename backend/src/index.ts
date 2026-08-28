/**
 * Main Express Server Entry Point for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import morgan from 'morgan';
import * as fs from 'fs';
import * as path from 'path';
import swaggerUi from 'swagger-ui-express';
import * as yaml from 'js-yaml';
import { threatModelingRoutes } from './routes/threatModeling';
import { chatRoutes } from './routes/chat';
import { authRoutes } from './routes/auth';
import { enforceSameOrigin } from './middleware/csrf';
import { allowedOrigins } from './config/allowedOrigins';
import { userRoutes } from './routes/users';
import { settingsRoutes } from './routes/settings';
import { githubRoutes } from './routes/github';
import { initializeDefaultAdmin } from './init/defaultUser';
import { runEncryptionKdfMigration } from './init/encryptionKdfMigration';
import { startStuckJobWatchdog } from './init/stuckJobWatchdog';
import { cleanupOrphanedUploads } from './utils/cleanupOrphanedUploads';
import logger, { morganStream } from './utils/logger';
import './db/database'; // Initialize database

// Load environment variables
dotenv.config();

// Re-encrypt any legacy 100k-iteration ciphertext with the new 310k KDF.
// Idempotent: runs once per install and short-circuits on subsequent boots.
runEncryptionKdfMigration();

// Initialize default admin user
initializeDefaultAdmin();

// Clean up orphaned uploaded files from previous server runs
logger.info('🧹 Checking for orphaned uploaded files...');
try {
  cleanupOrphanedUploads();
} catch (error) {
  logger.error('Failed to cleanup orphaned uploads', { error });
  logger.warn('Continuing with server startup...');
}

const app = express();
const PORT = Number(process.env.PORT) || 3001;
// SEC: default to listening only on loopback so the API is not exposed on the
// LAN. Override deliberately (e.g. `HOST=0.0.0.0` behind a reverse proxy or
// the docker-compose mapping) when remote access is required.
const HOST = process.env.HOST || '127.0.0.1';

// Middleware
// Restrict cross-origin access to the configured allowlist (SEC: CWE-346).
app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser requests (no Origin header) are allowed through.
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: false,
  }),
);

// Security headers (SEC: CWE-693). helmet defaults give us X-Content-Type-Options,
// X-Frame-Options, Strict-Transport-Security, Referrer-Policy, etc.
//
// CSP is kept strict for the API itself (no 'unsafe-inline'/'unsafe-eval') so
// any content that ever gets rendered/reflected faces an actual script barrier.
// Swagger UI needs a more permissive policy, so /api-docs is excluded here and
// gets its own relaxed CSP on the dedicated router below.
const strictHelmet = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});
app.use((req, res, next) => {
  if (req.path.startsWith('/api-docs')) {
    return next();
  }
  return strictHelmet(req, res, next);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Reject cross-origin state-changing requests (CSRF defense-in-depth).
app.use(enforceSameOrigin);

// HTTP request logging
app.use(morgan('combined', { stream: morganStream }));

// Load OpenAPI specification
let swaggerDocument: Record<string, unknown>;
try {
  const openapiPath = path.join(__dirname, '..', 'openapi.yaml');
  const openapiContent = fs.readFileSync(openapiPath, 'utf8');
  swaggerDocument = yaml.load(openapiContent) as Record<string, unknown>;
  logger.info('📄 Loaded OpenAPI specification from openapi.yaml');
} catch (error) {
  logger.warn('Could not load OpenAPI specification', { error });
  swaggerDocument = {
    openapi: '3.0.3',
    info: {
      title: 'AI Threat Modeler API',
      version: '0.6.0',
      description: 'API documentation not available'
    },
    paths: {}
  };
}

// Swagger UI setup. Only this path gets the relaxed CSP (Swagger UI requires
// inline scripts/styles and eval-based rendering); every other route retains the
// strict policy applied by `strictHelmet` earlier, so the XSS barrier stays up
// outside of /api-docs.
const relaxedHelmet = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

app.use('/api-docs', relaxedHelmet, swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'AI Threat Modeler API Documentation',
  swaggerOptions: {
    persistAuthorization: true
  }
}));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'AI Threat Modeler API is running' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/threat-modeling', threatModelingRoutes);
app.use('/api/chat', chatRoutes);

// Error handling middleware (SEC: CWE-209). Log the full detail server-side
// but never echo internal error messages or stack traces back to the client.
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.path, method: req.method });
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, HOST, () => {
  logger.info(`🚀 Backend server running on http://${HOST}:${PORT}`);
  logger.info(`📡 API endpoints available at http://${HOST}:${PORT}/api`);
  logger.info(`📚 API documentation available at http://localhost:${PORT}/api-docs`);
  logger.info(`📁 Logs are being written to backend/logs/`);
  
  // Set up periodic cleanup of orphaned uploads (every hour)
  setInterval(() => {
    logger.info('🧹 Running periodic cleanup of orphaned uploads...');
    try {
      cleanupOrphanedUploads();
    } catch (error) {
      logger.error('Periodic cleanup failed', { error });
    }
  }, 60 * 60 * 1000); // Run every hour

  // Stuck-job watchdog: sweeps jobs that have been in 'processing' past the
  // threshold (default 60m). Recovers from disk if a valid report exists,
  // otherwise auto-fails the row. Last-line-of-defense for spawn/handoff
  // bugs that tests can't enumerate (see CHANGELOG v1.6.5).
  startStuckJobWatchdog();
});

