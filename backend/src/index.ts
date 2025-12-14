/**
 * Main Express Server Entry Point for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import * as fs from 'fs';
import * as path from 'path';
import swaggerUi from 'swagger-ui-express';
import * as yaml from 'js-yaml';
import { threatModelingRoutes } from './routes/threatModeling';
import { chatRoutes } from './routes/chat';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { settingsRoutes } from './routes/settings';
import { initializeDefaultAdmin } from './init/defaultUser';
import { cleanupOrphanedUploads } from './utils/cleanupOrphanedUploads';
import logger, { morganStream } from './utils/logger';
import './db/database'; // Initialize database

// Load environment variables
dotenv.config();

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
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Swagger UI setup
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
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
app.use('/api/threat-modeling', threatModelingRoutes);
app.use('/api/chat', chatRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.path, method: req.method });
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  logger.info(`🚀 Backend server running on http://localhost:${PORT}`);
  logger.info(`📡 API endpoints available at http://localhost:${PORT}/api`);
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
});

