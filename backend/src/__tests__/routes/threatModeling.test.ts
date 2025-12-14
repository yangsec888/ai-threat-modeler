/**
 * Tests for Threat Modeling Routes
 * 
 * Author: Sam Li
 */

// Mock better-sqlite3 before any imports that use it
jest.mock('better-sqlite3', () => {
  const mockDb = {
    prepare: jest.fn(() => ({
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn(() => []),
    })),
    exec: jest.fn(),
    pragma: jest.fn(),
  };
  return jest.fn(() => mockDb);
});

// Mock SettingsModel before importing routes (routes import SettingsModel)
jest.mock('../../models/settings', () => ({
  SettingsModel: {
    getAnthropicConfig: jest.fn(() => ({
      apiKey: 'test-api-key',
      baseUrl: 'https://api.anthropic.com',
      claudeCodeMaxOutputTokens: null,
    })),
    get: jest.fn(() => ({
      encryption_key: 'test-encryption-key',
      anthropic_api_key: null,
      anthropic_base_url: 'https://api.anthropic.com',
      claude_code_max_output_tokens: null,
      updated_at: '2024-01-01T00:00:00Z',
    })),
  },
}));

// Mock database before importing routes
jest.mock('../../db/database', () => ({
  __esModule: true,
  default: {
    prepare: jest.fn(() => ({
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn(() => []),
    })),
    exec: jest.fn(),
    pragma: jest.fn(),
  },
}));

import request from 'supertest';
import express from 'express';
import { threatModelingRoutes } from '../../routes/threatModeling';
import * as fs from 'fs';
import * as path from 'path';

// Mock ThreatModelingJobModel
jest.mock('../../models/threatModelingJob', () => ({
  ThreatModelingJobModel: {
    create: jest.fn(),
    findByUserId: jest.fn(),
    findAllWithUsers: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    updateReports: jest.fn(),
    updateErrorMessage: jest.fn(),
    updateMetadata: jest.fn(),
    updateExecutionMetrics: jest.fn(),
    delete: jest.fn(),
  },
}));

// Mock child_process.spawn for agent-run CLI execution
jest.mock('child_process', () => ({
  execSync: jest.fn(),
  spawn: jest.fn((command: string, args: string[], options: any) => {
    const mockProcess = {
      stdout: {
        setEncoding: jest.fn(),
        on: jest.fn((event: string, handler: Function) => {
          if (event === 'data') {
            // Simulate successful output
            setTimeout(() => handler('Cost: $0.50\n'), 10);
          }
        }),
      },
      stderr: {
        setEncoding: jest.fn(),
        on: jest.fn(),
      },
      on: jest.fn((event: string, handler: Function) => {
        if (event === 'close') {
          // Simulate successful exit
          setTimeout(() => handler(0, null), 20);
        }
      }),
      killed: false,
      kill: jest.fn(),
    };
    return mockProcess;
  }),
}));

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  mkdirSync: jest.fn(),
  cpSync: jest.fn(),
  rmSync: jest.fn(),
  unlinkSync: jest.fn(),
  copyFileSync: jest.fn(),
  renameSync: jest.fn(),
  createWriteStream: jest.fn(() => ({
    on: jest.fn((event: string, handler: Function) => {
      if (event === 'close') {
        setTimeout(() => handler(), 0);
      }
    }),
    pipe: jest.fn(),
  })),
}));

// Mock path module
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  resolve: jest.fn((...args) => args.join('/')),
  basename: jest.fn((p: string) => {
    const parts = p.split('/');
    return parts[parts.length - 1] || p;
  }),
  dirname: jest.fn((p: string) => {
    const parts = p.split('/');
    parts.pop();
    return parts.join('/') || '.';
  }),
  extname: jest.fn((p: string) => {
    const match = p.match(/\.[^.]+$/);
    return match ? match[0] : '';
  }),
}));

