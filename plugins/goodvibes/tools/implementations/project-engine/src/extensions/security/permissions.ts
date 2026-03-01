/**
 * Permissions checker extension
 *
 * High-level handler for the check_permissions MCP tool.
 * Scans TypeScript/JavaScript source files for sensitive API usage
 * and categorizes findings by type and risk level.
 *
 * @module extensions/security/permissions
 */

import * as node_fsPromises from 'node:fs/promises';
import * as node_path from 'node:path';
import type { McpResponse } from '../../shared/types.js';
import { ok, fail } from '../../shared/response.js';
import { getProjectRoot } from '../../shared/config.js';
import { fileExists } from '../../shared/utils.js';
import {
  type CheckPermissionsArgs,
  type PermissionFinding,
  type PermissionType,
  type RiskLevel,
  shouldSkip,
  isSourceFile,
  calculateRiskAssessment,
  generateRecommendations,
} from '../../core/security/index.js';

// =============================================================================
// Permission Pattern Definitions
// =============================================================================

/** Internal pattern definition */
interface PermissionPattern {
  type: PermissionType;
  api: string;
  pattern: RegExp;
  risk: RiskLevel;
  description: string;
  recommendation?: string;
}

/**
 * Permission patterns to detect in source code.
 * Covers filesystem, network, process execution, and crypto APIs.
 */
