import { vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import * as os from 'os';
import * as path from 'path';

// Spy on process methods to mock them effectively
// We use a no-op for chdir and a mock for exit that prevents actual exit
vi.spyOn(process, 'chdir').mockImplementation(() => {});
vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => { return undefined as never; });

// Mock fs and fs/promises using memfs
// We import memfs inside the factory because vi.mock is hoisted above top-level imports
vi.mock('fs', async () => {
  const memfs = await import('memfs');
  return {
    default: memfs.fs,
    ...memfs.fs,
  };
});

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return {
    default: memfs.fs,
    ...memfs.fs,
  };
});

vi.mock('fs/promises', async () => {
  const memfs = await import('memfs');
  return {
    default: memfs.fs.promises,
    ...memfs.fs.promises,
  };
});

vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs');
  return {
    default: memfs.fs.promises,
    ...memfs.fs.promises,
  };
});

// Mock isTestEnvironment
vi.mock('./shared/hook-io.js', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    isTestEnvironment: true,
  };
});

// Helper to reset the virtual FS
export function resetMockFs() {
  vol.reset();
  const cwd = process.cwd();
  const tmpDir = os.tmpdir();
  // PLUGIN_ROOT defaults to one directory up from CWD in constants.ts
  const pluginRoot = path.resolve(cwd, '..');
  
  // Seed with a mock package.json so tests can resolve version
  // We place it in the current working directory
  const packageJson = JSON.stringify({
    name: 'goodvibes-hooks',
    version: '2.1.0',
    type: 'module'
  });

  const pluginManifest = JSON.stringify({
    version: '2.1.0'
  });

  const toolRegistry = 'total: 17\n';

  const json: Record<string, string> = {};
  json[path.join(cwd, 'package.json')] = packageJson;
  json[path.join(pluginRoot, '.claude-plugin', 'plugin.json')] = pluginManifest;
  json[path.join(pluginRoot, 'tools', '_registry.yaml')] = toolRegistry;
  
  vol.fromJSON(json);
  
  // Ensure temp directory exists
  try {
    vol.mkdirSync(tmpDir, { recursive: true });
  } catch (error) {
    // Ignore if already exists or other non-critical error during setup
  }
}

beforeEach(() => {
  resetMockFs();
});
