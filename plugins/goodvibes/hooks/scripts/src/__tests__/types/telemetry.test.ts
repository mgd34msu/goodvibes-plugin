/**
 * Tests for types/telemetry.ts
 *
 * This file contains only TypeScript interface definitions.
 * These tests verify that all interfaces are properly exported
 * and can be used for type checking.
 */

import { describe, it, expect } from 'vitest';
import type {
  TelemetryEntry,
  TelemetryTracking,
} from '../../types/telemetry.js';

describe('types/telemetry', () => {
  describe('TelemetryEntry interface', () => {
    it('should accept valid TelemetryEntry with completed status', () => {
      const entry: TelemetryEntry = {
        event: 'subagent_complete',
        agent_id: 'agent-abc123',
        agent_type: 'test-engineer',
        session_id: 'session-xyz789',
        project: '/home/user/projects/my-app',
        project_name: 'my-app',
        started_at: '2025-01-15T10:00:00.000Z',
        ended_at: '2025-01-15T10:30:00.000Z',
        duration_ms: 1800000,
        status: 'completed',
        keywords: ['testing', 'vitest', 'coverage'],
        files_modified: ['src/utils.ts', 'src/utils.test.ts'],
        tools_used: ['Read', 'Write', 'Bash'],
        summary: 'Added unit tests for utility functions',
      };

      expect(entry.event).toBe('subagent_complete');
      expect(entry.agent_id).toBe('agent-abc123');
      expect(entry.agent_type).toBe('test-engineer');
      expect(entry.session_id).toBe('session-xyz789');
      expect(entry.project).toBe('/home/user/projects/my-app');
      expect(entry.project_name).toBe('my-app');
      expect(entry.started_at).toBe('2025-01-15T10:00:00.000Z');
      expect(entry.ended_at).toBe('2025-01-15T10:30:00.000Z');
      expect(entry.duration_ms).toBe(1800000);
      expect(entry.status).toBe('completed');
      expect(entry.keywords).toEqual(['testing', 'vitest', 'coverage']);
      expect(entry.files_modified).toEqual(['src/utils.ts', 'src/utils.test.ts']);
      expect(entry.tools_used).toEqual(['Read', 'Write', 'Bash']);
      expect(entry.summary).toBe('Added unit tests for utility functions');
    });

    it('should accept valid TelemetryEntry with failed status', () => {
      const entry: TelemetryEntry = {
        event: 'subagent_complete',
        agent_id: 'agent-def456',
        agent_type: 'backend-engineer',
        session_id: 'session-uvw123',
        project: '/home/user/projects/api-server',
        project_name: 'api-server',
        started_at: '2025-01-15T11:00:00.000Z',
        ended_at: '2025-01-15T11:05:00.000Z',
        duration_ms: 300000,
        status: 'failed',
        keywords: ['api', 'database', 'error'],
        files_modified: [],
        tools_used: ['Read', 'Bash'],
        summary: 'Failed to connect to database',
      };

      expect(entry.status).toBe('failed');
      expect(entry.files_modified).toEqual([]);
    });

    it('should accept TelemetryEntry with optional git_branch', () => {
      const entry: TelemetryEntry = {
        event: 'subagent_complete',
        agent_id: 'agent-ghi789',
        agent_type: 'frontend-architect',
        session_id: 'session-rst456',
        project: '/home/user/projects/web-app',
        project_name: 'web-app',
        git_branch: 'feature/user-dashboard',
        started_at: '2025-01-15T12:00:00.000Z',
        ended_at: '2025-01-15T13:00:00.000Z',
        duration_ms: 3600000,
        status: 'completed',
        keywords: ['frontend', 'react', 'dashboard'],
        files_modified: ['src/Dashboard.tsx', 'src/Dashboard.test.tsx'],
        tools_used: ['Read', 'Write', 'Edit'],
        summary: 'Implemented user dashboard component',
      };

      expect(entry.git_branch).toBe('feature/user-dashboard');
    });

    it('should accept TelemetryEntry with optional git_commit', () => {
      const entry: TelemetryEntry = {
        event: 'subagent_complete',
        agent_id: 'agent-jkl012',
        agent_type: 'devops-deployer',
        session_id: 'session-opq789',
        project: '/home/user/projects/infra',
        project_name: 'infra',
        git_commit: 'abc1234def5678',
        started_at: '2025-01-15T14:00:00.000Z',
        ended_at: '2025-01-15T14:15:00.000Z',
        duration_ms: 900000,
        status: 'completed',
        keywords: ['deployment', 'docker', 'kubernetes'],
        files_modified: ['Dockerfile', 'k8s/deployment.yaml'],
        tools_used: ['Read', 'Write', 'Bash'],
        summary: 'Updated deployment configuration',
      };

      expect(entry.git_commit).toBe('abc1234def5678');
    });

    it('should accept TelemetryEntry with both git_branch and git_commit', () => {
      const entry: TelemetryEntry = {
        event: 'subagent_complete',
        agent_id: 'agent-mno345',
        agent_type: 'code-reviewer',
        session_id: 'session-lmn012',
        project: '/home/user/projects/library',
        project_name: 'library',
        git_branch: 'main',
        git_commit: 'xyz9876abc5432',
        started_at: '2025-01-15T15:00:00.000Z',
        ended_at: '2025-01-15T15:45:00.000Z',
        duration_ms: 2700000,
        status: 'completed',
        keywords: ['review', 'refactoring', 'optimization'],
        files_modified: ['src/core.ts'],
        tools_used: ['Read', 'Grep', 'LSP'],
        summary: 'Reviewed and optimized core module',
      };

      expect(entry.git_branch).toBe('main');
      expect(entry.git_commit).toBe('xyz9876abc5432');
    });

    it('should accept TelemetryEntry with empty arrays', () => {
      const entry: TelemetryEntry = {
        event: 'subagent_complete',
        agent_id: 'agent-pqr678',
        agent_type: 'documentation',
        session_id: 'session-ijk345',
        project: '/home/user/projects/docs',
        project_name: 'docs',
        started_at: '2025-01-15T16:00:00.000Z',
        ended_at: '2025-01-15T16:01:00.000Z',
        duration_ms: 60000,
        status: 'completed',
        keywords: [],
        files_modified: [],
        tools_used: [],
        summary: 'Quick documentation review - no changes needed',
      };

      expect(entry.keywords).toEqual([]);
      expect(entry.files_modified).toEqual([]);
      expect(entry.tools_used).toEqual([]);
    });

    it('should accept TelemetryEntry with many keywords', () => {
      const entry: TelemetryEntry = {
        event: 'subagent_complete',
        agent_id: 'agent-stu901',
        agent_type: 'full-stack',
        session_id: 'session-fgh678',
        project: '/home/user/projects/ecommerce',
        project_name: 'ecommerce',
        started_at: '2025-01-15T17:00:00.000Z',
        ended_at: '2025-01-15T19:00:00.000Z',
        duration_ms: 7200000,
        status: 'completed',
        keywords: [
          'authentication',
          'authorization',
          'jwt',
          'bcrypt',
          'middleware',
          'express',
          'typescript',
          'security',
        ],
        files_modified: [
          'src/auth/login.ts',
          'src/auth/register.ts',
          'src/middleware/auth.ts',
          'src/utils/jwt.ts',
        ],
        tools_used: ['Read', 'Write', 'Edit', 'Bash', 'Grep'],
        summary: 'Implemented complete authentication system',
      };

      expect(entry.keywords).toHaveLength(8);
      expect(entry.files_modified).toHaveLength(4);
      expect(entry.tools_used).toHaveLength(5);
    });

    it('should accept zero duration_ms', () => {
      const entry: TelemetryEntry = {
        event: 'subagent_complete',
        agent_id: 'agent-vwx234',
        agent_type: 'quick-fix',
        session_id: 'session-cde901',
        project: '/home/user/projects/app',
        project_name: 'app',
        started_at: '2025-01-15T20:00:00.000Z',
        ended_at: '2025-01-15T20:00:00.000Z',
        duration_ms: 0,
        status: 'completed',
        keywords: ['typo'],
        files_modified: ['README.md'],
        tools_used: ['Edit'],
        summary: 'Fixed typo in README',
      };

      expect(entry.duration_ms).toBe(0);
    });
  });

  describe('TelemetryTracking interface', () => {
    it('should accept valid TelemetryTracking with required fields', () => {
      const tracking: TelemetryTracking = {
        agent_id: 'agent-abc123',
        agent_type: 'test-engineer',
        session_id: 'session-xyz789',
        project: '/home/user/projects/my-app',
        project_name: 'my-app',
        started_at: '2025-01-15T10:00:00.000Z',
      };

      expect(tracking.agent_id).toBe('agent-abc123');
      expect(tracking.agent_type).toBe('test-engineer');
      expect(tracking.session_id).toBe('session-xyz789');
      expect(tracking.project).toBe('/home/user/projects/my-app');
      expect(tracking.project_name).toBe('my-app');
      expect(tracking.started_at).toBe('2025-01-15T10:00:00.000Z');
    });

    it('should accept TelemetryTracking with optional git_branch', () => {
      const tracking: TelemetryTracking = {
        agent_id: 'agent-def456',
        agent_type: 'frontend-architect',
        session_id: 'session-uvw123',
        project: '/home/user/projects/web-app',
        project_name: 'web-app',
        git_branch: 'feature/new-ui',
        started_at: '2025-01-15T11:00:00.000Z',
      };

      expect(tracking.git_branch).toBe('feature/new-ui');
    });

    it('should accept TelemetryTracking with optional git_commit', () => {
      const tracking: TelemetryTracking = {
        agent_id: 'agent-ghi789',
        agent_type: 'backend-engineer',
        session_id: 'session-rst456',
        project: '/home/user/projects/api',
        project_name: 'api',
        git_commit: 'abc1234567890',
        started_at: '2025-01-15T12:00:00.000Z',
      };

      expect(tracking.git_commit).toBe('abc1234567890');
    });

    it('should accept TelemetryTracking with both git_branch and git_commit', () => {
      const tracking: TelemetryTracking = {
        agent_id: 'agent-jkl012',
        agent_type: 'devops-deployer',
        session_id: 'session-opq789',
        project: '/home/user/projects/infra',
        project_name: 'infra',
        git_branch: 'develop',
        git_commit: 'xyz9876543210',
        started_at: '2025-01-15T13:00:00.000Z',
      };

      expect(tracking.git_branch).toBe('develop');
      expect(tracking.git_commit).toBe('xyz9876543210');
    });

    it('should work with various agent types', () => {
      const agentTypes = [
        'test-engineer',
        'frontend-architect',
        'backend-engineer',
        'devops-deployer',
        'code-reviewer',
        'documentation',
      ];

      agentTypes.forEach((agentType) => {
        const tracking: TelemetryTracking = {
          agent_id: `agent-${agentType}`,
          agent_type: agentType,
          session_id: 'session-test',
          project: '/test/project',
          project_name: 'project',
          started_at: '2025-01-15T00:00:00.000Z',
        };

        expect(tracking.agent_type).toBe(agentType);
      });
    });

    it('should accept Windows-style project paths', () => {
      const tracking: TelemetryTracking = {
        agent_id: 'agent-win',
        agent_type: 'test-engineer',
        session_id: 'session-win',
        project: 'C:\\Users\\developer\\projects\\my-app',
        project_name: 'my-app',
        started_at: '2025-01-15T14:00:00.000Z',
      };

      expect(tracking.project).toBe('C:\\Users\\developer\\projects\\my-app');
    });

    it('should accept Unix-style project paths', () => {
      const tracking: TelemetryTracking = {
        agent_id: 'agent-unix',
        agent_type: 'test-engineer',
        session_id: 'session-unix',
        project: '/home/developer/projects/my-app',
        project_name: 'my-app',
        started_at: '2025-01-15T15:00:00.000Z',
      };

      expect(tracking.project).toBe('/home/developer/projects/my-app');
    });
  });
});
