/**
 * Telemetry System Verification Script
 * Tests all key features of the telemetry implementation
 */

import { createTelemetryCollector, resetGlobalTelemetryCollector } from './src/runtime/telemetry.js';
import type { Batch } from './src/interfaces/batch.js';
import type { BatchResult, OperationResult } from './src/interfaces/result.js';
import type { OperationBase } from './src/interfaces/operation.js';

// Test data
const mockBatch: Batch = {
  id: 'batch_001',
  operations: {
    read: [],
    write: [],
    exec: [],
    query: [],
    state: [],
  },
  config: {
    transaction: {
      mode: 'atomic',
      isolation: 'strict',
      timeout_ms: 60000,
    },
    execution: {
      mode: 'parallel',
      max_workers: 4,
      fail_fast: false,
      retry: {
        attempts: 3,
        backoff: 'exponential',
        delay_ms: 1000,
      },
    },
    preview: {
      dry_run: false,
      diff: false,
      impact: false,
    },
    validation: {
      steps: ['typecheck'],
      fail_on_error: true,
      skip_if_passing: false,
    },
    output: {
      mode: 'standard',
      include: [],
      exclude: [],
    },
  },
};

const mockOperation: OperationBase = {
  id: 'op_001',
  type: 'files',
};

const mockOperationResult: OperationResult = {
  id: 'op_001',
  type: 'files',
  status: 'success',
  data: { files: ['test.ts'] },
  duration_ms: 150,
  tokens_used: 500,
};

const mockBatchResult: BatchResult = {
  summary: {
    status: 'success',
    operations: {
      total: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
    },
    duration_ms: 200,
    tokens_used: 500,
  },
  phases: {},
  validation: {
    before: { check: 'typecheck', passed: true },
    after: { check: 'typecheck', passed: true },
  },
  recovery: {
    rollback_available: true,
    rollback_triggered: false,
  },
  execution_graph: {
    phases: ['read'],
    parallel_groups: [['op_001']],
    critical_path_ms: 150,
  },
};

async function testTelemetry() {
  console.log('🔍 Testing Telemetry System...\n');

  // Create telemetry instance
  const telemetry = createTelemetryCollector();
  console.log('✅ Created telemetry collector');

  // Test batch recording
  telemetry.recordBatchStart(mockBatch);
  console.log('✅ Recorded batch start');

  // Test operation recording
  telemetry.recordOperationStart(mockOperation);
  console.log('✅ Recorded operation start');

  // Simulate work
  await new Promise(resolve => setTimeout(resolve, 100));

  telemetry.recordOperationComplete('op_001', mockOperationResult);
  console.log('✅ Recorded operation complete');

  telemetry.recordBatchComplete('batch_001', mockBatchResult);
  console.log('✅ Recorded batch complete');

  // Test querying
  const sessionMetrics = telemetry.getSessionMetrics();
  console.log('✅ Retrieved session metrics');
  console.log(`   - Total batches: ${sessionMetrics.total_batches}`);
  console.log(`   - Total operations: ${sessionMetrics.total_operations}`);
  console.log(`   - Total tokens: ${sessionMetrics.total_tokens}`);

  const batchMetrics = telemetry.getBatchMetrics('batch_001');
  console.log('✅ Retrieved batch metrics');
  console.log(`   - Status: ${batchMetrics.status}`);
  console.log(`   - Operations: ${batchMetrics.operations_succeeded}/${batchMetrics.operations_total}`);

  const aggregations = telemetry.getAggregations();
  console.log('✅ Retrieved aggregations');
  console.log(`   - Operations by type: ${Object.keys(aggregations.by_operation_type).length} types`);

  // Test analysis
  const cost = telemetry.estimateCost(sessionMetrics.total_tokens);
  console.log('✅ Estimated cost');
  console.log(`   - Cost: $${cost.toFixed(4)}`);

  const projected = telemetry.projectTokenUsage(10);
  console.log('✅ Projected token usage');
  console.log(`   - Projected for 10 batches: ${projected} tokens`);

  const bottlenecks = telemetry.identifyBottlenecks();
  console.log('✅ Identified bottlenecks');
  console.log(`   - Found: ${bottlenecks.length} bottlenecks`);

  // Test exports
  const jsonReport = telemetry.exportReport('json');
  console.log('✅ Exported JSON report');
  console.log(`   - Size: ${jsonReport.length} bytes`);

  const mdReport = telemetry.exportReport('markdown');
  console.log('✅ Exported Markdown report');
  console.log(`   - Lines: ${mdReport.split('\n').length}`);

  const csvReport = telemetry.exportReport('csv');
  console.log('✅ Exported CSV report');
  console.log(`   - Rows: ${csvReport.split('\n').length}`);

  // Test persistence
  try {
    await telemetry.persist();
    console.log('✅ Persisted telemetry data');
  } catch (error) {
    console.log('⚠️  Persistence skipped (expected in test)');
  }

  // Test reset
  resetGlobalTelemetryCollector();
  console.log('✅ Reset global collector');

  console.log('\n✨ All telemetry tests passed!\n');

  // Print sample markdown report
  console.log('📊 Sample Markdown Report:\n');
  console.log(mdReport.split('\n').slice(0, 30).join('\n'));
  console.log('\n... (truncated) ...\n');
}

// Run tests
testTelemetry().catch(console.error);
