/**
 * Integration tests for state management
 * Tests session state persistence, agent tracking, locks, and checkpoints
 * @see SPEC-v2 Section 7
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('State Management Integration', () => {
  let stateManager: MockStateManager;

  beforeEach(() => {
    stateManager = new MockStateManager();
  });

  afterEach(() => {
    stateManager.clear();
  });

  describe('Session State Persistence', () => {
    it('stores and retrieves session state', async () => {
      // Arrange
      await stateManager.set('session.user', { id: '123', name: 'test' });
      await stateManager.set('session.batch_count', 5);

      // Act
      const user = await stateManager.get('session.user');
      const count = await stateManager.get('session.batch_count');

      // Assert
      expect(user).toEqual({ id: '123', name: 'test' });
      expect(count).toBe(5);
    });

    it('persists state across sessions', async () => {
      // Arrange
      await stateManager.set('persistent.config', { mode: 'production' }, {
        persist: true,
      });

      // Simulate session restart
      await stateManager.save();
      const newManager = new MockStateManager();
      await newManager.load();

      // Act
      const config = await newManager.get('persistent.config');

      // Assert
      expect(config).toEqual({ mode: 'production' });
    });

    it('supports nested state keys', async () => {
      // Arrange
      await stateManager.set('app.features.darkMode', true);
      await stateManager.set('app.features.notifications', false);
      await stateManager.set('app.version', '1.0.0');

      // Act
      const darkMode = await stateManager.get('app.features.darkMode');
      const version = await stateManager.get('app.version');

      // Assert
      expect(darkMode).toBe(true);
      expect(version).toBe('1.0.0');
    });

    it('merges state when merge option is true', async () => {
      // Arrange
      await stateManager.set('config', { a: 1, b: 2 });

      // Act
      await stateManager.set('config', { b: 3, c: 4 }, { merge: true });
      const result = await stateManager.get('config');

      // Assert
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('replaces state when merge option is false', async () => {
      // Arrange
      await stateManager.set('config', { a: 1, b: 2 });

      // Act
      await stateManager.set('config', { c: 3 }, { merge: false });
      const result = await stateManager.get('config');

      // Assert
      expect(result).toEqual({ c: 3 });
    });

    it('deletes state keys', async () => {
      // Arrange
      await stateManager.set('temp.data', 'value');
      expect(await stateManager.get('temp.data')).toBe('value');

      // Act
      await stateManager.delete('temp.data');

      // Assert
      expect(await stateManager.get('temp.data')).toBeUndefined();
    });

    it('lists keys with prefix filter', async () => {
      // Arrange
      await stateManager.set('batch.001.status', 'running');
      await stateManager.set('batch.002.status', 'complete');
      await stateManager.set('batch.003.status', 'failed');
      await stateManager.set('session.user', 'test');

      // Act
      const batchKeys = await stateManager.list('batch.');

      // Assert
      expect(batchKeys).toHaveLength(3);
      expect(batchKeys).toContain('batch.001.status');
      expect(batchKeys).toContain('batch.002.status');
      expect(batchKeys).toContain('batch.003.status');
      expect(batchKeys).not.toContain('session.user');
    });
  });

  describe('Agent Tracking', () => {
    it('tracks agent spawning', async () => {
      // Arrange
      const agentInfo = {
        id: 'agent-001',
        name: 'engineer',
        batch_id: 'batch-001',
        task: 'Implement feature',
        status: 'spawned',
        spawned_at: new Date().toISOString(),
      };

      // Act
      await stateManager.trackAgent(agentInfo);
      const tracked = await stateManager.getAgent('agent-001');

      // Assert
      expect(tracked).toEqual(agentInfo);
    });

    it('updates agent status', async () => {
      // Arrange
      await stateManager.trackAgent({
        id: 'agent-002',
        name: 'tester',
        batch_id: 'batch-002',
        task: 'Write tests',
        status: 'spawned',
        spawned_at: new Date().toISOString(),
      });

      // Act
      await stateManager.updateAgentStatus('agent-002', 'running');
      await stateManager.updateAgentStatus('agent-002', 'completed');

      // Assert
      const agent = await stateManager.getAgent('agent-002');
      expect(agent.status).toBe('completed');
      expect(agent.completed_at).toBeDefined();
    });

    it('tracks agent results', async () => {
      // Arrange
      await stateManager.trackAgent({
        id: 'agent-003',
        name: 'deployer',
        batch_id: 'batch-003',
        task: 'Deploy app',
        status: 'spawned',
        spawned_at: new Date().toISOString(),
      });

      // Act
      await stateManager.updateAgentResult('agent-003', {
        success: true,
        files_changed: 5,
        tests_passed: true,
      });

      // Assert
      const agent = await stateManager.getAgent('agent-003');
      expect(agent.result).toEqual({
        success: true,
        files_changed: 5,
        tests_passed: true,
      });
    });

    it('lists agents by batch', async () => {
      // Arrange
      await stateManager.trackAgent({
        id: 'agent-004',
        name: 'engineer',
        batch_id: 'batch-004',
        task: 'Task 1',
        status: 'running',
        spawned_at: new Date().toISOString(),
      });
      await stateManager.trackAgent({
        id: 'agent-005',
        name: 'tester',
        batch_id: 'batch-004',
        task: 'Task 2',
        status: 'running',
        spawned_at: new Date().toISOString(),
      });
      await stateManager.trackAgent({
        id: 'agent-006',
        name: 'deployer',
        batch_id: 'batch-005',
        task: 'Task 3',
        status: 'running',
        spawned_at: new Date().toISOString(),
      });

      // Act
      const batch4Agents = await stateManager.listAgentsByBatch('batch-004');

      // Assert
      expect(batch4Agents).toHaveLength(2);
      expect(batch4Agents.map((a) => a.id)).toContain('agent-004');
      expect(batch4Agents.map((a) => a.id)).toContain('agent-005');
    });

    it('counts active agents', async () => {
      // Arrange
      await stateManager.trackAgent({
        id: 'agent-007',
        name: 'engineer',
        batch_id: 'batch-006',
        task: 'Task 1',
        status: 'running',
        spawned_at: new Date().toISOString(),
      });
      await stateManager.trackAgent({
        id: 'agent-008',
        name: 'tester',
        batch_id: 'batch-006',
        task: 'Task 2',
        status: 'running',
        spawned_at: new Date().toISOString(),
      });
      await stateManager.trackAgent({
        id: 'agent-009',
        name: 'deployer',
        batch_id: 'batch-006',
        task: 'Task 3',
        status: 'completed',
        spawned_at: new Date().toISOString(),
      });

      // Act
      const activeCount = await stateManager.countActiveAgents();

      // Assert
      expect(activeCount).toBe(2);
    });
  });

  describe('Lock Management', () => {
    it('acquires and releases locks', async () => {
      // Arrange
      const resource = 'file://src/main.ts';

      // Act: Acquire lock
      const acquired = await stateManager.acquireLock(resource, 'batch-001');

      // Assert
      expect(acquired).toBe(true);
      expect(await stateManager.isLocked(resource)).toBe(true);

      // Act: Release lock
      const released = await stateManager.releaseLock(resource, 'batch-001');

      // Assert
      expect(released).toBe(true);
      expect(await stateManager.isLocked(resource)).toBe(false);
    });

    it('prevents concurrent access to locked resources', async () => {
      // Arrange
      const resource = 'file://src/config.ts';
      await stateManager.acquireLock(resource, 'batch-001');

      // Act: Try to acquire same lock from different batch
      const acquired = await stateManager.acquireLock(resource, 'batch-002');

      // Assert
      expect(acquired).toBe(false);
    });

    it('supports lock timeouts', async () => {
      // Arrange
      const resource = 'file://src/utils.ts';
      await stateManager.acquireLock(resource, 'batch-001', { timeout_ms: 100 });

      // Act: Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Assert: Lock should be auto-released
      const canAcquire = await stateManager.acquireLock(resource, 'batch-002');
      expect(canAcquire).toBe(true);
    });

    it('lists all active locks', async () => {
      // Arrange
      await stateManager.acquireLock('file://file1.ts', 'batch-001');
      await stateManager.acquireLock('file://file2.ts', 'batch-001');
      await stateManager.acquireLock('file://file3.ts', 'batch-002');

      // Act
      const locks = await stateManager.listLocks();

      // Assert
      expect(locks).toHaveLength(3);
      expect(locks.map((l) => l.resource)).toContain('file://file1.ts');
      expect(locks.map((l) => l.resource)).toContain('file://file2.ts');
      expect(locks.map((l) => l.resource)).toContain('file://file3.ts');
    });

    it('lists locks by owner', async () => {
      // Arrange
      await stateManager.acquireLock('file://file1.ts', 'batch-001');
      await stateManager.acquireLock('file://file2.ts', 'batch-001');
      await stateManager.acquireLock('file://file3.ts', 'batch-002');

      // Act
      const batch1Locks = await stateManager.listLocksByOwner('batch-001');

      // Assert
      expect(batch1Locks).toHaveLength(2);
      expect(batch1Locks.map((l) => l.resource)).toContain('file://file1.ts');
      expect(batch1Locks.map((l) => l.resource)).toContain('file://file2.ts');
    });

    it('releases all locks for owner', async () => {
      // Arrange
      await stateManager.acquireLock('file://file1.ts', 'batch-001');
      await stateManager.acquireLock('file://file2.ts', 'batch-001');
      await stateManager.acquireLock('file://file3.ts', 'batch-002');

      // Act
      const released = await stateManager.releaseAllLocks('batch-001');

      // Assert
      expect(released).toBe(2);
      expect(await stateManager.isLocked('file://file1.ts')).toBe(false);
      expect(await stateManager.isLocked('file://file2.ts')).toBe(false);
      expect(await stateManager.isLocked('file://file3.ts')).toBe(true);
    });
  });

  describe('Checkpoint State Management', () => {
    it('stores checkpoint metadata in state', async () => {
      // Arrange
      const checkpointMeta = {
        id: 'cp_20240101_120000',
        batch_id: 'batch-001',
        created_at: new Date().toISOString(),
        files_count: 5,
        size_bytes: 10240,
      };

      // Act
      await stateManager.set(`checkpoint.${checkpointMeta.id}`, checkpointMeta, {
        persist: true,
      });

      // Assert
      const retrieved = await stateManager.get(`checkpoint.${checkpointMeta.id}`);
      expect(retrieved).toEqual(checkpointMeta);
    });

    it('tracks active checkpoint for batch', async () => {
      // Arrange
      const batchId = 'batch-007';
      const checkpointId = 'cp_20240101_120000';

      // Act
      await stateManager.set(`batch.${batchId}.checkpoint`, checkpointId);
      const activeCheckpoint = await stateManager.get(`batch.${batchId}.checkpoint`);

      // Assert
      expect(activeCheckpoint).toBe(checkpointId);
    });

    it('clears checkpoint reference after restore', async () => {
      // Arrange
      const batchId = 'batch-008';
      const checkpointId = 'cp_20240101_130000';
      await stateManager.set(`batch.${batchId}.checkpoint`, checkpointId);

      // Act: Simulate restore
      await stateManager.delete(`batch.${batchId}.checkpoint`);

      // Assert
      const checkpoint = await stateManager.get(`batch.${batchId}.checkpoint`);
      expect(checkpoint).toBeUndefined();
    });
  });

  describe('Batch State Tracking', () => {
    it('tracks batch execution progress', async () => {
      // Arrange
      const batchId = 'batch-009';
      await stateManager.set(`batch.${batchId}.status`, 'running');
      await stateManager.set(`batch.${batchId}.total_operations`, 10);
      await stateManager.set(`batch.${batchId}.completed_operations`, 0);

      // Act: Update progress
      for (let i = 1; i <= 10; i++) {
        await stateManager.set(`batch.${batchId}.completed_operations`, i);
      }

      // Assert
      const completed = await stateManager.get(`batch.${batchId}.completed_operations`);
      expect(completed).toBe(10);
    });

    it('stores batch configuration', async () => {
      // Arrange
      const batchId = 'batch-010';
      const config = {
        mode: 'atomic',
        timeout_ms: 30000,
        retry_attempts: 3,
      };

      // Act
      await stateManager.set(`batch.${batchId}.config`, config);

      // Assert
      const retrieved = await stateManager.get(`batch.${batchId}.config`);
      expect(retrieved).toEqual(config);
    });

    it('records batch start and end times', async () => {
      // Arrange
      const batchId = 'batch-011';
      const startTime = new Date().toISOString();

      // Act
      await stateManager.set(`batch.${batchId}.started_at`, startTime);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const endTime = new Date().toISOString();
      await stateManager.set(`batch.${batchId}.completed_at`, endTime);

      // Assert
      const start = await stateManager.get(`batch.${batchId}.started_at`);
      const end = await stateManager.get(`batch.${batchId}.completed_at`);
      expect(new Date(end).getTime()).toBeGreaterThan(new Date(start).getTime());
    });
  });
});

// ============================================================================
// Mock Implementations
// ============================================================================

interface SetOptions {
  merge?: boolean;
  persist?: boolean;
}

interface LockOptions {
  timeout_ms?: number;
}

interface Lock {
  resource: string;
  owner: string;
  acquired_at: string;
  expires_at?: string;
}

interface AgentInfo {
  id: string;
  name: string;
  batch_id: string;
  task: string;
  status: 'spawned' | 'running' | 'completed' | 'failed';
  spawned_at: string;
  completed_at?: string;
  result?: any;
}

class MockStateManager {
  private state: Map<string, any> = new Map();
  private persistentState: Map<string, any> = new Map();
  private locks: Map<string, Lock> = new Map();
  private agents: Map<string, AgentInfo> = new Map();
  private static globalPersistentState: Map<string, any> = new Map();

  async get(key: string): Promise<any> {
    return this.state.get(key) || this.persistentState.get(key);
  }

  async set(key: string, value: any, options?: SetOptions): Promise<void> {
    if (options?.merge && this.state.has(key)) {
      const existing = this.state.get(key);
      if (typeof existing === 'object' && typeof value === 'object') {
        value = { ...existing, ...value };
      }
    }

    if (options?.persist) {
      this.persistentState.set(key, value);
    } else {
      this.state.set(key, value);
    }
  }

  async delete(key: string): Promise<void> {
    this.state.delete(key);
    this.persistentState.delete(key);
  }

  async list(prefix?: string): Promise<string[]> {
    const allKeys = [
      ...Array.from(this.state.keys()),
      ...Array.from(this.persistentState.keys()),
    ];

    if (prefix) {
      return allKeys.filter((key) => key.startsWith(prefix));
    }

    return allKeys;
  }

  async save(): Promise<void> {
    // Simulate persisting to disk by copying to global store
    this.persistentState.forEach((value, key) => {
      MockStateManager.globalPersistentState.set(key, value);
    });
  }

  async load(): Promise<void> {
    // Simulate loading from disk by copying from global store
    MockStateManager.globalPersistentState.forEach((value, key) => {
      this.persistentState.set(key, value);
    });
  }

  async trackAgent(info: AgentInfo): Promise<void> {
    this.agents.set(info.id, info);
  }

  async getAgent(id: string): Promise<AgentInfo> {
    return this.agents.get(id)!;
  }

  async updateAgentStatus(
    id: string,
    status: AgentInfo['status']
  ): Promise<void> {
    const agent = this.agents.get(id);
    if (agent) {
      agent.status = status;
      if (status === 'completed' || status === 'failed') {
        agent.completed_at = new Date().toISOString();
      }
    }
  }

  async updateAgentResult(id: string, result: any): Promise<void> {
    const agent = this.agents.get(id);
    if (agent) {
      agent.result = result;
    }
  }

  async listAgentsByBatch(batchId: string): Promise<AgentInfo[]> {
    return Array.from(this.agents.values()).filter(
      (agent) => agent.batch_id === batchId
    );
  }

  async countActiveAgents(): Promise<number> {
    return Array.from(this.agents.values()).filter(
      (agent) => agent.status === 'running' || agent.status === 'spawned'
    ).length;
  }

  async acquireLock(
    resource: string,
    owner: string,
    options?: LockOptions
  ): Promise<boolean> {
    // Check for expired locks
    if (this.locks.has(resource)) {
      const lock = this.locks.get(resource)!;
      if (lock.expires_at && new Date(lock.expires_at) < new Date()) {
        this.locks.delete(resource);
      } else {
        return false; // Already locked
      }
    }

    const lock: Lock = {
      resource,
      owner,
      acquired_at: new Date().toISOString(),
    };

    if (options?.timeout_ms) {
      const expiresAt = new Date();
      expiresAt.setMilliseconds(expiresAt.getMilliseconds() + options.timeout_ms);
      lock.expires_at = expiresAt.toISOString();
    }

    this.locks.set(resource, lock);
    return true;
  }

  async releaseLock(resource: string, owner: string): Promise<boolean> {
    const lock = this.locks.get(resource);
    if (lock && lock.owner === owner) {
      this.locks.delete(resource);
      return true;
    }
    return false;
  }

  async isLocked(resource: string): Promise<boolean> {
    if (!this.locks.has(resource)) return false;

    const lock = this.locks.get(resource)!;
    if (lock.expires_at && new Date(lock.expires_at) < new Date()) {
      this.locks.delete(resource);
      return false;
    }

    return true;
  }

  async listLocks(): Promise<Lock[]> {
    return Array.from(this.locks.values());
  }

  async listLocksByOwner(owner: string): Promise<Lock[]> {
    return Array.from(this.locks.values()).filter((lock) => lock.owner === owner);
  }

  async releaseAllLocks(owner: string): Promise<number> {
    let count = 0;
    for (const [resource, lock] of this.locks.entries()) {
      if (lock.owner === owner) {
        this.locks.delete(resource);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.state.clear();
    this.persistentState.clear();
    this.locks.clear();
    this.agents.clear();
  }
}
