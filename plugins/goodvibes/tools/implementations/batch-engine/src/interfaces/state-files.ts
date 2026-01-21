/**
 * State Files interfaces for Batch Engine
 * @see SPEC-v2 Section 7.2
 *
 * State file paths structure:
 * .goodvibes/
 * ├── state/
 * │   ├── session.json           # Current session state
 * │   ├── agents.json            # Agent tracking
 * │   ├── locks.json             # Active locks
 * │   └── health.json            # Health check results
 * ├── checkpoints/
 * │   ├── cp_YYYYMMDD_HHMMSS/
 * │   │   ├── manifest.json      # Checkpoint metadata
 * │   │   ├── files/             # File backups
 * │   │   └── state.json         # State snapshot
 * │   └── ...
 * └── cache/
 *     ├── stack.json             # Cached stack detection
 *     ├── symbols.json           # Cached symbol index
 *     └── deps.json              # Cached dependency graph
 */

export const STATE_PATHS = {
  ROOT: '.goodvibes',
  STATE_DIR: '.goodvibes/state',
  SESSION_FILE: '.goodvibes/state/session.json',
  AGENTS_FILE: '.goodvibes/state/agents.json',
  LOCKS_FILE: '.goodvibes/state/locks.json',
  HEALTH_FILE: '.goodvibes/state/health.json',
  CHECKPOINTS_DIR: '.goodvibes/checkpoints',
  CACHE_DIR: '.goodvibes/cache',
  STACK_CACHE: '.goodvibes/cache/stack.json',
  SYMBOLS_CACHE: '.goodvibes/cache/symbols.json',
  DEPS_CACHE: '.goodvibes/cache/deps.json',
} as const

export type StatePath = typeof STATE_PATHS[keyof typeof STATE_PATHS]

export interface CheckpointDirectory {
  manifest: string   // manifest.json
  files: string      // files/ directory
  state: string      // state.json
}

export function getCheckpointPath(checkpointId: string): CheckpointDirectory {
  const base = `${STATE_PATHS.CHECKPOINTS_DIR}/${checkpointId}`
  return {
    manifest: `${base}/manifest.json`,
    files: `${base}/files`,
    state: `${base}/state.json`,
  }
}

export interface StateFileManager {
  ensureDirectories(): Promise<void>
  readStateFile<T>(path: StatePath): Promise<T | null>
  writeStateFile<T>(path: StatePath, data: T): Promise<void>
  deleteStateFile(path: StatePath): Promise<boolean>
  listCheckpoints(): Promise<string[]>
}
