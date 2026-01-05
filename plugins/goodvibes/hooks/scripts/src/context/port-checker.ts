/**
 * Port Checker
 *
 * Checks for active development server ports on common ports.
 */

import { execSync } from 'child_process';
import * as os from 'os';
import { debug } from '../shared/logging.js';

/** Information about a network port. */
export interface PortInfo {
  port: number;
  inUse: boolean;
  process?: string;
}

/** Common development server ports to check. */
export const COMMON_DEV_PORTS = [3000, 3001, 4000, 5000, 5173, 8000, 8080, 8888];

/** Timeout for netstat/lsof commands in milliseconds. */
const COMMAND_TIMEOUT = 10000;
/** Timeout for tasklist command on Windows in milliseconds. */
const TASKLIST_TIMEOUT = 5000;

// =============================================================================
// Platform-Specific Parsing Functions
// =============================================================================

/**
 * Parse Windows netstat output to extract listening ports
 */
function parseWindowsNetstat(output: string, ports: number[]): Map<number, string> {
  const portMap = new Map<number, string>();
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Proto')) continue;

    // Format: TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    1234
    // Or: TCP    [::]:3000    [::]:0    LISTENING    1234
    const parts = trimmed.split(/\s+/);
    if (parts.length < 4) continue;

    const localAddr = parts[1];
    const state = parts[3];

    if (state !== 'LISTENING') continue;

    // Extract port from address (handles both IPv4 and IPv6)
    const portMatch = localAddr.match(/:(\d+)$/);
    if (!portMatch) continue;

    const port = parseInt(portMatch[1], 10);
    if (ports.includes(port)) {
      // Try to get PID and process name
      const pid = parts[4];
      let processName = pid ? `PID:${pid}` : undefined;

      if (pid) {
        try {
          const tasklistOutput = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
            encoding: 'utf-8',
            timeout: TASKLIST_TIMEOUT,
            windowsHide: true,
          });
          const match = tasklistOutput.match(/"([^"]+)"/);
          if (match) {
            processName = match[1].replace('.exe', '');
          }
        } catch (error: unknown) {
          debug('parseWindowsNetstat tasklist failed', { error: String(error) });
        }
      }

      portMap.set(port, processName || 'unknown');
    }
  }

  return portMap;
}

/**
 * Parse Unix lsof output to extract listening ports
 */
function parseUnixLsof(output: string, ports: number[]): Map<number, string> {
  const portMap = new Map<number, string>();
  const lines = output.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    // lsof -i output format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    const parts = line.split(/\s+/);
    if (parts.length < 9) continue;

    const command = parts[0];
    const name = parts[parts.length - 1];

    // Extract port from NAME column (e.g., *:3000 or localhost:3000)
    const portMatch = name.match(/:(\d+)/);
    if (!portMatch) continue;

    const port = parseInt(portMatch[1], 10);
    if (ports.includes(port) && !portMap.has(port)) {
      portMap.set(port, command.toLowerCase());
    }
  }

  return portMap;
}

/**
 * Parse Unix netstat output to extract listening ports
 */
function parseUnixNetstat(output: string, ports: number[]): Map<number, string> {
  const portMap = new Map<number, string>();
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('LISTEN')) continue;

    // Extract port from local address
    const parts = trimmed.split(/\s+/);
    for (const part of parts) {
      const portMatch = part.match(/:(\d+)$/);
      if (portMatch) {
        const port = parseInt(portMatch[1], 10);
        if (ports.includes(port)) {
          // Try to extract process name if available (netstat -p output)
          const processMatch = trimmed.match(/(\d+)\/(\S+)/);
          const processName = processMatch ? processMatch[2] : 'unknown';
          portMap.set(port, processName);
        }
        break;
      }
    }
  }

  return portMap;
}

// =============================================================================
// Platform-Specific Port Detection
// =============================================================================

/**
 * Check ports on Windows using netstat
 */
function checkPortsWindows(ports: number[]): Map<number, string> {
  try {
    const output = execSync('netstat -ano -p TCP', {
      encoding: 'utf-8',
      timeout: COMMAND_TIMEOUT,
      windowsHide: true,
    });
    return parseWindowsNetstat(output, ports);
  } catch (error: unknown) {
    debug("checkPortsWindows failed", { error: String(error) });
    return new Map();
  }
}

/**
 * Check ports on Unix-like systems (Linux, macOS) using lsof or netstat
 */
function checkPortsUnix(ports: number[]): Map<number, string> {
  // Try lsof first (more reliable for process names)
  try {
    const portsArg = ports.map(p => `-i:${p}`).join(' ');
    const output = execSync(`lsof ${portsArg} 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: COMMAND_TIMEOUT,
    });
    return parseUnixLsof(output, ports);
  } catch (error: unknown) {
    debug('checkPortsUnix lsof failed', { error: String(error) });
    // Fall back to netstat
    try {
      const output = execSync('netstat -tlnp 2>/dev/null || netstat -tln', {
        encoding: 'utf-8',
        timeout: COMMAND_TIMEOUT,
      });
      return parseUnixNetstat(output, ports);
    } catch (error: unknown) {
      debug("checkPortsUnix netstat failed", { error: String(error) });
      return new Map();
    }
  }
}

/** Check which common development ports are in use. */
export async function checkPorts(_cwd: string): Promise<PortInfo[]> {
  const platform = os.platform();
  let activePortsMap: Map<number, string>;

  if (platform === 'win32') {
    activePortsMap = checkPortsWindows(COMMON_DEV_PORTS);
  } else {
    activePortsMap = checkPortsUnix(COMMON_DEV_PORTS);
  }

  return COMMON_DEV_PORTS.map(port => ({
    port,
    inUse: activePortsMap.has(port),
    process: activePortsMap.get(port),
  }));
}

/** Format port status for display in context output. */
export function formatPortStatus(ports: PortInfo[]): string {
  const activePorts = ports.filter(p => p.inUse);

  if (activePorts.length === 0) {
    return 'No dev servers detected';
  }

  const portList = activePorts
    .map(p => (p.process ? `${p.port} (${p.process})` : `${p.port}`))
    .join(', ');

  return `Active ports: ${portList}`;
}
