/**
 * Persistent cookie jar for connect requests.
 *
 * Ported from v1 precision-engine `utils/fetch/cookie-jar.ts` (domain/path
 * matching, expiration, eviction policy all intact). v2 changes: the file moves
 * under the namespaced state dir (`.goodvibes/goodvibes.cookies.json`) via
 * `core/config` `statePath`, and the gitignore guard is anchored at the real
 * project root (`process.cwd()`) rather than two directories up — the extra
 * `v2` path segment made the old `dirname(dirname(...))` land inside
 * `.goodvibes/` instead of the project root.
 */

import * as fs from 'fs';
import * as path from 'path';
import { statePath } from '@goodvibes/core/config';
import { ensureGitignore } from './secrets-guard.js';

/** Stored cookie. */
export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

interface CookieFile {
  cookies: StoredCookie[];
  updated_at: string;
}

const MAX_COOKIES = 1000;
const MAX_FILE_SIZE = 512 * 1024;

/** File-backed cookie jar. */
export class CookieJar {
  private cookies: StoredCookie[] = [];
  private dirty = false;
  private loaded = false;
  private cookiePath: string;
  private projectRoot: string;

  constructor() {
    // Cache the paths at construction so a later cwd change cannot split reads
    // and writes across two files.
    this.cookiePath = statePath('goodvibes.cookies.json');
    this.projectRoot = process.cwd();
  }

  private getCookiePath(): string {
    return this.cookiePath;
  }

