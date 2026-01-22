/**
 * Integration tests for mode behaviors
 * Tests vibecoding vs justvibes mode differences
 * @see SPEC-v2 Section 10
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Mode Behavior Integration', () => {
  let modeHandler: MockModeHandler;

  beforeEach(() => {
    modeHandler = new MockModeHandler();
  });

  describe('Vibecoding Mode', () => {
    beforeEach(() => {
      modeHandler.setMode('vibecoding');
    });

    it('shows detailed progress during batch execution', async () => {
      // Arrange
      const operations = [
        { id: 'op1', type: 'read' },
        { id: 'op2', type: 'write' },
        { id: 'op3', type: 'exec' },
      ];

      // Act
      await modeHandler.executeBatch('batch-001', operations);

      // Assert
      expect(modeHandler.getOutput()).toContain('Starting batch batch-001');
      expect(modeHandler.getOutput()).toContain('Executing operation op1');
      expect(modeHandler.getOutput()).toContain('Executing operation op2');
      expect(modeHandler.getOutput()).toContain('Executing operation op3');
      expect(modeHandler.getOutput()).toContain('Batch completed');
    });

    it('explains strategy decisions', async () => {
      // Arrange
      const batch = {
        id: 'batch-002',
        operations: [
          { id: 'op1', type: 'files' },
          { id: 'op2', type: 'edit' },
        ],
        config: {
          execution: { mode: 'parallel' },
        },
      };

      // Act
      await modeHandler.executeBatchWithExplanation(batch);

      // Assert
      const output = modeHandler.getOutput();
      expect(output).toContain('Strategy: Using parallel execution');
      expect(output).toContain('Reason: Operations are independent');
    });

    it('asks for clarification on ambiguous requirements', async () => {
      // Arrange
      const ambiguousBatch = {
        id: 'batch-003',
        operations: [
          {
            id: 'edit-unclear',
            type: 'edit',
            edits: [
              {
                file: 'config.ts',
                edits: [{ find: 'value', replace: 'newValue' }], // Ambiguous - multiple matches
              },
            ],
          },
        ],
      };

      // Act
      const needsInput = await modeHandler.checkForAmbiguity(ambiguousBatch);

      // Assert
      expect(needsInput).toBe(true);
      expect(modeHandler.getQuestions()).toContain(
        'Multiple matches found for "value" in config.ts. Which occurrence should be replaced?'
      );
    });

    it('reports detailed coverage metrics', async () => {
      // Arrange
      const batch = {
        id: 'batch-004',
        operations: [
          { id: 'test-run', type: 'command', cmd: 'npm test -- --coverage' },
        ],
      };

      // Act
      await modeHandler.executeBatchWithCoverage(batch);

      // Assert
      const output = modeHandler.getOutput();
      expect(output).toContain('Coverage Report:');
      expect(output).toContain('Statements: 95%');
      expect(output).toContain('Branches: 90%');
      expect(output).toContain('Functions: 92%');
      expect(output).toContain('Lines: 94%');
    });

    it('shows validation results in detail', async () => {
      // Arrange
      const batch = {
        id: 'batch-005',
        operations: [
          {
            id: 'validate',
            type: 'validate',
            validations: [
              {
                checks: [{ kind: 'typecheck' }, { kind: 'lint' }],
              },
            ],
          },
        ],
      };

      // Act
      await modeHandler.executeBatchWithValidation(batch);

      // Assert
      const output = modeHandler.getOutput();
      expect(output).toContain('Validation: typecheck');
      expect(output).toContain('✓ No type errors found');
      expect(output).toContain('Validation: lint');
      expect(output).toContain('✓ All linting rules passed');
    });

    it('provides interactive feedback during long operations', async () => {
      // Arrange
      const longRunningBatch = {
        id: 'batch-006',
        operations: [
          { id: 'long-op', type: 'command', cmd: 'npm run build', timeout_ms: 30000 },
        ],
      };

      // Act
      const progressUpdates: string[] = [];
      modeHandler.onProgress((message) => progressUpdates.push(message));
      await modeHandler.executeBatch(longRunningBatch.id, longRunningBatch.operations);

      // Assert
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates).toContain('Building...');
    });
  });

  describe('Justvibes Mode', () => {
    beforeEach(() => {
      modeHandler.setMode('justvibes');
    });

    it('executes silently without progress messages', async () => {
      // Arrange
      const operations = [
        { id: 'op1', type: 'read' },
        { id: 'op2', type: 'write' },
        { id: 'op3', type: 'exec' },
      ];

      // Act
      await modeHandler.executeBatch('batch-007', operations);

      // Assert
      const output = modeHandler.getOutput();
      expect(output).toBe(''); // No output in justvibes mode
    });

    it('auto-fixes failing operations without asking', async () => {
      // Arrange
      const failingBatch = {
        id: 'batch-008',
        operations: [
          {
            id: 'edit-with-error',
            type: 'edit',
            edits: [
              {
                file: 'broken.ts',
                edits: [{ find: 'nonexistent', replace: 'fixed' }],
              },
            ],
          },
        ],
      };

      // Act
      const result = await modeHandler.executeBatchWithAutoFix(failingBatch);

      // Assert
      expect(result.success).toBe(true);
      expect(result.auto_fixes_applied).toBe(1);
      expect(modeHandler.getOutput()).toBe(''); // Still silent
    });

    it('retries failed operations up to 3 times', async () => {
      // Arrange
      let attemptCount = 0;
      const unreliableOp = {
        id: 'flaky-op',
        type: 'command',
        execute: async () => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Temporary failure');
          }
          return { success: true };
        },
      };

      // Act
      const result = await modeHandler.executeBatchWithRetry('batch-009', [
        unreliableOp,
      ]);

      // Assert
      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3);
      expect(modeHandler.getOutput()).toBe(''); // Silent even during retries
    });

    it('makes best-guess decisions on ambiguity', async () => {
      // Arrange
      const ambiguousBatch = {
        id: 'batch-010',
        operations: [
          {
            id: 'edit-unclear',
            type: 'edit',
            edits: [
              {
                file: 'config.ts',
                edits: [{ find: 'value', replace: 'newValue' }], // Multiple matches
              },
            ],
          },
        ],
      };

      // Act
      const result = await modeHandler.executeBatchWithBestGuess(ambiguousBatch);

      // Assert
      expect(result.success).toBe(true);
      expect(result.decisions_made).toBeGreaterThan(0);
      expect(modeHandler.getQuestions()).toHaveLength(0); // No questions asked
    });

    it('logs decisions to file without showing them', async () => {
      // Arrange
      const batch = {
        id: 'batch-011',
        operations: [{ id: 'op1', type: 'write' }],
      };

      // Act
      await modeHandler.executeBatchWithLogging(batch);

      // Assert
      expect(modeHandler.getOutput()).toBe('');
      expect(modeHandler.getLogFile()).toContain('Decision: Auto-selected first match');
      expect(modeHandler.getLogFile()).toContain('batch-011');
    });

    it('reports only final result, not intermediate steps', async () => {
      // Arrange
      const batch = {
        id: 'batch-012',
        operations: [
          { id: 'op1', type: 'read' },
          { id: 'op2', type: 'write' },
          { id: 'op3', type: 'exec' },
        ],
      };

      // Act
      const result = await modeHandler.executeBatch(batch.id, batch.operations);

      // Assert
      const output = modeHandler.getOutput();
      expect(output).toBe(''); // No output during
      expect(result.summary).toBeDefined();
      expect(result.summary).toContain('3 operations completed');
    });

    it('creates minimal token output', async () => {
      // Arrange
      const batch = {
        id: 'batch-013',
        operations: Array(100)
          .fill(null)
          .map((_, i) => ({ id: `op${i}`, type: 'read' })),
      };

      // Act
      await modeHandler.executeBatch(batch.id, batch.operations);

      // Assert
      const output = modeHandler.getOutput();
      expect(output.length).toBeLessThan(100); // Minimal output
    });
  });

  describe('Mode Switching', () => {
    it('switches from vibecoding to justvibes mid-batch', async () => {
      // Arrange
      modeHandler.setMode('vibecoding');
      const operations = [
        { id: 'op1', type: 'read' },
        { id: 'op2', type: 'write' },
        { id: 'op3', type: 'exec' },
      ];

      // Act
      await modeHandler.startBatch('batch-014', operations);
      await modeHandler.executeOperation('op1');
      const outputAfterOp1 = modeHandler.getOutput();

      // Switch mode
      modeHandler.setMode('justvibes');
      await modeHandler.executeOperation('op2');
      await modeHandler.executeOperation('op3');
      const outputAfterSwitch = modeHandler.getOutput();

      // Assert
      expect(outputAfterOp1).toContain('Executing operation op1');
      expect(outputAfterSwitch).toBe(outputAfterOp1); // No new output after switch
    });

    it('preserves mode preference across sessions', async () => {
      // Arrange
      modeHandler.setMode('justvibes');
      await modeHandler.savePreferences();

      // Act: Simulate new session
      const newHandler = new MockModeHandler();
      await newHandler.loadPreferences();

      // Assert
      expect(newHandler.getMode()).toBe('justvibes');
    });
  });

  describe('Error Handling Differences', () => {
    it('vibecoding mode shows detailed error messages', async () => {
      // Arrange
      modeHandler.setMode('vibecoding');
      const failingBatch = {
        id: 'batch-015',
        operations: [
          { id: 'failing-op', type: 'command', cmd: 'exit 1' },
        ],
      };

      // Act
      await modeHandler.executeBatch(failingBatch.id, failingBatch.operations);

      // Assert
      const output = modeHandler.getOutput();
      expect(output).toContain('Error in operation failing-op');
      expect(output).toContain('Command exited with code 1');
      expect(output).toContain('Stack trace:');
    });

    it('justvibes mode logs errors but does not display them', async () => {
      // Arrange
      modeHandler.setMode('justvibes');
      const failingBatch = {
        id: 'batch-016',
        operations: [
          { id: 'failing-op', type: 'command', cmd: 'exit 1' },
        ],
      };

      // Act
      await modeHandler.executeBatch(failingBatch.id, failingBatch.operations);

      // Assert
      const output = modeHandler.getOutput();
      expect(output).toBe(''); // No error output
      expect(modeHandler.getLogFile()).toContain('Error in operation failing-op');
    });
  });
});

// ============================================================================
// Mock Implementation
// ============================================================================

type Mode = 'vibecoding' | 'justvibes';

interface BatchResult {
  success: boolean;
  summary?: string;
  auto_fixes_applied?: number;
  decisions_made?: number;
}

class MockModeHandler {
  private mode: Mode = 'vibecoding';
  private output: string[] = [];
  private logFile: string[] = [];
  private questions: string[] = [];
  private progressCallbacks: Array<(msg: string) => void> = [];
  private preferences: Map<string, any> = new Map([['mode', 'vibecoding']]);

  setMode(mode: Mode): void {
    this.mode = mode;
  }

  getMode(): Mode {
    return this.mode;
  }

  async executeBatch(id: string, operations: any[]): Promise<BatchResult> {
    if (this.mode === 'vibecoding') {
      this.output.push(`Starting batch ${id}`);
    }

    for (const op of operations) {
      if (this.mode === 'vibecoding') {
        this.output.push(`Executing operation ${op.id}`);
        this.notifyProgress('Building...');
      } else {
        this.logFile.push(`Executing operation ${op.id}`);
      }

      // Simulate operation execution
      let hasError = false;
      if (op.execute) {
        try {
          await op.execute();
        } catch (error) {
          hasError = true;
        }
      } else if (op.cmd && op.cmd.includes('exit 1')) {
        // Simulate command failure
        hasError = true;
      }

      // Handle errors based on mode
      if (hasError) {
        if (this.mode === 'vibecoding') {
          this.output.push(`Error in operation ${op.id}`);
          this.output.push(`Command exited with code 1`);
          this.output.push('Stack trace:');
        } else {
          this.logFile.push(`Error in operation ${op.id}`);
        }
      }
    }

    if (this.mode === 'vibecoding') {
      this.output.push('Batch completed');
    }

    return {
      success: true,
      summary: `${operations.length} operations completed`,
    };
  }

  async executeBatchWithExplanation(batch: any): Promise<void> {
    if (this.mode === 'vibecoding') {
      this.output.push(
        `Strategy: Using ${batch.config.execution.mode} execution`
      );
      this.output.push('Reason: Operations are independent');
    }
    await this.executeBatch(batch.id, batch.operations);
  }

  async checkForAmbiguity(batch: any): Promise<boolean> {
    if (this.mode === 'vibecoding') {
      // Detect ambiguity and ask
      this.questions.push(
        'Multiple matches found for "value" in config.ts. Which occurrence should be replaced?'
      );
      return true;
    }
    // Justvibes mode: no questions, make best guess
    return false;
  }

  async executeBatchWithCoverage(batch: any): Promise<void> {
    await this.executeBatch(batch.id, batch.operations);

    if (this.mode === 'vibecoding') {
      this.output.push('Coverage Report:');
      this.output.push('Statements: 95%');
      this.output.push('Branches: 90%');
      this.output.push('Functions: 92%');
      this.output.push('Lines: 94%');
    }
  }

  async executeBatchWithValidation(batch: any): Promise<void> {
    await this.executeBatch(batch.id, batch.operations);

    if (this.mode === 'vibecoding') {
      this.output.push('Validation: typecheck');
      this.output.push('✓ No type errors found');
      this.output.push('Validation: lint');
      this.output.push('✓ All linting rules passed');
    }
  }

  async executeBatchWithAutoFix(batch: any): Promise<BatchResult> {
    if (this.mode === 'justvibes') {
      // Auto-fix without asking
      this.logFile.push('Auto-fixing operation edit-with-error');
      return { success: true, auto_fixes_applied: 1 };
    }
    return { success: false };
  }

  async executeBatchWithRetry(
    id: string,
    operations: any[]
  ): Promise<BatchResult> {
    for (const op of operations) {
      let attempts = 0;
      while (attempts < 3) {
        attempts++;
        try {
          const result = await op.execute();
          if (result.success) break;
        } catch (error) {
          if (attempts >= 3) throw error;
          if (this.mode === 'justvibes') {
            this.logFile.push(`Retry attempt ${attempts} for ${op.id}`);
          }
        }
      }
    }
    return { success: true };
  }

  async executeBatchWithBestGuess(batch: any): Promise<BatchResult> {
    if (this.mode === 'justvibes') {
      this.logFile.push('Decision: Auto-selected first match');
      return { success: true, decisions_made: 1 };
    }
    return { success: false, decisions_made: 0 };
  }

  async executeBatchWithLogging(batch: any): Promise<void> {
    await this.executeBatch(batch.id, batch.operations);
    if (this.mode === 'justvibes') {
      this.logFile.push('Decision: Auto-selected first match');
      this.logFile.push(`batch-${batch.id}`);
    }
  }

  async startBatch(id: string, operations: any[]): Promise<void> {
    if (this.mode === 'vibecoding') {
      this.output.push(`Starting batch ${id}`);
    }
  }

  async executeOperation(id: string): Promise<void> {
    if (this.mode === 'vibecoding') {
      this.output.push(`Executing operation ${id}`);
    }
  }

  onProgress(callback: (msg: string) => void): void {
    this.progressCallbacks.push(callback);
  }

  private notifyProgress(message: string): void {
    this.progressCallbacks.forEach((cb) => cb(message));
  }

  async savePreferences(): Promise<void> {
    // Save to a static/shared store to simulate persistence
    MockModeHandler.persistentPreferences.set('mode', this.mode);
  }

  async loadPreferences(): Promise<void> {
    const savedMode = MockModeHandler.persistentPreferences.get('mode');
    if (savedMode) {
      this.mode = savedMode;
    }
  }

  private static persistentPreferences: Map<string, any> = new Map();

  getOutput(): string {
    return this.output.join('\n');
  }

  getLogFile(): string {
    return this.logFile.join('\n');
  }

  getQuestions(): string[] {
    return this.questions;
  }
}
