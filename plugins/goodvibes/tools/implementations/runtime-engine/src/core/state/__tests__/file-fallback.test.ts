import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileFallback } from '../file-fallback.js';
import type { IPCMessage, IPCResponse } from '../../../shared/ipc/protocol.js';

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('../../../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockWriteFileSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockUnlinkSync = vi.fn();
const mockExistsSync = vi.fn();

vi.mock('node:fs', () => ({
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  unlinkSync: (...args: unknown[]) => mockUnlinkSync(...args),
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

const mockEnsureDirSync = vi.fn();
vi.mock('../../utils/fs-utils.js', () => ({
  ensureDirSync: (...args: unknown[]) => mockEnsureDirSync(...args),
}));

const mockPollUntil = vi.fn();
vi.mock('../../utils/poll.js', () => ({
  pollUntil: (...args: unknown[]) => mockPollUntil(...args),
}));

// ─── Factories ────────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<IPCMessage> = {}): IPCMessage {
  return {
    id: 'msg-1',
    type: 'test:event',
    payload: {},
    timestamp: Date.now(),
    ...overrides,
  } as IPCMessage;
}

function makeResponse(overrides: Partial<IPCResponse> = {}): IPCResponse {
  return {
    id: 'msg-1',
    status: 'ok',
    data: { kind: 'ack' },
    ...overrides,
  } as IPCResponse;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FileFallback', () => {
  const STATE_DIR = '/tmp/test-state';

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: lock file does not exist (no contention)
    mockExistsSync.mockReturnValue(false);
    // Default: writeFileSync succeeds
    mockWriteFileSync.mockReturnValue(undefined);
  });

  // ─── constructor ───────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates instance without throwing', () => {
      expect(() => new FileFallback(STATE_DIR)).not.toThrow();
    });

    it('derives correct file paths from state directory', async () => {
      // We test indirectly via writeRequest calling writeFileSync with the right path
      const fb = new FileFallback('/custom/state');
      // existsSync is called by releaseLock — return false (no lock to delete)
      mockExistsSync.mockReturnValue(false);
      await fb.writeRequest(makeMessage());
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/custom/state/ipc-request.json',
        expect.any(String),
        'utf-8',
      );
    });
  });

  // ─── writeRequest ──────────────────────────────────────────────────────────

  describe('writeRequest', () => {
    it('ensures state directory exists before writing', async () => {
      const fb = new FileFallback(STATE_DIR);
      await fb.writeRequest(makeMessage());
      expect(mockEnsureDirSync).toHaveBeenCalledWith(expect.stringContaining(STATE_DIR));
    });

    it('writes the message as formatted JSON to the request path', async () => {
      const fb = new FileFallback(STATE_DIR);
      const msg = makeMessage({ id: 'write-test', type: 'hook:fired' });
      await fb.writeRequest(msg);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        `${STATE_DIR}/ipc-request.json`,
        expect.stringContaining('write-test'),
        'utf-8',
      );
    });

    it('acquires lock file (exclusive wx flag) before writing', async () => {
      const fb = new FileFallback(STATE_DIR);
      await fb.writeRequest(makeMessage());
      // First writeFileSync call is the lock, second is the actual request
      const calls = mockWriteFileSync.mock.calls;
      const lockCall = calls.find((c) => (c[2] as Record<string, unknown>)?.flag === 'wx');
      expect(lockCall).toBeDefined();
      expect(lockCall?.[0]).toBe(`${STATE_DIR}/ipc.lock`);
    });

    it('releases lock after writing (removes lock file)', async () => {
      const fb = new FileFallback(STATE_DIR);
      // acquireLock uses writeFileSync with flag: 'wx' (not existsSync)
      // releaseLock calls existsSync(lockPath) — return true so it calls unlinkSync
      mockExistsSync.mockReturnValue(true); // lock file exists for releaseLock
      await fb.writeRequest(makeMessage());
      // releaseLock calls unlinkSync on the lock path
      expect(mockUnlinkSync).toHaveBeenCalledWith(`${STATE_DIR}/ipc.lock`);
    });

    it('retries on lock contention (EEXIST) and eventually succeeds', async () => {
      const fb = new FileFallback(STATE_DIR);
      // First 2 lock attempts fail with EEXIST, third succeeds
      const eexist = Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
      mockWriteFileSync
        .mockImplementationOnce((_path: string, _data: string, opts: unknown) => {
          if ((opts as Record<string, unknown>)?.flag === 'wx') throw eexist;
        })
        .mockImplementationOnce((_path: string, _data: string, opts: unknown) => {
          if ((opts as Record<string, unknown>)?.flag === 'wx') throw eexist;
        })
        .mockReturnValue(undefined);

      await expect(fb.writeRequest(makeMessage())).resolves.toBeUndefined();
    });

    it('proceeds without lock after all retries exhausted (advisory semantics)', async () => {
      const fb = new FileFallback(STATE_DIR);
      const eexist = Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
      // All 4 attempts (LOCK_RETRIES+1) throw EEXIST
      mockWriteFileSync.mockImplementation((_path: string, _data: string, opts: unknown) => {
        if ((opts as Record<string, unknown>)?.flag === 'wx') throw eexist;
      });
      // Should still resolve (non-fatal)
      await expect(fb.writeRequest(makeMessage())).resolves.toBeUndefined();
    });
  });

  // ─── readResponse ──────────────────────────────────────────────────────────

  describe('readResponse', () => {
    it('returns null when pollUntil resolves null (timeout)', async () => {
      mockPollUntil.mockResolvedValueOnce(null);
      const fb = new FileFallback(STATE_DIR);
      const result = await fb.readResponse(100);
      expect(result).toBeNull();
    });

    it('returns the parsed IPCResponse when pollUntil resolves it', async () => {
      const response = makeResponse({ id: 'r-1' });
      mockPollUntil.mockResolvedValueOnce(response);
      const fb = new FileFallback(STATE_DIR);
      const result = await fb.readResponse(500);
      expect(result).toEqual(response);
    });

    it('passes correct timeout and interval to pollUntil', async () => {
      mockPollUntil.mockResolvedValueOnce(null);
      const fb = new FileFallback(STATE_DIR);
      await fb.readResponse(250);
      expect(mockPollUntil).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ timeoutMs: 250, intervalMs: 20 }),
      );
    });

    it('returns null when pollUntil throws (parse error path)', async () => {
      mockPollUntil.mockRejectedValueOnce(new Error('parse failure'));
      const fb = new FileFallback(STATE_DIR);
      const result = await fb.readResponse(100);
      expect(result).toBeNull();
    });

    it('poll callback returns null when response file does not exist', async () => {
      let capturedCheck: (() => IPCResponse | null) | null = null;
      mockPollUntil.mockImplementationOnce((check: () => IPCResponse | null) => {
        capturedCheck = check;
        return Promise.resolve(null);
      });
      const fb = new FileFallback(STATE_DIR);
      mockExistsSync.mockReturnValueOnce(false);
      await fb.readResponse(100);
      expect(capturedCheck?.()).toBeNull();
    });

    it('poll callback reads, parses, unlinks and returns response when file exists', async () => {
      const response = makeResponse({ id: 'poll-1' });
      let capturedCheck: (() => IPCResponse | null) | null = null;
      mockPollUntil.mockImplementationOnce((check: () => IPCResponse | null) => {
        capturedCheck = check;
        return Promise.resolve(null);
      });
      const fb = new FileFallback(STATE_DIR);
      await fb.readResponse(100);

      // Now trigger the check function as if the file appeared
      mockExistsSync.mockReturnValueOnce(true);
      mockReadFileSync.mockReturnValueOnce(JSON.stringify(response));
      const result = capturedCheck?.();
      expect(result).toEqual(response);
      expect(mockUnlinkSync).toHaveBeenCalledWith(`${STATE_DIR}/ipc-response.json`);
    });

    it('poll callback returns null when response file contains invalid JSON', async () => {
      let capturedCheck: (() => IPCResponse | null) | null = null;
      mockPollUntil.mockImplementationOnce((check: () => IPCResponse | null) => {
        capturedCheck = check;
        return Promise.resolve(null);
      });
      const fb = new FileFallback(STATE_DIR);
      await fb.readResponse(100);

      mockExistsSync.mockReturnValueOnce(true);
      mockReadFileSync.mockReturnValueOnce('not-valid-json{{{');
      const result = capturedCheck?.();
      expect(result).toBeNull();
    });
  });

  // ─── readRequest ───────────────────────────────────────────────────────────

  describe('readRequest', () => {
    it('returns null when request file does not exist', async () => {
      mockExistsSync.mockReturnValueOnce(false);
      const fb = new FileFallback(STATE_DIR);
      const result = await fb.readRequest();
      expect(result).toBeNull();
    });

    it('reads and returns the parsed IPCMessage', async () => {
      const msg = makeMessage({ id: 'req-1', type: 'hook:fired' });
      mockExistsSync.mockReturnValueOnce(true); // request file exists
      mockReadFileSync.mockReturnValueOnce(JSON.stringify(msg));
      mockExistsSync.mockReturnValueOnce(true); // lock file for releaseLock
      const fb = new FileFallback(STATE_DIR);
      const result = await fb.readRequest();
      expect(result).toEqual(msg);
    });

    it('removes the request file after reading', async () => {
      const msg = makeMessage();
      mockExistsSync.mockReturnValueOnce(true);
      mockReadFileSync.mockReturnValueOnce(JSON.stringify(msg));
      mockExistsSync.mockReturnValueOnce(true); // for releaseLock
      const fb = new FileFallback(STATE_DIR);
      await fb.readRequest();
      expect(mockUnlinkSync).toHaveBeenCalledWith(`${STATE_DIR}/ipc-request.json`);
    });

    it('returns null when request file contains invalid JSON', async () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockReadFileSync.mockReturnValueOnce('invalid json');
      mockExistsSync.mockReturnValueOnce(false); // no lock to release
      const fb = new FileFallback(STATE_DIR);
      const result = await fb.readRequest();
      expect(result).toBeNull();
    });

    it('returns null and logs when readFileSync throws', async () => {
      mockExistsSync.mockReturnValueOnce(true);
      mockReadFileSync.mockImplementationOnce(() => { throw new Error('EACCES'); });
      mockExistsSync.mockReturnValueOnce(false); // no lock to release
      const fb = new FileFallback(STATE_DIR);
      const result = await fb.readRequest();
      expect(result).toBeNull();
    });
  });

  // ─── writeResponse ─────────────────────────────────────────────────────────

  describe('writeResponse', () => {
    it('ensures state directory exists before writing', async () => {
      const fb = new FileFallback(STATE_DIR);
      await fb.writeResponse(makeResponse());
      expect(mockEnsureDirSync).toHaveBeenCalledWith(expect.stringContaining(STATE_DIR));
    });

    it('writes the response as formatted JSON to the response path', async () => {
      const response = makeResponse({ id: 'res-write-1' });
      const fb = new FileFallback(STATE_DIR);
      await fb.writeResponse(response);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        `${STATE_DIR}/ipc-response.json`,
        expect.stringContaining('res-write-1'),
        'utf-8',
      );
    });
  });

  // ─── cleanup ───────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('removes request, response, and lock files when they exist', async () => {
      mockExistsSync.mockReturnValue(true); // all three files exist
      const fb = new FileFallback(STATE_DIR);
      await fb.cleanup();
      expect(mockUnlinkSync).toHaveBeenCalledWith(`${STATE_DIR}/ipc-request.json`);
      expect(mockUnlinkSync).toHaveBeenCalledWith(`${STATE_DIR}/ipc-response.json`);
      expect(mockUnlinkSync).toHaveBeenCalledWith(`${STATE_DIR}/ipc.lock`);
      expect(mockUnlinkSync).toHaveBeenCalledTimes(3);
    });

    it('silently skips files that do not exist', async () => {
      mockExistsSync.mockReturnValue(false); // no files present
      const fb = new FileFallback(STATE_DIR);
      await fb.cleanup();
      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });

    it('continues cleanup even if one unlink throws', async () => {
      mockExistsSync.mockReturnValue(true);
      let callCount = 0;
      mockUnlinkSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error('EPERM');
      });
      const fb = new FileFallback(STATE_DIR);
      await expect(fb.cleanup()).resolves.toBeUndefined();
      // Should have attempted all three unlinkSync calls despite first failure
      expect(mockUnlinkSync).toHaveBeenCalledTimes(3);
    });
  });
});
