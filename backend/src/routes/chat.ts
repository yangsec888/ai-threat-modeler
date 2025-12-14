/**
 * Chat Interface Routes for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { SettingsModel } from '../models/settings';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { Readable, Writable } from 'stream';
import logger from '../utils/logger';

const router = Router();

// Store active chat sessions per user (userId -> session info)
interface ChatSession {
  process: ChildProcess;
  stdin: Writable;
  lastActivity: Date;
  buffer: string;
  responseResolvers: Array<{
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    startMarker: string;
  }>;
}

const chatSessions = new Map<number, ChatSession>();

// Cleanup inactive sessions after 60 minutes
const SESSION_TIMEOUT_MS = 60 * 60 * 1000;
setInterval(() => {
  const now = new Date();
  for (const [userId, session] of chatSessions.entries()) {
    if (now.getTime() - session.lastActivity.getTime() > SESSION_TIMEOUT_MS) {
      logger.info(`🧹 Cleaning up inactive session for user ${userId}`);
      session.process.kill('SIGTERM');
      chatSessions.delete(userId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Find agent-run CLI script path
function findAgentRunPath(): string {
  // Try multiple possible paths for agent-run
  const possiblePaths = [
    path.join(__dirname, '..', '..', '..', 'appsec-agent', 'bin', 'agent-run.js'),
    path.join(__dirname, '..', '..', '..', '..', 'appsec-agent', 'bin', 'agent-run.js'),
    path.join(process.cwd(), '..', 'appsec-agent', 'bin', 'agent-run.js'),
    path.join(process.cwd(), 'node_modules', 'appsec-agent', 'bin', 'agent-run.js'),
  ];

  for (const agentRunPath of possiblePaths) {
    if (fs.existsSync(agentRunPath)) {
      return agentRunPath;
    }
  }

  throw new Error(`agent-run script not found. Tried paths: ${possiblePaths.join(', ')}`);
}

// Create a new interactive chat session for a user
async function createChatSession(userId: number, role: string): Promise<ChatSession> {
  // Get Anthropic API configuration from database
  const anthropicConfig = SettingsModel.getAnthropicConfig();
  const settings = SettingsModel.get(false);
  const claudeCodeMaxOutputTokens = settings.claude_code_max_output_tokens;

  // Find agent-run CLI
  const agentRunPath = findAgentRunPath();
  logger.info(`🚀 Starting interactive session for user ${userId} with role: ${role}`);
  logger.info(`   Agent path: ${agentRunPath}`);

  // Construct agent-run CLI command for interactive mode
  // Format: node bin/agent-run -r simple_query_agent -k API_KEY -u API_URI
  // Interactive mode is the default when -q (query) flag is NOT provided
  const agentRunCommand = [
    agentRunPath,
    '-r', role,
    '-k', anthropicConfig.apiKey,
    '-u', anthropicConfig.baseUrl
  ];

  // Set up environment variables
  const env = { ...process.env };
  if (claudeCodeMaxOutputTokens) {
    env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = claudeCodeMaxOutputTokens.toString();
  }

  // Spawn the process in interactive mode
  const childProcess = spawn('node', agentRunCommand, {
    env: env,
    stdio: ['pipe', 'pipe', 'pipe'] // stdin: pipe, stdout: pipe, stderr: pipe
  });

  if (!childProcess.stdin || !childProcess.stdout || !childProcess.stderr) {
    throw new Error('Failed to create stdin/stdout/stderr pipes for chat session');
  }

  const session: ChatSession = {
    process: childProcess,
    stdin: childProcess.stdin,
    lastActivity: new Date(),
    buffer: '',
    responseResolvers: []
  };

  // Set up output handling
  childProcess.stdout.setEncoding('utf-8');
  childProcess.stdout.on('data', (data: string) => {
    session.buffer += data;
    logger.info(`[User ${userId}] ${data}`);
    
    // Try to extract and resolve pending responses
    processPendingResponses(session);
  });

  childProcess.stderr.setEncoding('utf-8');
  childProcess.stderr.on('data', (data: string) => {
    session.buffer += data;
    logger.error(`[User ${userId}] ${data}`);
  });

  childProcess.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
    logger.info(`🛑 Chat session closed for user ${userId} (code: ${code}, signal: ${signal})`);
    chatSessions.delete(userId);
    
    // Reject all pending resolvers
    for (const resolver of session.responseResolvers) {
      resolver.reject(new Error('Chat session closed unexpectedly'));
    }
    session.responseResolvers = [];
  });

  childProcess.on('error', (error: Error) => {
    logger.error(`❌ Chat session error for user ${userId}:`, error);
    chatSessions.delete(userId);
    
    // Reject all pending resolvers
    for (const resolver of session.responseResolvers) {
      resolver.reject(error);
    }
    session.responseResolvers = [];
  });

  return session;
}

// Process pending response resolvers when new data arrives
function processPendingResponses(session: ChatSession): void {
  if (session.responseResolvers.length === 0) return;

  const resolver = session.responseResolvers[0];
  const claudeIndex = session.buffer.indexOf(resolver.startMarker);
  
  if (claudeIndex !== -1) {
    // Extract response after "Claude:" marker
    let extractedResponse = session.buffer.substring(claudeIndex + resolver.startMarker.length);
    
    // Check if we have the end markers
    // Look for multiple possible end markers and use the earliest one
    const markers = [
      { name: '[DEBUG] Result:', index: extractedResponse.indexOf('[DEBUG] Result:') },
      { name: 'Cost:', index: extractedResponse.indexOf('\nCost:') },
      { name: 'Your turn', index: extractedResponse.indexOf('\nYour turn') },
      { name: 'User:', index: extractedResponse.indexOf('\nUser:') }
    ];
    
    // Filter out markers that weren't found (-1) and get the earliest one
    const validMarkers = markers.filter(m => m.index !== -1);
    const endMarker = validMarkers.length > 0 
      ? Math.min(...validMarkers.map(m => m.index))
      : -1;
    
    if (endMarker !== -1) {
      // We have a complete response
      extractedResponse = extractedResponse.substring(0, endMarker);
      extractedResponse = extractedResponse
        .replace(/\[DEBUG\].*$/gm, '')
        .replace(/<environment>[\s\S]*?<\/environment>/g, '') // Remove environment tags
        .replace(/<latest_message>[\s\S]*?<\/latest_message>/g, '') // Remove latest_message tags
        .trim();
      
      // Clear the buffer up to the end of this response
      session.buffer = session.buffer.substring(claudeIndex + resolver.startMarker.length + endMarker);
      
      // Resolve and remove this resolver
      session.responseResolvers.shift();
      resolver.resolve(extractedResponse);
    }
  }
}

// Send a message to an existing chat session and wait for response
async function sendMessageToSession(session: ChatSession, message: string, timeoutMs: number = 120000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // Add resolver to queue
    session.responseResolvers.push({
      resolve,
      reject,
      startMarker: '\nClaude:\n'
    });

    // Set timeout
    const timeout = setTimeout(() => {
      // Remove this resolver from queue
      const index = session.responseResolvers.findIndex(r => r.resolve === resolve);
      if (index !== -1) {
        session.responseResolvers.splice(index, 1);
      }
      reject(new Error('Timeout waiting for response from chat session'));
    }, timeoutMs);

    // Clear timeout when resolved/rejected
    const originalResolve = resolve;
    const originalReject = reject;
    
    const wrappedResolve = (value: string) => {
      clearTimeout(timeout);
      originalResolve(value);
    };
    
    const wrappedReject = (error: Error) => {
      clearTimeout(timeout);
      originalReject(error);
    };

    // Update the resolver with wrapped versions
    const resolver = session.responseResolvers[session.responseResolvers.length - 1];
    resolver.resolve = wrappedResolve;
    resolver.reject = wrappedReject;

    // Send message to stdin
    try {
      session.stdin.write(message + '\n');
      session.lastActivity = new Date();
    } catch (error) {
      clearTimeout(timeout);
      reject(new Error(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  });
}

// POST /api/chat
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { message, role = 'simple_query_agent' } = req.body;
    const userId = req.userId!;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    logger.info(`💬 Chat request from user ${userId} with role: ${role}, message: "${message.substring(0, 100)}..."`);

    // Check for /end command to terminate session
    if (message.trim().toLowerCase() === '/end') {
      const session = chatSessions.get(userId);
      if (session) {
        logger.info(`🛑 Ending chat session for user ${userId}`);
        session.stdin.write('/end\n');
        session.process.kill('SIGTERM');
        chatSessions.delete(userId);
        return res.json({
          status: 'success',
          response: 'Chat session ended. Your next message will start a new conversation.',
          sessionEnded: true
        });
      } else {
        return res.json({
          status: 'success',
          response: 'No active session to end.',
          sessionEnded: false
        });
      }
    }

    // Check if API configuration is available
    try {
      SettingsModel.getAnthropicConfig();
    } catch (error) {
      logger.error('Failed to get Anthropic configuration from database:', error);
      return res.status(500).json({ 
        error: 'Configuration error', 
        message: 'Anthropic API configuration not found. Please configure settings in the admin panel.' 
      });
    }

    // Get or create chat session for this user
    let session = chatSessions.get(userId);
    if (!session) {
      try {
        logger.info(`🆕 Creating new chat session for user ${userId}`);
        session = await createChatSession(userId, role);
        chatSessions.set(userId, session);
        logger.info(`✅ Chat session created for user ${userId}`);
      } catch (error) {
        logger.error(`Failed to create chat session for user ${userId}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return res.status(500).json({ 
          error: 'Failed to create chat session', 
          message: errorMessage 
        });
      }
    } else {
      logger.info(`♻️  Using existing chat session for user ${userId}`);
    }

    // Send message to session and wait for response
    try {
      const response = await sendMessageToSession(session, message);
      
      if (!response || response.trim().length === 0) {
        return res.status(500).json({ 
          error: 'Empty response', 
          message: 'Agent returned an empty response. Please try again or start a new session with /end.' 
        });
      }

      logger.info(`✅ Response received (length: ${response.length})`);

      res.json({
        status: 'success',
        response,
        role,
        sessionActive: true
      });
    } catch (error) {
      logger.error(`Failed to get response from chat session for user ${userId}:`, error);
      
      // Clean up failed session
      const failedSession = chatSessions.get(userId);
      if (failedSession) {
        failedSession.process.kill('SIGTERM');
        chatSessions.delete(userId);
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return res.status(500).json({ 
        error: 'Chat session failed', 
        message: `${errorMessage}. Your session has been terminated. Please try again.` 
      });
    }
  } catch (error: unknown) {
    logger.error('Chat error:', error);
    if (error instanceof Error) {
      logger.error('Error stack:', error.stack);
      res.status(500).json({ error: 'Failed to process chat message', message: error.message });
    } else {
      res.status(500).json({ error: 'Failed to process chat message', message: 'Unknown error occurred' });
    }
  }
});

// POST /api/chat/end - Explicitly end chat session
router.post('/end', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const session = chatSessions.get(userId);
    
    if (session) {
      logger.info(`🛑 Explicitly ending chat session for user ${userId}`);
      session.stdin.write('/end\n');
      session.process.kill('SIGTERM');
      chatSessions.delete(userId);
      
      res.json({
        status: 'success',
        message: 'Chat session ended successfully',
        sessionEnded: true
      });
    } else {
      res.json({
        status: 'success',
        message: 'No active session to end',
        sessionEnded: false
      });
    }
  } catch (error: unknown) {
    logger.error('End chat session error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Failed to end chat session', message });
  }
});

// GET /api/chat/session - Get current session status
router.get('/session', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const hasSession = chatSessions.has(userId);
    const session = chatSessions.get(userId);
    
    res.json({
      hasSession,
      sessionActive: hasSession && session?.process.pid !== undefined,
      lastActivity: session?.lastActivity,
      message: hasSession ? 'Active chat session exists' : 'No active chat session'
    });
  } catch (error: unknown) {
    logger.error('Get session status error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Failed to get session status', message });
  }
});

// GET /api/chat/health - Health check endpoint
router.get('/health', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    // Check if agent-run CLI is available
    const agentRunPath = findAgentRunPath();
    
    // Check if API configuration is available
    const anthropicConfig = SettingsModel.getAnthropicConfig();
    
    // Count active sessions
    const activeSessions = chatSessions.size;
    
    res.json({
      status: 'healthy',
      agentRunPath: path.basename(agentRunPath),
      apiConfigured: !!anthropicConfig.apiKey,
      activeSessions
    });
  } catch (error: unknown) {
    logger.error('Health check error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ 
      status: 'unhealthy',
      error: message 
    });
  }
});

export { router as chatRoutes };