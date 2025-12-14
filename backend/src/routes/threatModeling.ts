/**
 * Threat Modeling Routes for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { execSync, spawn } from 'child_process';
import archiver from 'archiver';
import multer from 'multer';
import yauzl from 'yauzl';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { requireJobScheduling } from '../middleware/permissions';
import { ThreatModelingJobModel } from '../models/threatModelingJob';
import { SettingsModel } from '../models/settings';
import db from '../db/database';
import logger from '../utils/logger';

const router = Router();

// Track running jobs and their abort controllers for cancellation
interface RunningJob {
  abortController: AbortController;
  workDir: string;
  uploadedZipPath?: string;
  extractedDir?: string;
}

const runningJobs = new Map<string, RunningJob>();

// Mutex for process.chdir() operations to ensure thread safety
// Only one job can change the working directory at a time
class ChdirMutex {
  private static queue: Array<() => void> = [];
  private static locked = false;

  static async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve(() => {
          this.locked = false;
          if (this.queue.length > 0) {
            const next = this.queue.shift()!;
            next();
          }
        });
      } else {
        this.queue.push(() => {
          this.locked = true;
          resolve(() => {
            this.locked = false;
            if (this.queue.length > 0) {
              const next = this.queue.shift()!;
              next();
            }
          });
        });
      }
    });
  }
}


// Configure multer for ZIP file uploads
const upload = multer({ 
  dest: 'uploads/threat-modeling/',
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB limit for ZIP files (large codebases)
  fileFilter: (req, file, cb) => {
    // Only accept ZIP files
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || 
        file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'));
    }
  }
});

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

// Helper function to extract ZIP file to a directory
function extractZip(zipPath: string, extractTo: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err: Error | null, zipfile: yauzl.ZipFile | undefined) => {
      if (err) {
        return reject(err);
      }

      if (!zipfile) {
        return reject(new Error('Failed to open ZIP file'));
      }

      // Ensure extract directory exists
      if (!fs.existsSync(extractTo)) {
        fs.mkdirSync(extractTo, { recursive: true });
      }

      zipfile.readEntry();
      
      zipfile.on('entry', (entry: yauzl.Entry) => {
        // Skip directories (they will be created when files are extracted)
        if (/\/$/.test(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        // Security: Prevent path traversal attacks
        const fullPath = path.join(extractTo, entry.fileName);
        const normalizedPath = path.normalize(fullPath);
        if (!normalizedPath.startsWith(path.normalize(extractTo))) {
          zipfile.readEntry();
          return;
        }

        // Ensure parent directory exists
        const parentDir = path.dirname(normalizedPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        zipfile.openReadStream(entry, (err: Error | null, readStream: NodeJS.ReadableStream | null) => {
          if (err) {
            return reject(err);
          }

          if (!readStream) {
            zipfile.readEntry();
            return;
          }

          const writeStream = fs.createWriteStream(normalizedPath);
          readStream.pipe(writeStream);
          
          writeStream.on('close', () => {
            zipfile.readEntry();
          });
          
          writeStream.on('error', (err: Error) => {
            reject(err);
          });
        });
      });

      zipfile.on('end', () => {
        logger.info(`✅ Successfully extracted ZIP to: ${extractTo}`);
        resolve();
      });

      zipfile.on('error', (err: Error) => {
        reject(err);
      });
    });
  });
}

// Helper function to detect repository metadata from a directory
function detectRepoMetadata(repoDir: string, zipFileName?: string | null): { repoName: string | null; gitBranch: string | null; gitCommit: string | null } {
  let repoName: string | null = null;
  let gitBranch: string | null = null;
  let gitCommit: string | null = null;

  try {
    // Primary: Use ZIP filename (without .zip extension) as repo name
    if (zipFileName) {
      const zipNameWithoutExt = zipFileName.replace(/\.zip$/i, '');
      repoName = zipNameWithoutExt;
    }

    // Fallback: Try to get name from package.json if it exists and ZIP name wasn't available
    if (!repoName) {
      const packageJsonPath = path.join(repoDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
          if (packageJson.name) {
            repoName = packageJson.name;
          }
        } catch (err) {
          // Ignore errors reading package.json
        }
      }
    }

    // Last resort: Use directory name (but this should rarely be needed)
    if (!repoName) {
      const dirName = path.basename(repoDir);
      repoName = dirName;
    }

    // Check if it's a git repository
    const gitDir = path.join(repoDir, '.git');
    if (fs.existsSync(gitDir)) {
      try {
        // Get current branch
        const branchOutput = execSync('git rev-parse --abbrev-ref HEAD', { 
          cwd: repoDir,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore']
        });
        gitBranch = branchOutput.trim();

        // Get current commit hash (short)
        const commitOutput = execSync('git rev-parse --short HEAD', { 
          cwd: repoDir,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore']
        });
        gitCommit = commitOutput.trim();
      } catch (err) {
        // Git commands failed - not a valid git repo or git not available
        logger.warn(`⚠️  Could not detect git metadata from ${repoDir}:`, err instanceof Error ? err.message : 'Unknown error');
      }
    }
  } catch (err) {
    logger.warn(`⚠️  Error detecting repository metadata:`, err instanceof Error ? err.message : 'Unknown error');
  }

  return { repoName, gitBranch, gitCommit };
}

/**
 * Process threat modeling job asynchronously using appsec-agent CLI
 * 
 * Workflow:
 * 1. Unpack uploaded ZIP to work_dir/jobId/repoName
 * 2. Detect repository metadata from extracted code
 * 3. Call agent-run CLI from work_dir/jobId with -s ./repoName
 * 4. Reports generated in work_dir/jobId (where agent-run is called)
 * 5. Move reports to threat-modeling-reports/{jobId}/
 * 6. Clean up work_dir and uploads
 */
