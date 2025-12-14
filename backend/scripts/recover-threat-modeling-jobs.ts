/**
 * Recovery script to restore threat modeling jobs from existing report files
 * 
 * This script scans the threat-modeling-reports directory and recreates
 * job records in the database for any reports that exist but don't have
 * corresponding database entries.
 */

import * as fs from 'fs';
import * as path from 'path';
import db from '../src/db/database';
import { UserModel } from '../src/models/user';

interface ReportFiles {
  dataFlowDiagram?: string;
  threatModel?: string;
  riskRegistry?: string;
}

function findReportFiles(jobDir: string): ReportFiles {
  const files = fs.readdirSync(jobDir);
  const reports: ReportFiles = {};

  for (const file of files) {
    const filePath = path.join(jobDir, file);
    if (file.includes('data_flow') || file.includes('dataflow')) {
      reports.dataFlowDiagram = filePath;
    } else if (file.includes('threat_model')) {
      reports.threatModel = filePath;
    } else if (file.includes('risk_registry')) {
      reports.riskRegistry = filePath;
    }
  }

  return reports;
}

function getJobCreatedDate(reports: ReportFiles): string {
  // Try to extract date from file modification time
  let earliestDate: Date | null = null;

  for (const filePath of Object.values(reports)) {
    if (filePath) {
      const stats = fs.statSync(filePath);
      if (!earliestDate || stats.birthtime < earliestDate) {
        earliestDate = stats.birthtime;
      }
    }
  }

  return earliestDate ? earliestDate.toISOString().replace('T', ' ').substring(0, 19) : new Date().toISOString().replace('T', ' ').substring(0, 19);
}

async function recoverJobs() {
  const reportsDir = path.join(process.cwd(), 'threat-modeling-reports');
  
  if (!fs.existsSync(reportsDir)) {
    console.log('❌ No threat-modeling-reports directory found');
    return;
  }

  // Get the admin user (or first user)
  const adminUser = UserModel.findByUsername('admin');
  if (!adminUser) {
    console.log('❌ Admin user not found. Please create a user first.');
    return;
  }

  console.log(`✅ Found admin user: ${adminUser.username} (ID: ${adminUser.id})`);

  const jobDirs = fs.readdirSync(reportsDir).filter(item => {
    const itemPath = path.join(reportsDir, item);
    return fs.statSync(itemPath).isDirectory();
  });

  console.log(`\n📁 Found ${jobDirs.length} job directories\n`);

  let recovered = 0;
  let skipped = 0;

  for (const jobId of jobDirs) {
    const jobDir = path.join(reportsDir, jobId);
    const reports = findReportFiles(jobDir);

    // Check if job already exists in database
    const existingJob = db.prepare('SELECT id FROM threat_modeling_jobs WHERE id = ?').get(jobId);
    
    if (existingJob) {
      console.log(`⏭️  Skipping ${jobId} - already exists in database`);
      skipped++;
      continue;
    }

    // Check if we have at least one report file
    if (!reports.dataFlowDiagram && !reports.threatModel && !reports.riskRegistry) {
      console.log(`⚠️  Skipping ${jobId} - no report files found`);
      skipped++;
      continue;
    }

    // Determine repo_path from the directory structure or use a placeholder
    // Since we don't have the original repo_path, we'll use the job ID as a placeholder
    const repoPath = `recovered/${jobId}`;
    const createdDate = getJobCreatedDate(reports);

    // Insert the job record
    const stmt = db.prepare(`
      INSERT INTO threat_modeling_jobs (
        id, user_id, repo_path, query, status,
        data_flow_diagram_path, threat_model_path, risk_registry_path,
        report_path, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Use threat_model_path as report_path for backward compatibility
    const reportPath = reports.threatModel || null;

    stmt.run(
      jobId,
      adminUser.id,
      repoPath,
      null, // query - we don't have the original query
      'completed',
      reports.dataFlowDiagram || null,
      reports.threatModel || null,
      reports.riskRegistry || null,
      reportPath,
      createdDate,
      createdDate,
      createdDate
    );

    console.log(`✅ Recovered job ${jobId}`);
    console.log(`   - Data Flow Diagram: ${reports.dataFlowDiagram ? '✓' : '✗'}`);
    console.log(`   - Threat Model: ${reports.threatModel ? '✓' : '✗'}`);
    console.log(`   - Risk Registry: ${reports.riskRegistry ? '✓' : '✗'}`);
    console.log(`   - Created: ${createdDate}\n`);
    
    recovered++;
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Recovered: ${recovered} jobs`);
  console.log(`   ⏭️  Skipped: ${skipped} jobs`);
}

// Run the recovery
recoverJobs()
  .then(() => {
    console.log('\n✅ Recovery completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Recovery failed:', error);
    process.exit(1);
  });

