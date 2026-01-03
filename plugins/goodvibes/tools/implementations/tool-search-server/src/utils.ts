/**
 * Utility functions for GoodVibes MCP Server
 */

import Fuse from 'fuse.js';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import * as http from 'http';

import { Registry, RegistryEntry, SearchResult } from './types.js';
import { PLUGIN_ROOT, FUSE_OPTIONS } from './config.js';

const execAsync = promisify(exec);

/**
 * Load registry from YAML file
 */
export function loadRegistry(registryPath: string): Registry | null {
  try {
    const fullPath = path.join(PLUGIN_ROOT, registryPath);
    if (!fs.existsSync(fullPath)) {
      console.error(`Registry not found: ${fullPath}`);
      return null;
    }
    const content = fs.readFileSync(fullPath, 'utf-8');
    return yaml.load(content) as Registry;
  } catch (error) {
    console.error(`Error loading registry ${registryPath}:`, error);
    return null;
  }
}

/**
 * Create Fuse index from registry
 */
export function createIndex(registry: Registry | null): Fuse<RegistryEntry> | null {
  if (!registry || !registry.search_index) return null;
  return new Fuse(registry.search_index, FUSE_OPTIONS);
}

/**
 * Perform search and return formatted results
 */
export function search(
  index: Fuse<RegistryEntry> | null,
  query: string,
  limit: number = 5
): SearchResult[] {
  if (!index) return [];

  const results = index.search(query, { limit });
  return results.map((r) => ({
    name: r.item.name,
    path: r.item.path,
    description: r.item.description,
    relevance: Math.round((1 - (r.score || 0)) * 100) / 100,
  }));
}

/**
 * Safely read JSON file
 */
export function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Execute command safely with timeout
 */
export async function safeExec(
  command: string,
  cwd: string,
  timeout: number = 30000
): Promise<{ stdout: string; stderr: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd, timeout });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      error: err.message || 'Command failed',
    };
  }
}

/**
 * Detect package manager in use
 */
export function detectPackageManager(projectPath: string): string {
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(projectPath, 'bun.lockb'))) return 'bun';
  return 'npm';
}

/**
 * Fetch URL content
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

/**
 * Create a successful tool response
 */
export function success(data: unknown): { content: Array<{ type: string; text: string }> } {
  return {
    content: [{
      type: 'text',
      text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
    }],
  };
}

/**
 * Create an error tool response
 */
export function error(message: string): { content: Array<{ type: string; text: string }>; isError: boolean } {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}
