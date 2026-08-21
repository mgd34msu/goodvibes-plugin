/**
 * The service credential shape and its two boundary parsers.
 *
 * `ServiceAuth` is a discriminated union on the auth mode, so a record can only
 * ever carry the fields of ONE mode: a bearer token can no longer sit beside
 * basic credentials, and code past the boundary never has to ask which of the
 * optional fields the record "really" meant.
 *
 * Two entry points guard that shape:
 *  - `parseServiceAuth` for a NEW registration (the `service` tool's `set_auth`
 *    action). Strict: an unknown mode, a foreign field, or a missing credential
 *    is rejected with a message naming the problem.
 *  - `normalizeStoredAuth` for a record already on disk, written under the old
 *    flat shape where every field was optional. Lenient: it maps the record onto
 *    exactly one mode instead of failing, so an existing registration keeps
 *    working.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Environment-variable reference. */
export interface EnvRef {
  $env: string;
}

/** A credential value: a literal, or an env reference resolved at use time. */
export type SecretValue = string | EnvRef;

/** The auth modes a registered service can use. */
export type AuthMode =
  | 'none'
  | 'bearer'
  | 'basic'
  | 'api-key'
  | 'custom-headers'
  | 'oauth2'
  | 'session';

/**
 * The auth union, parameterised by how credential values are carried: stored
 * records hold `string | EnvRef`, records that have been through
 * `resolveAuthConfig` hold the resolved `string | undefined`.
 */
export type ServiceAuthOf<V> =
  | { type: 'none' }
  | { type: 'bearer'; token: V; expires_at?: number }
  | { type: 'basic'; username: V; password: V; expires_at?: number }
  | { type: 'api-key'; header: string; key: V; expires_at?: number }
  | { type: 'custom-headers'; headers: Record<string, V>; expires_at?: number }
  | {
      type: 'oauth2';
      client_id?: V;
      client_secret?: V;
      token_url?: string;
      authorize_url?: string;
      redirect_uri?: string;
      scopes?: string[];
      /** Runtime-acquired access token (always plain, managed by the orchestrator). */
      access_token?: string;
      /** Runtime-acquired refresh token (always plain, managed by the orchestrator). */
      refresh_token?: string;
      expires_at?: number;
    }
  | {
      type: 'session';
      login_url?: string;
      login_body?: Record<string, V>;
      token_path?: string;
      /** Runtime-acquired session token (always plain, managed by the orchestrator). */
      access_token?: string;
      expires_at?: number;
    };

/** Auth configuration for a service, as registered and as stored. */
export type ServiceAuth = ServiceAuthOf<SecretValue>;

/** Auth configuration with every `$env` reference already resolved. */
export type ResolvedServiceAuth = ServiceAuthOf<string | undefined>;

/** The OAuth2 member, for the code that only ever runs on an OAuth2 service. */
export type OAuth2Auth = Extract<ServiceAuth, { type: 'oauth2' }>;

/** The session member, for the code that only ever runs on a session service. */
export type SessionAuth = Extract<ServiceAuth, { type: 'session' }>;

/** Result of parsing an incoming registration. */
export type ParsedServiceAuth = { ok: true; auth: ServiceAuth } | { ok: false; error: string };

const AUTH_MODES: readonly AuthMode[] = [
  'none',
  'bearer',
  'basic',
  'api-key',
  'custom-headers',
  'oauth2',
  'session',
];

/** The fields each mode accepts, `type` aside. Anything else is rejected. */
const FIELDS_BY_MODE: Record<AuthMode, readonly string[]> = {
  none: [],
  bearer: ['token', 'expires_at'],
  basic: ['username', 'password', 'expires_at'],
  'api-key': ['header', 'key', 'expires_at'],
  'custom-headers': ['headers', 'expires_at'],
  oauth2: [
    'client_id',
    'client_secret',
    'token_url',
    'authorize_url',
    'redirect_uri',
    'scopes',
    'access_token',
    'refresh_token',
    'expires_at',
  ],
  session: ['login_url', 'login_body', 'token_path', 'access_token', 'expires_at'],
};

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

/** Type guard: is a value an environment reference? */
export function isEnvRef(value: unknown): value is EnvRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$env' in value &&
    typeof (value as EnvRef).$env === 'string'
  );
}