  /** Load cookies from disk. */
  async load(): Promise<void> {
    const cookiePath = this.getCookiePath();
    try {
      const content = await fs.promises.readFile(cookiePath, 'utf-8');
      const parsed: CookieFile = JSON.parse(content);
      this.cookies = parsed.cookies ?? [];
      this.pruneExpired();
      if (this.dirty) {
        await this.save();
      }
      this.loaded = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.cookies = [];
        this.loaded = true;
        return;
      }
      throw error;
    }
  }

  /** Save cookies to disk with 0600 permissions and size-based eviction. */
  async save(): Promise<void> {
    if (!this.dirty) {return;}

    const cookiePath = this.getCookiePath();
    const cookieDir = path.dirname(cookiePath);

    await ensureGitignore(this.projectRoot);
    await fs.promises.mkdir(cookieDir, { recursive: true });

    const data: CookieFile = { cookies: this.cookies, updated_at: new Date().toISOString() };
    let content = JSON.stringify(data, null, 2) + '\n';

    const contentSize = Buffer.byteLength(content, 'utf-8');
    if (contentSize > MAX_FILE_SIZE) {
      // Evict session cookies first, then longest-lived persistent cookies.
      this.cookies.sort((a, b) => {
        const aExpiry = a.expires ?? Infinity;
        const bExpiry = b.expires ?? Infinity;
        return bExpiry - aExpiry;
      });

      const updatedAt = new Date().toISOString();
      while (Buffer.byteLength(content, 'utf-8') > MAX_FILE_SIZE && this.cookies.length > 0) {
        this.cookies.shift();
        content = JSON.stringify({ cookies: this.cookies, updated_at: updatedAt }, null, 2) + '\n';
      }
    }

    await fs.promises.writeFile(cookiePath, content, { encoding: 'utf-8', mode: 0o600 });
    this.dirty = false;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {await this.load();}
  }

  /** Parse Set-Cookie headers and store the cookies. */
  async setCookies(url: string, setCookieHeaders: string[]): Promise<void> {
    await this.ensureLoaded();

    const domain = new URL(url).hostname;

    for (const header of setCookieHeaders) {
      const cookie = this.parseSetCookie(header, domain);
      if (!cookie) {continue;}

      this.cookies = this.cookies.filter(
        (c) => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path),
      );
      this.cookies.push(cookie);
    }

    if (this.cookies.length > MAX_COOKIES) {
      this.cookies.sort((a, b) => {
        const aExpiry = a.expires ?? Infinity;
        const bExpiry = b.expires ?? Infinity;
        return aExpiry - bExpiry;
      });
      this.cookies = this.cookies.slice(-MAX_COOKIES);
    }

    this.dirty = true;
    await this.save();
  }

  /** Get cookies matching a URL (domain/path/secure filtered). */
  async getCookies(url: string): Promise<StoredCookie[]> {
    await this.ensureLoaded();
    const wasDirty = this.dirty;
    this.pruneExpired();
    if (!wasDirty && this.dirty) {await this.save();}

    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const urlPath = urlObj.pathname;
    const isSecure = urlObj.protocol === 'https:';

    return this.cookies.filter((cookie) => {
      if (!this.domainMatches(domain, cookie.domain)) {return false;}
      if (!urlPath.startsWith(cookie.path)) {return false;}
      if (cookie.secure && !isSecure) {return false;}
      return true;
    });
  }

  /** Format cookies as a `Cookie` header value. */
  toCookieHeader(cookies: StoredCookie[]): string {
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  }

  /** Clear cookies, optionally scoped to a domain. */
  async clear(domain?: string): Promise<void> {
    await this.ensureLoaded();
    if (domain) {
      this.cookies = this.cookies.filter((c) => c.domain !== domain);
    } else {
      this.cookies = [];
    }
    this.dirty = true;
    await this.save();
  }

  /** Get a copy of all stored cookies (for inspection). */
  async getAllCookies(): Promise<StoredCookie[]> {
    await this.ensureLoaded();
    return [...this.cookies];
  }

  private parseSetCookie(header: string, defaultDomain: string): StoredCookie | null {
    const parts = header.split(';').map((s) => s.trim());
    if (parts.length === 0) {return null;}

    const [nameValue, ...attributes] = parts;
    const eqIndex = nameValue.indexOf('=');
    if (eqIndex < 0) {return null;}

    const name = nameValue.slice(0, eqIndex).trim();
    const value = nameValue.slice(eqIndex + 1).trim();
    if (!name) {return null;}

    const cookie: StoredCookie = { name, value, domain: defaultDomain, path: '/' };

    for (const attr of attributes) {
      const [attrName, ...attrValueParts] = attr.split('=');
      const attrNameLower = attrName.trim().toLowerCase();
      const attrValue = attrValueParts.join('=').trim();

      switch (attrNameLower) {
        case 'domain': {
          const normalizedDomain = attrValue.replace(/^\./, '');
          if (!normalizedDomain.includes('.')) {
            return null; // Reject public-suffix (TLD) cookies.
          }
          cookie.domain = normalizedDomain;
          break;
        }
        case 'path':
          cookie.path = attrValue || '/';
          break;
        case 'expires': {
          const date = new Date(attrValue);
          if (!isNaN(date.getTime())) {cookie.expires = date.getTime();}
          break;
        }
        case 'max-age': {
          const seconds = parseInt(attrValue, 10);
          if (!isNaN(seconds)) {
            cookie.expires = seconds <= 0 ? Date.now() - 1 : Date.now() + seconds * 1000;
          }
          break;
        }
        case 'httponly':
          cookie.httpOnly = true;
          break;
        case 'secure':
          cookie.secure = true;
          break;
        case 'samesite':
          cookie.sameSite = attrValue;
          break;
      }
    }

    return cookie;
  }

  private domainMatches(hostname: string, cookieDomain: string): boolean {
    if (hostname === cookieDomain) {return true;}
    return hostname.endsWith('.' + cookieDomain);
  }

  private pruneExpired(): void {
    const now = Date.now();
    const before = this.cookies.length;
    this.cookies = this.cookies.filter((c) => !c.expires || c.expires > now);
    if (this.cookies.length !== before) {this.dirty = true;}
  }
}

/** Global singleton cookie jar. */
export const globalCookieJar = new CookieJar();
