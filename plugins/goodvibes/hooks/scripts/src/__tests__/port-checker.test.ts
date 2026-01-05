/**
 * Tests for port checker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { execSync } from 'child_process';
import * as os from 'os';
import { checkPorts, formatPortStatus, COMMON_DEV_PORTS, type PortInfo } from '../context/port-checker.js';

vi.mock('child_process');
vi.mock('os');
vi.mock('../shared/logging.js', () => ({
  debug: vi.fn(),
}));

describe('port-checker', () => {
  const mockCwd = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
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

      vi.mocked(execSync).mockImplementation((cmd: string | Buffer) => {
        const cmdStr = cmd.toString();
        if (cmdStr.includes('netstat')) return netstatOutput;
        if (cmdStr.includes('tasklist')) return tasklistOutput;
        return '';
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find(p => p.port === 3000);
      const port8080 = result.find(p => p.port === 8080);

      expect(port3000?.inUse).toBe(true);
      expect(port3000?.process).toBe('node');
      expect(port8080?.inUse).toBe(true);
    });

    it('should handle IPv6 addresses on Windows', async () => {
      const netstatOutput = `
  TCP    [::]:3000              [::]:0                 LISTENING       1234
`;

      vi.mocked(execSync).mockImplementation((cmd: string | Buffer) => {
        const cmdStr = cmd.toString();
        if (cmdStr.includes('netstat')) return netstatOutput;
        if (cmdStr.includes('tasklist')) return '"node.exe","1234","Console","1","12,345 K"';
        return '';
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find(p => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
    });

    it('should handle tasklist failure gracefully', async () => {
      const netstatOutput = `
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234
`;

      vi.mocked(execSync).mockImplementation((cmd: string | Buffer) => {
        const cmdStr = cmd.toString();
        if (cmdStr.includes('netstat')) return netstatOutput;
        if (cmdStr.includes('tasklist')) throw new Error('Tasklist failed');
        return '';
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find(p => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
      expect(port3000?.process).toBe('PID:1234');
    });

    it('should handle netstat failure on Windows', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Netstat failed');
      });

      const result = await checkPorts(mockCwd);

      expect(result).toHaveLength(COMMON_DEV_PORTS.length);
      expect(result.every(p => !p.inUse)).toBe(true);
    });

    it('should skip non-LISTENING connections', async () => {
      const netstatOutput = `
  TCP    0.0.0.0:3000           0.0.0.0:0              ESTABLISHED     1234
  TCP    0.0.0.0:8080           0.0.0.0:0              TIME_WAIT       5678
`;

      vi.mocked(execSync).mockReturnValue(netstatOutput);

      const result = await checkPorts(mockCwd);

      expect(result.every(p => !p.inUse)).toBe(true);
    });

    it('should handle malformed netstat output', async () => {
      const netstatOutput = `
  TCP    malformed line
  INVALID DATA
`;

      vi.mocked(execSync).mockReturnValue(netstatOutput);

      const result = await checkPorts(mockCwd);

      expect(result).toHaveLength(COMMON_DEV_PORTS.length);
      expect(result.every(p => !p.inUse)).toBe(true);
    });
  });

  describe('checkPorts - Unix/Linux', () => {
    beforeEach(() => {
      vi.mocked(os.platform).mockReturnValue('linux');
    });

    it('should detect listening ports using lsof', async () => {
      const lsofOutput = `node     1234 user   12u  IPv4  12345      0t0  TCP *:3000(LISTEN)
npm      5678 user   13u  IPv4  67890      0t0  TCP localhost:8080(LISTEN)`;

      vi.mocked(execSync).mockReturnValue(lsofOutput);

      const result = await checkPorts(mockCwd);

      const port3000 = result.find(p => p.port === 3000);
      const port8080 = result.find(p => p.port === 8080);

      expect(port3000?.inUse).toBe(true);
      expect(port3000?.process).toBe('node');
      expect(port8080?.inUse).toBe(true);
      expect(port8080?.process).toBe('npm');
    });

    it('should only detect first occurrence of duplicate ports', async () => {
      const lsofOutput = `node     1234 user   12u  IPv4  12345      0t0  TCP *:3000(LISTEN)
node     5678 user   13u  IPv4  67890      0t0  TCP *:3000(LISTEN)`;

      vi.mocked(execSync).mockReturnValue(lsofOutput);

      const result = await checkPorts(mockCwd);

      const port3000Entries = result.filter(p => p.port === 3000 && p.inUse);
      expect(port3000Entries).toHaveLength(1);
    });

    it('should fallback to netstat when lsof fails', async () => {
      const netstatOutput = `
Proto Recv-Q Send-Q Local Address           Foreign Address         State
tcp        0      0 0.0.0.0:3000            0.0.0.0:*               LISTEN
tcp6       0      0 :::8080                 :::*                    LISTEN
`;

      vi.mocked(execSync).mockImplementation((cmd: string | Buffer) => {
        const cmdStr = cmd.toString();
        if (cmdStr.includes('lsof')) throw new Error('lsof not found');
        return netstatOutput;
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find(p => p.port === 3000);
      const port8080 = result.find(p => p.port === 8080);

      expect(port3000?.inUse).toBe(true);
      expect(port8080?.inUse).toBe(true);
    });

    it('should handle netstat with process info', async () => {
      const netstatOutput = `
tcp        0      0 0.0.0.0:3000            0.0.0.0:*               LISTEN      1234/node
tcp        0      0 0.0.0.0:8080            0.0.0.0:*               LISTEN      5678/npm
`;

      vi.mocked(execSync).mockImplementation((cmd: string | Buffer) => {
        const cmdStr = cmd.toString();
        if (cmdStr.includes('lsof')) throw new Error('lsof not found');
        return netstatOutput;
      });

      const result = await checkPorts(mockCwd);

      const port3000 = result.find(p => p.port === 3000);
      expect(port3000?.inUse).toBe(true);
      expect(port3000?.process).toBe('node');
    });

    it('should handle both lsof and netstat failure', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = await checkPorts(mockCwd);

      expect(result).toHaveLength(COMMON_DEV_PORTS.length);
      expect(result.every(p => !p.inUse)).toBe(true);
    });

    it('should skip non-LISTEN connections in netstat', async () => {
      const netstatOutput = `
tcp        0      0 0.0.0.0:3000            0.0.0.0:*               ESTABLISHED
tcp        0      0 0.0.0.0:8080            0.0.0.0:*               TIME_WAIT
`;

      vi.mocked(execSync).mockImplementation((cmd: string | Buffer) => {
        const cmdStr = cmd.toString();
        if (cmdStr.includes('lsof')) throw new Error('lsof not found');
        return netstatOutput;
      });

      const result = await checkPorts(mockCwd);

      expect(result.every(p => !p.inUse)).toBe(true);
    });

    it('should handle malformed lsof output', async () => {
      const lsofOutput = `
INVALID DATA
COMMAND PID
INCOMPLETE LINE
`;

      vi.mocked(execSync).mockReturnValue(lsofOutput);

      const result = await checkPorts(mockCwd);

      expect(result.every(p => !p.inUse)).toBe(true);
    });
  });

  describe('checkPorts - macOS', () => {
    beforeEach(() => {
      vi.mocked(os.platform).mockReturnValue('darwin');
    });

    it('should work on macOS using lsof', async () => {
      const lsofOutput = `node     1234 user   12u  IPv4  12345      0t0  TCP *:3000(LISTEN)`;

      vi.mocked(execSync).mockReturnValue(lsofOutput);

      const result = await checkPorts(mockCwd);

      const port3000 = result.find(p => p.port === 3000);
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
      expect(COMMON_DEV_PORTS.every(p => typeof p === 'number')).toBe(true);
    });
  });
});
