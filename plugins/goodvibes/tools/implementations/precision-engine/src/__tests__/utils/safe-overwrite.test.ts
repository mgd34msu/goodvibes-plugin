import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkGitStatus, generateBackupPath, createBackup, performSafeOverwrite } from '../../utils/safe-overwrite.js';
import type { GitStatus, SafeOverwriteResult } from '../../utils/safe-overwrite.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { FileStateCache } from '../../state/file-cache.js';
import * as runtimeConfig from '../../runtime-config.js';

// Mock modules
vi.mock('child_process');
vi.mock('fs/promises');
vi.mock('../../state/file-cache.js');
vi.mock('../../runtime-config.js');

describe('checkGitStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns clean status for committed clean file', async () => {
    const mockProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('true')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    const mockStatusProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      return (callCount === 1 ? mockProc : mockStatusProc) as any;
    });

    const result = await checkGitStatus('/test/file.ts');

    expect(result).toEqual({ status: 'clean', inRepo: true });
  });

  it('returns staged status when index has changes', async () => {
    const mockProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('true')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    const mockStatusProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from(' M file.ts')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      return (callCount === 1 ? mockProc : mockStatusProc) as any;
    });

    const result = await checkGitStatus('/test/file.ts');

    expect(result).toEqual({ status: 'staged', inRepo: true });
  });

  it('returns staged status for staged file', async () => {
    const mockProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('true')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    const mockStatusProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('M  file.ts')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      return (callCount === 1 ? mockProc : mockStatusProc) as any;
    });

    const result = await checkGitStatus('/test/file.ts');

    expect(result).toEqual({ status: 'staged', inRepo: true });
  });

  it('returns untracked status for untracked file', async () => {
    const mockProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('true')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    const mockStatusProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('?? file.ts')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      return (callCount === 1 ? mockProc : mockStatusProc) as any;
    });

    const result = await checkGitStatus('/test/file.ts');

    expect(result).toEqual({ status: 'untracked', inRepo: true });
  });

  it('returns null status when not in git repo', async () => {
    const mockProc = {
      stdout: {
        on: vi.fn(),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 10);
        }
      }),
      kill: vi.fn(),
    };

    vi.mocked(spawn).mockReturnValue(mockProc as any);

    const result = await checkGitStatus('/test/file.ts');

    expect(result).toEqual({ status: null, inRepo: false });
  });

  it('handles git command timeout', async () => {
    vi.useFakeTimers();

    const mockProc = {
      stdout: {
        on: vi.fn(),
      },
      on: vi.fn(),
      kill: vi.fn(),
    };

    vi.mocked(spawn).mockReturnValue(mockProc as any);

    const promise = checkGitStatus('/test/file.ts');

    // Fast-forward past timeout
    await vi.advanceTimersByTimeAsync(6000);

    const result = await promise;

    expect(result).toEqual({ status: null, inRepo: false });
    expect(mockProc.kill).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('handles git spawn error', async () => {
    const mockProc = {
      stdout: {
        on: vi.fn(),
      },
      on: vi.fn((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('spawn failed')), 0);
        }
      }),
      kill: vi.fn(),
    };

    vi.mocked(spawn).mockReturnValue(mockProc as any);

    const result = await checkGitStatus('/test/file.ts');

    expect(result).toEqual({ status: null, inRepo: false });
  });
});