async function processThreatModelingJob(jobId: string, repoPath: string, query: string, uploadedZipPath?: string, extractedDir?: string, zipFileName?: string) {
  // Define directories - use unique subdirectory per job for thread safety
  const workDirBase = path.join(process.cwd(), 'work_dir');
  const workDir = path.join(workDirBase, jobId); // Unique directory per job
  const reportsBaseDir = path.join(process.cwd(), 'threat-modeling-reports');
  const jobReportDir = path.join(reportsBaseDir, jobId);
  
  // Create abort controller for this job
  const abortController = new AbortController();
  runningJobs.set(jobId, {
    abortController,
    workDir,
    uploadedZipPath,
    extractedDir
  });
  
  // Helper to check if job was cancelled
  const checkCancellation = () => {
    if (abortController.signal.aborted) {
      throw new Error('Job was cancelled');
    }
  };
  
  try {
    // Check cancellation at start
    checkCancellation();
    
    // Update job status to processing
    ThreatModelingJobModel.updateStatus(jobId, 'processing');

    // Get Anthropic API configuration from database
    let anthropicApiKey: string;
    let anthropicBaseUrl: string;
    let claudeCodeMaxOutputTokens: number | null = null;
    try {
      const anthropicConfig = SettingsModel.getAnthropicConfig();
      anthropicApiKey = anthropicConfig.apiKey;
      anthropicBaseUrl = anthropicConfig.baseUrl;
      logger.info(`🔑 Using Anthropic API configuration from database (base URL: ${anthropicBaseUrl})`);
      
      // Get Claude Code max output tokens setting
      const settings = SettingsModel.get(false);
      claudeCodeMaxOutputTokens = settings.claude_code_max_output_tokens;
      if (claudeCodeMaxOutputTokens) {
        logger.info(`🔧 Using Claude Code max output tokens: ${claudeCodeMaxOutputTokens}`);
      } else {
        logger.info(`ℹ️  Claude Code max output tokens not set, using default (32000)`);
      }
    } catch (error) {
      logger.error('Failed to get Anthropic configuration from database:', error);
      throw new Error('Anthropic API configuration not found. Please configure settings in the admin panel.');
    }

    // Find agent-run CLI script path
    const agentRunPath = findAgentRunPath();
    logger.info(`✅ Found agent-run CLI at: ${agentRunPath}`);
    
    // Ensure base directories exist
    if (!fs.existsSync(workDirBase)) {
      fs.mkdirSync(workDirBase, { recursive: true });
    }
    if (!fs.existsSync(reportsBaseDir)) {
      fs.mkdirSync(reportsBaseDir, { recursive: true });
    }
    if (!fs.existsSync(jobReportDir)) {
      fs.mkdirSync(jobReportDir, { recursive: true });
    }
    
    logger.info(`📝 Starting threat modeling job ${jobId}`);
    logger.info(`📁 Repository path: ${repoPath}`);
    logger.info(`📂 Work directory (unique per job): ${workDir}`);
    logger.info(`📂 Job report directory: ${jobReportDir}`);
    
    // Step 1: Clean up and create unique work directory for this job
    // This ensures thread safety - each job has its own isolated directory
    if (fs.existsSync(workDir)) {
      try {
        // Remove existing directory if it exists (shouldn't happen, but handle it)
        fs.rmSync(workDir, { recursive: true, force: true });
        logger.info(`🧹 Removed existing work directory for job ${jobId}`);
      } catch (err) {
        logger.warn(`⚠️  Could not remove existing work directory:`, err);
      }
    }
    
    // Create fresh directory for this job
    fs.mkdirSync(workDir, { recursive: true });
    logger.info(`✅ Created unique work directory for job ${jobId}: ${workDir}`);
    
    // Check cancellation before unpacking
    checkCancellation();
    
    // Step 2: Determine repoName early (needed for subdirectory structure)
    // Try to detect from extracted directory or use zipFileName as fallback
    let repoName: string | null = null;
    if (uploadedZipPath && extractedDir) {
      // Try to detect repoName from extracted directory
      const extractedPath = path.resolve(extractedDir);
      if (fs.existsSync(extractedPath)) {
        const extractedContents = fs.readdirSync(extractedPath);
        if (extractedContents.length === 1) {
          const singleItem = path.join(extractedPath, extractedContents[0]);
          const stats = fs.statSync(singleItem);
          if (stats.isDirectory()) {
            repoName = extractedContents[0];
          }
        }
        // If no single root directory, try to detect from package.json or use zipFileName
        if (!repoName) {
          const tempMetadata = detectRepoMetadata(extractedPath, zipFileName);
          repoName = tempMetadata.repoName;
        }
      }
    }
    
    // Fallback to zipFileName (without extension) or default name
    if (!repoName) {
      if (zipFileName) {
        repoName = zipFileName.replace(/\.zip$/i, '');
      } else {
        // Use a default name if we can't determine it
        repoName = 'repo';
      }
    }
    
    // Sanitize repoName for filesystem (remove invalid characters)
    repoName = repoName.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!repoName || repoName.length === 0) {
      repoName = 'repo';
    }
    
    // Create repoName subdirectory under workDir
    const repoDir = path.join(workDir, repoName);
    logger.info(`📁 Repository will be unpacked to: ${repoDir}`);
    
    // Step 3: Unpack uploaded ZIP to work_dir/repoName
    if (uploadedZipPath && extractedDir) {
      logger.info(`📦 Unpacking ZIP from ${extractedDir} to ${repoDir}...`);
      
      // Copy extracted directory contents to work_dir/repoName
      const extractedPath = path.resolve(extractedDir);
      if (!fs.existsSync(extractedPath)) {
        throw new Error(`Extracted directory does not exist: ${extractedPath}`);
    }

      // Check if extracted directory has a single root folder
      const extractedContents = fs.readdirSync(extractedPath);
      let sourcePath = extractedPath;
      
      if (extractedContents.length === 1) {
        const singleItem = path.join(extractedPath, extractedContents[0]);
        const stats = fs.statSync(singleItem);
        if (stats.isDirectory()) {
          logger.info(`📁 ZIP contains single root directory, using: ${singleItem}`);
          sourcePath = singleItem;
        }
      }
      
      // Copy source to work_dir/repoName
      fs.cpSync(sourcePath, repoDir, { recursive: true });
      logger.info(`✅ Unpacked to ${repoDir}`);
      
      // Verify repoDir contains expected files (not backend files)
      const repoDirContents = fs.readdirSync(repoDir);
      const hasBackendFiles = repoDirContents.includes('src') && 
                             repoDirContents.includes('package.json') && 
                             (repoDirContents.includes('threat-modeling-reports') || 
                              repoDirContents.includes('uploads') ||
                              repoDirContents.includes('routes'));
      if (hasBackendFiles) {
        throw new Error('Repository directory contains backend files - validation failed');
      }
      logger.info(`✅ Repository directory validated: ${repoDirContents.length} items`);
    } else {
      // Backward compatibility: copy from repoPath to work_dir/repoName
      logger.info(`📁 Copying repository from ${repoPath} to ${repoDir}...`);
      if (!fs.existsSync(repoPath)) {
        throw new Error(`Repository path does not exist: ${repoPath}`);
      }
      fs.cpSync(repoPath, repoDir, { recursive: true });
      logger.info(`✅ Copied to ${repoDir}`);
    }
    
    // Check cancellation before metadata detection
    checkCancellation();
    
    // Step 3.5: Detect repository metadata from repoDir
    logger.info(`🔍 Detecting repository metadata from ${repoDir}...`);
    const detectedMetadata = detectRepoMetadata(repoDir, zipFileName);
    logger.info(`   Detected metadata:`, detectedMetadata);
    
    // Check cancellation before database update
    checkCancellation();
    
    // Get current job to check for manual overrides
    const currentJob = ThreatModelingJobModel.findById(jobId);
    
    // Use detected metadata, but keep manual overrides if they exist and detection failed
    // Update repoName if detection found a better one
    const finalRepoName = detectedMetadata.repoName || repoName;
    const finalMetadata = {
      repoName: finalRepoName,
      gitBranch: detectedMetadata.gitBranch || currentJob.git_branch || null,
      gitCommit: detectedMetadata.gitCommit || currentJob.git_commit || null
    };
    
    // Update job with final metadata (detected takes priority, manual as fallback)
    if (finalMetadata.repoName || finalMetadata.gitBranch || finalMetadata.gitCommit) {
      ThreatModelingJobModel.updateMetadata(jobId, finalMetadata.repoName, finalMetadata.gitBranch, finalMetadata.gitCommit);
      logger.info(`✅ Updated job ${jobId} with metadata:`, finalMetadata);
    }
    
    // Use repoName for agent-run command (this is the directory name we created)
    // Note: Even if detection found a different name, we use the directory name we created
    const agentRunRepoName = repoName;
    
    // Check cancellation before agent execution
    checkCancellation();
    
    // Step 4: Execute agent-run CLI
    // - Called from workDir (parent directory)
    // - Source code is in workDir/repoName (passed via -s ./repoName)
    // - Reports are generated in workDir (where agent-run is executed)
    // - Query is loaded from built-in YAML config file for threat_modeler role
    logger.info(`📝 Agent CLI configuration:`);
    logger.info(`   role: threat_modeler`);
    logger.info(`   work directory: ${workDir}`);
    logger.info(`   repository directory: ${repoDir}`);
    logger.info(`   repository name: ${agentRunRepoName} (for agent-run -s flag)`);
    logger.info(`   detected repository name: ${finalRepoName} (for metadata)`);
    logger.info(`   query: ${query || 'Perform threat modeling analysis'} (loaded from YAML config)`);
    
    // Track execution start time
    const executionStartTime = Date.now();
    
    // Capture output to extract cost information and for error reporting
    let capturedOutput = '';
    
    // Track process exit code for error handling (check if reports were generated despite errors)
    let processExitCode: number | null = null;
    let processError: Error | null = null;
    
    // Acquire mutex for chdir operation (ensures only one job changes directory at a time)
    const releaseMutex = await ChdirMutex.acquire();
    const originalCwd = process.cwd();
    
    try {
      // Change to workDir for agent execution
      // agent-run will be called from workDir with -s ./repoName
      process.chdir(workDir);
      logger.info(`📂 Changed working directory to ${workDir} (mutex-protected)`);
      
      // Construct agent-run CLI command as array (safer for special characters)
      // Format: node bin/agent-run -r threat_modeler -s ./repoName -k API_KEY -u API_URI
      // Note: Query is loaded from built-in YAML config file, not passed via CLI flag
      // We're in workDir, so use ./repoName as the source directory
      const agentRunCommand = [
        'node',
        agentRunPath,
        '-r', 'threat_modeler',
        '-s', `./${agentRunRepoName}`, // Repository subdirectory relative to workDir
        '-k', anthropicApiKey,
        '-u', anthropicBaseUrl
      ];
      
      logger.info(`🚀 Starting agent-run CLI execution...`);
      logger.info(`   Command: node ${path.basename(agentRunPath)} -r threat_modeler -s ./${agentRunRepoName} -k [REDACTED] -u ${anthropicBaseUrl}`);
      logger.info(`   Note: Query will be loaded from built-in YAML config file for threat_modeler role`);
      
      // Execute the agent-run CLI command using spawn (non-blocking, async)
      // This prevents blocking the Node.js event loop and freezing the frontend
      // Set up environment variables for the child process
      const env = { ...process.env };
      
      // CRITICAL: Set ANTHROPIC_API_KEY in environment for Claude Code SDK
      // The SDK has environment inheritance issues in Docker (GitHub issue #4383)
      // Setting it here ensures it's available when the SDK spawns Claude Code
      env.ANTHROPIC_API_KEY = anthropicApiKey;
      
      if (claudeCodeMaxOutputTokens) {
        env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = claudeCodeMaxOutputTokens.toString();
        logger.info(`🔧 Setting CLAUDE_CODE_MAX_OUTPUT_TOKENS=${claudeCodeMaxOutputTokens} for agent-run`);
      }
      
      await new Promise<void>((resolve, reject) => {
        const childProcess = spawn(agentRunCommand[0], agentRunCommand.slice(1), {
          cwd: workDir,
          env: env, // Pass environment variables including ANTHROPIC_API_KEY and CLAUDE_CODE_MAX_OUTPUT_TOKENS
          stdio: ['ignore', 'pipe', 'pipe'] // stdin: ignore, stdout: pipe, stderr: pipe
        });
        
        // Collect stdout data
        if (childProcess.stdout) {
          childProcess.stdout.setEncoding('utf-8');
          childProcess.stdout.on('data', (data: string) => {
            capturedOutput += data;
            logger.info(data);
          });
        }
        
        // Collect stderr data
        if (childProcess.stderr) {
          childProcess.stderr.setEncoding('utf-8');
          childProcess.stderr.on('data', (data: string) => {
            capturedOutput += data;
            logger.error(data);
          });
        }
        
        // Handle process completion
        childProcess.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
          processExitCode = code;
          // Don't immediately reject on non-zero exit code
          // The process might have generated reports even with warnings/errors
          // We'll check for reports later and handle accordingly
          if (code === null) {
            processError = new Error(`agent-run process terminated by signal: ${signal || 'unknown'}`);
            reject(processError);
          } else if (code !== 0) {
            // Store the exit code but don't reject yet - we'll check for reports first
            logger.warn(`⚠️  agent-run exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`);
            logger.warn(`   This may be a warning (e.g., token limit) but reports might still be generated`);
            // Resolve anyway - we'll check for reports and handle the error later
            resolve();
          } else {
            resolve();
          }
        });
        
        // Handle process errors (spawn failures, not exit codes)
        childProcess.on('error', (error: Error) => {
          processError = new Error(`Failed to execute agent-run: ${error.message}`);
          reject(processError);
        });
        
        // Handle cancellation
        abortController.signal.addEventListener('abort', () => {
          logger.info(`🛑 Killing agent-run process for job ${jobId}...`);
          childProcess.kill('SIGTERM');
          // Give it a moment to gracefully shutdown, then force kill
          setTimeout(() => {
            if (!childProcess.killed) {
              childProcess.kill('SIGKILL');
            }
          }, 5000);
        });
      });
      
      // Log warning if process exited with non-zero code
      if (processExitCode !== null && processExitCode !== 0) {
        logger.warn(`⚠️  agent-run completed with exit code ${processExitCode}`);
        logger.warn(`   Checking for generated reports despite the error...`);
      }
      
      // Restore working directory immediately after agent execution
      process.chdir(originalCwd);
      logger.info(`📂 Restored working directory to ${originalCwd}`);
      
      // Release mutex
      releaseMutex();
      
      // Calculate execution duration
      const executionEndTime = Date.now();
      const executionDuration = Math.round((executionEndTime - executionStartTime) / 1000); // Duration in seconds
      
      // Parse cost from captured output
      // Look for the last line containing "Cost: $X.XXXX"
      let apiCost: string | null = null;
      const lines = capturedOutput.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        const costMatch = line.match(/Cost:\s*(\$[\d.]+)/i);
        if (costMatch) {
          apiCost = costMatch[1];
          logger.info(`💰 Detected API cost: ${apiCost}`);
          break;
        }
      }
      
      // Update job with execution metrics
      ThreatModelingJobModel.updateExecutionMetrics(jobId, executionDuration, apiCost);
      logger.info(`✅ Agent execution completed in ${executionDuration} seconds`);
      
    } catch (error) {
      // Restore working directory on error
      try {
        process.chdir(originalCwd);
        logger.info(`📂 Restored working directory to ${originalCwd} (after error)`);
      } catch (chdirErr) {
        logger.error(`⚠️  Failed to restore working directory on error:`, chdirErr);
      }
      
      // Release mutex even on error
      releaseMutex();
      
      // Calculate duration even if execution failed
      const executionEndTime = Date.now();
      const executionDuration = Math.round((executionEndTime - executionStartTime) / 1000);
      
      // Try to parse cost from captured output before throwing
      let apiCost: string | null = null;
      const lines = capturedOutput.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        const costMatch = line.match(/Cost:\s*(\$[\d.]+)/i);
        if (costMatch) {
          apiCost = costMatch[1];
          break;
        }
      }
      
      // Update job with execution metrics even on error
      ThreatModelingJobModel.updateExecutionMetrics(jobId, executionDuration, apiCost);
      
      throw error;
    }
    
    // Step 5: Find reports generated by agent-run and move them to jobReportDir
    // Reports are generated in workDir (where agent-run is executed)
    logger.info(`📋 Searching for reports in ${workDir}...`);
    
    // Search in workDir first (primary location), then repoDir and hidden subdirectories as fallback
    let searchDirs = [workDir, repoDir];
    
    // Check for hidden directories in workDir that might contain reports
    try {
      const workDirContents = fs.readdirSync(workDir, { withFileTypes: true });
      for (const item of workDirContents) {
        if (item.isDirectory() && item.name.startsWith('.')) {
          const hiddenDir = path.join(workDir, item.name);
          logger.info(`   Found hidden directory in workDir: ${item.name}, will search for reports there`);
          searchDirs.push(hiddenDir);
        }
      }
    } catch (err) {
      logger.warn(`⚠️  Could not list workDir contents:`, err);
    }
    
    // Also check for hidden directories in repoDir as fallback
    try {
      const repoDirContents = fs.readdirSync(repoDir, { withFileTypes: true });
      for (const item of repoDirContents) {
        if (item.isDirectory() && item.name.startsWith('.')) {
          const hiddenDir = path.join(repoDir, item.name);
          logger.info(`   Found hidden directory in repoDir: ${item.name}, will search for reports there`);
          searchDirs.push(hiddenDir);
        }
      }
    } catch (err) {
      logger.warn(`⚠️  Could not list repoDir contents:`, err);
    }
    
    // Collect all report files from all search directories
    const reportFiles: Array<{ file: string; sourceDir: string }> = [];
    
    for (const searchDir of searchDirs) {
      if (!fs.existsSync(searchDir)) {
        continue;
      }
      
      try {
        const dirFiles = fs.readdirSync(searchDir);
        logger.info(`   Files in ${path.basename(searchDir)}: ${dirFiles.slice(0, 10).join(', ')}${dirFiles.length > 10 ? '...' : ''}`);
        
        for (const file of dirFiles) {
          const filePath = path.join(searchDir, file);
          const stats = fs.statSync(filePath);
          
          // Skip directories
          if (!stats.isFile()) {
            continue;
          }
          
          // Check if file matches threat modeling report keywords
          const lowerFileName = file.toLowerCase();
          const isDataFlow = lowerFileName.includes('data_flow') || lowerFileName.includes('dataflow');
          const isThreatModel = lowerFileName.includes('threat_model') || lowerFileName.includes('threatmodel');
          const isRiskRegistry = lowerFileName.includes('risk_registry') || lowerFileName.includes('riskregistry');
          
          // Accept files that match keywords, regardless of extension (including no extension)
          // This handles files like: codebase_threat_model_20251124_232756 (no extension)
          // as well as traditional .txt and .md files
          if (isDataFlow || isThreatModel || isRiskRegistry) {
            reportFiles.push({ file, sourceDir: searchDir });
          }
        }
      } catch (err) {
        logger.warn(`⚠️  Could not read directory ${searchDir}:`, err);
      }
    }
    
    logger.info(`📄 Found ${reportFiles.length} threat modeling report files`);
    
    // If no reports found and process exited with error, throw error
    // Otherwise, if reports exist, continue even if process had warnings
    if (reportFiles.length === 0) {
      if (processExitCode !== null && processExitCode !== 0) {
        // Extract error message from captured output if available
        let errorDetails = `agent-run exited with code ${processExitCode}`;
        const errorLines = capturedOutput.split('\n').filter(line => 
          line.toLowerCase().includes('error') || 
          line.toLowerCase().includes('failed') ||
          line.toLowerCase().includes('exceeded')
        );
        if (errorLines.length > 0) {
          errorDetails += `. Error details: ${errorLines.slice(-3).join('; ')}`;
        }
        throw new Error(`No threat modeling report files were generated. ${errorDetails}`);
      } else {
        throw new Error('No threat modeling report files were generated by the agent');
      }
    } else if (processExitCode !== null && processExitCode !== 0) {
      // Reports were generated despite the error - log warning but continue
      logger.warn(`⚠️  Reports were generated despite agent-run exiting with code ${processExitCode}`);
      logger.warn(`   This may indicate warnings (e.g., token limits) but the analysis completed`);
    }
    
    // Move reports to jobReportDir and identify report types
    let dataFlowDiagramPath: string | null = null;
    let threatModelPath: string | null = null;
    let riskRegistryPath: string | null = null;
    
    for (const { file, sourceDir } of reportFiles) {
      const sourcePath = path.join(sourceDir, file);
      const destPath = path.join(jobReportDir, file);
      
      fs.copyFileSync(sourcePath, destPath);
      logger.info(`✅ Moved report: ${file} from ${path.basename(sourceDir)} -> ${jobReportDir}`);
      
      // Identify report types by filename patterns (case-insensitive)
      const lowerFileName = file.toLowerCase();
      if (lowerFileName.includes('data_flow') || lowerFileName.includes('dataflow')) {
        dataFlowDiagramPath = destPath;
      } else if (lowerFileName.includes('threat_model') || lowerFileName.includes('threatmodel')) {
        threatModelPath = destPath;
      } else if (lowerFileName.includes('risk_registry') || lowerFileName.includes('riskregistry')) {
        riskRegistryPath = destPath;
      }
    }
    
    // Check cancellation before updating job
    checkCancellation();
    
    // Update job with report paths (this also sets status to 'completed')
    // Do this FIRST to ensure status is set to completed even if execution metrics fail
    try {
      ThreatModelingJobModel.updateReports(
        jobId,
        dataFlowDiagramPath,
        threatModelPath,
        riskRegistryPath
      );
      logger.info(`✅ Updated job ${jobId} with report paths and set status to 'completed'`);
      
      // Verify the status was actually updated
      const verifyJob = ThreatModelingJobModel.findById(jobId);
      if (verifyJob.status !== 'completed') {
        logger.error(`❌ ERROR: Job ${jobId} status is '${verifyJob.status}' but should be 'completed'!`);
        // Force update status to completed
        ThreatModelingJobModel.updateStatus(jobId, 'completed');
        logger.info(`✅ Force-updated job ${jobId} status to 'completed'`);
      } else {
        logger.info(`✅ Verified job ${jobId} status is 'completed'`);
      }
    } catch (updateError) {
      logger.error(`❌ ERROR: Failed to update job ${jobId} status to completed:`, updateError);
      // Try to at least set the status to completed even if report paths fail
      try {
        ThreatModelingJobModel.updateStatus(jobId, 'completed');
        logger.info(`✅ Force-set job ${jobId} status to 'completed' after error`);
      } catch (statusError) {
        logger.error(`❌ CRITICAL: Could not set job ${jobId} status to 'completed':`, statusError);
        throw new Error(`Failed to update job status: ${statusError instanceof Error ? statusError.message : 'Unknown error'}`);
      }
    }
    
    // Try to preserve execution metrics (they were already updated in the try/catch block)
    // If this fails, the job is still marked as completed above
    try {
      const jobWithMetrics = ThreatModelingJobModel.findById(jobId);
      const savedExecutionDuration = jobWithMetrics.execution_duration;
      const savedApiCost = jobWithMetrics.api_cost;
      
      // Re-apply execution metrics after updateReports to ensure they're preserved
      // (updateReports calls updateStatus which doesn't touch execution metrics, but this ensures they're set)
      if (savedExecutionDuration !== null || savedApiCost !== null) {
        ThreatModelingJobModel.updateExecutionMetrics(jobId, savedExecutionDuration, savedApiCost);
        logger.info(`✅ Preserved execution metrics: duration=${savedExecutionDuration}s, cost=${savedApiCost}`);
      }
    } catch (metricsError) {
      // If we can't preserve metrics, log but don't fail - job is already marked as completed
      logger.warn(`⚠️  Could not preserve execution metrics (job is still marked as completed):`, metricsError);
    }
    
    logger.info(`✅ Threat modeling job ${jobId} completed successfully`);
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Only update status if job wasn't cancelled (cancelled jobs are deleted)
    if (!abortController.signal.aborted) {
      logger.error(`❌ Threat modeling job ${jobId} failed: ${errorMessage}`);
      try {
        ThreatModelingJobModel.updateStatus(jobId, 'failed');
        ThreatModelingJobModel.updateErrorMessage(jobId, errorMessage);
      } catch (dbError) {
        // Job might have been deleted, ignore database errors
        logger.warn(`⚠️  Could not update job status (job may have been deleted): ${dbError}`);
      }
    } else {
      logger.info(`🛑 Threat modeling job ${jobId} was cancelled`);
    }
    
    throw error;
  } finally {
    // Remove from running jobs map
    runningJobs.delete(jobId);
    // Step 7: Clean up job-specific work directory and uploads
    logger.info(`🧹 Cleaning up job ${jobId}...`);
    
    // Clean up this job's unique work directory (thread-safe - only affects this job)
    if (fs.existsSync(workDir)) {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
        logger.info(`✅ Cleaned up work directory for job ${jobId}: ${workDir}`);
      } catch (err) {
        logger.warn(`⚠️  Could not clean up work directory for job ${jobId}:`, err);
      }
    }
    
    // Clean up uploaded ZIP file
    if (uploadedZipPath && fs.existsSync(uploadedZipPath)) {
      try {
        fs.unlinkSync(uploadedZipPath);
        logger.info(`✅ Cleaned up uploaded ZIP file`);
      } catch (err) {
        logger.warn(`⚠️  Could not clean up uploaded ZIP file:`, err);
      }
    }
    
    // Clean up extracted directory
    if (extractedDir && fs.existsSync(extractedDir)) {
      try {
        fs.rmSync(extractedDir, { recursive: true, force: true });
        logger.info(`✅ Cleaned up extracted directory`);
      } catch (err) {
        logger.warn(`⚠️  Could not clean up extracted directory:`, err);
      }
    }
    
  }
}

