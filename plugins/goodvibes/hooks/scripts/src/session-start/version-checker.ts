/**
 * Version Checker Module
 *
 * Checks if the local GoodVibes plugin version matches the latest GitHub release.
 * Used during session-start to notify users of available updates.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

import { PLUGIN_ROOT } from '../shared/constants.js';
import { debug, logError } from '../shared/index.js';

/** GitHub repository for version checking */
const GITHUB_REPO = 'mgd34msu/goodvibes-plugin';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/** Timeout for GitHub API requests (ms) */
const REQUEST_TIMEOUT_MS = 5000;

export interface VersionCheckResult {
  isUpToDate: boolean;
  localVersion: string;
  remoteVersion: string | null;
  message: string;
  error?: string;
}

/**
 * Gets the local plugin version from package.json
 */
function getLocalVersion(): string {
  try {
    const packagePath = path.join(PLUGIN_ROOT, 'package.json');
    const content = fs.readFileSync(packagePath, 'utf-8');
    const pkg = JSON.parse(content) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Fetches the latest release version from GitHub
 */
function fetchLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const options = {
      headers: {
        'User-Agent': 'GoodVibes-Plugin-VersionCheck',
        'Accept': 'application/vnd.github.v3+json',
      },
      timeout: REQUEST_TIMEOUT_MS,
    };

    const req = https.get(GITHUB_API_URL, options, (res) => {
      let data = '';

      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });

      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            debug(`GitHub API returned status ${res.statusCode}`);
            resolve(null);
            return;
          }

          const release = JSON.parse(data) as { tag_name?: string };
          const tagName = release.tag_name || '';
          // Remove 'v' prefix if present
          const version = tagName.replace(/^v/, '');
          resolve(version || null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      debug(`GitHub API request failed: ${err.message}`);
      resolve(null);
    });


    req.on('timeout', () => {
      debug(`GitHub API request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      req.destroy();
      resolve(null);
    });

  });
}

/**
 * Compares two semantic version strings
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 *
 * Note: Only handles numeric semver (e.g., 1.2.3). Does not support
 * pre-release identifiers (e.g., 1.2.3-alpha) or build metadata (e.g., 1.2.3+build).
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }

  return 0;
}

/**
 * Checks if the local version is up to date with the latest GitHub release.
 * Returns a result object with version info and a user-friendly message.
 *
 * Note: fetchLatestVersion never throws (returns null on error), so the try-catch
 * here is for other potential errors in this function.
 */
export async function checkForUpdates(): Promise<VersionCheckResult> {
  const localVersion = getLocalVersion();
  
  try {
    const remoteVersion = await fetchLatestVersion();

    if (!remoteVersion) {
      debug('Could not fetch remote version');
      return {
        isUpToDate: true, // Assume up to date if we can't check
        localVersion,
        remoteVersion: null,
        message: '', // Silent on network failure
      };
    }

    const comparison = compareVersions(localVersion, remoteVersion);

    if (comparison >= 0) {
      return {
        isUpToDate: true,
        localVersion,
        remoteVersion,
        message: 'GoodVibes Plugin is up to date with latest version.',
      };
    } else {
      return {
        isUpToDate: false,
        localVersion,
        remoteVersion,
        message: `Plugin Update Available! (v${localVersion} → v${remoteVersion}) Run: /goodvibes:plugin update`,
      };
    }
  } catch (error) {
    logError('Version check failed', error);
    return {
      isUpToDate: true, // Assume up to date on error
      localVersion,
      remoteVersion: null,
      message: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
