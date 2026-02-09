/**
 * Persistent cookie jar for precision_fetch.
 * File-backed at .goodvibes/goodvibes.cookies.json with 0o600 permissions.
 * Supports domain/path matching, expiration, and automatic pruning.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ensureGitignore } from './secrets-guard.js';

/** Stored cookie */
export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number; // Unix timestamp in ms
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

/** Cookie jar file structure */
interface CookieFile {
  cookies: StoredCookie[];
  updated_at: string;
}

const MAX_COOKIES = 1000;
const MAX_FILE_SIZE = 512 * 1024; // 500KB

/**
 * Cookie jar with file-backed persistence.
 */
export class CookieJar {
  private cookies: StoredCookie[] = [];
  private dirty = false;
  private loaded = false;

  /**
   * Get the cookie file path.
   */
  private getCookiePath(): string {
    return path.join(process.cwd(), '.goodvibes', 'goodvibes.cookies.json');
  }

  /**
   * Load cookies from disk.
   */
  async load(): Promise<void> {
    const cookiePath = this.getCookiePath();
    try {
      const content = await fs.promises.readFile(cookiePath, 'utf-8');
      const parsed: CookieFile = JSON.parse(content);
      this.cookies = parsed.cookies ?? [];
      this.pruneExpired();
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

  /**
   * Save cookies to disk.
   */
  async save(): Promise<void> {
    if (!this.dirty) return;
    
    const cookiePath = this.getCookiePath();
    const cookieDir = path.dirname(cookiePath);
    
    // Ensure gitignore protection
    await ensureGitignore(process.cwd());
    
    // Ensure directory exists
    await fs.promises.mkdir(cookieDir, { recursive: true });
    
    const data: CookieFile = {
      cookies: this.cookies,
      updated_at: new Date().toISOString(),
    };
    
    const content = JSON.stringify(data, null, 2) + '\n';
    
    // Check file size limit
    if (content.length > MAX_FILE_SIZE) {
      // Evict oldest cookies until under limit
      this.cookies.sort((a, b) => (a.expires ?? Infinity) - (b.expires ?? Infinity));
      while (JSON.stringify({ cookies: this.cookies }).length > MAX_FILE_SIZE && this.cookies.length > 0) {
        this.cookies.shift();
      }
    }
    
    await fs.promises.writeFile(cookiePath, content, { encoding: 'utf-8', mode: 0o600 });
    this.dirty = false;
  }

  /**
   * Ensure cookies are loaded.
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.load();
    }
  }

  /**
   * Parse Set-Cookie headers and store cookies.
   */
  async setCookies(url: string, setCookieHeaders: string[]): Promise<void> {
    await this.ensureLoaded();
    
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    for (const header of setCookieHeaders) {
      const cookie = this.parseSetCookie(header, domain);
      if (!cookie) continue;
      
      // Remove existing cookie with same name+domain+path
      this.cookies = this.cookies.filter(c => 
        !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path)
      );
      
      this.cookies.push(cookie);
    }
    
    // Enforce max cookies limit (evict oldest)
    if (this.cookies.length > MAX_COOKIES) {
      this.cookies.sort((a, b) => (a.expires ?? Infinity) - (b.expires ?? Infinity));
      this.cookies = this.cookies.slice(-MAX_COOKIES);
    }
    
    this.dirty = true;
    await this.save();
  }

  /**
   * Get cookies matching a URL.
   */
  async getCookies(url: string): Promise<StoredCookie[]> {
    await this.ensureLoaded();
    this.pruneExpired();
    
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const urlPath = urlObj.pathname;
    const isSecure = urlObj.protocol === 'https:';
    
    return this.cookies.filter(cookie => {
      // Domain match (exact or parent domain)
      if (!this.domainMatches(domain, cookie.domain)) return false;
      
      // Path match
      if (!urlPath.startsWith(cookie.path)) return false;
      
      // Secure flag
      if (cookie.secure && !isSecure) return false;
      
      return true;
    });
  }

  /**
   * Format cookies as a Cookie header value.
   */
  toCookieHeader(cookies: StoredCookie[]): string {
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  /**
   * Clear cookies, optionally by domain.
   */
  async clear(domain?: string): Promise<void> {
    await this.ensureLoaded();
    
    if (domain) {
      this.cookies = this.cookies.filter(c => c.domain !== domain);
    } else {
      this.cookies = [];
    }
    
    this.dirty = true;
    await this.save();
  }

  /**
   * Get all cookies (for inspection).
   */
  async getAllCookies(): Promise<StoredCookie[]> {
    await this.ensureLoaded();
    return [...this.cookies];
  }

  /**
   * Parse a Set-Cookie header into a StoredCookie.
   */
  private parseSetCookie(header: string, defaultDomain: string): StoredCookie | null {
    const parts = header.split(';').map(s => s.trim());
    if (parts.length === 0) return null;
    
    // First part is name=value
    const [nameValue, ...attributes] = parts;
    const eqIndex = nameValue.indexOf('=');
    if (eqIndex < 0) return null;
    
    const name = nameValue.slice(0, eqIndex).trim();
    const value = nameValue.slice(eqIndex + 1).trim();
    
    if (!name) return null;
    
    const cookie: StoredCookie = {
      name,
      value,
      domain: defaultDomain,
      path: '/',
    };
    
    for (const attr of attributes) {
      const [attrName, ...attrValueParts] = attr.split('=');
      const attrNameLower = attrName.trim().toLowerCase();
      const attrValue = attrValueParts.join('=').trim();
      
      switch (attrNameLower) {
        case 'domain':
          cookie.domain = attrValue.replace(/^\./, ''); // Remove leading dot
          break;
        case 'path':
          cookie.path = attrValue || '/';
          break;
        case 'expires': {
          const date = new Date(attrValue);
          if (!isNaN(date.getTime())) {
            cookie.expires = date.getTime();
          }
          break;
        }
        case 'max-age': {
          const seconds = parseInt(attrValue, 10);
          if (!isNaN(seconds)) {
            cookie.expires = Date.now() + seconds * 1000;
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

  /**
   * Check if a hostname matches a cookie domain.
   */
  private domainMatches(hostname: string, cookieDomain: string): boolean {
    if (hostname === cookieDomain) return true;
    // Check if hostname is a subdomain of cookieDomain
    return hostname.endsWith('.' + cookieDomain);
  }

  /**
   * Remove expired cookies.
   */
  private pruneExpired(): void {
    const now = Date.now();
    const before = this.cookies.length;
    this.cookies = this.cookies.filter(c => !c.expires || c.expires > now);
    if (this.cookies.length !== before) {
      this.dirty = true;
    }
  }
}

/** Global singleton cookie jar */
export const globalCookieJar = new CookieJar();