// POST /api/threat-modeling - Create a new threat modeling job
// Accepts either a ZIP file upload or a repository path (for backward compatibility)
// Requires Admin or Operator role (Auditors cannot schedule jobs)
router.post('/', authenticateToken, requireJobScheduling, upload.single('repository'), async (req: AuthRequest, res: Response) => {
  let uploadedZipPath: string | undefined;
  let extractedDir: string | undefined;
  let finalRepoPath: string;

  try {
    const { query, repoName, gitBranch, gitCommit } = req.body;
    const userId = req.userId!;

    // Check if ZIP file was uploaded
    if (req.file) {
      uploadedZipPath = req.file.path;
      logger.info(`📦 Received ZIP file upload: ${uploadedZipPath}`);

      // Extract ZIP to a temporary directory
      extractedDir = path.join(process.cwd(), 'uploads', 'threat-modeling', `extracted-${req.file.filename}`);
      
      try {
        await extractZip(uploadedZipPath, extractedDir);
        
        // Verify extraction was successful and contains files
        if (!fs.existsSync(extractedDir)) {
          throw new Error('Extracted directory was not created');
        }
        
        const extractedContents = fs.readdirSync(extractedDir);
        if (extractedContents.length === 0) {
          throw new Error('Extracted directory is empty - ZIP file may be corrupted or empty');
        }
        
        logger.info(`✅ Extracted repository to: ${extractedDir}`);
        logger.info(`📋 Extracted directory contains ${extractedContents.length} items: ${extractedContents.slice(0, 10).join(', ')}${extractedContents.length > 10 ? '...' : ''}`);
        
        // If ZIP contains a single root directory, use that directory instead
        if (extractedContents.length === 1) {
          const singleItem = path.join(extractedDir, extractedContents[0]);
          const stats = fs.statSync(singleItem);
          if (stats.isDirectory()) {
            logger.info(`📁 ZIP contains single root directory, using: ${singleItem}`);
            finalRepoPath = singleItem;
          } else {
            finalRepoPath = extractedDir;
          }
        } else {
          finalRepoPath = extractedDir;
        }
        
        // Final verification: list what's actually in the directory we'll use
        logger.info(`✅ Using source directory: ${finalRepoPath}`);
        const finalContents = fs.readdirSync(finalRepoPath);
        logger.info(`📋 Final source directory contains: ${finalContents.slice(0, 10).join(', ')}${finalContents.length > 10 ? '...' : ''} (${finalContents.length} total)`);
      } catch (extractErr) {
        // Clean up uploaded file if extraction fails
        if (fs.existsSync(uploadedZipPath)) {
          fs.unlinkSync(uploadedZipPath);
        }
        if (fs.existsSync(extractedDir)) {
          fs.rmSync(extractedDir, { recursive: true, force: true });
        }
        throw new Error(`Failed to extract ZIP file: ${extractErr instanceof Error ? extractErr.message : 'Unknown error'}`);
      }
    } else {
      // Backward compatibility: use repoPath from body
      const { repoPath } = req.body;
      if (!repoPath) {
        return res.status(400).json({ error: 'Repository ZIP file upload or repository path required' });
      }
      finalRepoPath = repoPath;
    }

    // Create job (store the original path or indicate it was uploaded)
    const jobRepoPath = req.file ? `[UPLOADED] ${req.file.originalname}` : finalRepoPath;
    const zipFileName = req.file ? req.file.originalname : null;
    const job = ThreatModelingJobModel.create(userId, jobRepoPath, query, repoName || null, gitBranch || null, gitCommit || null);

    // Process job asynchronously (don't await)
    // Pass the extracted directory path and uploaded ZIP path for cleanup
    processThreatModelingJob(
      job.id, 
      finalRepoPath, 
      query || 'Perform threat modeling analysis',
      uploadedZipPath,
      extractedDir,
      zipFileName || undefined
    ).catch(err => logger.error('Background job processing error:', err));

    res.json({
      status: 'success',
      message: 'Threat modeling job created',
      jobId: job.id,
      job: {
        id: job.id,
        status: job.status,
        repoPath: job.repo_path,
        query: job.query,
        repoName: job.repo_name,
        gitBranch: job.git_branch,
        gitCommit: job.git_commit,
        executionDuration: job.execution_duration,
        apiCost: job.api_cost,
        createdAt: job.created_at
      }
    });
  } catch (error: unknown) {
    logger.error('Threat modeling job creation error:', error);
    
    // Clean up on error
    if (uploadedZipPath && fs.existsSync(uploadedZipPath)) {
      try {
        fs.unlinkSync(uploadedZipPath);
      } catch (err) {
        logger.warn('Could not clean up uploaded file on error:', err);
      }
    }
    if (extractedDir && fs.existsSync(extractedDir)) {
      try {
        fs.rmSync(extractedDir, { recursive: true, force: true });
      } catch (err) {
        logger.warn('Could not clean up extracted directory on error:', err);
      }
    }
    
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Failed to create threat modeling job', message });
  }
});

