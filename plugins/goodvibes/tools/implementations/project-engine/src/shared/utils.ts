/**
 * Shared utility functions for project-engine v2.0.0.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import * as http from 'http';

const execAsync = promisify(exec);

/**
 * Check if a file exists asynchronously.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely read JSON file.
 */
export async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    if (!(await fileExists(filePath))) {
      return null;
    }
    const content = await fsPromises.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Execute command safely with timeout.
 */
export async function safeExec(
  command: string,
  cwd: string,
  timeout: number = 30000
): Promise<{ stdout: string; stderr: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd, timeout });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (caughtError: unknown) {
    const execError = caughtError as { stdout?: string; stderr?: string; message?: string };
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || '',
      error: execError.message || 'Command failed',
    };
  }
}

/**
 * Detect package manager in use.
 */
export async function detectPackageManager(projectPath: string): Promise<string> {
  if (await fileExists(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fileExists(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  if (await fileExists(path.join(projectPath, 'bun.lockb'))) return 'bun';
  return 'npm';
}

/**
 * Fetch URL content with redirect support.
 */
export function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}
