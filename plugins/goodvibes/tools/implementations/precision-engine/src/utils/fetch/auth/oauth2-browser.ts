/**
 * OAuth2 browser-based authorization code flow — Tier 4.
 * Starts a local HTTP callback server, opens browser for user authorization,
 * exchanges authorization code for tokens.
 * 
 * NEVER auto-triggered on 401 — only via slash command or explicit request.
 */

import * as http from 'http';
import * as crypto from 'crypto';
import { type ServiceAuth } from '../secrets-store.js';
import { setServiceSecret } from '../secrets-store.js';

/** OAuth2 flow configuration */
export interface OAuth2FlowConfig {
  /** Service name for storing tokens */
  serviceName: string;
  /** Current auth config */
  auth: ServiceAuth;
  /** Override redirect port (default: auto-select from 9876-9878, then random) */
  port?: number;
}

/** OAuth2 flow result */
export interface OAuth2FlowResult {
  success: boolean;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  error?: string;
  /** The authorize URL for manual copy if browser fails to open */
  authorize_url?: string;
}

const PREFERRED_PORTS = [9876, 9877, 9878];
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate a cryptographically random state parameter for CSRF protection.
 */
export function generateState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Build the OAuth2 authorization URL.
 */
export function buildAuthorizeUrl(auth: ServiceAuth, redirectUri: string, state: string): string {
  if (!auth.authorize_url || !auth.client_id) {
    throw new Error('Missing required fields: authorize_url, client_id');
  }
  
  const url = new URL(auth.authorize_url);
  url.searchParams.set('client_id', typeof auth.client_id === 'string' ? auth.client_id : '');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  
  if (auth.scopes && auth.scopes.length > 0) {
    url.searchParams.set('scope', auth.scopes.join(' '));
  }
  
  return url.toString();
}

/**
 * Try to open a URL in the user's browser.
 * Falls back to displaying the URL if browser can't be opened.
 */
async function openBrowser(url: string): Promise<boolean> {
  const { spawn } = await import('child_process');
  
  const platform = process.platform;
  let command: string;
  let args: string[];
  
  if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else {
    // Linux
    command = 'xdg-open';
    args = [url];
  }
  
  return new Promise<boolean>((resolve) => {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        shell: platform === 'win32',
      });
      child.unref();
      child.on('error', () => resolve(false));
      // Give it a moment to fail
      setTimeout(() => resolve(true), 1000);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Find an available port from the preferred list, or use a random port.
 */
async function findAvailablePort(preferredPort?: number): Promise<number> {
  const portsToTry = preferredPort ? [preferredPort] : [...PREFERRED_PORTS, 0]; // 0 = random
  
  for (const port of portsToTry) {
    try {
      const available = await checkPort(port);
      if (available) return port === 0 ? await getRandomPort() : port;
    } catch {
      continue;
    }
  }
  
  // Last resort: random port
  return getRandomPort();
}

/**
 * Check if a port is available.
 */
function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (port === 0) {
      resolve(true);
      return;
    }
    const server = http.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on('error', () => resolve(false));
  });
}

/**
 * Get a random available port.
 */
function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not determine port')));
      }
    });
    server.on('error', reject);
  });
}

/**
 * Start the OAuth2 authorization code flow.
 * 
 * 1. Generates random state for CSRF protection
 * 2. Constructs the authorize URL
 * 3. Starts local callback server
 * 4. Opens browser (or displays URL for manual copy)
 * 5. Waits for callback (5-minute timeout)
 * 6. Validates state, exchanges code for tokens
 * 7. Stores tokens in secrets file
 * 
 * @param config - OAuth2 flow configuration
 * @returns OAuth2FlowResult with tokens or error
 */