/** True for a usable credential: a non-blank literal or an env reference. */
function isSecretValue(value: unknown): value is SecretValue {
  return (typeof value === 'string' && value.trim() !== '') || isEnvRef(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keep only the entries of a map whose values are usable credentials. */
function secretMap(value: unknown): Record<string, SecretValue> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const out: Record<string, SecretValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isSecretValue(entry)) {
      out[key] = entry;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Resolve a secret value: strings pass through; `{$env}` refs read from
 * `process.env`; unresolvable refs become undefined.
 */
export function resolveSecretValue(value: SecretValue | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (isEnvRef(value)) {
    return process.env[value.$env];
  }
  return undefined;
}

function resolveMap(map: Record<string, SecretValue>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    const resolved = resolveSecretValue(value);
    if (resolved !== undefined) {
      out[key] = resolved;
    }
  }
  return out;
}

/**
 * Deep-resolve every `$env` reference in an auth config, returning a new object.
 * Unresolvable refs become undefined (consumers must validate before use).
 */
export function resolveAuthConfig(auth: ServiceAuth): ResolvedServiceAuth {
  switch (auth.type) {
    case 'none':
      return { type: 'none' };
    case 'bearer':
      return { type: 'bearer', token: resolveSecretValue(auth.token), expires_at: auth.expires_at };
    case 'basic':
      return {
        type: 'basic',
        username: resolveSecretValue(auth.username),
        password: resolveSecretValue(auth.password),
        expires_at: auth.expires_at,
      };
    case 'api-key':
      return {
        type: 'api-key',
        header: auth.header,
        key: resolveSecretValue(auth.key),
        expires_at: auth.expires_at,
      };
    case 'custom-headers':
      return {
        type: 'custom-headers',
        headers: resolveMap(auth.headers),
        expires_at: auth.expires_at,
      };
    case 'oauth2':
      return {
        type: 'oauth2',
        client_id: resolveSecretValue(auth.client_id),
        client_secret: resolveSecretValue(auth.client_secret),
        token_url: auth.token_url,
        authorize_url: auth.authorize_url,
        redirect_uri: auth.redirect_uri,
        scopes: auth.scopes ? [...auth.scopes] : undefined,
        access_token: auth.access_token,
        refresh_token: auth.refresh_token,
        expires_at: auth.expires_at,
      };
    case 'session':
      return {
        type: 'session',
        login_url: auth.login_url,
        login_body: auth.login_body ? resolveMap(auth.login_body) : undefined,
        token_path: auth.token_path,
        access_token: auth.access_token,
        expires_at: auth.expires_at,
      };
  }
}

// ---------------------------------------------------------------------------
// Strict parse, for an incoming registration
// ---------------------------------------------------------------------------

function fail(error: string): ParsedServiceAuth {
  return { ok: false, error };
}

const SECRET_HINT = 'a non-empty string or {"$env":"VAR_NAME"}';

/** Validate the optional expiry stamp any mode may carry. */
function readExpiresAt(
  record: Record<string, unknown>,
  mode: AuthMode,
): { ok: true; expires_at?: number } | { ok: false; error: string } {
  const value = record.expires_at;
  if (value === undefined) {
    return { ok: true };
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return {
      ok: false,
      error: `${mode} auth field "expires_at" must be a number (epoch milliseconds).`,
    };
  }
  return { ok: true, expires_at: value };
}

/** Spread into an auth literal to carry an expiry stamp, or nothing when absent. */
function expiryField(expiresAt?: number): { expires_at?: number } {
  return expiresAt === undefined ? {} : { expires_at: expiresAt };
}

function parseOAuth2(record: Record<string, unknown>, expiresAt?: number): ParsedServiceAuth {
  const auth: OAuth2Auth = { type: 'oauth2', ...expiryField(expiresAt) };

  for (const field of ['client_id', 'client_secret'] as const) {
    const value = record[field];
    if (value === undefined) {
      continue;
    }
    if (!isSecretValue(value)) {
      return fail(`oauth2 auth field "${field}" must be ${SECRET_HINT}.`);
    }
    auth[field] = value;
  }

  for (const field of ['token_url', 'authorize_url', 'redirect_uri', 'access_token', 'refresh_token'] as const) {
    const value = record[field];
    if (value === undefined) {
      continue;
    }
    if (!isNonEmptyString(value)) {
      return fail(`oauth2 auth field "${field}" must be a non-empty string.`);
    }
    auth[field] = value;
  }

  if (record.scopes !== undefined) {
    if (!Array.isArray(record.scopes) || !record.scopes.every((s) => typeof s === 'string')) {
      return fail('oauth2 auth field "scopes" must be an array of strings.');
    }
    auth.scopes = [...(record.scopes as string[])];
  }

  if (!auth.client_id && !auth.token_url && !auth.authorize_url && !auth.access_token) {
    return fail(
      'oauth2 auth needs at least "client_id" with "token_url"/"authorize_url" for the ' +
        'browser or refresh flow, or an "access_token" to use directly.',
    );
  }

  return { ok: true, auth };
}

function parseSession(record: Record<string, unknown>, expiresAt?: number): ParsedServiceAuth {
  const auth: SessionAuth = { type: 'session', ...expiryField(expiresAt) };

  for (const field of ['login_url', 'token_path', 'access_token'] as const) {
    const value = record[field];
    if (value === undefined) {
      continue;
    }
    if (!isNonEmptyString(value)) {
      return fail(`session auth field "${field}" must be a non-empty string.`);
    }
    auth[field] = value;
  }

  if (record.login_body !== undefined) {
    if (!isRecord(record.login_body)) {
      return fail('session auth field "login_body" must be an object of login fields.');
    }
    const body: Record<string, SecretValue> = {};
    for (const [key, value] of Object.entries(record.login_body)) {
      if (!isSecretValue(value)) {
        return fail(`session auth login_body["${key}"] must be ${SECRET_HINT}.`);
      }
      body[key] = value;
    }
    auth.login_body = body;
  }

  if (!auth.login_url && !auth.access_token) {
    return fail(
      'session auth needs a "login_url" (with "login_body") to acquire a token, or an ' +
        '"access_token" to use directly.',
    );
  }
  if (auth.login_url && !auth.login_body) {
    return fail('session auth with a "login_url" also needs a "login_body" to post to it.');
  }

  return { ok: true, auth };
}

/**
 * Validate an incoming auth registration into the union.
 *
 * Rejects anything the union cannot represent, INCLUDING a field that belongs
 * to another mode, which is how a mixed record (a bearer token beside basic
 * credentials) is refused instead of being silently half-applied.
 * @param raw - the caller-supplied auth object
 */
export function parseServiceAuth(raw: unknown): ParsedServiceAuth {
  if (!isRecord(raw)) {
    return fail(`auth must be an object with a "type" of: ${AUTH_MODES.join(', ')}.`);
  }

  const mode = raw.type;
  if (typeof mode !== 'string' || !AUTH_MODES.includes(mode as AuthMode)) {
    // Report the SHAPE of a non-string `type`, never its content: a caller that
    // double-wraps the auth object puts a whole credential record in this field,
    // and the message goes straight into the transcript.
    const received = typeof mode === 'string' ? `"${mode.slice(0, 40)}"` : typeof mode;
    return fail(`auth "type" must be one of: ${AUTH_MODES.join(', ')}. Received: ${received}.`);
  }
  const authMode = mode as AuthMode;

  const allowed = FIELDS_BY_MODE[authMode];
  const foreign = Object.keys(raw).filter((key) => key !== 'type' && !allowed.includes(key));
  if (foreign.length > 0) {
    return fail(
      `auth type "${authMode}" does not accept field(s): ${foreign.join(', ')}. ` +
        `Fields for "${authMode}": ${allowed.length > 0 ? allowed.join(', ') : '(none)'}. ` +
        'Register one auth mode per service.',
    );
  }

  const expiry = readExpiresAt(raw, authMode);
  if (!expiry.ok) {
    return fail(expiry.error);
  }

  switch (authMode) {
    case 'none':
      return { ok: true, auth: { type: 'none' } };

    case 'bearer':
      if (!isSecretValue(raw.token)) {
        return fail(`bearer auth requires "token": ${SECRET_HINT}.`);
      }
      return {
        ok: true,
        auth: { type: 'bearer', token: raw.token, ...expiryField(expiry.expires_at) },
      };

    case 'basic':
      if (!isSecretValue(raw.username) || !isSecretValue(raw.password)) {
        return fail(`basic auth requires "username" and "password", each ${SECRET_HINT}.`);
      }
      return {
        ok: true,
        auth: {
          type: 'basic',
          username: raw.username,
          password: raw.password,
          ...expiryField(expiry.expires_at),
        },
      };

    case 'api-key':
      if (!isNonEmptyString(raw.header)) {
        return fail('api-key auth requires "header": the header name to send the key in.');
      }
      if (!isSecretValue(raw.key)) {
        return fail(`api-key auth requires "key": ${SECRET_HINT}.`);
      }
      return {
        ok: true,
        auth: {
          type: 'api-key',
          header: raw.header,
          key: raw.key,
          ...expiryField(expiry.expires_at),
        },
      };

    case 'custom-headers': {
      if (!isRecord(raw.headers)) {
        return fail('custom-headers auth requires "headers": an object of header names to values.');
      }
      const headers: Record<string, SecretValue> = {};
      for (const [name, value] of Object.entries(raw.headers)) {
        if (!isSecretValue(value)) {
          return fail(`custom-headers auth value for "${name}" must be ${SECRET_HINT}.`);
        }
        headers[name] = value;
      }
      if (Object.keys(headers).length === 0) {
        return fail('custom-headers auth requires at least one header.');
      }
      return {
        ok: true,
        auth: { type: 'custom-headers', headers, ...expiryField(expiry.expires_at) },
      };
    }

    case 'oauth2':
      return parseOAuth2(raw, expiry.expires_at);

    case 'session':
      return parseSession(raw, expiry.expires_at);
  }
}

// ---------------------------------------------------------------------------
// Lenient normalization, for a record already on disk
// ---------------------------------------------------------------------------

/** Build one mode from a legacy record, or undefined when its fields are absent. */
function buildMode(mode: AuthMode, record: Record<string, unknown>): ServiceAuth | undefined {
  const expiresAt = typeof record.expires_at === 'number' ? record.expires_at : undefined;

  switch (mode) {
    case 'none':
      return { type: 'none' };

    case 'bearer':
      return isSecretValue(record.token)
        ? { type: 'bearer', token: record.token, ...expiryField(expiresAt) }
        : undefined;

    case 'basic':
      return isSecretValue(record.username) && isSecretValue(record.password)
        ? {
            type: 'basic',
            username: record.username,
            password: record.password,
            ...expiryField(expiresAt),
          }
        : undefined;

    case 'api-key':
      return isNonEmptyString(record.header) && isSecretValue(record.key)
        ? { type: 'api-key', header: record.header, key: record.key, ...expiryField(expiresAt) }
        : undefined;

    case 'custom-headers': {
      const headers = secretMap(record.headers);
      return headers ? { type: 'custom-headers', headers, ...expiryField(expiresAt) } : undefined;
    }

    case 'oauth2': {
      const auth: OAuth2Auth = { type: 'oauth2' };
      if (isSecretValue(record.client_id)) {
        auth.client_id = record.client_id;
      }
      if (isSecretValue(record.client_secret)) {
        auth.client_secret = record.client_secret;
      }
      if (isNonEmptyString(record.token_url)) {
        auth.token_url = record.token_url;
      }
      if (isNonEmptyString(record.authorize_url)) {
        auth.authorize_url = record.authorize_url;
      }
      if (isNonEmptyString(record.redirect_uri)) {
        auth.redirect_uri = record.redirect_uri;
      }
      if (Array.isArray(record.scopes)) {
        auth.scopes = record.scopes.filter((s): s is string => typeof s === 'string');
      }
      if (isNonEmptyString(record.access_token)) {
        auth.access_token = record.access_token;
      }
      if (isNonEmptyString(record.refresh_token)) {
        auth.refresh_token = record.refresh_token;
      }
      if (typeof record.expires_at === 'number') {
        auth.expires_at = record.expires_at;
      }
      // Metadata alone (an expiry stamp, scopes) authenticates nothing and
      // starts no flow, so such a record is left unread rather than rebuilt
      // into a credential-free oauth2 entry that would drop whatever else it
      // was holding.
      const usable = auth.client_id ?? auth.token_url ?? auth.authorize_url ?? auth.access_token;
      return usable === undefined ? undefined : auth;
    }

    case 'session': {
      const auth: SessionAuth = { type: 'session' };
      if (isNonEmptyString(record.login_url)) {
        auth.login_url = record.login_url;
      }
      const body = secretMap(record.login_body);
      if (body) {
        auth.login_body = body;
      }
      if (isNonEmptyString(record.token_path)) {
        auth.token_path = record.token_path;
      }
      if (isNonEmptyString(record.access_token)) {
        auth.access_token = record.access_token;
      }
      if (typeof record.expires_at === 'number') {
        auth.expires_at = record.expires_at;
      }
      return auth.login_url === undefined && auth.access_token === undefined ? undefined : auth;
    }
  }
}

/**
 * Map a stored record onto the auth mode it declares.
 *
 * Records written before the union existed used one flat shape with every field
 * optional, so a single record can carry fields for several modes at once. The
 * rule is the record's own `type` and nothing else: when that mode can be built
 * from the fields present, the record becomes that mode and the other modes'
 * fields are dropped (a record declaring `bearer` stays bearer with stray basic
 * fields beside it; `none` stays none). When the declared mode cannot be built,
 * or the record declares no mode or an unknown one, NO mode is inferred.
 *
 * Inferring one would change what goes on the wire: the pre-union applier sent
 * no header at all for such a record, so guessing `basic` from a stray
 * username/password pair would transmit a password this machine has never sent.
 * The caller keeps the record verbatim in the unreadable bucket instead, where a
 * person can repair it and `set_auth` can replace it outright.
 * @param raw - one entry from the stored `services` map
 * @returns the record as a union value, or undefined when its mode cannot be built
 */
export function normalizeStoredAuth(raw: unknown): ServiceAuth | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const declared = raw.type;
  if (typeof declared !== 'string' || !AUTH_MODES.includes(declared as AuthMode)) {
    return undefined;
  }

  return buildMode(declared as AuthMode, raw);
}
