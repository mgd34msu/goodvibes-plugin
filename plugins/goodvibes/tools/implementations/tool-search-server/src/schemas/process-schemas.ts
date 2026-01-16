/**
 * Process management tool schemas - dev server, health monitoring, error watching
 */

export const PROCESS_SCHEMAS = [
  {
    name: 'start_dev_server',
    description: 'Start a development server and return when ready. Spawns npm/yarn/pnpm dev command, monitors output for ready signals (localhost URLs, "ready", "compiled"), and returns server URL. Supports custom commands and ports. Process runs in background and can be stopped with the returned process ID.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Custom command to run (default: auto-detect from package.json scripts)',
        },
        port: {
          type: 'integer',
          description: 'Expected port number (default: auto-detect from output)',
        },
        ready_timeout: {
          type: 'integer',
          description: 'Max time in ms to wait for ready signal (default: 60000)',
          default: 60000,
        },
        cwd: {
          type: 'string',
          description: 'Working directory (default: project root)',
        },
      },
    },
  },
  {
    name: 'health_monitor',
    description: 'Monitor a URL endpoint for health status. Makes periodic HTTP requests to check if a service is responding. Returns health status, response times, and any errors. Useful for verifying dev servers are running after changes.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to monitor (e.g., http://localhost:3000)',
        },
        interval_ms: {
          type: 'integer',
          description: 'Time between health checks in ms (default: 5000)',
          default: 5000,
        },
        duration_ms: {
          type: 'integer',
          description: 'Total monitoring duration in ms (default: 30000)',
          default: 30000,
        },
        expected_status: {
          type: 'integer',
          description: 'Expected HTTP status code (default: 200)',
          default: 200,
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'watch_for_errors',
    description: 'Monitor logs or process output for errors. Can tail log files or run commands and capture errors. Detects common error patterns (TypeError, ReferenceError, SyntaxError, ENOENT, etc.), extracts stack traces, deduplicates similar errors, and classifies error types. Returns structured error information with counts and recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['file', 'command'],
          description: 'Source type: "file" to tail a log file, "command" to run and watch a command',
        },
        file_path: {
          type: 'string',
          description: 'Log file path to tail (when source is "file")',
        },
        command: {
          type: 'string',
          description: 'Command to run and watch (when source is "command")',
        },
        patterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Custom regex patterns to match errors (in addition to defaults)',
        },
        duration: {
          type: 'integer',
          description: 'How long to watch in ms (default: 5000)',
          default: 5000,
        },
        tail_lines: {
          type: 'integer',
          description: 'For file source, how many lines to read (default: 100)',
          default: 100,
        },
        cwd: {
          type: 'string',
          description: 'Working directory for command source',
        },
      },
      required: ['source'],
    },
  },
  {
    name: 'detect_memory_leaks',
    description: 'Monitor process memory usage over time to detect potential memory leaks. Takes periodic snapshots, performs trend analysis with linear regression, and identifies consistent memory growth patterns. Supports monitoring existing processes by PID or spawning a new command.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: ['pid', 'command'],
          description: 'Target type: "pid" to monitor existing process, "command" to spawn and monitor new process',
        },
        pid: {
          type: 'integer',
          description: 'Process ID to monitor (required when target is "pid")',
        },
        command: {
          type: 'string',
          description: 'Command to spawn and monitor (e.g., "npm run dev") - required when target is "command"',
        },
        duration_seconds: {
          type: 'integer',
          description: 'How long to monitor in seconds (default: 30, max: 600)',
          default: 30,
        },
        snapshot_interval_ms: {
          type: 'integer',
          description: 'Time between memory measurements in milliseconds (default: 5000)',
          default: 5000,
        },
        threshold_mb: {
          type: 'integer',
          description: 'Minimum memory growth in MB to flag as potential leak (default: 10)',
          default: 10,
        },
        cwd: {
          type: 'string',
          description: 'Working directory for command execution (default: project root)',
        },
      },
      required: ['target'],
    },
  },
];
