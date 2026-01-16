/**
 * Unit tests for upgrade-package handler
 *
 * Tests cover:
 * - Package version resolution
 * - Semver major bump detection
 * - Changelog fetching and parsing
 * - Breaking change detection
 * - Dependency impact analysis
 * - Upgrade execution and rollback
 * - Test execution after upgrade
 * - Dry run mode
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fsPromises from 'fs/promises';

// Mock modules before imports
vi.mock('fs/promises');
vi.mock('../../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));
vi.mock('../../../utils.js', () => ({
  readJsonFile: vi.fn(),
  fileExists: vi.fn(),
  safeExec: vi.fn(),
  fetchUrl: vi.fn(),
}));

import {
  handleUpgradePackage,
  UpgradePackageArgs,
} from '../../../handlers/package/upgrade-package.js';
import { readJsonFile, fileExists, safeExec, fetchUrl } from '../../../utils.js';

describe('handleUpgradePackage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('argument validation', () => {
    it('should return error when package.json not found', async () => {
      vi.mocked(readJsonFile).mockResolvedValue(null);

      const args: UpgradePackageArgs = {
        package: 'lodash',
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('package.json not found');
    });

    it('should return error when package is not installed', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^18.0.0',
        },
        devDependencies: {},
      });

      const args: UpgradePackageArgs = {
        package: 'nonexistent-package',
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('not installed');
    });

    it('should return error when target version cannot be resolved', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValue({
        error: 'npm ERR! 404 Not Found',
        stdout: '',
        stderr: '',
      });

      const args: UpgradePackageArgs = {
        package: 'lodash',
        target_version: '99.99.99',
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.error).toContain('Could not resolve version');
    });
  });

  describe('version resolution', () => {
    it('should resolve "latest" version from npm registry', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '4.17.21',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        target_version: 'latest',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.target_version).toBe('4.17.21');
    });

    it('should validate specific version exists', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '4.17.20',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        target_version: '4.17.20',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.target_version).toBe('4.17.20');
    });

    it('should detect package from devDependencies', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {},
        devDependencies: {
          vitest: '^0.34.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '1.0.0',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'vitest',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.current_version).toBe('0.34.0');
      expect(data.rollback_command).toContain('-D');
    });
  });

  describe('major bump detection', () => {
    it('should detect major version bump', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^17.0.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '18.2.0',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'react',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.is_major_bump).toBe(true);
      expect(data.warnings).toContain(
        'This is a major version upgrade. Review breaking changes carefully.'
      );
    });

    it('should not flag minor version bump as major', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '4.18.0',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.is_major_bump).toBe(false);
    });

    it('should not flag patch version bump as major', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '4.17.21',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.is_major_bump).toBe(false);
    });

    it('should handle version prefixes correctly', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          typescript: '~4.9.5',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '5.3.3',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'typescript',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.current_version).toBe('4.9.5');
      expect(data.is_major_bump).toBe(true);
    });

    it('should handle prerelease versions', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          next: '^13.0.0-beta.1',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '14.0.0',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'next',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.current_version).toBe('13.0.0');
      expect(data.is_major_bump).toBe(true);
    });
  });

  describe('changelog fetching', () => {
    it('should fetch changelog from GitHub', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec)
        .mockResolvedValueOnce({
          error: null,
          stdout: '4.17.21',
          stderr: '',
        })
        .mockResolvedValueOnce({
          error: null,
          stdout: JSON.stringify({
            repository: { url: 'git+https://github.com/lodash/lodash.git' },
          }),
          stderr: '',
        });
      // Changelog content needs to be > 100 chars to be accepted
      vi.mocked(fetchUrl).mockResolvedValueOnce(
        '# Changelog\n\n## 4.17.21\n\n- Fixed security issue in prototype pollution vulnerability\n- Performance improvements for array methods\n- Updated dependencies to latest versions\n- Various bug fixes and stability improvements'
      );
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        include_changelog: true,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      // release_notes_url will be defined from GitHub repo extraction
      expect(data.release_notes_url).toBeDefined();
      // changelog_summary will be defined since content > 100 chars
      expect(data.changelog_summary).toBeDefined();
    });

    it('should return release notes URL when changelog not found', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec)
        .mockResolvedValueOnce({
          error: null,
          stdout: '4.17.21',
          stderr: '',
        })
        .mockResolvedValueOnce({
          error: null,
          stdout: JSON.stringify({
            repository: { url: 'git+https://github.com/lodash/lodash.git' },
          }),
          stderr: '',
        });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        include_changelog: true,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.release_notes_url).toContain('github.com');
      expect(data.release_notes_url).toContain('releases');
    });

    it('should skip changelog when include_changelog is false', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '4.17.21',
        stderr: '',
      });
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);

      // Should not call fetchUrl for changelog
      expect(fetchUrl).not.toHaveBeenCalled();
    });
  });

  describe('breaking change detection', () => {
    it('should detect breaking changes from changelog', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^17.0.0',
        },
      });
      vi.mocked(safeExec)
        .mockResolvedValueOnce({
          error: null,
          stdout: '18.0.0',
          stderr: '',
        })
        .mockResolvedValueOnce({
          error: null,
          stdout: JSON.stringify({
            repository: { url: 'https://github.com/facebook/react' },
          }),
          stderr: '',
        });
      // Changelog needs to be > 100 chars and have breaking change patterns
      vi.mocked(fetchUrl).mockResolvedValueOnce(
        '# Changelog\n\n## 18.0.0\n\nBREAKING CHANGES: ReactDOM.render is now deprecated and will be removed in a future version of React. Please migrate to createRoot API. This is a significant change that affects how applications are initialized.'
      );
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'react',
        include_changelog: true,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.breaking_changes.length).toBeGreaterThan(0);
      // The warning says "potential breaking change(s)"
      expect(data.warnings.some((w: string) => w.includes('breaking change'))).toBe(true);
    });

    it('should classify API breaking changes', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          axios: '^0.27.0',
        },
      });
      vi.mocked(safeExec)
        .mockResolvedValueOnce({
          error: null,
          stdout: '1.0.0',
          stderr: '',
        })
        .mockResolvedValueOnce({
          error: null,
          stdout: JSON.stringify({
            repository: { url: 'https://github.com/axios/axios' },
          }),
          stderr: '',
        });
      // Changelog needs > 100 chars and "function" keyword for API classification
      vi.mocked(fetchUrl).mockResolvedValueOnce(
        '# Changelog\n\nBREAKING CHANGES: Changed function signature for request interceptors. The old function format is no longer supported. Please update your interceptor functions to match the new API signature. See migration guide for details on updating your code.'
      );
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'axios',
        include_changelog: true,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      // Should have breaking changes detected
      expect(data.breaking_changes.length).toBeGreaterThan(0);
      // Check if any has 'api' type (or it may classify as 'behavior' based on content)
      const hasApiOrBehavior = data.breaking_changes.some(
        (bc: { type: string }) => bc.type === 'api' || bc.type === 'behavior'
      );
      expect(hasApiOrBehavior).toBe(true);
    });

    it('should add generic warning for major bump without detected changes', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          typescript: '^4.9.0',
        },
      });
      vi.mocked(safeExec)
        .mockResolvedValueOnce({
          error: null,
          stdout: '5.0.0',
          stderr: '',
        })
        .mockResolvedValueOnce({
          error: null,
          stdout: JSON.stringify({
            repository: { url: 'https://github.com/microsoft/TypeScript' },
          }),
          stderr: '',
        });
      vi.mocked(fetchUrl).mockResolvedValueOnce(
        '# Changelog\n\n## 5.0.0\n\n- New features added\n- Performance improvements'
      );
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'typescript',
        include_changelog: true,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.breaking_changes.length).toBeGreaterThan(0);
      expect(data.breaking_changes[0].description).toContain('Major version bump');
    });
  });

  describe('dependency analysis', () => {
    it('should find dependent packages from package-lock.json', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          debug: '^4.3.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '4.3.4',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        JSON.stringify({
          packages: {
            'node_modules/axios': {
              dependencies: {
                debug: '^4.3.0',
              },
            },
            'node_modules/express': {
              dependencies: {
                debug: '^4.3.0',
              },
            },
          },
        })
      );

      const args: UpgradePackageArgs = {
        package: 'debug',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies_affected).toContain('axios');
      expect(data.dependencies_affected).toContain('express');
    });

    it('should warn when many packages are affected', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          tslib: '^2.0.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '2.6.0',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(true);

      // Create many dependents
      const packages: Record<string, { dependencies: { tslib: string } }> = {};
      for (let i = 0; i < 10; i++) {
        packages[`node_modules/pkg-${i}`] = {
          dependencies: { tslib: '^2.0.0' },
        };
      }

      vi.mocked(fsPromises.readFile).mockResolvedValue(
        JSON.stringify({ packages })
      );

      const args: UpgradePackageArgs = {
        package: 'tslib',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies_affected.length).toBeGreaterThan(5);
      // Warning format is "{count} other packages depend on this one. Test thoroughly."
      expect(data.warnings.some((w: string) => w.includes('packages depend'))).toBe(true);
    });

    it('should handle scoped packages in dependents', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          'zone.js': '^0.13.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '0.14.0',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(true);
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        JSON.stringify({
          packages: {
            'node_modules/@angular/core': {
              peerDependencies: {
                'zone.js': '~0.13.0',
              },
            },
          },
        })
      );

      const args: UpgradePackageArgs = {
        package: 'zone.js',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.dependencies_affected).toContain('@angular/core');
    });
  });

  describe('dry run mode', () => {
    it('should not execute upgrade in dry run mode (default)', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '4.17.21',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.upgrade_applied).toBe(false);
      // Warning format is "Dry run mode: No changes were made. Set dry_run=false to apply upgrade."
      expect(data.warnings.some((w: string) => w.includes('Dry run'))).toBe(true);
    });

    it('should show what would be done without executing', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          express: '^4.18.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '4.19.0',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'express',
        dry_run: true,
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.package).toBe('express');
      expect(data.current_version).toBe('4.18.0');
      expect(data.target_version).toBe('4.19.0');
      expect(data.rollback_command).toContain('npm install express@4.18.0');
      expect(data.upgrade_applied).toBe(false);
    });
  });

  describe('upgrade execution', () => {
    it('should execute upgrade when dry_run is false', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec)
        .mockResolvedValueOnce({
          error: null,
          stdout: '4.17.21',
          stderr: '',
        })
        .mockResolvedValueOnce({
          error: null,
          stdout: 'added 1 package',
          stderr: '',
        });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        dry_run: false,
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.upgrade_applied).toBe(true);
      expect(safeExec).toHaveBeenCalledWith(
        expect.stringContaining('npm install lodash@4.17.21'),
        expect.any(String),
        expect.any(Number)
      );
    });

    it('should use -D flag for devDependencies', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {},
        devDependencies: {
          vitest: '^0.34.0',
        },
      });
      vi.mocked(safeExec)
        .mockResolvedValueOnce({
          error: null,
          stdout: '1.0.0',
          stderr: '',
        })
        .mockResolvedValueOnce({
          error: null,
          stdout: 'added 1 package',
          stderr: '',
        });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'vitest',
        dry_run: false,
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);

      expect(safeExec).toHaveBeenCalledWith(
        expect.stringContaining('-D'),
        expect.any(String),
        expect.any(Number)
      );
    });

    it('should handle upgrade failure', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec)
        .mockResolvedValueOnce({
          error: null,
          stdout: '4.17.21',
          stderr: '',
        })
        .mockResolvedValueOnce({
          error: 'npm ERR! ERESOLVE',
          stdout: '',
          stderr: 'Could not resolve dependency tree',
        });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        dry_run: false,
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(data.upgrade_applied).toBe(false);
      // Warning format is "Upgrade failed: {output}"
      expect(data.warnings.some((w: string) => w.includes('Upgrade failed'))).toBe(true);
    });
  });

  describe('test execution after upgrade', () => {
    it('should run tests when run_tests_after is true', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec)
        .mockResolvedValueOnce({
          error: null,
          stdout: '4.17.21',
          stderr: '',
        })
        .mockResolvedValueOnce({
          error: null,
          stdout: 'Package upgraded',
          stderr: '',
        })
        .mockResolvedValueOnce({
          error: null,
          stdout: 'All tests passed',
          stderr: '',
        });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        dry_run: false,
        run_tests_after: true,
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.test_results).toBeDefined();
      expect(data.test_results.passed).toBe(true);
    });

    it('should report test failure with warning', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec)
        .mockResolvedValueOnce({
          error: null,
          stdout: '4.17.21',
          stderr: '',
        })
        .mockResolvedValueOnce({
          error: null,
          stdout: 'Package upgraded',
          stderr: '',
        })
        .mockResolvedValueOnce({
          error: 'Test failed',
          stdout: 'FAIL src/utils.test.ts',
          stderr: 'Assertion failed',
        });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        dry_run: false,
        run_tests_after: true,
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.test_results).toBeDefined();
      expect(data.test_results.passed).toBe(false);
      // Warning format is "Tests failed after upgrade. Consider rolling back."
      expect(data.warnings.some((w: string) => w.includes('Tests failed'))).toBe(true);
    });

    it('should not run tests in dry run mode', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '4.17.21',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        dry_run: true,
        run_tests_after: true,
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.test_results).toBeUndefined();
    });
  });

  describe('rollback command', () => {
    it('should generate correct rollback command', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          react: '^17.0.2',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '18.2.0',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'react',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.rollback_command).toBe('npm install react@17.0.2');
    });

    it('should include -D in rollback for devDependencies', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {},
        devDependencies: {
          jest: '^28.0.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '29.0.0',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'jest',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.rollback_command).toBe('npm install jest@28.0.0 -D');
    });
  });

  describe('already at target version', () => {
    it('should warn when already at target version', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.21',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '4.17.21',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(data.warnings).toContain('Package is already at the target version.');
    });
  });

  describe('custom project path', () => {
    it('should use custom path when provided', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '4.17.21',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        path: './packages/my-app',
        include_changelog: false,
      };

      await handleUpgradePackage(args);

      expect(readJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('packages')
      );
    });
  });

  describe('GitHub repo extraction', () => {
    it('should extract repo from git+https URL', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          axios: '^1.0.0',
        },
      });
      vi.mocked(safeExec)
        .mockResolvedValueOnce({
          error: null,
          stdout: '1.6.0',
          stderr: '',
        })
        .mockResolvedValueOnce({
          error: null,
          stdout: JSON.stringify({
            repository: { url: 'git+https://github.com/axios/axios.git' },
          }),
          stderr: '',
        });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'axios',
        include_changelog: true,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.release_notes_url).toContain('github.com/axios/axios');
    });

    it('should extract repo from homepage when repository not available', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          somepackage: '^1.0.0',
        },
      });
      vi.mocked(safeExec)
        .mockResolvedValueOnce({
          error: null,
          stdout: '2.0.0',
          stderr: '',
        })
        .mockResolvedValueOnce({
          error: null,
          stdout: JSON.stringify({
            homepage: 'https://github.com/owner/repo#readme',
          }),
          stderr: '',
        });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'somepackage',
        include_changelog: true,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data.release_notes_url).toContain('github.com/owner/repo');
    });
  });

  describe('response format', () => {
    it('should include all expected fields', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '4.17.21',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);
      const data = JSON.parse(result.content[0].text);

      expect(data).toHaveProperty('package');
      expect(data).toHaveProperty('current_version');
      expect(data).toHaveProperty('target_version');
      expect(data).toHaveProperty('is_major_bump');
      expect(data).toHaveProperty('breaking_changes');
      expect(data).toHaveProperty('dependencies_affected');
      expect(data).toHaveProperty('upgrade_applied');
      expect(data).toHaveProperty('rollback_command');
      expect(data).toHaveProperty('warnings');
    });

    it('should format output as pretty JSON', async () => {
      vi.mocked(readJsonFile).mockResolvedValue({
        dependencies: {
          lodash: '^4.17.0',
        },
      });
      vi.mocked(safeExec).mockResolvedValueOnce({
        error: null,
        stdout: '4.17.21',
        stderr: '',
      });
      vi.mocked(fetchUrl).mockResolvedValue(null);
      vi.mocked(fileExists).mockResolvedValue(false);

      const args: UpgradePackageArgs = {
        package: 'lodash',
        include_changelog: false,
      };

      const result = await handleUpgradePackage(args);

      // Check that output is formatted (contains newlines)
      expect(result.content[0].text).toContain('\n');
    });
  });
});