export async function startOAuth2Flow(config: OAuth2FlowConfig): Promise<OAuth2FlowResult> {
  const { serviceName, auth } = config;
  
  if (!auth.authorize_url || !auth.client_id || !auth.token_url) {
    return {
      success: false,
      error: 'Missing required fields: authorize_url, client_id, token_url',
    };
  }
  
  // Find available port
  const port = await findAvailablePort(config.port);
  const redirectUri = auth.redirect_uri ?? `http://localhost:${port}/callback`;
  
  // Generate state
  const state = generateState();
  
  // Build authorize URL
  const authorizeUrl = buildAuthorizeUrl(auth, redirectUri, state);
  
  // Start callback server
  let server: http.Server | null = null;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  
  try {
    const { code, error: callbackError } = await new Promise<{ code?: string; error?: string }>((resolve) => {
      server = http.createServer((req, res) => {
        const reqUrl = new URL(req.url ?? '/', `http://localhost:${port}`);
        
        if (reqUrl.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        
        // Validate state
        const returnedState = reqUrl.searchParams.get('state');
        if (returnedState !== state) {
          res.writeHead(400);
          res.end('Invalid state parameter — possible CSRF attack. Please try again.');
          resolve({ error: 'State mismatch — possible CSRF' });
          return;
        }
        
        // Check for error
        const errorParam = reqUrl.searchParams.get('error');
        if (errorParam) {
          const errorDesc = reqUrl.searchParams.get('error_description') ?? errorParam;
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<html><body><h2>Authorization Failed</h2><p>${errorDesc}</p><p>You can close this window.</p></body></html>`);
          resolve({ error: `OAuth2 error: ${errorDesc}` });
          return;
        }
        
        // Get authorization code
        const code = reqUrl.searchParams.get('code');
        if (!code) {
          res.writeHead(400);
          res.end('Missing authorization code');
          resolve({ error: 'No authorization code in callback' });
          return;
        }
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Authorization Successful!</h2><p>You can close this window and return to your terminal.</p></body></html>');
        resolve({ code });
      });
      
      server.listen(port, () => {
        // Server started — open browser
        openBrowser(authorizeUrl).catch(() => {
          // Browser failed — user will need to copy URL manually
        });
      });
      
      // Set timeout
      timeoutHandle = setTimeout(() => {
        resolve({ error: `Authorization timed out after ${CALLBACK_TIMEOUT_MS / 1000}s. Please try again.` });
      }, CALLBACK_TIMEOUT_MS);
    });
    
    // Clear timeout
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    
    if (callbackError || !code) {
      return {
        success: false,
        error: callbackError ?? 'No authorization code received',
        authorize_url: authorizeUrl,
      };
    }
    
    // Exchange code for tokens
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: typeof auth.client_id === 'string' ? auth.client_id : '',
    });
    
    if (auth.client_secret) {
      tokenBody.set('client_secret', typeof auth.client_secret === 'string' ? auth.client_secret : '');
    }
    
    const tokenResponse = await fetch(auth.token_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return {
        success: false,
        error: `Token exchange failed: HTTP ${tokenResponse.status} - ${errorText.slice(0, 200)}`,
        authorize_url: authorizeUrl,
      };
    }
    
    const tokenData = await tokenResponse.json() as Record<string, unknown>;
    
    const accessToken = tokenData.access_token as string | undefined;
    if (!accessToken) {
      return {
        success: false,
        error: 'Token response missing access_token',
        authorize_url: authorizeUrl,
      };
    }
    
    let expiresAt: number | undefined;
    if (typeof tokenData.expires_in === 'number') {
      expiresAt = Date.now() + tokenData.expires_in * 1000;
    }
    
    const refreshToken = (tokenData.refresh_token as string) ?? auth.refresh_token;
    
    // Store tokens
    const updatedAuth: ServiceAuth = {
      ...auth,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
    };
    
    await setServiceSecret(serviceName, updatedAuth);
    
    return {
      success: true,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      authorize_url: authorizeUrl,
    };
  } finally {
    // Clean up
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    if (server) {
      (server as http.Server).close();
    }
  }
}