// GET /api/threat-modeling/jobs - Get all jobs for the authenticated user (or all jobs for Auditors)
router.get('/jobs', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const userRole = req.userRole;
    
    // Auditors can see all jobs with owner information
    if (userRole === 'Auditor') {
      const jobs = ThreatModelingJobModel.findAllWithUsers();
      res.json({
        status: 'success',
        jobs: jobs.map(job => ({
          id: job.id,
          repoPath: job.repo_path,
          query: job.query,
          status: job.status,
          reportPath: job.report_path, // Keep for backward compatibility
          dataFlowDiagramPath: job.data_flow_diagram_path,
          threatModelPath: job.threat_model_path,
          riskRegistryPath: job.risk_registry_path,
          errorMessage: job.error_message,
          repoName: job.repo_name,
          gitBranch: job.git_branch,
          gitCommit: job.git_commit,
          executionDuration: job.execution_duration,
          apiCost: job.api_cost,
          createdAt: job.created_at,
          updatedAt: job.updated_at,
          completedAt: job.completed_at,
          owner: job.username || 'Unknown'
        }))
      });
    } else {
      // Other users see only their own jobs
      const jobs = ThreatModelingJobModel.findByUserId(userId);
      res.json({
        status: 'success',
        jobs: jobs.map(job => ({
          id: job.id,
          repoPath: job.repo_path,
          query: job.query,
          status: job.status,
          reportPath: job.report_path, // Keep for backward compatibility
          dataFlowDiagramPath: job.data_flow_diagram_path,
          threatModelPath: job.threat_model_path,
          riskRegistryPath: job.risk_registry_path,
          errorMessage: job.error_message,
          repoName: job.repo_name,
          gitBranch: job.git_branch,
          gitCommit: job.git_commit,
          executionDuration: job.execution_duration,
          apiCost: job.api_cost,
          createdAt: job.created_at,
          updatedAt: job.updated_at,
          completedAt: job.completed_at
        }))
      });
    }
  } catch (error: unknown) {
    logger.error('List jobs error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Failed to list jobs', message });
  }
});

