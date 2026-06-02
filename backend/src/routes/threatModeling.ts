/**
 * Threat Modeling Routes for AI Threat Modeler Dashboard
 * 
 * Author: Sam Li
 */

import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { execSync, spawn, ChildProcess } from 'child_process';
import archiver from 'archiver';
import multer from 'multer';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { requireJobScheduling } from '../middleware/permissions';
import { ThreatModelingJobModel } from '../models/threatModelingJob';
import { SettingsModel } from '../models/settings';
import db from '../db/database';
import logger from '../utils/logger';
import { findAgentRunPath } from '../services/agentRunPath';
import { buildAgentRunInvocation } from '../services/agentInvocation';
import { extractZip } from '../services/zipExtract';
import { listPopulatedContextFieldNames } from '../types/contextFields';
import {
  awaitAgentChildExit,
  type AgentChildExitResult,
} from '../utils/awaitAgentChildExit';
import {
  registerThreatModelingStagingRoutes,
  LEGACY_GONE_BODY,
} from './threatModelingStaging';

export { awaitAgentChildExit, type AgentChildExitResult };
export { extractZip };

const router = Router();

// Base directory name for reports (relative to process.cwd())
const REPORTS_DIR_NAME = 'threat-modeling-reports';

/**
 * Resolve a report path to an absolute path
 * Handles both relative paths (stored in DB) and legacy absolute paths
 * Works in both dev (backend/) and prod (Docker /app/) environments
 */
