/**
 * Trust boundary unit tests (BUILD NEW). Each of the five rules is exercised
 * directly against the pure functions in `trust.ts`.
 */

import { describe, it, expect } from 'vitest';
import {
  originOf,
  isSameOrigin,
  isSafeMethod,
  isDestinationAllowed,
  isCredentialAttachAllowed,
  isMethodAllowed,
  collectSecretValues,
  redactString,
  redactValue,
} from '../trust.js';

describe('trust boundary', () => {
  describe('originOf / isSameOrigin', () => {
    it('extracts an origin and compares by protocol+host+port', () => {
      expect(originOf('https://api.example.com/v1/x?y=1')).toBe('https://api.example.com');
      expect(originOf('not a url')).toBeNull();
      expect(isSameOrigin('https://a.com/x', 'https://a.com/y')).toBe(true);
      expect(isSameOrigin('https://a.com', 'http://a.com')).toBe(false); // protocol differs
      expect(isSameOrigin('https://a.com', 'https://a.com:8443')).toBe(false); // port differs
      expect(isSameOrigin('https://a.com', 'https://b.com')).toBe(false);
    });
  });

  describe('rule 2, destination allowlist (default-on in restricted mode)', () => {
    const registeredOrigins = ['https://api.stripe.com'];
    const allowlist = ['raw.githubusercontent.com'];

    it('allows a registered service origin', () => {
      const d = isDestinationAllowed('https://api.stripe.com/v1/customers', {
        mode: 'restricted',
        registeredOrigins,
        allowlist,
      });
      expect(d.allowed).toBe(true);
    });

    it('allows an allowlisted host', () => {
      const d = isDestinationAllowed('https://raw.githubusercontent.com/o/r/main/f', {
        mode: 'restricted',
        registeredOrigins,
        allowlist,
      });
      expect(d.allowed).toBe(true);
    });

    it('denies an unknown host in restricted mode', () => {
      const d = isDestinationAllowed('https://evil.example.com/x', {
        mode: 'restricted',
        registeredOrigins,
        allowlist,
      });
      expect(d.allowed).toBe(false);
      expect(d.reason).toContain('not a registered service origin');
    });

    it('allows any destination in open mode', () => {
      const d = isDestinationAllowed('https://evil.example.com/x', {
        mode: 'open',
        registeredOrigins,
        allowlist,
      });
      expect(d.allowed).toBe(true);
    });

    it('denies a malformed URL', () => {
      const d = isDestinationAllowed('http://', { mode: 'open', registeredOrigins, allowlist });
      expect(d.allowed).toBe(false);
    });
  });

  describe('rule 1, credential pinning is NOT toggleable', () => {
    it('attaches only on an exact origin match, in either mode', () => {
      expect(isCredentialAttachAllowed('https://api.stripe.com/v1/x', 'https://api.stripe.com')).toBe(true);
      // A same-host different-port target is a different origin, no attach.
      expect(isCredentialAttachAllowed('https://api.stripe.com:8443/v1/x', 'https://api.stripe.com')).toBe(false);
      // A lookalike host never gets the credential.
      expect(isCredentialAttachAllowed('https://api.stripe.com.evil.com/x', 'https://api.stripe.com')).toBe(false);
    });
  });

  describe('rule 3, per-service read-only default with write opt-in', () => {
    it('always allows safe methods', () => {
      expect(isSafeMethod('get')).toBe(true);
      expect(isMethodAllowed('GET', { mode: 'restricted', hasService: false }).allowed).toBe(true);
      expect(isMethodAllowed('HEAD', { mode: 'restricted', hasService: true }).allowed).toBe(true);
    });

    it('blocks a write on a service that did not opt in', () => {
      const d = isMethodAllowed('POST', { mode: 'restricted', hasService: true, writeMethods: [] });
      expect(d.allowed).toBe(false);
      expect(d.reason).toContain('read-only by default');
    });

    it('allows a write the service opted into', () => {
      const d = isMethodAllowed('post', { mode: 'restricted', hasService: true, writeMethods: ['POST'] });
      expect(d.allowed).toBe(true);
    });

    it('blocks a write to a bare url in restricted mode, allows in open mode', () => {
      expect(isMethodAllowed('DELETE', { mode: 'restricted', hasService: false }).allowed).toBe(false);
      expect(isMethodAllowed('DELETE', { mode: 'open', hasService: false }).allowed).toBe(true);
    });
  });

  describe('rule 5, redaction', () => {
    it('collects the secret plaintexts used for a request', () => {
      const secrets = collectSecretValues({
        type: 'basic',
        username: 'admin',
        password: 'hunter2xyz',
      });
      expect(secrets).toContain('hunter2xyz');
      // The base64 basic-auth pair is also collected so it can be scrubbed.
      expect(secrets).toContain(Buffer.from('admin:hunter2xyz', 'utf-8').toString('base64'));
    });

    it('ignores trivially short values so redaction cannot blank the response', () => {
      expect(collectSecretValues({ type: 'bearer', token: 'ab' })).toEqual([]);
    });

    it('collects a per-request auth override alongside the service auth', () => {
      const secrets = collectSecretValues(
        { type: 'bearer', token: 'service_token_value' },
        { type: 'bearer', token: 'per_request_token_value' },
      );
      expect(secrets).toContain('service_token_value');
      expect(secrets).toContain('per_request_token_value');
    });

    it('collects per-request api-key and custom-header values', () => {
      const secrets = collectSecretValues(undefined, {
        type: 'custom-headers',
        headers: { 'X-Api-Key': 'header_secret_value' },
      });
      expect(secrets).toContain('header_secret_value');
    });

    it('redacts every occurrence in strings and nested objects', () => {
      const secrets = ['sk_live_abcdef'];
      expect(redactString('key=sk_live_abcdef; again sk_live_abcdef', secrets)).toBe(
        'key=***REDACTED***; again ***REDACTED***',
      );
      const echoed = redactValue({ echoed: { token: 'sk_live_abcdef' }, list: ['sk_live_abcdef'] }, secrets);
      expect(echoed).toEqual({ echoed: { token: '***REDACTED***' }, list: ['***REDACTED***'] });
    });

    it('is a no-op when there are no secrets', () => {
      const value = { a: 1, b: 'text' };
      expect(redactValue(value, [])).toBe(value);
    });
  });
});