// Mock multer
jest.mock('multer', () => {
  return jest.fn((options: any) => ({
    single: jest.fn((fieldName: string) => {
      return (req: any, res: any, next: any) => {
        // Only add file if explicitly requested via header
        if (req.headers['x-test-file-upload'] === 'true') {
          req.file = {
            fieldname: fieldName,
            originalname: 'test.zip',
            encoding: '7bit',
            mimetype: 'application/zip',
            filename: 'test123',
            path: '/uploads/threat-modeling/test123',
            size: 1024,
          };
        }
        next();
      };
    }),
  }));
});

// Mock yauzl for ZIP extraction
jest.mock('yauzl', () => ({
  open: jest.fn((zipPath: string, options: any, callback: any) => {
    const eventHandlers: { [key: string]: Function[] } = {};
    const mockZipFile = {
      readEntry: jest.fn(() => {
        // After readEntry is called, immediately trigger 'end' event
        // This simulates an empty ZIP or completed extraction
        setTimeout(() => {
          if (eventHandlers['end']) {
            eventHandlers['end'].forEach(handler => handler());
          }
        }, 0);
      }),
      on: jest.fn((event: string, handler: Function) => {
        if (!eventHandlers[event]) {
          eventHandlers[event] = [];
        }
        eventHandlers[event].push(handler);
      }),
      close: jest.fn(),
      openReadStream: jest.fn((entry: any, callback: any) => {
        // Mock openReadStream to immediately call callback with a mock stream
        const mockStream = {
          pipe: jest.fn(),
          on: jest.fn(),
        };
        callback(null, mockStream);
      }),
    };
    callback(null, mockZipFile);
  }),
}));

// Mock archiver
jest.mock('archiver', () => {
  return jest.fn(() => ({
    pipe: jest.fn(),
    file: jest.fn(),
    finalize: jest.fn(),
  }));
});

// Mock authenticateToken middleware
jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.userId = 1;
    req.username = 'testuser';
    req.userRole = 'Admin'; // Set role to Admin to pass requireJobScheduling
    next();
  },
  AuthRequest: {},
}));

// Mock permissions middleware
jest.mock('../../middleware/permissions', () => ({
  requireJobScheduling: jest.fn((req: any, res: any, next: any) => {
    // Allow if userRole is Admin or Operator
    if (req.userRole === 'Admin' || req.userRole === 'Operator') {
      next();
    } else {
      res.status(403).json({ error: 'Job scheduling requires Admin or Operator role' });
    }
  }),
}));

const app = express();
app.use(express.json());
app.use('/api/threat-modeling', threatModelingRoutes);

