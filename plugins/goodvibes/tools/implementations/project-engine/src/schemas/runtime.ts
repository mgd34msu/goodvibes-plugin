import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const runtimeSchemas: Tool[] = [
  {
    name: 'project_runtime_memory',
    description: 'Detect potential memory leaks in a running Node.js process by monitoring heap growth over time.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          enum: ['pid', 'command'],
          description: 'Whether to monitor an existing PID or spawn a new command.',
        },
        pid: {
          type: 'number',
          description: 'Process ID to monitor (required when target is "pid").',
        },
        command: {
          type: 'string',
          description: 'Command to spawn and monitor (required when target is "command").',
        },
        duration_seconds: {
          type: 'number',
          description: 'How long to monitor in seconds. Defaults to 60.',
        },
        snapshot_interval_ms: {
          type: 'number',
          description: 'Interval between memory snapshots in milliseconds. Defaults to 5000.',
        },
        threshold_mb: {
          type: 'number',
          description: 'Heap growth threshold in MB to classify as a leak. Defaults to 50.',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for spawned commands.',
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'project_runtime_profile',
    description: 'Profile a function execution for performance bottlenecks, measuring timing and memory statistics.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file: {
          type: 'string',
          description: 'Path to the file containing the function to profile.',
        },
        function_name: {
          type: 'string',
          description: 'Name of the exported function to profile.',
        },
        inputs: {
          type: 'array',
          description: 'Input arguments to pass to the function.',
          items: {},
        },
        iterations: {
          type: 'number',
          description: 'Number of times to run the function for timing. Defaults to 100.',
        },
        warmup: {
          type: 'number',
          description: 'Number of warmup runs before timing. Defaults to 10.',
        },
        capture_memory: {
          type: 'boolean',
          description: 'Also capture heap memory delta. Defaults to false.',
        },
        timeout: {
          type: 'number',
          description: 'Timeout per invocation in milliseconds. Defaults to 5000.',
        },
      },
      required: ['file', 'function_name', 'inputs'],
    },
  },
  {
    name: 'project_runtime_logs',
    description: 'Analyze application logs for patterns, anomalies, error frequency, and rate changes.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        source: {
          type: 'string',
          enum: ['file', 'command'],
          description: 'Whether to read from a log file or capture output from a command.',
        },
        path: {
          type: 'string',
          description: 'Path to the log file (required when source is "file").',
        },
        command: {
          type: 'string',
          description: 'Command to run and capture output from (required when source is "command").',
        },
        duration_seconds: {
          type: 'number',
          description: 'How long to capture command output in seconds. Defaults to 30.',
        },
        tail_lines: {
          type: 'number',
          description: 'Number of lines from the end of the log file to analyze. Defaults to 1000.',
        },
        structured: {
          type: 'boolean',
          description: 'Parse as structured JSON logs. Auto-detected if not specified.',
        },
        patterns: {
          type: 'array',
          description: 'Custom patterns to count in the logs.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              pattern: { type: 'string' },
            },
            required: ['name', 'pattern'],
          },
        },
        time_window: {
          type: 'string',
          description: 'Time window for rate analysis (e.g., "1h", "30m", "1d").',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for spawned commands.',
        },
      },
      required: ['source'],
    },
  },
];