describe('generateBackupPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates backup path with timestamp', () => {
    vi.mocked(runtimeConfig.getBackupDir).mockReturnValue('.goodvibes/backups');

    const result = generateBackupPath('/project/src/file.ts', '/project');

    expect(result).toMatch(/\/project\/.goodvibes\/backups\/src\/file\.ts\.[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}.*\.bak$/);
  });

  it('uses configured backup directory', () => {
    vi.mocked(runtimeConfig.getBackupDir).mockReturnValue('custom/backup');

    const result = generateBackupPath('/project/src/file.ts', '/project');

    expect(result).toContain('/custom/backup/');
  });

  it('preserves file extension in backup name', () => {
    vi.mocked(runtimeConfig.getBackupDir).mockReturnValue('.goodvibes/backups');

    const result = generateBackupPath('/project/src/utils/test.ts', '/project');

    expect(result).toMatch(/test\.ts\.[0-9]{4}-.*\.bak$/);
  });

  it('handles absolute file paths', () => {
    vi.mocked(runtimeConfig.getBackupDir).mockReturnValue('.goodvibes/backups');

    const result = generateBackupPath('/project/src/file.ts', '/project');

    expect(result).toContain('.goodvibes/backups/src/file.ts');
  });

  it('handles relative file paths', () => {
    vi.mocked(runtimeConfig.getBackupDir).mockReturnValue('.goodvibes/backups');

    const result = generateBackupPath('src/file.ts', '/project');

    expect(result).toContain('.goodvibes/backups/src/file.ts');
  });

  it('throws if backup path escapes backup directory', () => {
    vi.mocked(runtimeConfig.getBackupDir).mockReturnValue('.goodvibes/backups');

    expect(() => {
      generateBackupPath('/project/../../../etc/passwd', '/project');
    }).toThrow('Backup path escapes backup directory');
  });
});

describe('createBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates backup by copying file', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ size: 1024 } as any);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);

    await createBackup('/project/file.ts', '/project/.goodvibes/backups/file.ts.2024.bak');

    expect(fs.stat).toHaveBeenCalledWith('/project/file.ts');
    expect(fs.mkdir).toHaveBeenCalledWith('/project/.goodvibes/backups', { recursive: true });
    expect(fs.copyFile).toHaveBeenCalledWith('/project/file.ts', '/project/.goodvibes/backups/file.ts.2024.bak');
  });

  it('creates parent directories recursively', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ size: 1024 } as any);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);

    await createBackup('/project/file.ts', '/project/.goodvibes/backups/deep/nested/file.ts.bak');

    expect(fs.mkdir).toHaveBeenCalledWith('/project/.goodvibes/backups/deep/nested', { recursive: true });
  });

  it('rejects files larger than 50MB', async () => {
    const largeSize = 51 * 1024 * 1024;
    vi.mocked(fs.stat).mockResolvedValue({ size: largeSize } as any);

    await expect(createBackup('/project/large.ts', '/backup/large.ts.bak'))
      .rejects.toThrow('File too large for backup (>50MB)');

    expect(fs.copyFile).not.toHaveBeenCalled();
  });

  it('handles missing source file', async () => {
    vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT: file not found'));

    await expect(createBackup('/project/missing.ts', '/backup/missing.ts.bak'))
      .rejects.toThrow('ENOENT: file not found');
  });

  it('allows files exactly at 50MB limit', async () => {
    const exactSize = 50 * 1024 * 1024;
    vi.mocked(fs.stat).mockResolvedValue({ size: exactSize } as any);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);

    await expect(createBackup('/project/exact.ts', '/backup/exact.ts.bak'))
      .resolves.toBeUndefined();

    expect(fs.copyFile).toHaveBeenCalled();
  });
});

