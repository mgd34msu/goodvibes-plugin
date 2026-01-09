/**
 * Tests for port checker
 */

import * as childProcess from 'child_process';
import * as os from 'os';

import { describe, it, expect, beforeEach, vi, type _Mock } from 'vitest';

// Mock dependencies - must be before imports
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// Mock promisify to properly convert callback-style to promise-style
vi.mock('util', () => ({
  promisify: <T extends (...args: unknown[]) => unknown>(fn: T) => {
    return (command: string, options: Record<string, unknown>) => {
      return new Promise((resolve, reject) => {
        fn(command, options, (error: Error | null, stdout: string, stderr: string) => {
          if (error) {
            reject(error);
          } else {
            resolve({ stdout, stderr });
          }
        });
      });
    };
  },
}));

// Mock os module
vi.mock('os', () => ({
  platform: vi.fn(),
}));

// Mock logging
vi.mock('../../shared/logging.js', () => ({
  debug: vi.fn(),
}));

import type { PortInfo } from '../../context/port-checker.js';

// Get reference to the mocked functions
const mockExec = vi.mocked(childProcess.exec);

describe('port-checker', () => {
  const mockCwd = '/test/project';

  // Import after mocks are set up
  let checkPorts: (_cwd: string) => Promise<PortInfo[]>;
  let formatPortStatus: (_ports: PortInfo[]) => string;
  let COMMON_DEV_PORTS: number[];

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mock implementation - default to empty output
    // promisify turns this into async function that returns Promise<{stdout, stderr}>
    type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
    mockExec.mockImplementation((command: string, options: Record<string, unknown>, callback: ExecCallback) => {
      callback(null, '', '');
      return {} as ReturnType<typeof childProcess.exec>; // Return ChildProcess-like object for exec
    });

    // Dynamically import to get fresh module with mocks
    const module = await import('../../context/port-checker.js');
    checkPorts = module.checkPorts;
    formatPortStatus = module.formatPortStatus;
    COMMON_DEV_PORTS = module.COMMON_DEV_PORTS;
  });

  describe('checkPorts - Windows', () => {
    beforeEach(() => {
      vi.mocked(os.platform).mockReturnValue('win32');
    });

    it('should detect listening ports on Windows', async () => {
      const netstatOutput = `
  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234
  TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       5678
`;
      const tasklistOutput = '"node.exe","1234","Console","1","12,345 K"';

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('netstat')) {
          callback(null, netstatOutput, '');
        } else if (cmd.toString().includes('tasklist')) {
          callback(null, tasklistOutput, '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      const port8080 = result.find((p) => p.port === 8080);

      expect(port3000?.inUse).toBe(true);
      expect(port3000?.process).toBe('node');
      expect(port8080?.inUse).toBe(true);
    });

    it('should handle IPv6 addresses on Windows', async () => {
      const netstatOutput = `
  TCP    [::]:3000              [::]:0                 LISTENING       1234
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('netstat')) {
          callback(null, netstatOutput, '');
        } else if (cmd.toString().includes('tasklist')) {
          callback(null, '"node.exe","1234","Console","1","12,345 K"', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
    });

    it('should handle tasklist failure gracefully', async () => {
      const netstatOutput = `
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('netstat')) {
          callback(null, netstatOutput, '');
        } else if (cmd.toString().includes('tasklist')) {
          callback(new Error('Tasklist failed'), '', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
      expect(port3000?.process).toBe('PID:1234');
    });

    it('should handle netstat failure on Windows', async () => {
      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        callback(new Error('Netstat failed'), '', '');
      });

      const result = await checkPorts(mockCwd);

      expect(result).toHaveLength(COMMON_DEV_PORTS.length);
      expect(result.every((p) => !p.inUse)).toBe(true);
    });

    it('should skip non-LISTENING connections', async () => {
      const netstatOutput = `
  TCP    0.0.0.0:3000           0.0.0.0:0              ESTABLISHED     1234
  TCP    0.0.0.0:8080           0.0.0.0:0              TIME_WAIT       5678
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        callback(null, netstatOutput, '');
      });

      const result = await checkPorts(mockCwd);

      expect(result.every((p) => !p.inUse)).toBe(true);
    });

    it('should handle malformed netstat output', async () => {
      const netstatOutput = `
  TCP    malformed line
  INVALID DATA
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        callback(null, netstatOutput, '');
      });

      const result = await checkPorts(mockCwd);

      expect(result).toHaveLength(COMMON_DEV_PORTS.length);
      expect(result.every((p) => !p.inUse)).toBe(true);
    });

    it('should handle netstat line without port in address', async () => {
      const netstatOutput = `
  Proto  Local Address          Foreign Address        State           PID
  TCP    invalidaddress         0.0.0.0:0              LISTENING       1234
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       5678
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('netstat')) {
          callback(null, netstatOutput, '');
        } else if (cmd.toString().includes('tasklist')) {
          callback(null, '"node.exe","5678","Console","1","12,345 K"', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
    });

    it('should handle netstat line with empty PID', async () => {
      const netstatOutput = `
  Proto  Local Address          Foreign Address        State
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        callback(null, netstatOutput, '');
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
      expect(port3000?.process).toBe('unknown');
    });

    it('should handle tasklist output without matching process name', async () => {
      const netstatOutput = `
  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('netstat')) {
          callback(null, netstatOutput, '');
        } else if (cmd.toString().includes('tasklist')) {
          callback(
            null,
            'INFO: No tasks are running which match the specified criteria.',
            ''
          );
        } else {
          callback(null, '', '');
        }
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
      expect(port3000?.process).toBe('PID:1234');
    });

    it('should ignore ports not in COMMON_DEV_PORTS on Windows', async () => {
      const netstatOutput = `
  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:9999           0.0.0.0:0              LISTENING       1234
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       5678
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('netstat')) {
          callback(null, netstatOutput, '');
        } else if (cmd.toString().includes('tasklist')) {
          callback(null, '"node.exe","5678","Console","1","12,345 K"', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await checkPorts(mockCwd);

      const port9999 = result.find((p) => p.port === 9999);
      expect(port9999).toBeUndefined();

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
    });

    it('should handle lines without enough parts', async () => {
      const netstatOutput = `
  Proto  Local Address
  TCP
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('netstat')) {
          callback(null, netstatOutput, '');
        } else if (cmd.toString().includes('tasklist')) {
          callback(null, '"node.exe","1234","Console","1","12,345 K"', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
    });

    it('should handle header lines', async () => {
      const netstatOutput = `
  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('netstat')) {
          callback(null, netstatOutput, '');
        } else if (cmd.toString().includes('tasklist')) {
          callback(null, '"node.exe","1234","Console","1","12,345 K"', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
    });

    it('should handle empty lines in netstat output', async () => {
      const netstatOutput = `

  Proto  Local Address          Foreign Address        State           PID

  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234

`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('netstat')) {
          callback(null, netstatOutput, '');
        } else if (cmd.toString().includes('tasklist')) {
          callback(null, '"node.exe","1234","Console","1","12,345 K"', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
    });

    it('should handle multiple ports for the same process', async () => {
      const netstatOutput = `
  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234
  TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       1234
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('netstat')) {
          callback(null, netstatOutput, '');
        } else if (cmd.toString().includes('tasklist')) {
          callback(null, '"node.exe","1234","Console","1","12,345 K"', '');
        } else {
          callback(null, '', '');
        }
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      const port8080 = result.find((p) => p.port === 8080);

      expect(port3000?.inUse).toBe(true);
      expect(port3000?.process).toBe('node');
      expect(port8080?.inUse).toBe(true);
      expect(port8080?.process).toBe('node');
    });
  });

  describe('checkPorts - Unix/Linux', () => {
    beforeEach(() => {
      vi.mocked(os.platform).mockReturnValue('linux');
    });

    it('should detect listening ports using lsof', async () => {
      const lsofOutput = `node     1234 user   12u  IPv4  12345      0t0  TCP *:3000(LISTEN)
npm      5678 user   13u  IPv4  67890      0t0  TCP localhost:8080(LISTEN)`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        callback(null, lsofOutput, '');
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      const port8080 = result.find((p) => p.port === 8080);

      expect(port3000?.inUse).toBe(true);
      expect(port3000?.process).toBe('node');
      expect(port8080?.inUse).toBe(true);
      expect(port8080?.process).toBe('npm');
    });

    it('should only detect first occurrence of duplicate ports', async () => {
      const lsofOutput = `node     1234 user   12u  IPv4  12345      0t0  TCP *:3000(LISTEN)
node     5678 user   13u  IPv4  67890      0t0  TCP *:3000(LISTEN)`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        callback(null, lsofOutput, '');
      });

      const result = await checkPorts(mockCwd);

      const port3000Entries = result.filter((p) => p.port === 3000 && p.inUse);
      expect(port3000Entries).toHaveLength(1);
    });

    it('should fallback to netstat when lsof fails', async () => {
      const netstatOutput = `
Proto Recv-Q Send-Q Local Address           Foreign Address         State
tcp        0      0 0.0.0.0:3000            0.0.0.0:*               LISTEN
tcp6       0      0 :::8080                 :::*                    LISTEN
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('lsof')) {
          callback(new Error('lsof not found'), '', '');
        } else {
          callback(null, netstatOutput, '');
        }
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      const port8080 = result.find((p) => p.port === 8080);

      expect(port3000?.inUse).toBe(true);
      expect(port8080?.inUse).toBe(true);
    });

    it('should handle netstat with process info', async () => {
      const netstatOutput = `
tcp        0      0 0.0.0.0:3000            0.0.0.0:*               LISTEN      1234/node
tcp        0      0 0.0.0.0:8080            0.0.0.0:*               LISTEN      5678/npm
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('lsof')) {
          callback(new Error('lsof not found'), '', '');
        } else {
          callback(null, netstatOutput, '');
        }
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
      expect(port3000?.process).toBe('node');
    });

    it('should handle both lsof and netstat failure', async () => {
      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        callback(new Error('Command failed'), '', '');
      });

      const result = await checkPorts(mockCwd);

      expect(result).toHaveLength(COMMON_DEV_PORTS.length);
      expect(result.every((p) => !p.inUse)).toBe(true);
    });

    it('should skip non-LISTEN connections in netstat', async () => {
      const netstatOutput = `
tcp        0      0 0.0.0.0:3000            0.0.0.0:*               ESTABLISHED
tcp        0      0 0.0.0.0:8080            0.0.0.0:*               TIME_WAIT
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('lsof')) {
          callback(new Error('lsof not found'), '', '');
        } else {
          callback(null, netstatOutput, '');
        }
      });

      const result = await checkPorts(mockCwd);

      expect(result.every((p) => !p.inUse)).toBe(true);
    });

    it('should handle malformed lsof output', async () => {
      const lsofOutput = `
INVALID DATA
COMMAND PID
INCOMPLETE LINE
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        callback(null, lsofOutput, '');
      });

      const result = await checkPorts(mockCwd);

      expect(result.every((p) => !p.inUse)).toBe(true);
    });

    it('should skip lsof lines where name has no port', async () => {
      const lsofOutput = `node     1234 user   12u  IPv4  12345      0t0  TCP *:noport(LISTEN)
npm      5678 user   13u  IPv4  67890      0t0  TCP *:3000(LISTEN)`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        callback(null, lsofOutput, '');
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
      expect(port3000?.process).toBe('npm');
    });

    it('should skip netstat lines with ports not in COMMON_DEV_PORTS', async () => {
      const netstatOutput = `
tcp        0      0 0.0.0.0:9999            0.0.0.0:*               LISTEN      1234/node
tcp        0      0 0.0.0.0:3000            0.0.0.0:*               LISTEN      5678/npm
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('lsof')) {
          callback(new Error('lsof not found'), '', '');
        } else {
          callback(null, netstatOutput, '');
        }
      });

      const result = await checkPorts(mockCwd);

      const port9999 = result.find((p) => p.port === 9999);
      expect(port9999).toBeUndefined();

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
    });

    it('should skip netstat parts without port match', async () => {
      const netstatOutput = `
tcp        0      0 noport                  0.0.0.0:*               LISTEN      1234/node
tcp        0      0 0.0.0.0:3000            0.0.0.0:*               LISTEN      5678/npm
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('lsof')) {
          callback(new Error('lsof not found'), '', '');
        } else {
          callback(null, netstatOutput, '');
        }
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
    });

    it('should skip lsof lines with fewer than 9 parts', async () => {
      const lsofOutput = `COMMAND PID USER FD TYPE
npm      5678 user   13u  IPv4  67890      0t0  TCP *:3000(LISTEN)`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        callback(null, lsofOutput, '');
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
    });

    it('should skip netstat lines that do not contain LISTEN', async () => {
      const netstatOutput = `
Proto Recv-Q Send-Q Local Address           Foreign Address         State
tcp        0      0 0.0.0.0:3000            0.0.0.0:*               CLOSE_WAIT
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('lsof')) {
          callback(new Error('lsof not found'), '', '');
        } else {
          callback(null, netstatOutput, '');
        }
      });

      const result = await checkPorts(mockCwd);

      expect(result.every((p) => !p.inUse)).toBe(true);
    });

    it('should handle empty lsof lines', async () => {
      const lsofOutput = `

node     1234 user   12u  IPv4  12345      0t0  TCP *:3000(LISTEN)

`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        callback(null, lsofOutput, '');
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
      expect(port3000?.process).toBe('node');
    });

    it('should handle netstat without process names (no -p flag)', async () => {
      const netstatOutput = `
Proto Recv-Q Send-Q Local Address           Foreign Address         State
tcp        0      0 0.0.0.0:3000            0.0.0.0:*               LISTEN
tcp6       0      0 :::8080                 :::*                    LISTEN
`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        if (cmd.toString().includes('lsof')) {
          callback(new Error('lsof not found'), '', '');
        } else {
          callback(null, netstatOutput, '');
        }
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      const port8080 = result.find((p) => p.port === 8080);

      expect(port3000?.inUse).toBe(true);
      expect(port3000?.process).toBe('unknown');
      expect(port8080?.inUse).toBe(true);
      expect(port8080?.process).toBe('unknown');
    });

    it('should ignore lsof lines where port is not in COMMON_DEV_PORTS', async () => {
      const lsofOutput = `node     1234 user   12u  IPv4  12345      0t0  TCP *:9999(LISTEN)
npm      5678 user   13u  IPv4  67890      0t0  TCP *:3000(LISTEN)`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        callback(null, lsofOutput, '');
      });

      const result = await checkPorts(mockCwd);

      const port9999 = result.find((p) => p.port === 9999);
      expect(port9999).toBeUndefined();

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
    });

    it('should convert process names to lowercase', async () => {
      const lsofOutput = `NODE     1234 user   12u  IPv4  12345      0t0  TCP *:3000(LISTEN)
NPM      5678 user   13u  IPv4  67890      0t0  TCP *:8080(LISTEN)`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        callback(null, lsofOutput, '');
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      const port8080 = result.find((p) => p.port === 8080);

      expect(port3000?.process).toBe('node');
      expect(port8080?.process).toBe('npm');
    });
  });

  describe('checkPorts - macOS', () => {
    beforeEach(() => {
      vi.mocked(os.platform).mockReturnValue('darwin');
    });

    it('should work on macOS using lsof', async () => {
      const lsofOutput = `node     1234 user   12u  IPv4  12345      0t0  TCP *:3000(LISTEN)`;

      type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
      mockExec.mockImplementation((cmd: string, options: Record<string, unknown>, callback: ExecCallback) => {
        callback(null, lsofOutput, '');
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find((p) => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
      expect(port3000?.process).toBe('node');
    });
  });

  describe('formatPortStatus', () => {
    it('should format no active ports', () => {
      const ports: PortInfo[] = [
        { port: 3000, inUse: false },
        { port: 8080, inUse: false },
      ];

      const formatted = formatPortStatus(ports);

      expect(formatted).toBe('No dev servers detected');
    });

    it('should format single active port', () => {
      const ports: PortInfo[] = [
        { port: 3000, inUse: true, process: 'node' },
        { port: 8080, inUse: false },
      ];

      const formatted = formatPortStatus(ports);

      expect(formatted).toBe('Active ports: 3000 (node)');
    });

    it('should format multiple active ports', () => {
      const ports: PortInfo[] = [
        { port: 3000, inUse: true, process: 'node' },
        { port: 8080, inUse: true, process: 'npm' },
        { port: 5000, inUse: false },
      ];

      const formatted = formatPortStatus(ports);

      expect(formatted).toBe('Active ports: 3000 (node), 8080 (npm)');
    });

    it('should format active port without process name', () => {
      const ports: PortInfo[] = [
        { port: 3000, inUse: true },
        { port: 8080, inUse: false },
      ];

      const formatted = formatPortStatus(ports);

      expect(formatted).toBe('Active ports: 3000');
    });

    it('should format mix of ports with and without process names', () => {
      const ports: PortInfo[] = [
        { port: 3000, inUse: true, process: 'node' },
        { port: 8080, inUse: true },
        { port: 5000, inUse: true, process: 'python' },
      ];

      const formatted = formatPortStatus(ports);

      expect(formatted).toBe('Active ports: 3000 (node), 8080, 5000 (python)');
    });

    it('should handle empty port list', () => {
      const ports: PortInfo[] = [];

      const formatted = formatPortStatus(ports);

      expect(formatted).toBe('No dev servers detected');
    });
  });

  describe('COMMON_DEV_PORTS', () => {
    it('should include standard development ports', () => {
      expect(COMMON_DEV_PORTS).toContain(3000); // React/Next.js default
      expect(COMMON_DEV_PORTS).toContain(5173); // Vite default
      expect(COMMON_DEV_PORTS).toContain(8080); // Common alt port
      expect(COMMON_DEV_PORTS).toContain(4000); // Common GraphQL port
    });

    it('should be an array of numbers', () => {
      expect(Array.isArray(COMMON_DEV_PORTS)).toBe(true);
      expect(COMMON_DEV_PORTS.every((p) => typeof p === 'number')).toBe(true);
    });
  });
});
