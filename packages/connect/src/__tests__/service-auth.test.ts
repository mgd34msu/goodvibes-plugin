/**
 * The credential trust boundary: what may be registered, what a record already
 * on disk becomes, and what is refused.
 *
 * Every test writes to a tmpdir with `process.cwd()` stubbed, the same isolation
 * the secrets-store tests use, so no real credential file is touched.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resetConfigCache } from '@goodvibes/core/config';
import * as store from '../fetch/secrets-store.js';
import { parseServiceAuth, normalizeStoredAuth } from '../fetch/service-auth.js';
import type { ServiceAuth } from '../fetch/service-auth.js';
import { handleService } from '../tools/service.js';
import { getAuthStatus } from '../fetch/auth/auth-orchestrator.js';

const STATE = ['.goodvibes'];

interface ParsedEnvelope {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

describe('service auth boundary', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'service-auth-test-'));
    await fs.promises.mkdir(path.join(tmpDir, ...STATE), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    resetConfigCache();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    resetConfigCache();
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  async function seedSecretsFile(services: Record<string, unknown>): Promise<void> {
    await fs.promises.writeFile(
      path.join(tmpDir, ...STATE, 'goodvibes.secrets.json'),
      JSON.stringify({ services, global: {} }),
      'utf-8',
    );
  }

  async function readSecretsFile(): Promise<{ services: Record<string, unknown> }> {
    const raw = await fs.promises.readFile(
      path.join(tmpDir, ...STATE, 'goodvibes.secrets.json'),
      'utf-8',
    );
    return JSON.parse(raw) as { services: Record<string, unknown> };
  }

  describe('round-trip per auth mode', () => {
    const modes: Array<[string, ServiceAuth]> = [
      ['none', { type: 'none' }],
      ['bearer', { type: 'bearer', token: 'ghp_token_value' }],
      ['bearer via $env', { type: 'bearer', token: { $env: 'SOME_TOKEN_VAR' } }],
      ['basic', { type: 'basic', username: 'admin', password: 'hunter2' }],
      ['api-key', { type: 'api-key', header: 'X-API-Key', key: 'key-123' }],
      [
        'custom-headers',
        { type: 'custom-headers', headers: { 'X-One': 'v1', 'X-Two': { $env: 'HDR_VAR' } } },
      ],
      [
        'oauth2',
        {
          type: 'oauth2',
          client_id: 'cid',
          client_secret: { $env: 'OAUTH_SECRET' },
          token_url: 'https://auth.example.com/token',
          authorize_url: 'https://auth.example.com/authorize',
          redirect_uri: 'http://localhost:9876/callback',
          scopes: ['read', 'write'],
          access_token: 'at',
          refresh_token: 'rt',
          expires_at: 1_800_000_000_000,
        },
      ],
      [
        'session',
        {
          type: 'session',
          login_url: 'https://example.com/login',
          login_body: { username: 'admin', password: { $env: 'LOGIN_PASS' } },
          token_path: 'data.access_token',
        },
      ],
    ];

    for (const [label, auth] of modes) {
      it(`parses, stores and reads back ${label} unchanged`, async () => {
        const parsed = parseServiceAuth(auth);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) {
          return;
        }
        expect(parsed.auth).toEqual(auth);

        await store.setServiceSecret('svc', parsed.auth);
        expect(await store.getServiceSecrets('svc')).toEqual(auth);
      });
    }
  });

  describe('legacy flat records', () => {
    it('keeps a plain legacy record as its declared mode', () => {
      expect(normalizeStoredAuth({ type: 'bearer', token: 'abc123' })).toEqual({
        type: 'bearer',
        token: 'abc123',
      });
    });

    it('keeps the declared mode and drops the other modes fields', () => {
      // The contradictory case: a bearer token beside basic credentials.
      expect(
        normalizeStoredAuth({
          type: 'bearer',
          token: 'tok_value',
          username: 'admin',
          password: 'hunter2',
        }),
      ).toEqual({ type: 'bearer', token: 'tok_value' });
    });

    it('reads no credential from a record that declares no mode', () => {
      // Nothing declares what these fields are for, and the pre-union code sent
      // no header for such a record. Guessing basic here would put a password on
      // the wire that this machine has never sent.
      expect(
        normalizeStoredAuth({ token: 'tok_value', username: 'admin', password: 'hunter2' }),
      ).toBeUndefined();
      expect(normalizeStoredAuth({ token: 'tok_value' })).toBeUndefined();
    });

    it('reads no credential when the declared mode cannot be built', () => {
      // Declares api-key but never says which header, so nothing is applied.
      expect(normalizeStoredAuth({ type: 'api-key', key: 'k', token: 'tok_value' })).toBeUndefined();
    });

    it('reads no credential from an unknown mode', () => {
      expect(normalizeStoredAuth({ type: 'jwt', token: 'tok_value' })).toBeUndefined();
    });

    it('keeps a declared oauth2 record and drops the static fields beside it', () => {
      expect(
        normalizeStoredAuth({
          type: 'oauth2',
          client_id: 'cid',
          token_url: 'https://auth.example.com/token',
          access_token: 'at',
          token: 'stray-token',
          username: 'admin',
          password: 'hunter2',
        }),
      ).toEqual({
        type: 'oauth2',
        client_id: 'cid',
        token_url: 'https://auth.example.com/token',
        access_token: 'at',
      });
    });

    it('honours a declared none and drops any credential beside it', () => {
      expect(normalizeStoredAuth({ type: 'none', token: 'stray-token' })).toEqual({ type: 'none' });
    });

    it('reports no auth for a record with no usable credential', () => {
      expect(normalizeStoredAuth({ type: 'bearer' })).toBeUndefined();
      expect(normalizeStoredAuth({ type: 'basic', username: 'admin' })).toBeUndefined();
      expect(normalizeStoredAuth({ type: 'bearer', token: '   ' })).toBeUndefined();
      expect(normalizeStoredAuth('not-an-object')).toBeUndefined();
    });

    it('normalizes on load without rewriting the stored file', async () => {
      await seedSecretsFile({
        mixed: { type: 'bearer', token: 'tok_value', username: 'admin', password: 'hunter2' },
      });

      expect(await store.getServiceSecrets('mixed')).toEqual({ type: 'bearer', token: 'tok_value' });
      expect((await readSecretsFile()).services.mixed).toEqual({
        type: 'bearer',
        token: 'tok_value',
        username: 'admin',
        password: 'hunter2',
      });
    });

    it('carries an uninterpretable record through a later write', async () => {
      await seedSecretsFile({ broken: { type: 'bearer' } });

      expect(await store.getServiceSecrets('broken')).toBeUndefined();
      await store.setServiceSecret('other', { type: 'bearer', token: 'tok_value' });

      const onDisk = await readSecretsFile();
      expect(onDisk.services.broken).toEqual({ type: 'bearer' });
      expect(onDisk.services.other).toEqual({ type: 'bearer', token: 'tok_value' });
    });

    it('keeps every field of a record whose declared mode cannot be built', async () => {
      // api-key without a header name cannot be built, and the basic pair beside
      // it is not evidence of anything. The whole record survives a rewrite.
      const record = {
        type: 'api-key',
        username: 'admin',
        password: 'hunter2',
        token_url: 'https://auth.example.com/token',
      };
      await seedSecretsFile({ legacy: record });

      expect(normalizeStoredAuth(record)).toBeUndefined();
      expect(await store.getServiceSecrets('legacy')).toBeUndefined();

      await store.setServiceSecret('unrelated', { type: 'bearer', token: 'tok_value' });
      expect((await readSecretsFile()).services.legacy).toEqual(record);
    });

    it('keeps every field of a record whose declared mode carries only metadata', async () => {
      // oauth2 with an expiry stamp but nothing that authenticates or starts a
      // flow. Building it would drop the credentials sitting beside it.
      const record = { type: 'oauth2', expires_at: 1, username: 'admin', password: 'hunter2' };
      await seedSecretsFile({ legacy: record });

      expect(normalizeStoredAuth(record)).toBeUndefined();
      expect(normalizeStoredAuth({ type: 'session', token_path: 'data.token' })).toBeUndefined();

      await store.setServiceSecret('unrelated', { type: 'bearer', token: 'tok_value' });
      expect((await readSecretsFile()).services.legacy).toEqual(record);
    });

    it('keeps every field of a typeless record with a stray expiry stamp', async () => {
      const record = { username: 'admin', password: 'hunter2', expires_at: 1 };
      await seedSecretsFile({ legacy: record });

      expect(normalizeStoredAuth(record)).toBeUndefined();
      expect(await store.getServiceSecrets('legacy')).toBeUndefined();

      await store.setServiceSecret('unrelated', { type: 'bearer', token: 'tok_value' });
      expect((await readSecretsFile()).services.legacy).toEqual(record);
    });

    it('purges an uninterpretable record on remove', async () => {
      await seedSecretsFile({ broken: { type: 'bearer' } });

      expect(await store.removeServiceSecret('broken')).toBe(true);
      expect((await readSecretsFile()).services.broken).toBeUndefined();
    });
  });

  describe('expiry on a static credential', () => {
    const expired = { type: 'bearer', token: 'tok_value', expires_at: Date.now() - 1000 } as const;

    it('accepts an expiry stamp on a static mode and keeps it on disk', async () => {
      const parsed = parseServiceAuth(expired);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) {
        return;
      }
      expect(parsed.auth).toEqual(expired);

      await store.setServiceSecret('svc', parsed.auth);
      expect(await store.getServiceSecrets('svc')).toEqual(expired);
      expect((await readSecretsFile()).services.svc).toEqual(expired);
    });

    it('keeps a legacy expiry stamp through normalization', () => {
      expect(normalizeStoredAuth(expired)).toEqual(expired);
      expect(
        normalizeStoredAuth({ type: 'api-key', header: 'X-Key', key: 'k', expires_at: 42 }),
      ).toEqual({ type: 'api-key', header: 'X-Key', key: 'k', expires_at: 42 });
    });

    it('still reports an expired static credential as expired', async () => {
      await store.setServiceSecret('svc', expired);
      expect(await getAuthStatus('svc')).toBe('expired');
    });

    it('reports a static credential with a future expiry as valid', async () => {
      await store.setServiceSecret('svc', { ...expired, expires_at: Date.now() + 3_600_000 });
      expect(await getAuthStatus('svc')).toBe('valid');
    });
  });

  describe('rejecting a malformed registration', () => {
    it('refuses fields from a second auth mode', () => {
      const parsed = parseServiceAuth({
        type: 'bearer',
        token: 'tok_value',
        username: 'admin',
        password: 'hunter2',
      });
      expect(parsed.ok).toBe(false);
      if (parsed.ok) {
        return;
      }
      expect(parsed.error).toContain('does not accept field(s): username, password');
    });

    it('refuses an unknown mode', () => {
      const parsed = parseServiceAuth({ type: 'jwt', token: 'tok_value' });
      expect(parsed.ok).toBe(false);
      if (parsed.ok) {
        return;
      }
      expect(parsed.error).toContain('"type" must be one of');
      expect(parsed.error).toContain('jwt');
    });

    it('never echoes the received value back in the rejection message', () => {
      // A double-wrapped auth object puts a whole credential record in `type`.
      // The message may say what kind of thing arrived, never what it held.
      const parsed = parseServiceAuth({ type: { type: 'bearer', token: 'sk-SECRET' } });
      expect(parsed.ok).toBe(false);
      if (parsed.ok) {
        return;
      }
      expect(parsed.error).not.toContain('sk-SECRET');
      expect(parsed.error).toContain('object');
    });

    it('refuses a mode with its credential missing or blank', () => {
      for (const raw of [{ type: 'bearer' }, { type: 'bearer', token: '  ' }]) {
        const parsed = parseServiceAuth(raw);
        expect(parsed.ok).toBe(false);
        if (!parsed.ok) {
          expect(parsed.error).toContain('bearer auth requires "token"');
        }
      }

      const halfBasic = parseServiceAuth({ type: 'basic', username: 'admin' });
      expect(halfBasic.ok).toBe(false);

      const keyless = parseServiceAuth({ type: 'api-key', header: 'X-API-Key' });
      expect(keyless.ok).toBe(false);
    });

    it('refuses a wrongly typed credential value', () => {
      const parsed = parseServiceAuth({ type: 'bearer', token: { env: 'TYPO_VAR' } });
      expect(parsed.ok).toBe(false);
    });

    it('refuses an oauth2 or session record that could never authenticate', () => {
      expect(parseServiceAuth({ type: 'oauth2' }).ok).toBe(false);
      expect(parseServiceAuth({ type: 'session' }).ok).toBe(false);
      expect(parseServiceAuth({ type: 'session', login_url: 'https://example.com/login' }).ok).toBe(
        false,
      );
    });

    it('refuses a non-object auth', () => {
      expect(parseServiceAuth('bearer tok_value').ok).toBe(false);
      expect(parseServiceAuth(null).ok).toBe(false);
      expect(parseServiceAuth(['bearer']).ok).toBe(false);
    });
  });

  describe('service tool set_auth', () => {
    async function callService(args: unknown): Promise<ParsedEnvelope> {
      const res = await handleService(args);
      const block = (res.content as { type: string; text: string }[])[0];
      return JSON.parse(block.text) as ParsedEnvelope;
    }

    it('stores a well-formed auth and reports only its status', async () => {
      const envelope = await callService({
        action: 'set_auth',
        name: 'github',
        auth: { type: 'bearer', token: 'ghp_token_value' },
      });

      expect(envelope.success).toBe(true);
      expect(envelope.data).toMatchObject({ name: 'github', stored: true, auth_status: 'valid' });
      expect(JSON.stringify(envelope)).not.toContain('ghp_token_value');
      expect(await store.getServiceSecrets('github')).toEqual({
        type: 'bearer',
        token: 'ghp_token_value',
      });
    });

    it('rejects a mixed-mode auth and stores nothing', async () => {
      const envelope = await callService({
        action: 'set_auth',
        name: 'github',
        auth: { type: 'bearer', token: 'ghp_token_value', username: 'admin', password: 'hunter2' },
      });

      expect(envelope.success).toBe(false);
      expect(envelope.error).toContain('does not accept field(s)');
      expect(await store.getServiceSecrets('github')).toBeUndefined();
    });
  });
});
