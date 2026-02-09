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

    it('should evict cookies when file size exceeds limit', async () => {
      // Create cookies with large values to exceed 500KB
      const largeValue = 'x'.repeat(1000); // 1KB per cookie
      const headers: string[] = [];
      for (let i = 0; i < 600; i++) {
        headers.push(`largecookie${i}=${largeValue}; Path=/; Max-Age=3600`);
      }
      await jar.setCookies('https://example.com/', headers);
      
      // Verify file exists and is within size limit
      const cookiePath = path.join(tmpDir, '.goodvibes', 'goodvibes.cookies.json');
      const stat = await fs.promises.stat(cookiePath);
      expect(stat.size).toBeLessThanOrEqual(512 * 1024); // 500KB + overhead
      
      // Verify some cookies were evicted
      const allCookies = await jar.getAllCookies();
      expect(allCookies.length).toBeLessThan(600);
    });
  });

  describe('edge cases', () => {
    it('should handle Max-Age=0 (cookie deletion)', async () => {
      // Set a cookie
      await jar.setCookies('https://example.com/', ['temp=value; Path=/']);
      expect(await jar.getAllCookies()).toHaveLength(1);
      
      // Delete it with Max-Age=0
      await jar.setCookies('https://example.com/', ['temp=deleted; Path=/; Max-Age=0']);
      
      // Cookie should be expired and not returned
      const cookies = await jar.getCookies('https://example.com/');
      expect(cookies).toHaveLength(0);
    });

    it('should reject malformed Set-Cookie headers', async () => {
      await jar.setCookies('https://example.com/', [
        'valid=ok; Path=/',
        'noequals',
        '=noname',
        '',
        'another=valid; Path=/',
      ]);
      
      const cookies = await jar.getAllCookies();
      expect(cookies).toHaveLength(2);
      expect(cookies.find(c => c.name === 'valid')).toBeDefined();
      expect(cookies.find(c => c.name === 'another')).toBeDefined();
    });

    it('should reject public suffix cookies', async () => {
      await jar.setCookies('https://example.com/', [
        'valid=ok; Domain=example.com; Path=/',
        'bad=tld; Domain=com; Path=/',
        'bad2=org; Domain=org; Path=/',
        'bad3=net; Domain=net; Path=/',
      ]);
      
      const cookies = await jar.getAllCookies();
      expect(cookies).toHaveLength(1);
      expect(cookies[0].name).toBe('valid');
      expect(cookies[0].domain).toBe('example.com');
    });

    it('should handle negative Max-Age', async () => {
      await jar.setCookies('https://example.com/', [
        'expired=old; Path=/; Max-Age=-100',
      ]);
      
      const cookies = await jar.getCookies('https://example.com/');
      expect(cookies).toHaveLength(0);
    });
  });

  describe('eviction order', () => {
    it('should evict session cookies before persistent cookies during file size overflow', async () => {
      // Create a mix of session cookies (no expiry) and persistent cookies (with expiry)
      const largeValue = 'x'.repeat(1000); // 1KB per cookie
      const headers: string[] = [];
      
      // Add 200 persistent cookies (with expiry in the future)
      for (let i = 0; i < 200; i++) {
        headers.push(`persistent${i}=${largeValue}; Path=/; Max-Age=3600`);
      }
      
      // Add 200 session cookies (no expiry)
      for (let i = 0; i < 200; i++) {
        headers.push(`session${i}=${largeValue}; Path=/`);
      }
      
      // More persistent cookies with varying expiry times
      for (let i = 0; i < 200; i++) {
        const maxAge = 1800 + i; // Varying expiry times
        headers.push(`persistent_var${i}=${largeValue}; Path=/; Max-Age=${maxAge}`);
      }
      
      await jar.setCookies('https://example.com/', headers);
      
      // Verify file size is within limit
      const cookiePath = path.join(tmpDir, '.goodvibes', 'goodvibes.cookies.json');
      const stat = await fs.promises.stat(cookiePath);
      expect(stat.size).toBeLessThanOrEqual(512 * 1024);
      
      // Get all remaining cookies
      const allCookies = await jar.getAllCookies();
      
      // Count session vs persistent cookies
      const sessionCookies = allCookies.filter(c => !c.expires);
      const persistentCookies = allCookies.filter(c => c.expires);
      
      // Session cookies should be evicted first, so we expect:
      // - Fewer or zero session cookies remaining
      // - More persistent cookies remaining
      // If eviction is working correctly, session cookies should be heavily reduced
      const sessionRatio = sessionCookies.length / 200; // Originally 200 session cookies
      const persistentRatio = persistentCookies.length / 400; // Originally 400 persistent cookies
      
      // Session cookies should have a lower survival rate than persistent cookies
      expect(sessionRatio).toBeLessThan(persistentRatio);
      
      // Most session cookies should be gone
      expect(sessionCookies.length).toBeLessThan(persistentCookies.length);
    });
  });
});