// Helper function to read report content
function readReportContent(filePath: string | null): string | null {
  if (!filePath) return null;
  
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch (err: unknown) {
    logger.warn(`⚠️ Could not read report file ${filePath}:`, err);
  }
  return null;
}

// GET /api/threat-modeling/jobs/:id - Get a specific job by ID
router.get('/jobs/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    const userRole = req.userRole;
    
    const job = ThreatModelingJobModel.findById(id);
    
    // Auditors can view any job, others can only view their own
    if (userRole !== 'Auditor' && job.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get owner username for Auditors
    let owner: string | undefined;
    if (userRole === 'Auditor') {
      const userStmt = db.prepare('SELECT username FROM users WHERE id = ?');
      const user = userStmt.get(job.user_id) as { username: string } | undefined;
      owner = user?.username;
    }

    // Read all report contents if available
    let dataFlowDiagramContent = null;
    let threatModelContent = null;
    let riskRegistryContent = null;
    
    if (job.status === 'completed') {
      dataFlowDiagramContent = readReportContent(job.data_flow_diagram_path);
      threatModelContent = readReportContent(job.threat_model_path);
      riskRegistryContent = readReportContent(job.risk_registry_path);
      
      // Fallback: if new paths are not set, try reading from report_path (backward compatibility)
      if (!threatModelContent && job.report_path) {
        threatModelContent = readReportContent(job.report_path);
      }
    }

    res.json({
      status: 'success',
      job: {
        id: job.id,
        repoPath: job.repo_path,
        query: job.query,
        status: job.status,
        reportPath: job.report_path, // Keep for backward compatibility
        dataFlowDiagramPath: job.data_flow_diagram_path,
        threatModelPath: job.threat_model_path,
        riskRegistryPath: job.risk_registry_path,
        errorMessage: job.error_message,
        repoName: job.repo_name,
        gitBranch: job.git_branch,
        gitCommit: job.git_commit,
        executionDuration: job.execution_duration,
        apiCost: job.api_cost,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        completedAt: job.completed_at,
        // Report contents
        dataFlowDiagramContent,
        threatModelContent,
        riskRegistryContent,
        // Backward compatibility
        reportContent: threatModelContent,
        ...(owner && { owner })
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    if (message.includes('not found')) {
      // Log 404s as warnings since they're expected (e.g., job was deleted, frontend polling stale IDs)
      logger.warn(`Job not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Job not found', message });
    }
    // Only log actual errors
    logger.error('Get job error:', error);
    res.status(500).json({ error: 'Failed to get job', message });
  }
});

// DELETE /api/threat-modeling/jobs/:id - Delete a threat modeling job
router.delete('/jobs/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    
    // Check if job exists and belongs to user
    let job;
    try {
      job = ThreatModelingJobModel.findById(id);
      
      // Verify job belongs to user
      if (job.user_id !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    } catch (error) {
      // Job might not exist or already deleted
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      if (message.includes('not found')) {
        return res.status(404).json({ error: 'Job not found' });
      }
      throw error;
    }

    // Check if job is currently running and cancel it
    const runningJob = runningJobs.get(id);
    if (runningJob) {
      logger.info(`🛑 Cancelling running job ${id}...`);
      runningJob.abortController.abort();
      
      // Clean up work directory immediately
      if (fs.existsSync(runningJob.workDir)) {
        try {
          fs.rmSync(runningJob.workDir, { recursive: true, force: true });
          logger.info(`✅ Cleaned up work directory: ${runningJob.workDir}`);
        } catch (err) {
          logger.warn(`⚠️  Could not clean up work directory: ${err}`);
        }
      }
      
      // Clean up uploaded ZIP file
      if (runningJob.uploadedZipPath && fs.existsSync(runningJob.uploadedZipPath)) {
        try {
          fs.unlinkSync(runningJob.uploadedZipPath);
          logger.info(`✅ Cleaned up uploaded ZIP file`);
        } catch (err) {
          logger.warn(`⚠️  Could not clean up uploaded ZIP file: ${err}`);
        }
      }
      
      // Clean up extracted directory
      if (runningJob.extractedDir && fs.existsSync(runningJob.extractedDir)) {
        try {
          fs.rmSync(runningJob.extractedDir, { recursive: true, force: true });
          logger.info(`✅ Cleaned up extracted directory`);
        } catch (err) {
          logger.warn(`⚠️  Could not clean up extracted directory: ${err}`);
        }
      }
      
      // Remove from running jobs map
      runningJobs.delete(id);
    }

    // Delete report files from filesystem
    const reportsBaseDir = path.join(process.cwd(), 'threat-modeling-reports');
    const jobReportDir = path.join(reportsBaseDir, id);
    
    if (fs.existsSync(jobReportDir)) {
      try {
        fs.rmSync(jobReportDir, { recursive: true, force: true });
        logger.info(`✅ Deleted report directory: ${jobReportDir}`);
      } catch (err) {
        logger.warn(`⚠️  Could not delete report directory ${jobReportDir}:`, err);
        // Continue with database deletion even if file deletion fails
      }
    }

    // Delete the job from database
    ThreatModelingJobModel.delete(id);
    
    res.json({
      status: 'success',
      message: 'Job deleted successfully'
    });
  } catch (error: unknown) {
    logger.error('Delete job error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    if (message.includes('not found')) {
      return res.status(404).json({ error: 'Job not found', message });
    }
    res.status(500).json({ error: 'Failed to delete job', message });
  }
});

// GET /api/threat-modeling/reports - Get all reports (for backward compatibility)
router.get('/reports', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const jobs = ThreatModelingJobModel.findByUserId(userId);
    
    // Filter to only completed jobs with reports
    const reports = jobs
      .filter(job => job.status === 'completed' && (job.threat_model_path || job.report_path))
      .map(job => ({
        id: job.id,
        repoPath: job.repo_path,
        query: job.query,
        reportPath: job.report_path || job.threat_model_path,
        dataFlowDiagramPath: job.data_flow_diagram_path,
        threatModelPath: job.threat_model_path,
        riskRegistryPath: job.risk_registry_path,
        createdAt: job.created_at,
        completedAt: job.completed_at
      }));
    
    res.json({
      status: 'success',
      reports
    });
  } catch (error: unknown) {
    logger.error('Get reports error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    res.status(500).json({ error: 'Failed to get reports', message });
  }
});

// GET /api/threat-modeling/reports/:jobId/download - Download threat modeling reports
// Query param: type=data_flow_diagram|threat_model|risk_registry|all (default: all - downloads ZIP with all reports)
router.get('/reports/:jobId/download', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { jobId } = req.params;
    const { type = 'all' } = req.query;
    const userId = req.userId!;
    
    const job = ThreatModelingJobModel.findById(jobId);
    
    // Verify job belongs to user
    if (job.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if job is completed
    if (job.status !== 'completed') {
      return res.status(404).json({ error: 'Report not available' });
    }

    // If type is 'all', create a ZIP file with all reports
    if (type === 'all') {
      const zip = archiver('zip', { zlib: { level: 9 } });
      
      res.attachment(`threat_modeling_reports_${jobId}.zip`);
      zip.pipe(res);
      
      // Add each report file if it exists
      if (job.data_flow_diagram_path && fs.existsSync(job.data_flow_diagram_path)) {
        zip.file(job.data_flow_diagram_path, { name: path.basename(job.data_flow_diagram_path) });
      }
      if (job.threat_model_path && fs.existsSync(job.threat_model_path)) {
        zip.file(job.threat_model_path, { name: path.basename(job.threat_model_path) });
      }
      if (job.risk_registry_path && fs.existsSync(job.risk_registry_path)) {
        zip.file(job.risk_registry_path, { name: path.basename(job.risk_registry_path) });
      }
      // Fallback to report_path for backward compatibility
      if (!job.threat_model_path && job.report_path && fs.existsSync(job.report_path)) {
        zip.file(job.report_path, { name: path.basename(job.report_path) });
      }
      
      zip.finalize();
    } else {
      // Download a single report file
      let filePath: string | null = null;
      let filename = '';
      
      if (type === 'data_flow_diagram' && job.data_flow_diagram_path) {
        filePath = job.data_flow_diagram_path;
        filename = `data_flow_diagram_${jobId}.txt`;
      } else if (type === 'threat_model' && job.threat_model_path) {
        filePath = job.threat_model_path;
        filename = `threat_model_${jobId}.txt`;
      } else if (type === 'risk_registry' && job.risk_registry_path) {
        filePath = job.risk_registry_path;
        filename = `risk_registry_${jobId}.txt`;
      } else if (type === 'threat_model' && job.report_path) {
        // Fallback for backward compatibility
        filePath = job.report_path;
        filename = `threat_model_${jobId}.txt`;
      }
      
      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Report file not found' });
      }
      
      res.download(filePath, filename);
    }
  } catch (error: unknown) {
    logger.error('Download report error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    if (message.includes('not found')) {
      return res.status(404).json({ error: 'Job or report not found', message });
    }
    res.status(500).json({ error: 'Failed to download report', message });
  }
});

export { router as threatModelingRoutes };

