/**
 * Ported from v1 precision-engine `__tests__/utils/secrets-store.test.ts`
 * (assertions intact). The only change is the file location: v2 stores
 * credentials under the namespaced `.goodvibes/` state dir, so the seed/read
 * paths point there.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as store from '../fetch/secrets-store.js';

const STATE = ['.goodvibes'];

/** The resolved-auth member for one mode, so a test can read that mode's fields. */
type Resolved<M extends store.AuthMode> = Extract<store.ResolvedServiceAuth, { type: M }>;

describe('secrets-store', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'secrets-store-test-'));
    await fs.promises.mkdir(path.join(tmpDir, ...STATE), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('loadSecrets', () => {
    it('should return empty defaults when file does not exist', async () => {
      const secrets = await store.loadSecrets();
      expect(secrets).toEqual({ services: {}, global: {} });
    });

    it('should load existing secrets file', async () => {
      const data = { services: { github: { type: 'bearer', token: 'abc123' } }, global: {} };
      await fs.promises.writeFile(
        path.join(tmpDir, ...STATE, 'goodvibes.secrets.json'),
        JSON.stringify(data),
        'utf-8',
      );
      const secrets = await store.loadSecrets();
      expect(secrets.services.github).toEqual({ type: 'bearer', token: 'abc123' });
    });

    it('should throw on malformed JSON', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, ...STATE, 'goodvibes.secrets.json'),
        '{invalid json content',
        'utf-8',
      );
      await expect(store.loadSecrets()).rejects.toThrow();
    });
  });

  describe('saveSecrets', () => {
    it('should write secrets with 0o600 permissions', async () => {
      await store.saveSecrets({ services: { test: { type: 'bearer', token: 'tok' } }, global: {} });
      const secretsPath = path.join(tmpDir, ...STATE, 'goodvibes.secrets.json');
      const stat = await fs.promises.stat(secretsPath);
      expect(stat.mode & 0o777).toBe(0o600);
      const content = JSON.parse(await fs.promises.readFile(secretsPath, 'utf-8'));
      expect(content.services.test.token).toBe('tok');
    });

    it('replaces the secrets file by rename, never opening it for writing', async () => {
      const secretsPath = path.join(tmpDir, ...STATE, 'goodvibes.secrets.json');
      await store.setServiceSecret('github', { type: 'bearer', token: 'one' });
      // Only a rename over the path can update a file this process cannot write
      // to, so a truncating in-place write would fail here.
      await fs.promises.chmod(secretsPath, 0o444);
      await expect(fs.promises.writeFile(secretsPath, 'direct')).rejects.toThrow();

      await store.setServiceSecret('gitlab', { type: 'bearer', token: 'two' });

      const secrets = await store.loadSecrets();
      expect(secrets.services.github).toEqual({ type: 'bearer', token: 'one' });
      expect(secrets.services.gitlab).toEqual({ type: 'bearer', token: 'two' });
      expect((await fs.promises.stat(secretsPath)).mode & 0o777).toBe(0o600);
    });

    it('leaves no temp residue beside the secrets file', async () => {
      await store.setServiceSecret('svc', { type: 'bearer', token: 'tok' });
      const entries = await fs.promises.readdir(path.join(tmpDir, ...STATE));
      expect(entries.filter((e) => e.includes('.tmp'))).toEqual([]);
    });
  });

  describe('getServiceSecrets / setServiceSecret', () => {
    it('should return undefined for unknown service', async () => {
      expect(await store.getServiceSecrets('nonexistent')).toBeUndefined();
    });

    it('should store and retrieve service auth', async () => {
      await store.setServiceSecret('myapi', { type: 'api-key', header: 'X-API-Key', key: 'secret123' });
      const auth = await store.getServiceSecrets('myapi');
      expect(auth).toEqual({ type: 'api-key', header: 'X-API-Key', key: 'secret123' });
    });
  });

  describe('removeServiceSecret', () => {
    it('should return false if service does not exist', async () => {
      expect(await store.removeServiceSecret('nonexistent')).toBe(false);
    });

    it('should remove an existing service', async () => {
      await store.setServiceSecret('temp', { type: 'bearer', token: 'x' });
      expect(await store.removeServiceSecret('temp')).toBe(true);
      expect(await store.getServiceSecrets('temp')).toBeUndefined();
    });
  });

  describe('resolveSecretValue', () => {
    it('should return string values as-is', () => {
      expect(store.resolveSecretValue('hello')).toBe('hello');
    });

    it('should resolve env var references', () => {
      process.env.TEST_SECRET_KEY = 'resolved-value';
      try {
        expect(store.resolveSecretValue({ $env: 'TEST_SECRET_KEY' })).toBe('resolved-value');
      } finally {
        delete process.env.TEST_SECRET_KEY;
      }
    });

    it('should return undefined for missing env vars', () => {
      expect(store.resolveSecretValue({ $env: 'DEFINITELY_NOT_SET_12345' })).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      expect(store.resolveSecretValue(undefined)).toBeUndefined();
    });
  });

  describe('resolveAuthConfig', () => {
    it('should resolve bearer token env ref', () => {
      process.env.TEST_BEARER_TOKEN = 'my-bearer-token';
      try {
        const auth = store.resolveAuthConfig({
          type: 'bearer',
          token: { $env: 'TEST_BEARER_TOKEN' },
        }) as Resolved<'bearer'>;
        expect(auth.token).toBe('my-bearer-token');
      } finally {
        delete process.env.TEST_BEARER_TOKEN;
      }
    });

    it('should resolve OAuth2 client credentials', () => {
      process.env.TEST_CLIENT_ID = 'client-123';
      process.env.TEST_CLIENT_SECRET = 'secret-456';
      try {
        const auth = store.resolveAuthConfig({
          type: 'oauth2',
          client_id: { $env: 'TEST_CLIENT_ID' },
          client_secret: { $env: 'TEST_CLIENT_SECRET' },
          access_token: 'runtime-token',
          refresh_token: 'runtime-refresh',
          token_url: 'https://auth.example.com/token',
          scopes: ['read', 'write'],
        }) as Resolved<'oauth2'>;
        expect(auth.client_id).toBe('client-123');
        expect(auth.client_secret).toBe('secret-456');
        expect(auth.access_token).toBe('runtime-token');
        expect(auth.refresh_token).toBe('runtime-refresh');
        expect(auth.token_url).toBe('https://auth.example.com/token');
        expect(auth.scopes).toEqual(['read', 'write']);
      } finally {
        delete process.env.TEST_CLIENT_ID;
        delete process.env.TEST_CLIENT_SECRET;
      }
    });

    it('should resolve login_body env refs', () => {
      process.env.TEST_LOGIN_PASS = 'secret-pass';
      try {
        const auth = store.resolveAuthConfig({
          type: 'session',
          login_url: 'https://example.com/login',
          login_body: { username: 'admin', password: { $env: 'TEST_LOGIN_PASS' } },
          token_path: 'data.access_token',
        }) as Resolved<'session'>;
        expect(auth.login_body).toEqual({ username: 'admin', password: 'secret-pass' });
        expect(auth.login_url).toBe('https://example.com/login');
        expect(auth.token_path).toBe('data.access_token');
      } finally {
        delete process.env.TEST_LOGIN_PASS;
      }
    });

    it('should resolve all env refs in auth config', () => {
      process.env.TEST_USER = 'admin';
      try {
        const auth = store.resolveAuthConfig({
          type: 'basic',
          username: { $env: 'TEST_USER' },
          password: { $env: 'TEST_MISSING' },
        }) as Resolved<'basic'>;
        expect(auth.username).toBe('admin');
        expect(auth.password).toBeUndefined();
      } finally {
        delete process.env.TEST_USER;
      }
    });

    it('should resolve headers map', () => {
      process.env.TEST_HEADER_VAL = 'header-value';
      try {
        const auth = store.resolveAuthConfig({
          type: 'custom-headers',
          headers: { 'X-Custom': { $env: 'TEST_HEADER_VAL' }, 'X-Static': 'static-value' },
        }) as Resolved<'custom-headers'>;
        expect(auth.headers).toEqual({ 'X-Custom': 'header-value', 'X-Static': 'static-value' });
      } finally {
        delete process.env.TEST_HEADER_VAL;
      }
    });
  });

  describe('isEnvRef', () => {
    it('should identify env refs', () => {
      expect(store.isEnvRef({ $env: 'TEST' })).toBe(true);
    });

    it('should reject non-env-refs', () => {
      expect(store.isEnvRef('string')).toBe(false);
      expect(store.isEnvRef(null)).toBe(false);
      expect(store.isEnvRef({})).toBe(false);
      expect(store.isEnvRef({ env: 'TEST' })).toBe(false);
    });
  });

  describe('listServiceNames', () => {
    it('should list stored service names', async () => {
      await store.setServiceSecret('svc1', { type: 'bearer', token: 'a' });
      await store.setServiceSecret('svc2', { type: 'bearer', token: 'b' });
      const names = await store.listServiceNames();
      expect(names).toContain('svc1');
      expect(names).toContain('svc2');
    });
  });
});
