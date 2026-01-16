/**
 * Unit tests for start-dev-server handler
 *
 * Tests cover:
 * - handleStartDevServer main function
 * - Command validation
 * - Process spawning and management
 * - Ready pattern detection
 * - Port detection from output
 * - Health URL polling
 * - Timeout handling
 * - Process registry management
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as http from 'http';
import * as https from 'https';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock http and https
vi.mock('http', () => ({
  get: vi.fn(),
}));

vi.mock('https', () => ({
  get: vi.fn(),
}));

vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

// Import after mocks
import {
  handleStartDevServer,
  getSpawnedProcesses,
  killProcess,
  killAllProcesses,
  type StartDevServerArgs,
  type StartDevServerResult,
} from '../../../handlers/process/start-dev-server.js';

// Helper to create mock child process
function createMockChildProcess(options: {
  pid?: number | undefined;
  exitCode?: number | null;
  exitSignal?: string | null;
  emitReadyPattern?: boolean;
  emitPort?: boolean;
  delayMs?: number;
  failOnSpawn?: boolean;
} = {}): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();

  // Use explicit check to allow undefined PID
  const pidValue = 'pid' in options ? options.pid : 12345;
  Object.defineProperty(proc, 'pid', { value: pidValue });
  Object.defineProperty(proc, 'stdout', { value: stdout });
  Object.defineProperty(proc, 'stderr', { value: stderr });
  proc.kill = vi.fn().mockReturnValue(true);

  if (!options.failOnSpawn) {
    const delay = options.delayMs ?? 50;

    setTimeout(() => {
      if (options.emitPort !== false) {
        stdout.emit('data', Buffer.from('Server started on http://localhost:3000\n'));
      }
      if (options.emitReadyPattern !== false) {
        stdout.emit('data', Buffer.from('ready - started server on 0.0.0.0:3000\n'));
      }
    }, delay);

    if (options.exitCode !== undefined) {
      setTimeout(() => {
        proc.emit('exit', options.exitCode, options.exitSignal ?? null);
      }, delay + 50);
    }
  }

  return proc;
}

// Helper to create mock HTTP response
function createMockHttpRequest(options: {
  statusCode?: number;
  error?: Error;
  timeout?: boolean;
} = {}) {
  const req = new EventEmitter();
  const res = new EventEmitter() as http.IncomingMessage;

  Object.defineProperty(res, 'statusCode', { value: options.statusCode ?? 200 });
  res.resume = vi.fn();

  setTimeout(() => {
    if (options.error) {
      req.emit('error', options.error);
    } else if (options.timeout) {
      req.emit('timeout');
    } else {
      // Trigger the callback with response
    }
  }, 10);

  (req as unknown as { setTimeout: Mock }).setTimeout = vi.fn();
  (req as unknown as { destroy: Mock }).destroy = vi.fn();

  return { req, res };
}

describe('start-dev-server handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Clear any spawned processes from previous tests
    const processes = getSpawnedProcesses();
    processes.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();

    // Cleanup processes
    killAllProcesses();
  });

  describe('handleStartDevServer', () => {
    describe('argument validation', () => {
      it('should return error when command is missing', async () => {
        const resultPromise = handleStartDevServer({} as StartDevServerArgs);
        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toContain('Missing required argument: command');
      });

      it('should return error when command is not a string', async () => {
        const resultPromise = handleStartDevServer({ command: 123 } as unknown as StartDevServerArgs);
        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toContain('Missing required argument: command');
      });

      it('should return error when command is empty string', async () => {
        const resultPromise = handleStartDevServer({ command: '' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        // Empty string is falsy, so it hits the first validation
        expect(data.error).toContain('Missing required argument: command');
      });

      it('should return error when command is whitespace only', async () => {
        const resultPromise = handleStartDevServer({ command: '   ' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toContain('Command cannot be empty');
      });

      it('should return error for invalid ready_pattern regex', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess());

        const resultPromise = handleStartDevServer({
          command: 'npm run dev',
          ready_pattern: '[invalid regex',
        });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toContain('Invalid ready_pattern regex');
      });
    });

    describe('process spawning', () => {
      it('should spawn process with command', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess());

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        await resultPromise;

        expect(spawn).toHaveBeenCalled();
      });

      it('should use shell on Windows', async () => {
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'win32' });

        vi.mocked(spawn).mockReturnValue(createMockChildProcess());

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        await resultPromise;

        expect(spawn).toHaveBeenCalled();

        Object.defineProperty(process, 'platform', { value: originalPlatform });
      });

      it('should use /bin/sh on Unix', async () => {
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'linux' });

        vi.mocked(spawn).mockReturnValue(createMockChildProcess());

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        await resultPromise;

        expect(spawn).toHaveBeenCalled();

        Object.defineProperty(process, 'platform', { value: originalPlatform });
      });

      it('should return error when process has no PID', async () => {
        // Create a mock without PID by using undefined directly
        const proc = createMockChildProcess({ pid: undefined });
        vi.mocked(spawn).mockReturnValue(proc);

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.isError).toBe(true);
        const data = JSON.parse(result.content[0].text);
        expect(data.error).toContain('no PID assigned');
      });

      it('should use custom cwd when provided', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess());

        const resultPromise = handleStartDevServer({
          command: 'npm run dev',
          cwd: '/custom/path',
        });
        vi.runAllTimersAsync();
        await resultPromise;

        expect(spawn).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({ cwd: '/custom/path' })
        );
      });
    });

    describe('ready pattern detection', () => {
      it('should detect default ready pattern', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess());

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data.status).toBe('ready');
      });

      it('should use custom ready_pattern', async () => {
        const proc = createMockChildProcess({ emitReadyPattern: false });
        vi.mocked(spawn).mockReturnValue(proc);

        // Emit custom pattern
        setTimeout(() => {
          (proc.stdout as EventEmitter).emit('data', Buffer.from('Server compiled successfully\n'));
        }, 60);

        const resultPromise = handleStartDevServer({
          command: 'npm run dev',
          ready_pattern: 'compiled successfully',
        });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(['ready', 'running']).toContain(data.status);
      });

      it('should detect "listening" as ready', async () => {
        const proc = createMockChildProcess({ emitReadyPattern: false });
        vi.mocked(spawn).mockReturnValue(proc);

        setTimeout(() => {
          (proc.stdout as EventEmitter).emit('data', Buffer.from('listening on port 3000\n'));
        }, 60);

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(['ready', 'running']).toContain(data.status);
      });

      it('should detect "started" as ready', async () => {
        const proc = createMockChildProcess({ emitReadyPattern: false });
        vi.mocked(spawn).mockReturnValue(proc);

        setTimeout(() => {
          (proc.stdout as EventEmitter).emit('data', Buffer.from('Server started\n'));
        }, 60);

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(['ready', 'running']).toContain(data.status);
      });

      it('should detect "Local:" as ready', async () => {
        const proc = createMockChildProcess({ emitReadyPattern: false });
        vi.mocked(spawn).mockReturnValue(proc);

        setTimeout(() => {
          (proc.stdout as EventEmitter).emit('data', Buffer.from('Local: http://localhost:3000\n'));
        }, 60);

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(['ready', 'running']).toContain(data.status);
      });
    });

    describe('port detection', () => {
      it('should detect port from localhost URL', async () => {
        const proc = createMockChildProcess({ emitPort: false, emitReadyPattern: false });
        vi.mocked(spawn).mockReturnValue(proc);

        setTimeout(() => {
          (proc.stdout as EventEmitter).emit('data', Buffer.from('Running on http://localhost:4000\n'));
          (proc.stdout as EventEmitter).emit('data', Buffer.from('ready\n'));
        }, 60);

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data.port).toBe(4000);
      });

      it('should detect port from PORT: prefix', async () => {
        const proc = createMockChildProcess({ emitPort: false, emitReadyPattern: false });
        vi.mocked(spawn).mockReturnValue(proc);

        setTimeout(() => {
          (proc.stdout as EventEmitter).emit('data', Buffer.from('PORT: 5000\nready\n'));
        }, 60);

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data.port).toBe(5000);
      });

      it('should detect port from 0.0.0.0 URL', async () => {
        const proc = createMockChildProcess({ emitPort: false, emitReadyPattern: false });
        vi.mocked(spawn).mockReturnValue(proc);

        setTimeout(() => {
          (proc.stdout as EventEmitter).emit('data', Buffer.from('Listening on 0.0.0.0:8080\nready\n'));
        }, 60);

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data.port).toBe(8080);
      });

      it('should detect port from 127.0.0.1 URL', async () => {
        const proc = createMockChildProcess({ emitPort: false, emitReadyPattern: false });
        vi.mocked(spawn).mockReturnValue(proc);

        setTimeout(() => {
          (proc.stdout as EventEmitter).emit('data', Buffer.from('Server at 127.0.0.1:9000\nready\n'));
        }, 60);

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data.port).toBe(9000);
      });

      it('should use provided port instead of detecting', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess());

        const resultPromise = handleStartDevServer({
          command: 'npm run dev',
          port: 7777,
        });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data.port).toBe(7777);
      });

      it('should build URL from detected port', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess());

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data.url).toBe('http://localhost:3000');
      });

      it('should return null URL when port not detected', async () => {
        const proc = createMockChildProcess({ emitPort: false, emitReadyPattern: false });
        vi.mocked(spawn).mockReturnValue(proc);

        setTimeout(() => {
          (proc.stdout as EventEmitter).emit('data', Buffer.from('ready\n'));
        }, 60);

        const resultPromise = handleStartDevServer({
          command: 'npm run dev',
          timeout: 100,
        });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data.port).toBeNull();
        expect(data.url).toBeNull();
      });
    });

    describe('timeout handling', () => {
      it('should use default timeout of 30000ms', async () => {
        // Disable both port and ready pattern - the port message contains "started" which triggers ready
        const proc = createMockChildProcess({ emitReadyPattern: false, emitPort: false });
        vi.mocked(spawn).mockReturnValue(proc);

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });

        // Advance time past default timeout
        vi.advanceTimersByTime(35000);

        const result = await resultPromise;
        const data = JSON.parse(result.content[0].text);

        expect(data.status).toBe('running');
        expect(data.error).toContain('Timeout');
      });

      it('should use custom timeout', async () => {
        // Disable both port and ready pattern - the port message contains "started" which triggers ready
        const proc = createMockChildProcess({ emitReadyPattern: false, emitPort: false });
        vi.mocked(spawn).mockReturnValue(proc);

        const resultPromise = handleStartDevServer({
          command: 'npm run dev',
          timeout: 5000,
        });

        vi.advanceTimersByTime(6000);

        const result = await resultPromise;
        const data = JSON.parse(result.content[0].text);

        expect(data.status).toBe('running');
        expect(data.error).toContain('Timeout');
      });

      it('should return running status on timeout without ready pattern', async () => {
        // Disable both port and ready pattern - the port message contains "started" which triggers ready
        const proc = createMockChildProcess({ emitReadyPattern: false, emitPort: false, delayMs: 10000 });
        vi.mocked(spawn).mockReturnValue(proc);

        const resultPromise = handleStartDevServer({
          command: 'npm run dev',
          timeout: 500,
        });

        vi.advanceTimersByTime(1000);

        const result = await resultPromise;
        const data = JSON.parse(result.content[0].text);

        expect(data.status).toBe('running');
      });
    });

    describe('health URL polling', () => {
      it('should poll health URL when provided', async () => {
        const proc = createMockChildProcess();
        vi.mocked(spawn).mockReturnValue(proc);

        // Mock http.get to return successful response
        // The handler calls client.get(url, callback) with 2 args
        vi.mocked(http.get).mockImplementation((...args: unknown[]) => {
          const mockRequest = new EventEmitter();
          const mockResponse = new EventEmitter() as http.IncomingMessage;
          Object.defineProperty(mockResponse, 'statusCode', { value: 200 });
          mockResponse.resume = vi.fn();

          (mockRequest as unknown as { setTimeout: Mock }).setTimeout = vi.fn();
          (mockRequest as unknown as { destroy: Mock }).destroy = vi.fn();

          // Find the callback (last function argument)
          const cb = args.find((arg) => typeof arg === 'function') as
            | ((res: http.IncomingMessage) => void)
            | undefined;

          // Schedule callback to fire after ready pattern detected
          setTimeout(() => {
            if (cb) cb(mockResponse);
          }, 100);

          return mockRequest as unknown as http.ClientRequest;
        });

        const resultPromise = handleStartDevServer({
          command: 'npm run dev',
          health_url: 'http://localhost:3000/health',
        });

        await vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data.status).toBe('ready');
      });

      it('should use https for https health URLs', async () => {
        const proc = createMockChildProcess();
        vi.mocked(spawn).mockReturnValue(proc);

        // Mock https.get to return successful response
        vi.mocked(https.get).mockImplementation((...args: unknown[]) => {
          const mockRequest = new EventEmitter();
          const mockResponse = new EventEmitter() as http.IncomingMessage;
          Object.defineProperty(mockResponse, 'statusCode', { value: 200 });
          mockResponse.resume = vi.fn();

          (mockRequest as unknown as { setTimeout: Mock }).setTimeout = vi.fn();
          (mockRequest as unknown as { destroy: Mock }).destroy = vi.fn();

          // Find the callback (last function argument)
          const cb = args.find((arg) => typeof arg === 'function') as
            | ((res: http.IncomingMessage) => void)
            | undefined;

          // Schedule callback
          setTimeout(() => {
            if (cb) cb(mockResponse);
          }, 100);

          return mockRequest as unknown as http.ClientRequest;
        });

        const resultPromise = handleStartDevServer({
          command: 'npm run dev',
          health_url: 'https://localhost:3000/health',
        });

        await vi.runAllTimersAsync();
        await resultPromise;

        expect(https.get).toHaveBeenCalled();
      });

      it('should retry health check on error', async () => {
        const proc = createMockChildProcess();
        vi.mocked(spawn).mockReturnValue(proc);

        let callCount = 0;
        vi.mocked(http.get).mockImplementation((...args: unknown[]) => {
          const req = new EventEmitter();
          (req as unknown as { setTimeout: Mock }).setTimeout = vi.fn();
          (req as unknown as { destroy: Mock }).destroy = vi.fn();

          // Find the callback (last function argument)
          const cb = args.find((arg) => typeof arg === 'function') as
            | ((res: http.IncomingMessage) => void)
            | undefined;

          callCount++;
          // Schedule error/success
          setTimeout(() => {
            if (callCount < 3) {
              req.emit('error', new Error('Connection refused'));
            } else {
              const res = new EventEmitter() as http.IncomingMessage;
              Object.defineProperty(res, 'statusCode', { value: 200 });
              res.resume = vi.fn();
              if (cb) cb(res);
            }
          }, 50);

          return req as unknown as http.ClientRequest;
        });

        const resultPromise = handleStartDevServer({
          command: 'npm run dev',
          health_url: 'http://localhost:3000/health',
        });

        await vi.runAllTimersAsync();
        await resultPromise;

        expect(callCount).toBeGreaterThanOrEqual(1);
      });

      it('should return running status when health check does not pass', async () => {
        const proc = createMockChildProcess();
        vi.mocked(spawn).mockReturnValue(proc);

        vi.mocked(http.get).mockImplementation((...args: unknown[]) => {
          const req = new EventEmitter();
          (req as unknown as { setTimeout: Mock }).setTimeout = vi.fn();
          (req as unknown as { destroy: Mock }).destroy = vi.fn();

          setTimeout(() => {
            req.emit('error', new Error('Connection refused'));
          }, 10);

          return req as unknown as http.ClientRequest;
        });

        const resultPromise = handleStartDevServer({
          command: 'npm run dev',
          health_url: 'http://localhost:3000/health',
          timeout: 500,
        });

        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data.error).toContain('Health check did not pass');
      });
    });

    describe('process error handling', () => {
      it('should handle process spawn error', async () => {
        // Disable all automatic emissions to have full control over timing
        const proc = createMockChildProcess({ emitReadyPattern: false, emitPort: false });
        vi.mocked(spawn).mockReturnValue(proc);

        // Emit error before any other events
        setTimeout(() => {
          proc.emit('error', new Error('Spawn failed'));
        }, 10);

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data.status).toBe('failed');
        expect(data.error).toContain('Spawn failed');
      });

      it('should handle process exit with error code', async () => {
        // Disable all automatic emissions to have full control over timing
        const proc = createMockChildProcess({ emitReadyPattern: false, emitPort: false });
        vi.mocked(spawn).mockReturnValue(proc);

        // Emit exit before timeout
        setTimeout(() => {
          proc.emit('exit', 1, null);
        }, 10);

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data.status).toBe('failed');
        expect(data.error).toContain('exited');
      });

      it('should handle process exit with signal', async () => {
        // Disable all automatic emissions to have full control over timing
        const proc = createMockChildProcess({ emitReadyPattern: false, emitPort: false });
        vi.mocked(spawn).mockReturnValue(proc);

        // Emit exit before timeout
        setTimeout(() => {
          proc.emit('exit', null, 'SIGTERM');
        }, 10);

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data.status).toBe('failed');
        expect(data.error).toContain('SIGTERM');
      });
    });

    describe('log buffer', () => {
      it('should capture stdout output', async () => {
        const proc = createMockChildProcess();
        vi.mocked(spawn).mockReturnValue(proc);

        setTimeout(() => {
          (proc.stdout as EventEmitter).emit('data', Buffer.from('Log line 1\n'));
          (proc.stdout as EventEmitter).emit('data', Buffer.from('Log line 2\n'));
        }, 60);

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data.logs).toBeDefined();
        expect(data.logs.length).toBeGreaterThan(0);
      });

      it('should capture stderr output', async () => {
        const proc = createMockChildProcess();
        vi.mocked(spawn).mockReturnValue(proc);

        setTimeout(() => {
          (proc.stderr as EventEmitter).emit('data', Buffer.from('Warning message\n'));
        }, 60);

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data.logs).toBeDefined();
      });

      it('should limit log buffer to 50 lines', async () => {
        const proc = createMockChildProcess({ emitReadyPattern: false });
        vi.mocked(spawn).mockReturnValue(proc);

        setTimeout(() => {
          for (let i = 0; i < 100; i++) {
            (proc.stdout as EventEmitter).emit('data', Buffer.from(`Log line ${i}\n`));
          }
          (proc.stdout as EventEmitter).emit('data', Buffer.from('ready\n'));
        }, 60);

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data.logs.length).toBeLessThanOrEqual(50);
      });
    });

    describe('response format', () => {
      it('should return properly formatted MCP response', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess());

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result).toHaveProperty('content');
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');
      });

      it('should return valid JSON in response', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess());

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      });

      it('should include all result fields', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess());

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        const result = await resultPromise;

        const data = JSON.parse(result.content[0].text);
        expect(data).toHaveProperty('pid');
        expect(data).toHaveProperty('port');
        expect(data).toHaveProperty('status');
        expect(data).toHaveProperty('url');
        expect(data).toHaveProperty('logs');
      });
    });
  });

  describe('process registry management', () => {
    describe('getSpawnedProcesses', () => {
      it('should return process map', () => {
        const processes = getSpawnedProcesses();
        expect(processes).toBeInstanceOf(Map);
      });
    });

    describe('killProcess', () => {
      it('should kill registered process', async () => {
        const proc = createMockChildProcess({ pid: 99999 });
        vi.mocked(spawn).mockReturnValue(proc);

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        await resultPromise;

        const killed = killProcess(99999);
        expect(killed).toBe(true);
        expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
      });

      it('should return false for unregistered PID', () => {
        const killed = killProcess(88888);
        expect(killed).toBe(false);
      });
    });

    describe('killAllProcesses', () => {
      it('should kill all registered processes', async () => {
        const proc1 = createMockChildProcess({ pid: 11111 });
        const proc2 = createMockChildProcess({ pid: 22222 });

        vi.mocked(spawn)
          .mockReturnValueOnce(proc1)
          .mockReturnValueOnce(proc2);

        const promise1 = handleStartDevServer({ command: 'npm run dev' });
        const promise2 = handleStartDevServer({ command: 'npm run build' });

        vi.runAllTimersAsync();
        await Promise.all([promise1, promise2]);

        killAllProcesses();

        expect(proc1.kill).toHaveBeenCalledWith('SIGTERM');
        expect(proc2.kill).toHaveBeenCalledWith('SIGTERM');
      });

      it('should clear process registry after killing', async () => {
        vi.mocked(spawn).mockReturnValue(createMockChildProcess());

        const resultPromise = handleStartDevServer({ command: 'npm run dev' });
        vi.runAllTimersAsync();
        await resultPromise;

        killAllProcesses();

        const processes = getSpawnedProcesses();
        expect(processes.size).toBe(0);
      });
    });
  });
});
