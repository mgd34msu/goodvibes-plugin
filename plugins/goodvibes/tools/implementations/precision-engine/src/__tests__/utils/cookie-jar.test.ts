import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CookieJar } from '../../utils/fetch/cookie-jar.js';

describe('CookieJar', () => {
  let tmpDir: string;
  let jar: CookieJar;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cookie-jar-test-'));
    await fs.promises.mkdir(path.join(tmpDir, '.goodvibes'), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    jar = new CookieJar();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('basic operations', () => {
    it('should start with no cookies', async () => {
      const cookies = await jar.getAllCookies();
      expect(cookies).toEqual([]);
    });

    it('should parse and store Set-Cookie headers', async () => {
      await jar.setCookies('https://example.com/path', [
        'session=abc123; Path=/; HttpOnly; Secure',
        'theme=dark; Path=/; Max-Age=3600',
      ]);
      const cookies = await jar.getAllCookies();
      expect(cookies).toHaveLength(2);
      expect(cookies.find(c => c.name === 'session')?.value).toBe('abc123');
      expect(cookies.find(c => c.name === 'session')?.httpOnly).toBe(true);
      expect(cookies.find(c => c.name === 'session')?.secure).toBe(true);
      expect(cookies.find(c => c.name === 'theme')?.value).toBe('dark');
    });

    it('should match cookies by domain and path', async () => {
      await jar.setCookies('https://example.com/api', [
        'token=xyz; Path=/api',
        'global=123; Path=/',
      ]);
      
      const apiCookies = await jar.getCookies('https://example.com/api/users');
      expect(apiCookies).toHaveLength(2);
      
      const rootCookies = await jar.getCookies('https://example.com/');
      expect(rootCookies).toHaveLength(1);
      expect(rootCookies[0].name).toBe('global');
    });

    it('should not return secure cookies for HTTP', async () => {
      await jar.setCookies('https://example.com/', [
        'secure_tok=abc; Secure',
        'normal_tok=def',
      ]);
      
      const httpCookies = await jar.getCookies('http://example.com/');
      expect(httpCookies).toHaveLength(1);
      expect(httpCookies[0].name).toBe('normal_tok');
    });

    it('should format Cookie header', () => {
      const cookies = [
        { name: 'a', value: '1', domain: 'example.com', path: '/' },
        { name: 'b', value: '2', domain: 'example.com', path: '/' },
      ];
      expect(jar.toCookieHeader(cookies)).toBe('a=1; b=2');
    });
  });

  describe('persistence', () => {
    it('should save and reload cookies', async () => {
      await jar.setCookies('https://example.com/', ['persist=yes; Path=/']);
      
      // Create new jar instance (simulates restart)
      const jar2 = new CookieJar();
      const cookies = await jar2.getCookies('https://example.com/');
      expect(cookies).toHaveLength(1);
      expect(cookies[0].name).toBe('persist');
      expect(cookies[0].value).toBe('yes');
    });

    it('should write with 0o600 permissions', async () => {
      await jar.setCookies('https://example.com/', ['test=val']);
      const cookiePath = path.join(tmpDir, '.goodvibes', 'goodvibes.cookies.json');
      const stat = await fs.promises.stat(cookiePath);
      expect(stat.mode & 0o777).toBe(0o600);
    });
  });

  describe('expiration', () => {
    it('should prune expired cookies on load', async () => {
      // Manually write expired cookie
      const cookiePath = path.join(tmpDir, '.goodvibes', 'goodvibes.cookies.json');
      const data = {
        cookies: [
          { name: 'expired', value: 'old', domain: 'example.com', path: '/', expires: Date.now() - 10000 },
          { name: 'valid', value: 'new', domain: 'example.com', path: '/' },
        ],
        updated_at: new Date().toISOString(),
      };
      await fs.promises.writeFile(cookiePath, JSON.stringify(data), { mode: 0o600 });
      
      const cookies = await jar.getCookies('https://example.com/');
      expect(cookies).toHaveLength(1);
      expect(cookies[0].name).toBe('valid');
    });
  });

  describe('domain matching', () => {
    it('should match subdomain cookies', async () => {
      await jar.setCookies('https://example.com/', [
        'parent=val; Domain=example.com; Path=/',
      ]);
      
      const subCookies = await jar.getCookies('https://sub.example.com/');
      expect(subCookies).toHaveLength(1);
      expect(subCookies[0].name).toBe('parent');
    });

    it('should not match unrelated domains', async () => {
      await jar.setCookies('https://example.com/', ['test=val']);
      const cookies = await jar.getCookies('https://other.com/');
      expect(cookies).toHaveLength(0);
    });
  });

  describe('cookie replacement', () => {
    it('should replace cookies with same name+domain+path', async () => {
      await jar.setCookies('https://example.com/', ['token=old; Path=/']);
      await jar.setCookies('https://example.com/', ['token=new; Path=/']);
      
      const cookies = await jar.getAllCookies();
      expect(cookies).toHaveLength(1);
      expect(cookies[0].value).toBe('new');
    });
  });

  describe('clear', () => {
    it('should clear all cookies', async () => {
      await jar.setCookies('https://a.com/', ['x=1']);
      await jar.setCookies('https://b.com/', ['y=2']);
      await jar.clear();
      expect(await jar.getAllCookies()).toEqual([]);
    });

    it('should clear cookies by domain', async () => {
      await jar.setCookies('https://a.com/', ['x=1']);
      await jar.setCookies('https://b.com/', ['y=2']);
      await jar.clear('a.com');
      const cookies = await jar.getAllCookies();
      expect(cookies).toHaveLength(1);
      expect(cookies[0].name).toBe('y');
    });
  });

  describe('overflow protection', () => {
    it('should enforce max cookie limit', async () => {
      // Add many cookies
      const headers: string[] = [];
      for (let i = 0; i < 1010; i++) {
        headers.push(`cookie${i}=value${i}; Path=/`);
      }
      await jar.setCookies('https://example.com/', headers);
      
      const allCookies = await jar.getAllCookies();
      expect(allCookies.length).toBeLessThanOrEqual(1000);
    });
  });
});