describe('Threat Modeling Routes', () => {
  const { ThreatModelingJobModel } = require('../../models/threatModelingJob');
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Suppress console output to avoid "Cannot log after tests are done" warnings
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Default mocks
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue('# Threat Model Report\n\nTest content');
    (fs.readdirSync as jest.Mock).mockReturnValue(['threat_model_report.md']);
    (fs.statSync as jest.Mock).mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
      birthtime: new Date('2024-01-01'),
    });
    
    // Mock findAgentRunPath by mocking fs.existsSync for agent-run.js
    (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
      if (path.includes('agent-run.js')) {
        return true; // Simulate agent-run.js found
      }
      return true; // Default to true for other paths
    });
  });
  
  afterEach(() => {
    // Restore console methods
    jest.restoreAllMocks();
  });

  describe('POST /api/threat-modeling', () => {
    it('should create a threat modeling job with repoPath', async () => {
      const mockJob = {
        id: 'test-job-id',
        user_id: 1,
        repo_path: '/path/to/repo',
        query: 'Test query',
        status: 'pending',
        repo_name: null,
        git_branch: null,
        git_commit: null,
        created_at: new Date().toISOString(),
      };
      
      ThreatModelingJobModel.create.mockReturnValue(mockJob);

      const response = await request(app)
        .post('/api/threat-modeling')
        .send({
          repoPath: '/path/to/repo',
          query: 'Test query',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Threat modeling job created');
      expect(response.body.jobId).toBe('test-job-id');
      // Query is optional - should use provided query or default
      expect(ThreatModelingJobModel.create).toHaveBeenCalledWith(1, '/path/to/repo', 'Test query', null, null, null);
    });

    it('should create a threat modeling job without query (query loaded from YAML)', async () => {
      const mockJob = {
        id: 'test-job-id',
        user_id: 1,
        repo_path: '/path/to/repo',
        query: 'Perform threat modeling analysis',
        status: 'pending',
        repo_name: null,
        git_branch: null,
        git_commit: null,
        created_at: new Date().toISOString(),
      };
      
      ThreatModelingJobModel.create.mockReturnValue(mockJob);

      const response = await request(app)
        .post('/api/threat-modeling')
        .send({
          repoPath: '/path/to/repo',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      // Query is optional - when not provided, it's undefined (defaults handled in model or route)
      expect(ThreatModelingJobModel.create).toHaveBeenCalledWith(
        1, 
        '/path/to/repo', 
        undefined, 
        null, 
        null, 
        null
      );
    });

    it('should return 400 if neither repoPath nor file is provided', async () => {
      const response = await request(app)
        .post('/api/threat-modeling')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Repository ZIP file upload or repository path required');
    });

    it('should handle file upload', async () => {
      const mockJob = {
        id: 'test-job-id',
        user_id: 1,
        repo_path: '[UPLOADED] test.zip',
        query: 'Test query',
        status: 'pending',
        repo_name: null,
        git_branch: null,
        git_commit: null,
        created_at: new Date().toISOString(),
      };
      
      ThreatModelingJobModel.create.mockReturnValue(mockJob);
      (fs.readdirSync as jest.Mock).mockReturnValue(['file1.ts', 'file2.ts']);

      const response = await request(app)
        .post('/api/threat-modeling')
        .set('x-test-file-upload', 'true')
        .send({
          query: 'Test query',
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Threat modeling job created');
      // Query is optional - can be provided for database storage, but CLI uses YAML config
    }, 10000); // Increase timeout for this test

    it('should not rename backend/src directory (removed behavior)', async () => {
      const mockJob = {
        id: 'test-job-id',
        user_id: 1,
        repo_path: '/path/to/repo',
        query: 'Test query',
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      
      ThreatModelingJobModel.create.mockReturnValue(mockJob);

      await request(app)
        .post('/api/threat-modeling')
        .send({
          repoPath: '/path/to/repo',
          query: 'Test query',
        });

      // Verify that renameSync was NOT called for src directory
      expect(fs.renameSync).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/threat-modeling/jobs', () => {
    it('should return list of jobs for authenticated user', async () => {
      const mockJobs = [
        {
          id: 'job1',
          user_id: 1,
          repo_path: '/path/to/repo1',
          query: 'Query 1',
          status: 'completed',
          report_path: '/reports/job1/threat_model.md',
          data_flow_diagram_path: '/reports/job1/data_flow.txt',
          threat_model_path: '/reports/job1/threat_model.md',
          risk_registry_path: '/reports/job1/risk_registry.md',
          error_message: null,
          repo_name: 'repo1',
          git_branch: 'main',
          git_commit: 'abc123',
          execution_duration: 120,
          api_cost: '$1.50',
          created_at: new Date('2024-01-01').toISOString(),
          updated_at: new Date('2024-01-02').toISOString(),
          completed_at: new Date('2024-01-02').toISOString(),
        },
        {
          id: 'job2',
          user_id: 1,
          repo_path: '/path/to/repo2',
          query: 'Query 2',
          status: 'processing',
          report_path: null,
          data_flow_diagram_path: null,
          threat_model_path: null,
          risk_registry_path: null,
          error_message: null,
          repo_name: null,
          git_branch: null,
          git_commit: null,
          execution_duration: null,
          api_cost: null,
          created_at: new Date('2024-01-03').toISOString(),
          updated_at: new Date('2024-01-03').toISOString(),
          completed_at: null,
        },
      ];
      
      ThreatModelingJobModel.findByUserId.mockReturnValue(mockJobs);

      const response = await request(app)
        .get('/api/threat-modeling/jobs');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.jobs).toBeDefined();
      expect(Array.isArray(response.body.jobs)).toBe(true);
      expect(response.body.jobs.length).toBe(2);
      expect(response.body.jobs[0]).toHaveProperty('id');
      expect(response.body.jobs[0]).toHaveProperty('status');
      expect(response.body.jobs[0]).toHaveProperty('repoPath');
    });

    it('should return empty array if user has no jobs', async () => {
      ThreatModelingJobModel.findByUserId.mockReturnValue([]);

      const response = await request(app)
        .get('/api/threat-modeling/jobs');

      expect(response.status).toBe(200);
      expect(response.body.jobs).toEqual([]);
    });
  });

  describe('GET /api/threat-modeling/jobs/:id', () => {
    it('should return a specific job by ID', async () => {
      const mockJob = {
        id: 'job1',
        user_id: 1,
        repo_path: '/path/to/repo',
        query: 'Test query',
        status: 'completed',
        report_path: '/reports/job1/threat_model.md',
        data_flow_diagram_path: '/reports/job1/data_flow.txt',
        threat_model_path: '/reports/job1/threat_model.md',
        risk_registry_path: '/reports/job1/risk_registry.md',
        error_message: null,
        repo_name: 'test-repo',
        git_branch: 'main',
        git_commit: 'abc123',
        execution_duration: 120,
        api_cost: '$1.50',
        created_at: new Date('2024-01-01').toISOString(),
        updated_at: new Date('2024-01-02').toISOString(),
        completed_at: new Date('2024-01-02').toISOString(),
      };
      
      ThreatModelingJobModel.findById.mockReturnValue(mockJob);
      (fs.readFileSync as jest.Mock).mockReturnValue('# Threat Model Report\n\nContent');

      const response = await request(app)
        .get('/api/threat-modeling/jobs/job1');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.job).toBeDefined();
      expect(response.body.job.id).toBe('job1');
      expect(response.body.job.status).toBe('completed');
      expect(response.body.job.threatModelContent).toBeDefined();
    });

    it('should return 403 if job belongs to different user', async () => {
      const mockJob = {
        id: 'job1',
        user_id: 2, // Different user
        repo_path: '/path/to/repo',
        query: 'Test query',
        status: 'completed',
        report_path: null,
        data_flow_diagram_path: null,
        threat_model_path: null,
        risk_registry_path: null,
        error_message: null,
        repo_name: null,
        git_branch: null,
        git_commit: null,
        execution_duration: null,
        api_cost: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };
      
      ThreatModelingJobModel.findById.mockReturnValue(mockJob);

      const response = await request(app)
        .get('/api/threat-modeling/jobs/job1');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });

    it('should return 404 if job not found', async () => {
      ThreatModelingJobModel.findById.mockImplementation(() => {
        throw new Error('Job not found');
      });

      const response = await request(app)
        .get('/api/threat-modeling/jobs/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Job not found');
    });
  });

  describe('DELETE /api/threat-modeling/jobs/:id', () => {
    it('should delete a job and its report files', async () => {
      const mockJob = {
        id: 'job1',
        user_id: 1,
        repo_path: '/path/to/repo',
        query: 'Test query',
        status: 'completed',
        report_path: null,
        data_flow_diagram_path: null,
        threat_model_path: null,
        risk_registry_path: null,
        error_message: null,
        repo_name: null,
        git_branch: null,
        git_commit: null,
        execution_duration: null,
        api_cost: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };
      
      ThreatModelingJobModel.findById.mockReturnValue(mockJob);
      ThreatModelingJobModel.delete.mockReturnValue(undefined);
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.rmSync as jest.Mock).mockReturnValue(undefined);

      const response = await request(app)
        .delete('/api/threat-modeling/jobs/job1');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Job deleted successfully');
      expect(ThreatModelingJobModel.delete).toHaveBeenCalledWith('job1');
      // Verify report directory deletion was attempted
      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.rmSync).toHaveBeenCalled();
    });

    it('should delete a job even if report directory does not exist', async () => {
      const mockJob = {
        id: 'job1',
        user_id: 1,
        repo_path: '/path/to/repo',
        query: 'Test query',
        status: 'pending',
        report_path: null,
        data_flow_diagram_path: null,
        threat_model_path: null,
        risk_registry_path: null,
        error_message: null,
        repo_name: null,
        git_branch: null,
        git_commit: null,
        execution_duration: null,
        api_cost: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };
      
      ThreatModelingJobModel.findById.mockReturnValue(mockJob);
      ThreatModelingJobModel.delete.mockReturnValue(undefined);
      (fs.existsSync as jest.Mock).mockReturnValue(false); // Report directory doesn't exist

      const response = await request(app)
        .delete('/api/threat-modeling/jobs/job1');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(ThreatModelingJobModel.delete).toHaveBeenCalledWith('job1');
      // Should not attempt to delete if directory doesn't exist
      expect(fs.rmSync).not.toHaveBeenCalled();
    });

    it('should return 403 if job belongs to different user', async () => {
      const mockJob = {
        id: 'job1',
        user_id: 2, // Different user
        repo_path: '/path/to/repo',
        query: 'Test query',
        status: 'completed',
        report_path: null,
        data_flow_diagram_path: null,
        threat_model_path: null,
        risk_registry_path: null,
        error_message: null,
        repo_name: null,
        git_branch: null,
        git_commit: null,
        execution_duration: null,
        api_cost: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };
      
      ThreatModelingJobModel.findById.mockReturnValue(mockJob);

      const response = await request(app)
        .delete('/api/threat-modeling/jobs/job1');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Access denied');
    });

    it('should return 404 if job not found', async () => {
      ThreatModelingJobModel.findById.mockImplementation(() => {
        throw new Error('Job not found');
      });

      const response = await request(app)
        .delete('/api/threat-modeling/jobs/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Job not found');
    });
  });

  describe('GET /api/threat-modeling/reports', () => {
    it('should return list of completed jobs with reports', async () => {
      const mockJobs = [
        {
          id: 'job1',
          user_id: 1,
          repo_path: '/path/to/repo1',
          query: 'Query 1',
          status: 'completed',
          report_path: '/reports/job1/threat_model.md',
          data_flow_diagram_path: '/reports/job1/data_flow.txt',
          threat_model_path: '/reports/job1/threat_model.md',
          risk_registry_path: '/reports/job1/risk_registry.md',
          error_message: null,
          repo_name: 'repo1',
          git_branch: 'main',
          git_commit: 'abc123',
          execution_duration: 120,
          api_cost: '$1.50',
          created_at: new Date('2024-01-01').toISOString(),
          updated_at: new Date('2024-01-02').toISOString(),
          completed_at: new Date('2024-01-02').toISOString(),
        },
        {
          id: 'job2',
          user_id: 1,
          repo_path: '/path/to/repo2',
          query: 'Query 2',
          status: 'processing',
          report_path: null,
          data_flow_diagram_path: null,
          threat_model_path: null,
          risk_registry_path: null,
          error_message: null,
          repo_name: null,
          git_branch: null,
          git_commit: null,
          execution_duration: null,
          api_cost: null,
          created_at: new Date('2024-01-03').toISOString(),
          updated_at: new Date('2024-01-03').toISOString(),
          completed_at: null,
        },
      ];
      
      ThreatModelingJobModel.findByUserId.mockReturnValue(mockJobs);

      const response = await request(app)
        .get('/api/threat-modeling/reports');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.reports).toBeDefined();
      expect(Array.isArray(response.body.reports)).toBe(true);
      expect(response.body.reports.length).toBe(1); // Only completed jobs
      expect(response.body.reports[0]).toHaveProperty('id');
      expect(response.body.reports[0]).toHaveProperty('repoPath');
      expect(response.body.reports[0]).toHaveProperty('reportPath');
    });
  });
});