const PERMISSION_PATTERNS: PermissionPattern[] = [
  // Filesystem - Medium/High Risk
  { type: 'filesystem', api: 'fs.writeFileSync', pattern: /\bfs\.writeFileSync\s*\(/g, risk: 'medium', description: 'Synchronous file write operation', recommendation: 'Consider async fs.promises.writeFile for non-blocking I/O' },
  { type: 'filesystem', api: 'fs.promises.writeFile', pattern: /\bfs(?:Promises)?\.promises\.writeFile\s*\(/g, risk: 'low', description: 'Async file write operation' },
  { type: 'filesystem', api: 'fs.writeFile', pattern: /\bfs\.writeFile\s*\(/g, risk: 'low', description: 'Async file write with callback' },
  { type: 'filesystem', api: 'fs.readFileSync', pattern: /\bfs\.readFileSync\s*\(/g, risk: 'low', description: 'Synchronous file read operation' },
  { type: 'filesystem', api: 'fs.promises.readFile', pattern: /\bfs(?:Promises)?\.promises\.readFile\s*\(/g, risk: 'low', description: 'Async file read operation' },
  { type: 'filesystem', api: 'fs.readFile', pattern: /\bfs\.readFile\s*\(/g, risk: 'low', description: 'Async file read with callback' },
  { type: 'filesystem', api: 'fs.unlinkSync', pattern: /\bfs\.unlinkSync\s*\(/g, risk: 'medium', description: 'Synchronous file deletion', recommendation: 'Validate paths carefully before deletion' },
  { type: 'filesystem', api: 'fs.promises.unlink', pattern: /\bfs(?:Promises)?\.promises\.unlink\s*\(/g, risk: 'medium', description: 'Async file deletion', recommendation: 'Validate paths carefully before deletion' },
  { type: 'filesystem', api: 'fs.rmSync', pattern: /\bfs\.rmSync\s*\(/g, risk: 'high', description: 'Synchronous recursive directory removal', recommendation: 'Use with extreme caution - can delete entire directories' },
  { type: 'filesystem', api: 'fs.promises.rm', pattern: /\bfs(?:Promises)?\.promises\.rm\s*\(/g, risk: 'high', description: 'Async recursive directory removal', recommendation: 'Use with extreme caution - can delete entire directories' },
  { type: 'filesystem', api: 'fs.chmodSync', pattern: /\bfs\.chmodSync\s*\(/g, risk: 'medium', description: 'File permission modification' },
  { type: 'filesystem', api: 'fs.readdirSync', pattern: /\bfs\.readdirSync\s*\(/g, risk: 'low', description: 'Synchronous directory listing' },

  // Network
  { type: 'network', api: 'fetch', pattern: /\bfetch\s*\(/g, risk: 'low', description: 'HTTP fetch request' },
  { type: 'network', api: 'axios', pattern: /\baxios\s*\.\s*(get|post|put|patch|delete|request)\s*\(/g, risk: 'low', description: 'Axios HTTP request' },
  { type: 'network', api: 'http.createServer', pattern: /\bhttp\.createServer\s*\(/g, risk: 'low', description: 'HTTP server creation' },
  { type: 'network', api: 'https.createServer', pattern: /\bhttps\.createServer\s*\(/g, risk: 'low', description: 'HTTPS server creation' },
  { type: 'network', api: 'http.request', pattern: /\bhttp\.request\s*\(/g, risk: 'low', description: 'HTTP request' },
  { type: 'network', api: 'https.request', pattern: /\bhttps\.request\s*\(/g, risk: 'low', description: 'HTTPS request' },
  { type: 'network', api: 'net.createConnection', pattern: /\bnet\.createConnection\s*\(/g, risk: 'medium', description: 'Raw TCP socket connection', recommendation: 'Ensure proper connection validation and error handling' },
  { type: 'network', api: 'net.createServer', pattern: /\bnet\.createServer\s*\(/g, risk: 'medium', description: 'TCP server creation', recommendation: 'Implement proper authentication and rate limiting' },
  { type: 'network', api: 'dgram.createSocket', pattern: /\bdgram\.createSocket\s*\(/g, risk: 'medium', description: 'UDP socket creation' },
  { type: 'network', api: 'WebSocket', pattern: /\bnew\s+WebSocket\s*\(/g, risk: 'low', description: 'WebSocket connection' },
  { type: 'network', api: 'dns.lookup', pattern: /\bdns\.lookup\s*\(/g, risk: 'low', description: 'DNS lookup operation' },

  // Process - High Risk
  { type: 'process', api: 'child_process.exec', pattern: /\b(?:child_process\.)?exec\s*\(/g, risk: 'high', description: 'Command execution - potential injection risk', recommendation: 'Use execFile instead of exec to prevent shell injection' },
  { type: 'process', api: 'child_process.execSync', pattern: /\b(?:child_process\.)?execSync\s*\(/g, risk: 'high', description: 'Synchronous command execution - potential injection risk', recommendation: 'Use execFileSync instead and validate all inputs' },
  { type: 'process', api: 'child_process.spawn', pattern: /\b(?:child_process\.)?spawn\s*\(/g, risk: 'medium', description: 'Process spawning', recommendation: 'Validate command arguments carefully' },
  { type: 'process', api: 'child_process.spawnSync', pattern: /\b(?:child_process\.)?spawnSync\s*\(/g, risk: 'medium', description: 'Synchronous process spawning' },
  { type: 'process', api: 'child_process.execFile', pattern: /\b(?:child_process\.)?execFile\s*\(/g, risk: 'medium', description: 'File execution (safer than exec)' },
  { type: 'process', api: 'child_process.fork', pattern: /\b(?:child_process\.)?fork\s*\(/g, risk: 'medium', description: 'Node.js process forking' },
  { type: 'process', api: 'process.exit', pattern: /\bprocess\.exit\s*\(/g, risk: 'low', description: 'Process termination' },
  { type: 'process', api: 'process.kill', pattern: /\bprocess\.kill\s*\(/g, risk: 'high', description: 'Process signal/kill', recommendation: 'Validate PID before sending signals' },
  { type: 'process', api: 'eval', pattern: /\beval\s*\(/g, risk: 'high', description: 'Dynamic code evaluation - security risk', recommendation: "Avoid eval() - use safer alternatives like JSON.parse()" },
  { type: 'process', api: 'Function constructor', pattern: /\bnew\s+Function\s*\(/g, risk: 'high', description: 'Dynamic function creation - similar to eval', recommendation: 'Avoid dynamic function creation for security' },
  { type: 'process', api: 'vm.runInContext', pattern: /\bvm\.runInContext\s*\(/g, risk: 'high', description: 'Code execution in VM context', recommendation: 'VM is not a security sandbox - use with caution' },
  { type: 'process', api: 'vm.runInNewContext', pattern: /\bvm\.runInNewContext\s*\(/g, risk: 'high', description: 'Code execution in new VM context', recommendation: 'VM is not a security sandbox - use with caution' },

  // Crypto - Generally Low Risk
  { type: 'crypto', api: 'crypto.randomBytes', pattern: /\bcrypto\.randomBytes\s*\(/g, risk: 'low', description: 'Cryptographically secure random bytes' },
  { type: 'crypto', api: 'crypto.createHash', pattern: /\bcrypto\.createHash\s*\(/g, risk: 'low', description: 'Hash creation' },
  { type: 'crypto', api: 'crypto.createCipheriv', pattern: /\bcrypto\.createCipheriv\s*\(/g, risk: 'low', description: 'Symmetric encryption' },
  { type: 'crypto', api: 'crypto.createDecipheriv', pattern: /\bcrypto\.createDecipheriv\s*\(/g, risk: 'low', description: 'Symmetric decryption' },
  { type: 'crypto', api: 'crypto.createSign', pattern: /\bcrypto\.createSign\s*\(/g, risk: 'low', description: 'Digital signature creation' },
  { type: 'crypto', api: 'crypto.createVerify', pattern: /\bcrypto\.createVerify\s*\(/g, risk: 'low', description: 'Digital signature verification' },
  { type: 'crypto', api: 'crypto.createHmac', pattern: /\bcrypto\.createHmac\s*\(/g, risk: 'low', description: 'HMAC creation' },
  { type: 'crypto', api: 'crypto.pbkdf2', pattern: /\bcrypto\.pbkdf2(?:Sync)?\s*\(/g, risk: 'low', description: 'Password-based key derivation' },
  { type: 'crypto', api: 'crypto.scrypt', pattern: /\bcrypto\.scrypt(?:Sync)?\s*\(/g, risk: 'low', description: 'Scrypt key derivation' },
];

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Recursively find all source code files in a directory.
 */
async function findSourceFiles(dir: string, files: string[] = []): Promise<string[]> {
  try {
    const entries = await node_fsPromises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = node_path.join(dir, entry.name);

      if (shouldSkip(fullPath)) continue;

      if (entry.isDirectory()) {
        await findSourceFiles(fullPath, files);
      } else if (entry.isFile() && isSourceFile(fullPath)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory may not be accessible
  }

  return files;
}

/**
 * Scan a single source file for permission patterns.
 */
async function scanFile(filePath: string, projectRoot: string): Promise<PermissionFinding[]> {
  const findings: PermissionFinding[] = [];

  try {
    const content = await node_fsPromises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const relativePath = node_path.relative(projectRoot, filePath);

    for (const pattern of PERMISSION_PATTERNS) {
      pattern.pattern.lastIndex = 0;

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        const trimmedLine = line.trim();

        // Skip comments
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/*')) {
          continue;
        }

        pattern.pattern.lastIndex = 0;

        if (pattern.pattern.test(line)) {
          findings.push({
            type: pattern.type,
            api: pattern.api,
            file: relativePath,
            line: lineNum + 1,
            risk_level: pattern.risk,
            description: pattern.description,
          });
        }
      }
    }
  } catch {
    // File may be binary or inaccessible
  }

  return findings;
}

// =============================================================================
// Public Handler
// =============================================================================

/**
 * Analyze source code for file, network, and system access patterns.
 *
 * Scans TypeScript/JavaScript files and categorizes findings by permission
 * type and risk level. Generates a risk assessment and recommendations.
 *
 * @param args - The check_permissions tool arguments
 * @returns MCP response with permissions analysis
 *
 * @example
 * await checkPermissions({ path: 'src' })
 * // Returns findings sorted by risk, with overall assessment
 */
export async function checkPermissions(args: CheckPermissionsArgs): Promise<McpResponse> {
  const projectRoot = getProjectRoot();
  let filesToScan: string[] = [];
  const scanPath = node_path.resolve(projectRoot, args.path || '.');

  if (args.file) {
    const filePath = node_path.resolve(projectRoot, args.file);
    if (!await fileExists(filePath)) {
      return fail(`File not found: ${args.file}`);
    }
    filesToScan = [filePath];
  } else {
    if (!await fileExists(scanPath)) {
      return fail(`Path not found: ${args.path || '.'}`);
    }

    const stats = await node_fsPromises.stat(scanPath);
    if (stats.isFile()) {
      filesToScan = [scanPath];
    } else {
      filesToScan = await findSourceFiles(scanPath);
    }
  }

  if (filesToScan.length === 0) {
    return ok({
      permissions: [],
      summary: { filesystem: 0, network: 0, process: 0, crypto: 0 },
      risk_assessment: 'low',
      recommendations: [],
      files_scanned: 0,
    });
  }

  const allFindings: PermissionFinding[] = [];
  for (const file of filesToScan) {
    const findings = await scanFile(file, projectRoot);
    allFindings.push(...findings);
  }

  // Sort: high risk first, then by file
  allFindings.sort((a, b) => {
    const riskOrder: Record<RiskLevel, number> = { high: 2, medium: 1, low: 0 };
    const riskDiff = riskOrder[b.risk_level] - riskOrder[a.risk_level];
    if (riskDiff !== 0) return riskDiff;
    return a.file.localeCompare(b.file);
  });

  const summary = {
    filesystem: allFindings.filter(f => f.type === 'filesystem').length,
    network: allFindings.filter(f => f.type === 'network').length,
    process: allFindings.filter(f => f.type === 'process').length,
    crypto: allFindings.filter(f => f.type === 'crypto').length,
  };

  const riskAssessment = calculateRiskAssessment(allFindings);
  const recommendations = generateRecommendations(allFindings, PERMISSION_PATTERNS);

  return ok({
    permissions: allFindings,
    summary,
    risk_assessment: riskAssessment,
    recommendations,
    files_scanned: filesToScan.length,
  });
}