describe('performSafeOverwrite', () => {
  let mockCache: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCache = {
      getEntryInfo: vi.fn(),
      update: vi.fn(),
    };

    vi.mocked(FileStateCache.getInstance).mockReturnValue(mockCache);
  });

  it('returns early when safe_overwrite is disabled', async () => {
    vi.mocked(runtimeConfig.getSafeOverwrite).mockReturnValue(false);

    const result = await performSafeOverwrite('/project/file.ts', '/project', true);

    expect(result).toEqual({
      gitStatus: { status: null, inRepo: false },
    });
    expect(mockCache.getEntryInfo).not.toHaveBeenCalled();
  });

  it('returns early when file does not exist', async () => {
    vi.mocked(runtimeConfig.getSafeOverwrite).mockReturnValue(true);

    const result = await performSafeOverwrite('/project/file.ts', '/project', false);

    expect(result).toEqual({
      gitStatus: { status: null, inRepo: false },
    });
    expect(mockCache.getEntryInfo).not.toHaveBeenCalled();
  });

  it('returns early when file has been read this session', async () => {
    vi.mocked(runtimeConfig.getSafeOverwrite).mockReturnValue(true);
    mockCache.getEntryInfo.mockReturnValue({ version: 1 });

    const result = await performSafeOverwrite('/project/file.ts', '/project', true);

    expect(result).toEqual({
      gitStatus: { status: null, inRepo: false },
    });
    expect(mockCache.getEntryInfo).toHaveBeenCalledWith('/project/file.ts');
  });

  it('creates snapshot for first-time overwrite', async () => {
    vi.mocked(runtimeConfig.getSafeOverwrite).mockReturnValue(true);
    vi.mocked(runtimeConfig.getBackupDir).mockReturnValue('.goodvibes/backups');
    vi.mocked(runtimeConfig.getBackupGitCleanSkip).mockReturnValue(false);
    mockCache.getEntryInfo.mockReturnValue(null);
    mockCache.update.mockReturnValue({ version: 1 });
    vi.mocked(fs.readFile).mockResolvedValue('file content');
    vi.mocked(fs.stat).mockResolvedValue({ size: 1024 } as any);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);

    const mockGitProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('true')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    const mockStatusProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      return (callCount === 1 ? mockGitProc : mockStatusProc) as any;
    });

    const result = await performSafeOverwrite('/project/file.ts', '/project', true);

    expect(result.snapshotVersion).toBe(1);
    expect(result.gitStatus).toEqual({ status: 'clean', inRepo: true });
    expect(mockCache.update).toHaveBeenCalledWith(
      '/project/file.ts',
      'file content',
      'pre_overwrite_snapshot',
      undefined,
      'Automatic snapshot before first overwrite'
    );
  });

  it('creates backup for dirty file', async () => {
    vi.mocked(runtimeConfig.getSafeOverwrite).mockReturnValue(true);
    vi.mocked(runtimeConfig.getBackupDir).mockReturnValue('.goodvibes/backups');
    vi.mocked(runtimeConfig.getBackupGitCleanSkip).mockReturnValue(true);
    mockCache.getEntryInfo.mockReturnValue(null);
    mockCache.update.mockReturnValue({ version: 1 });
    vi.mocked(fs.readFile).mockResolvedValue('file content');
    vi.mocked(fs.stat).mockResolvedValue({ size: 1024 } as any);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);

    const mockGitProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('true')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    const mockStatusProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from(' M file.ts')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      return (callCount === 1 ? mockGitProc : mockStatusProc) as any;
    });

    const result = await performSafeOverwrite('/project/file.ts', '/project', true);

    expect(result.backupPath).toMatch(/\.goodvibes\/backups\/file\.ts\./);    expect(result.gitStatus).toEqual({ status: 'staged', inRepo: true });
    expect(result.warning).toContain('First-time overwrite: backup created');
    expect(fs.copyFile).toHaveBeenCalled();
  });

  it('sets recoverableVia for clean git file with skipGitClean enabled', async () => {
    vi.mocked(runtimeConfig.getSafeOverwrite).mockReturnValue(true);
    vi.mocked(runtimeConfig.getBackupGitCleanSkip).mockReturnValue(true);
    mockCache.getEntryInfo.mockReturnValue(null);
    mockCache.update.mockReturnValue({ version: 1 });
    vi.mocked(fs.readFile).mockResolvedValue('file content');

    const mockGitProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('true')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    const mockStatusProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      return (callCount === 1 ? mockGitProc : mockStatusProc) as any;
    });

    const result = await performSafeOverwrite('/project/file.ts', '/project', true);

    expect(result.recoverableVia).toBe('git checkout (file is committed and clean)');
    expect(result.backupPath).toBeUndefined();
  });

  it('creates backup for untracked file', async () => {
    vi.mocked(runtimeConfig.getSafeOverwrite).mockReturnValue(true);
    vi.mocked(runtimeConfig.getBackupDir).mockReturnValue('.goodvibes/backups');
    vi.mocked(runtimeConfig.getBackupGitCleanSkip).mockReturnValue(true);
    mockCache.getEntryInfo.mockReturnValue(null);
    mockCache.update.mockReturnValue({ version: 1 });
    vi.mocked(fs.readFile).mockResolvedValue('file content');
    vi.mocked(fs.stat).mockResolvedValue({ size: 1024 } as any);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);

    const mockGitProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('true')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    const mockStatusProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('?? file.ts')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      return (callCount === 1 ? mockGitProc : mockStatusProc) as any;
    });

    const result = await performSafeOverwrite('/project/file.ts', '/project', true);

    expect(result.backupPath).toBeDefined();
    expect(result.gitStatus).toEqual({ status: 'untracked', inRepo: true });
    expect(result.warning).toContain('backup created');
  });

  it('adds warning on snapshot failure but continues', async () => {
    vi.mocked(runtimeConfig.getSafeOverwrite).mockReturnValue(true);
    vi.mocked(runtimeConfig.getBackupGitCleanSkip).mockReturnValue(true);
    mockCache.getEntryInfo.mockReturnValue(null);
    vi.mocked(fs.readFile).mockRejectedValue(new Error('Read failed'));

    const mockGitProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('true')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    const mockStatusProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      return (callCount === 1 ? mockGitProc : mockStatusProc) as any;
    });

    const result = await performSafeOverwrite('/project/file.ts', '/project', true);

    expect(result.warning).toContain('Failed to create cache snapshot: Read failed');
    expect(result.snapshotVersion).toBeUndefined();
  });

  it('adds warning on backup failure but continues', async () => {
    vi.mocked(runtimeConfig.getSafeOverwrite).mockReturnValue(true);
    vi.mocked(runtimeConfig.getBackupDir).mockReturnValue('.goodvibes/backups');
    vi.mocked(runtimeConfig.getBackupGitCleanSkip).mockReturnValue(true);
    mockCache.getEntryInfo.mockReturnValue(null);
    mockCache.update.mockReturnValue({ version: 1 });
    vi.mocked(fs.readFile).mockResolvedValue('file content');
    vi.mocked(fs.stat).mockRejectedValue(new Error('Stat failed'));

    const mockGitProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('true')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    const mockStatusProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from(' M file.ts')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      return (callCount === 1 ? mockGitProc : mockStatusProc) as any;
    });

    const result = await performSafeOverwrite('/project/file.ts', '/project', true);

    expect(result.warning).toContain('Failed to create backup: Stat failed');
    expect(result.backupPath).toBeUndefined();
  });

  it('chains multiple warnings correctly', async () => {
    vi.mocked(runtimeConfig.getSafeOverwrite).mockReturnValue(true);
    vi.mocked(runtimeConfig.getBackupDir).mockReturnValue('.goodvibes/backups');
    vi.mocked(runtimeConfig.getBackupGitCleanSkip).mockReturnValue(true);
    mockCache.getEntryInfo.mockReturnValue(null);
    mockCache.update.mockImplementation(() => {
      throw new Error('Cache failed');
    });
    vi.mocked(fs.readFile).mockResolvedValue('file content');
    vi.mocked(fs.stat).mockRejectedValue(new Error('Backup failed'));

    const mockGitProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('true')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    const mockStatusProc = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from(' M file.ts')), 0);
          }
        }),
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
      }),
      kill: vi.fn(),
    };

    let callCount = 0;
    vi.mocked(spawn).mockImplementation(() => {
      callCount++;
      return (callCount === 1 ? mockGitProc : mockStatusProc) as any;
    });

    const result = await performSafeOverwrite('/project/file.ts', '/project', true);

    expect(result.warning).toContain('Failed to create cache snapshot: Cache failed');
    expect(result.warning).toContain('Failed to create backup: Backup failed');
  });
});