function resolveReportPath(storedPath: string | null): string | null {
  if (!storedPath) return null;
  
  // If it's already an absolute path that exists, use it
  if (path.isAbsolute(storedPath) && fs.existsSync(storedPath)) {
    return storedPath;
  }
  
  // If it's a relative path, resolve it from cwd
  if (!path.isAbsolute(storedPath)) {
    const resolved = path.join(process.cwd(), storedPath);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }
  
  // Try to extract the relative portion from an absolute path
  // This handles paths like /app/threat-modeling-reports/xxx when running in dev
  const reportsIndex = storedPath.indexOf(REPORTS_DIR_NAME);
  if (reportsIndex !== -1) {
    const relativePath = storedPath.substring(reportsIndex);
    const resolved = path.join(process.cwd(), relativePath);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }
  
  // Path doesn't exist in any form
  return null;
}

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
export async function processThreatModelingJob(jobId: string, repoPath: string, query: string, uploadedZipPath?: string, extractedDir?: string, zipFileName?: string) {
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

    const jobRecord = ThreatModelingJobModel.findById(jobId);
    const contextText = (jobRecord.context ?? '').trim();
    if (!uploadedZipPath && jobRecord.uploaded_zip_path) {
      uploadedZipPath = jobRecord.uploaded_zip_path;
    }
    if (!extractedDir && jobRecord.extracted_dir) {
      extractedDir = jobRecord.extracted_dir;
    }

    // Get agent provider configuration from database
    let providerConfig;
    try {
      providerConfig = SettingsModel.getAgentProviderConfig();
      logger.info(
        `🔑 Using ${providerConfig.provider} provider from admin settings (base URL: ${providerConfig.baseUrl})`,
      );
      if (providerConfig.claudeCodeMaxOutputTokens) {
        logger.info(`🔧 Using Claude Code max output tokens: ${providerConfig.claudeCodeMaxOutputTokens}`);
      }
    } catch (error) {
      logger.error('Failed to get agent provider configuration from database:', error);
      throw new Error('Agent provider not configured. Please configure settings in the admin panel.');
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
    logger.info(`   contextProvided: ${contextText.length > 0}`);
    logger.info(`   contextLength: ${contextText.length}`);
    logger.info(
      `   contextFieldsPresent: [${listPopulatedContextFieldNames(jobRecord.contextFields ?? {}).join(', ')}]`,
    );
    
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
      const roleArgs = [
        'node',
        agentRunPath,
        '-r', 'threat_modeler',
        '-s', `./${agentRunRepoName}`,
        '-f', 'json',
      ];
      const { args: providerArgs, env } = buildAgentRunInvocation(providerConfig, []);
      const agentRunCommand = [...roleArgs, ...providerArgs];

      // argv exposure: -c value is visible in process list (same as -k). Migrate to stdin/env when upstream supports it.
      if (contextText.length > 0) {
        agentRunCommand.push('-c', contextText);
      }
      
      logger.info(`🚀 Starting agent-run CLI execution...`);
      logger.info(
        `   Command: node ${path.basename(agentRunPath)} -r threat_modeler -s ./${agentRunRepoName} --provider ${providerConfig.provider} [REDACTED]${contextText.length > 0 ? ' -c [REDACTED]' : ''}`,
      );
      logger.info(`   Note: Query will be loaded from built-in YAML config file for threat_modeler role`);
      
      // Execute the agent-run CLI command using spawn (non-blocking, async)
      const childProcess = spawn(agentRunCommand[0], agentRunCommand.slice(1), {
        cwd: workDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      if (childProcess.stdout) {
        childProcess.stdout.setEncoding('utf-8');
        childProcess.stdout.on('data', (data: string) => {
          capturedOutput += data;
          logger.info(data);
        });
      }

      if (childProcess.stderr) {
        childProcess.stderr.setEncoding('utf-8');
        childProcess.stderr.on('data', (data: string) => {
          capturedOutput += data;
          logger.error(data);
        });
      }

      const onAbort = () => {
        logger.info(`🛑 Killing agent-run process for job ${jobId}...`);
        childProcess.kill('SIGTERM');
        // Give it a moment to gracefully shut down, then force kill
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill('SIGKILL');
          }
        }, 5000);
      };
      abortController.signal.addEventListener('abort', onAbort);

      try {
        // Use the exit-aware helper so we never hang on 'close' if the
        // agent forks a grandchild (e.g. Claude Code) that inherits stdio.
        const exitResult = await awaitAgentChildExit(childProcess, jobId);
        processExitCode = exitResult.exitCode;
        if (exitResult.exitCode !== null && exitResult.exitCode !== 0) {
          logger.warn(
            `⚠️  agent-run exited with code ${exitResult.exitCode}${exitResult.signal ? ` (signal: ${exitResult.signal})` : ''}`,
          );
          logger.warn(`   This may be a warning (e.g., token limit) but reports might still be generated`);
        }
        if (exitResult.forced) {
          logger.warn(`   (resolved via post-exit grace; 'close' never fired — investigate stdio inheritance)`);
        }
      } catch (err) {
        processError = err instanceof Error ? err : new Error(String(err));
        throw processError;
      } finally {
        abortController.signal.removeEventListener('abort', onAbort);
      }
      
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
    
    // Step 5: Find the JSON report generated by agent-run and move it to jobReportDir
    logger.info(`📋 Searching for JSON report in ${workDir}...`);
    
    // Search for the JSON report file in workDir and fallback locations
    const searchDirs = [workDir, repoDir];
    
    // Also check hidden directories as fallback
    for (const dir of [workDir, repoDir]) {
      try {
        const contents = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of contents) {
          if (item.isDirectory() && item.name.startsWith('.')) {
            searchDirs.push(path.join(dir, item.name));
          }
        }
      } catch (err) {
        // Ignore if directory can't be read
      }
    }
    
    let reportJsonPath: string | null = null;
    
    for (const searchDir of searchDirs) {
      if (!fs.existsSync(searchDir)) continue;
      
      try {
        const dirFiles = fs.readdirSync(searchDir);
        logger.info(`   Files in ${path.basename(searchDir)}: ${dirFiles.slice(0, 10).join(', ')}${dirFiles.length > 10 ? '...' : ''}`);
        
        for (const file of dirFiles) {
          const filePath = path.join(searchDir, file);
          if (!fs.statSync(filePath).isFile()) continue;
          
          const lowerFileName = file.toLowerCase();
          // Look for JSON report file: threat_model_report.json or similar
          if (lowerFileName.includes('threat_model') && lowerFileName.endsWith('.json')) {
            reportJsonPath = filePath;
            break;
          }
        }
        if (reportJsonPath) break;
      } catch (err) {
        logger.warn(`⚠️  Could not read directory ${searchDir}:`, err);
      }
    }
    
    if (!reportJsonPath) {
      if (processExitCode !== null && processExitCode !== 0) {
        let errorDetails = `agent-run exited with code ${processExitCode}`;
        const errorLines = capturedOutput.split('\n').filter(line => 
          line.toLowerCase().includes('error') || 
          line.toLowerCase().includes('failed') ||
          line.toLowerCase().includes('exceeded')
        );
        if (errorLines.length > 0) {
          errorDetails += `. Error details: ${errorLines.slice(-3).join('; ')}`;
        }
        throw new Error(`No threat modeling report was generated. ${errorDetails}`);
      } else {
        throw new Error('No threat modeling JSON report was generated by the agent');
      }
    } else if (processExitCode !== null && processExitCode !== 0) {
      logger.warn(`⚠️  Report was generated despite agent-run exiting with code ${processExitCode}`);
    }
    
    // Validate the JSON report structure
    let reportData: any;
    try {
      const rawContent = fs.readFileSync(reportJsonPath, 'utf-8');
      reportData = JSON.parse(rawContent);
      if (!reportData.threat_model_report) {
        throw new Error('JSON report missing required "threat_model_report" root key');
      }
      logger.info(`✅ Validated JSON report structure`);
    } catch (parseErr) {
      if (parseErr instanceof SyntaxError) {
        throw new Error(`Generated report is not valid JSON: ${parseErr.message}`);
      }
      throw parseErr;
    }
    
    // Copy the single JSON report to jobReportDir
    const destReportPath = path.join(jobReportDir, 'threat_model_report.json');
    fs.copyFileSync(reportJsonPath, destReportPath);
    logger.info(`✅ Copied report to ${jobReportDir}`);
    
    // Check cancellation before updating job
    checkCancellation();
    
    // Update job with report path (this also sets status to 'completed')
    // All three path columns point to the same JSON file for compatibility
    try {
      ThreatModelingJobModel.updateReports(
        jobId,
        destReportPath,
        destReportPath,
        destReportPath
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

registerThreatModelingStagingRoutes(router, upload, { processThreatModelingJob });

// POST /api/threat-modeling — removed; migrate to staging flow
router.post('/', authenticateToken, requireJobScheduling, (_req: AuthRequest, res: Response) => {
  res.status(410).json(LEGACY_GONE_BODY);
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
          sourceType: job.source_type ?? 'upload',
          sourceUrl: job.source_url,
          gitRef: job.git_ref,
          gitRefType: job.git_ref_type,
          context: job.context,
          contextFields: job.contextFields,
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
          sourceType: job.source_type ?? 'upload',
          sourceUrl: job.source_url,
          gitRef: job.git_ref,
          gitRefType: job.git_ref_type,
          context: job.context,
          contextFields: job.contextFields,
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
  
  // Resolve the path (handles dev vs prod environments)
  const resolvedPath = resolveReportPath(filePath);
  if (!resolvedPath) {
    logger.warn(`⚠️ Could not resolve report file path: ${filePath}`);
    return null;
  }
  
  try {
    return fs.readFileSync(resolvedPath, 'utf-8');
  } catch (err: unknown) {
    logger.warn(`⚠️ Could not read report file ${resolvedPath}:`, err);
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

    // Read and parse report JSON if available
    let dataFlowDiagram = null;
    let threatModel = null;
    let riskRegistry = null;
    let metadata = null;
    let recommendations = null;
    let conclusion = null;
    
    if (job.status === 'completed') {
      // All three path columns point to the same JSON file
      const reportPath = job.data_flow_diagram_path || job.threat_model_path || job.risk_registry_path || job.report_path;
      const rawContent = readReportContent(reportPath);
      if (rawContent) {
        try {
          const report = JSON.parse(rawContent);
          const tmr = report.threat_model_report;
          if (tmr) {
            dataFlowDiagram = tmr.data_flow_diagram || null;
            threatModel = tmr.threat_model || null;
            riskRegistry = tmr.risk_registry || null;
            metadata = tmr.metadata || null;
            recommendations = tmr.recommendations || null;
            conclusion = tmr.conclusion || null;
          }
        } catch (parseErr) {
          logger.warn(`⚠️ Could not parse report JSON for job ${id}:`, parseErr);
        }
      }
    }

    res.json({
      status: 'success',
      job: {
        id: job.id,
        repoPath: job.repo_path,
        query: job.query,
        status: job.status,
        errorMessage: job.error_message,
        repoName: job.repo_name,
        gitBranch: job.git_branch,
        gitCommit: job.git_commit,
        sourceType: job.source_type ?? 'upload',
        sourceUrl: job.source_url,
        gitRef: job.git_ref,
        gitRefType: job.git_ref_type,
        context: job.context,
        contextFields: job.contextFields,
        executionDuration: job.execution_duration,
        apiCost: job.api_cost,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        completedAt: job.completed_at,
        // Structured report sections
        metadata,
        dataFlowDiagram,
        threatModel,
        riskRegistry,
        recommendations,
        conclusion,
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

// GET /api/threat-modeling/reports/:jobId/download - Download threat modeling report
// Query param: format=json|csv (default: json)
router.get('/reports/:jobId/download', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { jobId } = req.params;
    const { format = 'json' } = req.query;
    const userId = req.userId!;
    const userRole = req.userRole;
    
    const job = ThreatModelingJobModel.findById(jobId);
    
    if (userRole !== 'Auditor' && job.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (job.status !== 'completed') {
      return res.status(404).json({ error: 'Report not available' });
    }

    const reportPath = job.data_flow_diagram_path || job.threat_model_path || job.risk_registry_path || job.report_path;
    const filePath = resolveReportPath(reportPath);
    if (!filePath) {
      return res.status(404).json({ error: 'Report file not found' });
    }

    if (format === 'csv') {
      // Export risk registry as CSV
      const rawContent = fs.readFileSync(filePath, 'utf-8');
      const report = JSON.parse(rawContent);
      const risks = report.threat_model_report?.risk_registry?.risks || [];
      
      if (risks.length === 0) {
        return res.status(404).json({ error: 'No risks found in the report' });
      }
      
      const columns = [
        'id', 'title', 'category', 'stride_category', 'severity',
        'current_risk_score', 'residual_risk_score', 'description',
        'affected_components', 'business_impact', 'remediation_plan',
        'effort_estimate', 'cost_estimate', 'timeline', 'related_threats'
      ];
      
      const escapeCSV = (val: unknown): string => {
        const str = Array.isArray(val) ? val.join(', ') : String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      const header = columns.map(c => escapeCSV(c.replace(/_/g, ' ').toUpperCase())).join(',');
      const rows = risks.map((risk: Record<string, unknown>) =>
        columns.map(col => escapeCSV(risk[col])).join(',')
      );
      
      const BOM = '\uFEFF';
      const csvContent = BOM + [header, ...rows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.attachment(`risk_registry_${jobId}.csv`);
      res.send(csvContent);
    } else {
      // Download the full JSON report
      res.download(filePath, `threat_model_report_${jobId}.json`);
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

