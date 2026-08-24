/**
 * Tests for Threat Review Model
 *
 * Author: Cline
 */

import { ThreatReviewModel } from '../../models/threatReview';
import { ThreatModelingJobModel } from '../../models/threatModelingJob';
import { UserModel } from '../../models/user';
import db from '../../db/database';

describe('ThreatReviewModel', () => {
  let testUserId: number;
  let testJobId: string;

  beforeAll(async () => {
    const testUser = await UserModel.create('reviewtest', 'review@example.com', 'password123', true);
    testUserId = testUser.id;
  });

  beforeEach(() => {
    // Clean up reviews + jobs before each test.
    const deleteReviews = db.prepare('DELETE FROM threat_reviews');
    deleteReviews.run();
    const deleteJobs = db.prepare('DELETE FROM threat_modeling_jobs WHERE user_id = ?');
    deleteJobs.run(testUserId);
    testJobId = ThreatModelingJobModel.create(testUserId, '/path/to/repo', 'query').id;
  });

  afterAll(() => {
    const deleteReviews = db.prepare('DELETE FROM threat_reviews');
    deleteReviews.run();
    const deleteJobsStmt = db.prepare('DELETE FROM threat_modeling_jobs WHERE user_id = ?');
    deleteJobsStmt.run(testUserId);
    const deleteUserStmt = db.prepare('DELETE FROM users WHERE id = ?');
    deleteUserStmt.run(testUserId);
  });

  describe('upsert', () => {
    it('should insert a new review row', () => {
      const review = ThreatReviewModel.upsert(testJobId, 'T-1', 'accepted', 'Looks good');

      expect(review.jobId).toBe(testJobId);
      expect(review.findingId).toBe('T-1');
      expect(review.status).toBe('accepted');
      expect(review.note).toBe('Looks good');
      expect(review.updatedAt).toBeDefined();
    });

    it('should update an existing review row on the same (job, finding) pair', () => {
      ThreatReviewModel.upsert(testJobId, 'T-1', 'accepted', 'first');
      const updated = ThreatReviewModel.upsert(testJobId, 'T-1', 'false_positive', 'not real');

      expect(updated.status).toBe('false_positive');
      expect(updated.note).toBe('not real');
    });

    it('should keep different findings distinct', () => {
      ThreatReviewModel.upsert(testJobId, 'T-1', 'accepted');
      ThreatReviewModel.upsert(testJobId, 'T-2', 'mitigated');

      const reviews = ThreatReviewModel.listForJob(testJobId);
      expect(Object.keys(reviews)).toHaveLength(2);
      expect(reviews['T-1'].status).toBe('accepted');
      expect(reviews['T-2'].status).toBe('mitigated');
    });
  });

  describe('listForJob', () => {
    it('should return an empty object when there are no reviews', () => {
      expect(ThreatReviewModel.listForJob(testJobId)).toEqual({});
    });

    it('should return reviews keyed by finding_id for a job', () => {
      ThreatReviewModel.upsert(testJobId, 'T-1', 'accepted');
      ThreatReviewModel.upsert(testJobId, 'T-2', 'needs_review');

      const reviews = ThreatReviewModel.listForJob(testJobId);
      expect(reviews['T-1'].status).toBe('accepted');
      expect(reviews['T-2'].status).toBe('needs_review');
    });
  });

  describe('deleteForJob', () => {
    it('should delete all review rows for a job', () => {
      ThreatReviewModel.upsert(testJobId, 'T-1', 'accepted');
      ThreatReviewModel.upsert(testJobId, 'T-2', 'mitigated');

      const changes = ThreatReviewModel.deleteForJob(testJobId);
      expect(changes).toBe(2);
      expect(ThreatReviewModel.listForJob(testJobId)).toEqual({});
    });
  });

  describe('job delete cascade', () => {
    it('should remove reviews when the job is deleted', () => {
      ThreatReviewModel.upsert(testJobId, 'T-1', 'accepted');

      ThreatModelingJobModel.delete(testJobId);

      // SELECT should return nothing for the deleted job.
      const row = db
        .prepare('SELECT * FROM threat_reviews WHERE job_id = ?')
        .get(testJobId);
      expect(row).toBeUndefined();
    });
  });
});
