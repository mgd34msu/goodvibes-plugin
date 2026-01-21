/**
 * Security tool schemas - secrets scanning, permissions checking
 */

export const SECURITY_SCHEMAS = [
  {
    name: 'scan_for_secrets',
    description: 'Scan source files for potential secrets, credentials, and sensitive data. Detects common secret patterns including API keys, tokens, passwords, private keys, and database connection strings. Supports configurable depth limit and early exit for presence-only checks.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory to scan for secrets', default: '.' },
        include_staged: { type: 'boolean', description: 'Also check git staged files', default: true },
        severity_threshold: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Minimum severity level to report',
          default: 'low',
        },
        max_depth: {
          type: 'integer',
          description: 'Maximum directory depth to scan (default: 10, configurable via SECRETS_SCAN_MAX_DEPTH env var)',
          default: 10,
        },
        check_presence_only: {
          type: 'boolean',
          description: 'Stop scanning after first match - useful for fast presence checks (default: false)',
          default: false,
        },
      },
    },
  },
  {
    name: 'check_permissions',
    description: 'Analyze file, network, and system access patterns in code. Scans for fs, net, child_process, http(s) imports and usages. Categorizes findings by type (filesystem, network, process, crypto) and risk level.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Specific file to analyze (optional)' },
        path: { type: 'string', description: 'Directory to scan (defaults to current directory)', default: '.' },
      },
    },
  },
];
