/**
 * Tests for Threat Modeling Job Model
 * 
 * Author: Sam Li
 */

// Mock uuid before importing the module
let uuidCounter = 0;
jest.mock('uuid', () => ({
  v4: jest.fn(() => `test-uuid-v4-${++uuidCounter}`),
}));

import { ThreatModelingJobModel } from '../../models/threatModelingJob';
import { UserModel } from '../../models/user';
import db from '../../db/database';

describe('ThreatModelingJobModel', () => {
  let testUserId: number;
  let testJobId: string;

  beforeAll(async () => {
    // Create a test user
    const testUser = await UserModel.create('testuser', 'test@example.com', 'password123', true);
    testUserId = testUser.id;
  });

  beforeEach(() => {
    // Clean up jobs before each test
    const deleteStmt = db.prepare('DELETE FROM threat_modeling_jobs WHERE user_id = ?');
    deleteStmt.run(testUserId);
  });

  afterAll(() => {
    // Clean up test user and jobs
    const deleteJobsStmt = db.prepare('DELETE FROM threat_modeling_jobs WHERE user_id = ?');
    deleteJobsStmt.run(testUserId);
    const deleteUserStmt = db.prepare('DELETE FROM users WHERE id = ?');
    deleteUserStmt.run(testUserId);
  });

  describe('create', () => {
    it('should create a new threat modeling job', () => {
      const job = ThreatModelingJobModel.create(testUserId, '/path/to/repo', 'Test query');
      
      expect(job).toBeDefined();
      expect(job.user_id).toBe(testUserId);
      expect(job.repo_path).toBe('/path/to/repo');
      expect(job.query).toBe('Test query');
      expect(job.status).toBe('pending');
      expect(job.id).toBeDefined();
      expect(job.created_at).toBeDefined();
      
      testJobId = job.id;
    });

    it('should create a job without query', () => {
      const job = ThreatModelingJobModel.create(testUserId, '/path/to/repo');
      
      expect(job).toBeDefined();
      expect(job.query).toBeNull();
      expect(job.status).toBe('pending');
    });
  });

  describe('findById', () => {
    it('should find a job by id', () => {
      const createdJob = ThreatModelingJobModel.create(testUserId, '/path/to/repo', 'Test query');
      const foundJob = ThreatModelingJobModel.findById(createdJob.id);
      
      expect(foundJob).toBeDefined();
      expect(foundJob.id).toBe(createdJob.id);
      expect(foundJob.user_id).toBe(testUserId);
      expect(foundJob.repo_path).toBe('/path/to/repo');
      expect(foundJob.query).toBe('Test query');
    });

    it('should throw error if job not found', () => {
      expect(() => {
        ThreatModelingJobModel.findById('non-existent-id');
      }).toThrow('Job not found');
    });
  });

  describe('findByUserId', () => {
    it('should find all jobs for a user', () => {
      const job1 = ThreatModelingJobModel.create(testUserId, '/path/to/repo1', 'Query 1');
      const job2 = ThreatModelingJobModel.create(testUserId, '/path/to/repo2', 'Query 2');
      
      const jobs = ThreatModelingJobModel.findByUserId(testUserId);
      
      expect(jobs).toHaveLength(2);
      // Should contain both jobs (order may vary based on timing)
      const jobIds = jobs.map(j => j.id);
      const repoPaths = jobs.map(j => j.repo_path);
      expect(jobIds).toContain(job1.id);
      expect(jobIds).toContain(job2.id);
      expect(repoPaths).toContain('/path/to/repo1');
      expect(repoPaths).toContain('/path/to/repo2');
    });

    it('should respect limit parameter', () => {
      // Create 5 jobs
      for (let i = 0; i < 5; i++) {
        ThreatModelingJobModel.create(testUserId, `/path/to/repo${i}`, `Query ${i}`);
      }
      
      const jobs = ThreatModelingJobModel.findByUserId(testUserId, 3);
      
      expect(jobs).toHaveLength(3);
    });

    it('should return empty array if user has no jobs', () => {
      const jobs = ThreatModelingJobModel.findByUserId(testUserId);
      
      expect(jobs).toHaveLength(0);
    });
  });

  describe('updateStatus', () => {
    it('should update job status', () => {
      const job = ThreatModelingJobModel.create(testUserId, '/path/to/repo', 'Test query');
      
      const updatedJob = ThreatModelingJobModel.updateStatus(job.id, 'processing');
      
      expect(updatedJob.status).toBe('processing');
      expect(updatedJob.updated_at).toBeDefined();
    });

    it('should update report path', () => {
      const job = ThreatModelingJobModel.create(testUserId, '/path/to/repo', 'Test query');
      
      const updatedJob = ThreatModelingJobModel.updateStatus(
        job.id,
        'completed',
        '/path/to/report.md'
      );
      
      expect(updatedJob.status).toBe('completed');
      expect(updatedJob.report_path).toBe('/path/to/report.md');
      expect(updatedJob.completed_at).toBeDefined();
    });

    it('should update error message', () => {
      const job = ThreatModelingJobModel.create(testUserId, '/path/to/repo', 'Test query');
      
      const updatedJob = ThreatModelingJobModel.updateStatus(
        job.id,
        'failed',
        null,
        'Error occurred'
      );
      
      expect(updatedJob.status).toBe('failed');
      expect(updatedJob.error_message).toBe('Error occurred');
      expect(updatedJob.completed_at).toBeDefined();
    });

    it('should update all report paths', () => {
      const job = ThreatModelingJobModel.create(testUserId, '/path/to/repo', 'Test query');
      
      const updatedJob = ThreatModelingJobModel.updateStatus(
        job.id,
        'completed',
        '/path/to/report.md',
        null,
        '/path/to/dataflow.txt',
        '/path/to/threatmodel.txt',
        '/path/to/riskregistry.txt'
      );
      
      expect(updatedJob.status).toBe('completed');
      expect(updatedJob.report_path).toBe('/path/to/report.md');
      expect(updatedJob.data_flow_diagram_path).toBe('/path/to/dataflow.txt');
      expect(updatedJob.threat_model_path).toBe('/path/to/threatmodel.txt');
      expect(updatedJob.risk_registry_path).toBe('/path/to/riskregistry.txt');
    });

    it('should set completed_at when status is completed', () => {
      const job = ThreatModelingJobModel.create(testUserId, '/path/to/repo', 'Test query');
      
      const updatedJob = ThreatModelingJobModel.updateStatus(job.id, 'completed');
      
      expect(updatedJob.completed_at).toBeDefined();
    });

    it('should set completed_at when status is failed', () => {
      const job = ThreatModelingJobModel.create(testUserId, '/path/to/repo', 'Test query');
      
      const updatedJob = ThreatModelingJobModel.updateStatus(job.id, 'failed', null, 'Error');
      
      expect(updatedJob.completed_at).toBeDefined();
    });

    it('should not set completed_at when status is pending or processing', () => {
      const job = ThreatModelingJobModel.create(testUserId, '/path/to/repo', 'Test query');
      
      const updatedJob1 = ThreatModelingJobModel.updateStatus(job.id, 'pending');
      expect(updatedJob1.completed_at).toBeNull();
      
      const updatedJob2 = ThreatModelingJobModel.updateStatus(job.id, 'processing');
      expect(updatedJob2.completed_at).toBeNull();
    });
  });

  describe('updateReports', () => {
    it('should update all report paths and set status to completed', () => {
      const job = ThreatModelingJobModel.create(testUserId, '/path/to/repo', 'Test query');
      
      const updatedJob = ThreatModelingJobModel.updateReports(
        job.id,
        '/path/to/dataflow.txt',
        '/path/to/threatmodel.txt',
        '/path/to/riskregistry.txt'
      );
      
      expect(updatedJob.status).toBe('completed');
      expect(updatedJob.data_flow_diagram_path).toBe('/path/to/dataflow.txt');
      expect(updatedJob.threat_model_path).toBe('/path/to/threatmodel.txt');
      expect(updatedJob.risk_registry_path).toBe('/path/to/riskregistry.txt');
      expect(updatedJob.report_path).toBe('/path/to/threatmodel.txt'); // Should use threatModelPath
      expect(updatedJob.completed_at).toBeDefined();
    });

    it('should handle null report paths', () => {
      const job = ThreatModelingJobModel.create(testUserId, '/path/to/repo', 'Test query');
      
      const updatedJob = ThreatModelingJobModel.updateReports(
        job.id,
        null,
        null,
        null
      );
      
      expect(updatedJob.status).toBe('completed');
      expect(updatedJob.data_flow_diagram_path).toBeNull();
      expect(updatedJob.threat_model_path).toBeNull();
      expect(updatedJob.risk_registry_path).toBeNull();
    });
  });

  describe('updateErrorMessage', () => {
    it('should update error message and set status to failed', () => {
      const job = ThreatModelingJobModel.create(testUserId, '/path/to/repo', 'Test query');
      
      const updatedJob = ThreatModelingJobModel.updateErrorMessage(job.id, 'Test error message');
      
      expect(updatedJob.status).toBe('failed');
      expect(updatedJob.error_message).toBe('Test error message');
      expect(updatedJob.completed_at).toBeDefined();
    });
  });

  describe('delete', () => {
    it('should delete a job', () => {
      const job = ThreatModelingJobModel.create(testUserId, '/path/to/repo', 'Test query');
      const jobId = job.id;
      
      ThreatModelingJobModel.delete(jobId);
      
      expect(() => {
        ThreatModelingJobModel.findById(jobId);
      }).toThrow('Job not found');
    });
  });
});

