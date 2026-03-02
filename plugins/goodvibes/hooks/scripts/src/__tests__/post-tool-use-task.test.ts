/**
 * Unit tests for post-tool-use-task hook
 *
 * Tests cover:
 * - Fast path: runtime not available — respond with plain allowTool, no query
 * - Directive present: system_message result injects additionalContext
 * - No directives: null result from query — plain allowTool response
 * - No directives: non-matching kind from query — plain allowTool response
 * - No directives: system_message with falsy message — plain allowTool response
 * - Error path: runtime throws — silently allow (never block)
 * - stdin.resume() is always called to discard input
 * - query() is called with the correct { kind: 'get_directives' } argument
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (vi.hoisted runs before module imports) ──────────────────
// RuntimeClient mock must be hoisted so vi.mock factory can close over the fns.
const hoisted = vi.hoisted(() => ({
  mockIsAvailable: vi.fn<[], boolean>(),
  mockQuery: vi.fn<[], Promise<unknown>>(),
  mockStdinResume: vi.fn<[], void>(),
  mockRespond: vi.fn<[], void>(),
  mockCreateResponse: vi.fn<[object?], { continue: boolean; additionalContext?: string | Record<string, string> }>(),
  mockBuildGvDirectiveTag: vi.fn<[string], string>(),
}));

// ─── Module-level mocks (hoisted by Vitest) ──────────────────────────────────
// Vitest 4 requires class constructors to be mocked with 'function' or 'class' syntax.
vi.mock('../shared/runtime-client.js', () => {
  class MockRuntimeClient {
    isAvailable = hoisted.mockIsAvailable;
    query = hoisted.mockQuery;
  }
  return { RuntimeClient: MockRuntimeClient };
});

vi.mock('../shared/index.js', () => ({
  respond: hoisted.mockRespond,
  createResponse: hoisted.mockCreateResponse,
  buildGvDirectiveTag: hoisted.mockBuildGvDirectiveTag,
  isTestEnvironment: () => true,
}));

vi.mock('node:process', () => ({
  stdin: { resume: hoisted.mockStdinResume },
}));

// ─── Test suite ──────────────────────────────────────────────────────────────
describe('runPostToolUseTaskHook', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default createResponse return — returns options merged with continue: true
    hoisted.mockCreateResponse.mockImplementation(
      (options?: object) => ({ continue: true, ...options })
    );
  });

  async function importAndRun() {
    vi.resetModules();
    const { runPostToolUseTaskHook } = await import('../post-tool-use-task.js');
    await runPostToolUseTaskHook();
  }

  // ─── stdin handling ─────────────────────────────────────────────────────────
  describe('stdin handling', () => {
    it('always calls stdin.resume() to discard input', async () => {
      hoisted.mockIsAvailable.mockReturnValue(false);

      await importAndRun();

      expect(hoisted.mockStdinResume).toHaveBeenCalledTimes(1);
    });

    it('calls stdin.resume() even when runtime is available', async () => {
      hoisted.mockIsAvailable.mockReturnValue(true);
      hoisted.mockQuery.mockResolvedValue(null);

      await importAndRun();

      expect(hoisted.mockStdinResume).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Fast path: runtime not available ───────────────────────────────────────
  describe('fast path: runtime not available', () => {
    it('responds with plain allowTool when runtime is unavailable', async () => {
      hoisted.mockIsAvailable.mockReturnValue(false);

      await importAndRun();

      expect(hoisted.mockIsAvailable).toHaveBeenCalledTimes(1);
      expect(hoisted.mockQuery).not.toHaveBeenCalled();
      expect(hoisted.mockCreateResponse).toHaveBeenCalledWith();
      expect(hoisted.mockRespond).toHaveBeenCalledTimes(1);
    });

    it('does not call buildGvDirectiveTag on fast path', async () => {
      hoisted.mockIsAvailable.mockReturnValue(false);

      await importAndRun();

      expect(hoisted.mockBuildGvDirectiveTag).not.toHaveBeenCalled();
    });

    it('does not call allowTool with additionalContext on fast path', async () => {
      hoisted.mockIsAvailable.mockReturnValue(false);

      await importAndRun();

      // createResponse must be called with no arguments (no additionalContext)
      expect(hoisted.mockCreateResponse).toHaveBeenCalledWith();
      expect(hoisted.mockCreateResponse).not.toHaveBeenCalledWith(
        expect.anything()
      );
    });
  });

  // ─── Directive present ───────────────────────────────────────────────────────
  describe('directive present', () => {
    it('calls query with the correct { kind: get_directives } argument', async () => {
      hoisted.mockIsAvailable.mockReturnValue(true);
      hoisted.mockQuery.mockResolvedValue({
        kind: 'system_message',
        message: 'test directive',
      });

      await importAndRun();

      expect(hoisted.mockQuery).toHaveBeenCalledWith({ kind: 'get_directives' });
    });

    it('calls buildGvDirectiveTag with the message from the runtime result', async () => {
      const directiveMessage = 'orchestrator directive payload';
      hoisted.mockIsAvailable.mockReturnValue(true);
      hoisted.mockQuery.mockResolvedValue({
        kind: 'system_message',
        message: directiveMessage,
      });

      await importAndRun();

      expect(hoisted.mockBuildGvDirectiveTag).toHaveBeenCalledWith(directiveMessage);
    });

    it('passes additionalContext returned by buildGvDirectiveTag into allowTool', async () => {
      const directiveMessage = 'inject this context';
      const expectedTag = `<gv>${JSON.stringify({ action: 'directive', message: directiveMessage })}</gv>`;
      hoisted.mockIsAvailable.mockReturnValue(true);
      hoisted.mockQuery.mockResolvedValue({
        kind: 'system_message',
        message: directiveMessage,
      });
      hoisted.mockBuildGvDirectiveTag.mockReturnValue(expectedTag);

      await importAndRun();

      expect(hoisted.mockCreateResponse).toHaveBeenCalledWith({ additionalContext: { gv_directive: expectedTag } });
    });

    it('responds exactly once with the directive-carrying response', async () => {
      hoisted.mockIsAvailable.mockReturnValue(true);
      hoisted.mockQuery.mockResolvedValue({
        kind: 'system_message',
        message: 'some directive',
      });

      await importAndRun();

      expect(hoisted.mockRespond).toHaveBeenCalledTimes(1);
    });
  });

  // ─── No directives pending ──────────────────────────────────────────────────
  describe('no directives pending', () => {
    it('responds with plain allowTool when query returns null', async () => {
      hoisted.mockIsAvailable.mockReturnValue(true);
      hoisted.mockQuery.mockResolvedValue(null);

      await importAndRun();

      expect(hoisted.mockBuildGvDirectiveTag).not.toHaveBeenCalled();
      expect(hoisted.mockCreateResponse).toHaveBeenCalledWith();
      expect(hoisted.mockRespond).toHaveBeenCalledTimes(1);
    });

    it('responds with plain createResponse when query returns a non-matching kind', async () => {
      hoisted.mockIsAvailable.mockReturnValue(true);
      hoisted.mockQuery.mockResolvedValue({ kind: 'ack' });

      await importAndRun();

      expect(hoisted.mockBuildGvDirectiveTag).not.toHaveBeenCalled();
      expect(hoisted.mockCreateResponse).toHaveBeenCalledWith();
      expect(hoisted.mockRespond).toHaveBeenCalledTimes(1);
    });

    it('responds with plain createResponse when system_message has an empty message', async () => {
      hoisted.mockIsAvailable.mockReturnValue(true);
      // kind matches but message is empty string (falsy)
      hoisted.mockQuery.mockResolvedValue({ kind: 'system_message', message: '' });

      await importAndRun();

      expect(hoisted.mockBuildGvDirectiveTag).not.toHaveBeenCalled();
      expect(hoisted.mockCreateResponse).toHaveBeenCalledWith();
      expect(hoisted.mockRespond).toHaveBeenCalledTimes(1);
    });

    it('responds with plain createResponse when system_message has no message field', async () => {
      hoisted.mockIsAvailable.mockReturnValue(true);
      // kind matches but message is undefined
      hoisted.mockQuery.mockResolvedValue({ kind: 'system_message' });

      await importAndRun();

      expect(hoisted.mockBuildGvDirectiveTag).not.toHaveBeenCalled();
      expect(hoisted.mockCreateResponse).toHaveBeenCalledWith();
      expect(hoisted.mockRespond).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Error path ──────────────────────────────────────────────────────────────
  describe('error path: always allows, never blocks', () => {
    it('silently allows when query() rejects', async () => {
      hoisted.mockIsAvailable.mockReturnValue(true);
      hoisted.mockQuery.mockRejectedValue(new Error('IPC timeout'));

      await importAndRun();

      expect(hoisted.mockCreateResponse).toHaveBeenCalledWith();
      expect(hoisted.mockRespond).toHaveBeenCalledTimes(1);
    });

    it('does not propagate errors — always resolves', async () => {
      hoisted.mockIsAvailable.mockReturnValue(true);
      hoisted.mockQuery.mockRejectedValue(new Error('socket disconnected'));

      await expect(importAndRun()).resolves.toBeUndefined();
    });

    it('does not call buildGvDirectiveTag on error path', async () => {
      hoisted.mockIsAvailable.mockReturnValue(true);
      hoisted.mockQuery.mockRejectedValue(new Error('network error'));

      await importAndRun();

      expect(hoisted.mockBuildGvDirectiveTag).not.toHaveBeenCalled();
    });

    it('responds with plain allowTool (no additionalContext) on error', async () => {
      hoisted.mockIsAvailable.mockReturnValue(true);
      hoisted.mockQuery.mockRejectedValue(new Error('error'));

      await importAndRun();

      expect(hoisted.mockCreateResponse).toHaveBeenCalledWith();
      expect(hoisted.mockCreateResponse).not.toHaveBeenCalledWith(
        expect.anything()
      );
    });
  });
});
