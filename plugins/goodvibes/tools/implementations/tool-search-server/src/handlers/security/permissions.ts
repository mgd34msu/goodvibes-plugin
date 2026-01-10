/**
 * Permissions Checker Handler
 *
 * Analyzes code for file, network, and system access patterns.
 * Scans for potentially sensitive API usage and categorizes by risk level.
 *
 * @module handlers/security/permissions
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { ToolResponse } from '../../types.js';
import { PROJECT_ROOT } from '../../config.js';
import { fileExists } from '../../utils.js';

/**
 * Permission types
 */
export type PermissionType = 'filesystem' | 'network' | 'process' | 'crypto';

/**
 * Risk levels
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Arguments for the check_permissions MCP tool
 */
export interface CheckPermissionsArgs {
  /** Specific file to analyze */
  file?: string;
  /** Directory to scan */
  path?: string;
}

/**
 * A single permission finding
 */
interface PermissionFinding {
  type: PermissionType;
  api: string;
  file: string;
  line: number;
  risk_level: RiskLevel;
  description: string;
}

/**
 * Permission summary counts
 */
interface PermissionSummary {
  filesystem: number;
  network: number;
  process: number;
  crypto: number;
}

/**
 * Complete permissions analysis result
 */
interface PermissionsAnalysis {
  permissions: PermissionFinding[];
  summary: PermissionSummary;
  risk_assessment: RiskLevel;
  recommendations: string[];
  files_scanned?: number;
}

/**
 * Pattern definition for permission detection
 */
interface PermissionPattern {
  type: PermissionType;
  api: string;
  pattern: RegExp;
  risk: RiskLevel;
  description: string;
  recommendation?: string;
}

/**
 * Permission patterns to detect
 */
const PERMISSION_PATTERNS: PermissionPattern[] = [
  // Filesystem - High Risk
  {
    type: 'filesystem',
    api: 'fs.writeFileSync',
    pattern: /\bfs\.writeFileSync\s*\(/g,
    risk: 'medium',
    description: 'Synchronous file write operation',
    recommendation: 'Consider async fs.promises.writeFile for non-blocking I/O',
  },
  {
    type: 'filesystem',
    api: 'fs.promises.writeFile',
    pattern: /\bfs(?:Promises)?\.promises\.writeFile\s*\(/g,
    risk: 'low',
    description: 'Async file write operation',
  },
  {
    type: 'filesystem',
    api: 'fs.writeFile',
    pattern: /\bfs\.writeFile\s*\(/g,
    risk: 'low',
    description: 'Async file write with callback',
  },
  {
    type: 'filesystem',
    api: 'fs.readFileSync',
    pattern: /\bfs\.readFileSync\s*\(/g,
    risk: 'low',
    description: 'Synchronous file read operation',
  },
  {
    type: 'filesystem',
    api: 'fs.promises.readFile',
    pattern: /\bfs(?:Promises)?\.promises\.readFile\s*\(/g,
    risk: 'low',
    description: 'Async file read operation',
  },
  {
    type: 'filesystem',
    api: 'fs.readFile',
    pattern: /\bfs\.readFile\s*\(/g,
    risk: 'low',
    description: 'Async file read with callback',
  },
  {
    type: 'filesystem',
    api: 'fs.unlinkSync',
    pattern: /\bfs\.unlinkSync\s*\(/g,
    risk: 'medium',
    description: 'Synchronous file deletion',
    recommendation: 'Validate paths carefully before deletion',
  },
  {
    type: 'filesystem',
    api: 'fs.promises.unlink',
    pattern: /\bfs(?:Promises)?\.promises\.unlink\s*\(/g,
    risk: 'medium',
    description: 'Async file deletion',
    recommendation: 'Validate paths carefully before deletion',
  },
  {
    type: 'filesystem',
    api: 'fs.rmSync',
    pattern: /\bfs\.rmSync\s*\(/g,
    risk: 'high',
    description: 'Synchronous recursive directory removal',
    recommendation: 'Use with extreme caution - can delete entire directories',
  },
  {
    type: 'filesystem',
    api: 'fs.promises.rm',
    pattern: /\bfs(?:Promises)?\.promises\.rm\s*\(/g,
    risk: 'high',
    description: 'Async recursive directory removal',
    recommendation: 'Use with extreme caution - can delete entire directories',
  },
  {
    type: 'filesystem',
    api: 'fs.chmodSync',
    pattern: /\bfs\.chmodSync\s*\(/g,
    risk: 'medium',
    description: 'File permission modification',
  },
  {
    type: 'filesystem',
    api: 'fs.readdirSync',
    pattern: /\bfs\.readdirSync\s*\(/g,
    risk: 'low',
    description: 'Synchronous directory listing',
  },

  // Network - Various Risk Levels
  {
    type: 'network',
    api: 'fetch',
    pattern: /\bfetch\s*\(/g,
    risk: 'low',
    description: 'HTTP fetch request',
  },
  {
    type: 'network',
    api: 'axios',
    pattern: /\baxios\s*\.\s*(get|post|put|patch|delete|request)\s*\(/g,
    risk: 'low',
    description: 'Axios HTTP request',
  },
  {
    type: 'network',
    api: 'http.createServer',
    pattern: /\bhttp\.createServer\s*\(/g,
    risk: 'low',
    description: 'HTTP server creation',
  },
  {
    type: 'network',
    api: 'https.createServer',
    pattern: /\bhttps\.createServer\s*\(/g,
    risk: 'low',
    description: 'HTTPS server creation',
  },
  {
    type: 'network',
    api: 'http.request',
    pattern: /\bhttp\.request\s*\(/g,
    risk: 'low',
    description: 'HTTP request',
  },
  {
    type: 'network',
    api: 'https.request',
    pattern: /\bhttps\.request\s*\(/g,
    risk: 'low',
    description: 'HTTPS request',
  },
  {
    type: 'network',
    api: 'net.createConnection',
    pattern: /\bnet\.createConnection\s*\(/g,
    risk: 'medium',
    description: 'Raw TCP socket connection',
    recommendation: 'Ensure proper connection validation and error handling',
  },
  {
    type: 'network',
    api: 'net.createServer',
    pattern: /\bnet\.createServer\s*\(/g,
    risk: 'medium',
    description: 'TCP server creation',
    recommendation: 'Implement proper authentication and rate limiting',
  },
  {
    type: 'network',
    api: 'dgram.createSocket',
    pattern: /\bdgram\.createSocket\s*\(/g,
    risk: 'medium',
    description: 'UDP socket creation',
  },
  {
    type: 'network',
    api: 'WebSocket',
    pattern: /\bnew\s+WebSocket\s*\(/g,
    risk: 'low',
    description: 'WebSocket connection',
  },
  {
    type: 'network',
    api: 'dns.lookup',
    pattern: /\bdns\.lookup\s*\(/g,
    risk: 'low',
    description: 'DNS lookup operation',
  },

  // Process - High Risk
  {
    type: 'process',
    api: 'child_process.exec',
    pattern: /\b(?:child_process\.)?exec\s*\(/g,
    risk: 'high',
    description: 'Command execution - potential injection risk',
    recommendation: 'Use execFile instead of exec to prevent shell injection',
  },
  {
    type: 'process',
    api: 'child_process.execSync',
    pattern: /\b(?:child_process\.)?execSync\s*\(/g,
    risk: 'high',
    description: 'Synchronous command execution - potential injection risk',
    recommendation: 'Use execFileSync instead and validate all inputs',
  },
  {
    type: 'process',
    api: 'child_process.spawn',
    pattern: /\b(?:child_process\.)?spawn\s*\(/g,
    risk: 'medium',
    description: 'Process spawning',
    recommendation: 'Validate command arguments carefully',
  },
  {
    type: 'process',
    api: 'child_process.spawnSync',
    pattern: /\b(?:child_process\.)?spawnSync\s*\(/g,
    risk: 'medium',
    description: 'Synchronous process spawning',
  },
  {
    type: 'process',
    api: 'child_process.execFile',
    pattern: /\b(?:child_process\.)?execFile\s*\(/g,
    risk: 'medium',
    description: 'File execution (safer than exec)',
  },
  {
    type: 'process',
    api: 'child_process.fork',
    pattern: /\b(?:child_process\.)?fork\s*\(/g,
    risk: 'medium',
    description: 'Node.js process forking',
  },
  {
    type: 'process',
    api: 'process.exit',
    pattern: /\bprocess\.exit\s*\(/g,
    risk: 'low',
    description: 'Process termination',
  },
  {
    type: 'process',
    api: 'process.kill',
    pattern: /\bprocess\.kill\s*\(/g,
    risk: 'high',
    description: 'Process signal/kill',
    recommendation: 'Validate PID before sending signals',
  },
  {
    type: 'process',
    api: 'eval',
    pattern: /\beval\s*\(/g,
    risk: 'high',
    description: 'Dynamic code evaluation - security risk',
    recommendation: 'Avoid eval() - use safer alternatives like JSON.parse()',
  },
  {
    type: 'process',
    api: 'Function constructor',
    pattern: /\bnew\s+Function\s*\(/g,
    risk: 'high',
    description: 'Dynamic function creation - similar to eval',
    recommendation: 'Avoid dynamic function creation for security',
  },
  {
    type: 'process',
    api: 'vm.runInContext',
    pattern: /\bvm\.runInContext\s*\(/g,
    risk: 'high',
    description: 'Code execution in VM context',
    recommendation: 'VM is not a security sandbox - use with caution',
  },
  {
    type: 'process',
    api: 'vm.runInNewContext',
    pattern: /\bvm\.runInNewContext\s*\(/g,
    risk: 'high',
    description: 'Code execution in new VM context',
    recommendation: 'VM is not a security sandbox - use with caution',
  },

  // Crypto - Generally Low Risk
  {
    type: 'crypto',
    api: 'crypto.randomBytes',
    pattern: /\bcrypto\.randomBytes\s*\(/g,
    risk: 'low',
    description: 'Cryptographically secure random bytes',
  },
  {
    type: 'crypto',
    api: 'crypto.createHash',
    pattern: /\bcrypto\.createHash\s*\(/g,
    risk: 'low',
    description: 'Hash creation',
  },
  {
    type: 'crypto',
    api: 'crypto.createCipheriv',
    pattern: /\bcrypto\.createCipheriv\s*\(/g,
    risk: 'low',
    description: 'Symmetric encryption',
  },
  {
    type: 'crypto',
    api: 'crypto.createDecipheriv',
    pattern: /\bcrypto\.createDecipheriv\s*\(/g,
    risk: 'low',
    description: 'Symmetric decryption',
  },
  {
    type: 'crypto',
    api: 'crypto.createSign',
    pattern: /\bcrypto\.createSign\s*\(/g,
    risk: 'low',
    description: 'Digital signature creation',
  },
  {
    type: 'crypto',
    api: 'crypto.createVerify',
    pattern: /\bcrypto\.createVerify\s*\(/g,
    risk: 'low',
    description: 'Digital signature verification',
  },
  {
    type: 'crypto',
    api: 'crypto.createHmac',
    pattern: /\bcrypto\.createHmac\s*\(/g,
    risk: 'low',
    description: 'HMAC creation',
  },
  {
    type: 'crypto',
    api: 'crypto.pbkdf2',
    pattern: /\bcrypto\.pbkdf2(?:Sync)?\s*\(/g,
    risk: 'low',
    description: 'Password-based key derivation',
  },
  {
    type: 'crypto',
    api: 'crypto.scrypt',
    pattern: /\bcrypto\.scrypt(?:Sync)?\s*\(/g,
    risk: 'low',
    description: 'Scrypt key derivation',
  },
];

/**
 * Skip patterns for files/directories
 */
const SKIP_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '*.min.js',
  '*.map',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

/**
 * File extensions to scan
 */
const SCANNABLE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
];

/**
 * Check if path should be skipped
 */
function shouldSkip(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return SKIP_PATTERNS.some(pattern => {
    if (pattern.startsWith('*.')) {
      return normalizedPath.endsWith(pattern.substring(1));
    }
    return normalizedPath.includes(`/${pattern}/`) || normalizedPath.endsWith(`/${pattern}`);
  });
}

/**
 * Check if file is scannable
 */
function isScannable(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SCANNABLE_EXTENSIONS.includes(ext);
}

/**
 * Recursively find all source files
 */
async function findSourceFiles(dir: string, files: string[] = []): Promise<string[]> {
  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (shouldSkip(fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await findSourceFiles(fullPath, files);
      } else if (entry.isFile() && isScannable(fullPath)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory may not exist or be inaccessible
  }

  return files;
}

/**
 * Scan a single file for permission patterns
 */
async function scanFile(
  filePath: string,
  projectRoot: string
): Promise<PermissionFinding[]> {
  const findings: PermissionFinding[] = [];

  try {
    const content = await fsPromises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const relativePath = path.relative(projectRoot, filePath);

    for (const pattern of PERMISSION_PATTERNS) {
      // Reset regex for each file
      pattern.pattern.lastIndex = 0;

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];

        // Skip comments
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*') || trimmedLine.startsWith('/*')) {
          continue;
        }

        // Reset regex for each line
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

/**
 * Calculate overall risk assessment
 */
function calculateRiskAssessment(findings: PermissionFinding[]): RiskLevel {
  const highRiskCount = findings.filter(f => f.risk_level === 'high').length;
  const mediumRiskCount = findings.filter(f => f.risk_level === 'medium').length;

  if (highRiskCount >= 3) return 'high';
  if (highRiskCount >= 1 || mediumRiskCount >= 5) return 'medium';
  return 'low';
}

/**
 * Generate recommendations based on findings
 */
function generateRecommendations(findings: PermissionFinding[]): string[] {
  const recommendations: string[] = [];
  const seenApis = new Set<string>();

  // Get unique high-risk patterns
  for (const finding of findings) {
    if (finding.risk_level === 'high' && !seenApis.has(finding.api)) {
      seenApis.add(finding.api);
      const pattern = PERMISSION_PATTERNS.find(p => p.api === finding.api);
      if (pattern?.recommendation) {
        recommendations.push(
          `${finding.api} in ${finding.file}:${finding.line} - ${pattern.recommendation}`
        );
      }
    }
  }

  // Add general recommendations
  const processCount = findings.filter(f => f.type === 'process').length;
  if (processCount > 0) {
    const execCount = findings.filter(f =>
      f.api.includes('exec') && !f.api.includes('execFile')
    ).length;
    if (execCount > 0) {
      recommendations.push(
        'Consider using execFile/execFileSync instead of exec/execSync to prevent shell injection'
      );
    }
  }

  const evalCount = findings.filter(f => f.api === 'eval' || f.api === 'Function constructor').length;
  if (evalCount > 0) {
    recommendations.push(
      'Avoid eval() and new Function() - they pose significant security risks'
    );
  }

  return recommendations.slice(0, 10);
}

/**
 * Handles the check_permissions MCP tool call.
 *
 * Scans source files for file, network, and system access patterns.
 * Categorizes findings by type and risk level.
 *
 * @param args - The check_permissions tool arguments
 * @returns MCP tool response with permissions analysis
 */
export async function handleCheckPermissions(
  args: CheckPermissionsArgs
): Promise<ToolResponse> {
  let filesToScan: string[] = [];
  const scanPath = path.resolve(PROJECT_ROOT, args.path || '.');

  // Check if specific file or directory
  if (args.file) {
    const filePath = path.resolve(PROJECT_ROOT, args.file);
    if (!await fileExists(filePath)) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: `File not found: ${args.file}`,
          }, null, 2),
        }],
        isError: true,
      };
    }
    filesToScan = [filePath];
  } else {
    // Scan directory
    if (!await fileExists(scanPath)) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: `Path not found: ${args.path || '.'}`,
          }, null, 2),
        }],
        isError: true,
      };
    }

    const stats = await fsPromises.stat(scanPath);
    if (stats.isFile()) {
      filesToScan = [scanPath];
    } else {
      filesToScan = await findSourceFiles(scanPath);
    }
  }

  if (filesToScan.length === 0) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          permissions: [],
          summary: { filesystem: 0, network: 0, process: 0, crypto: 0 },
          risk_assessment: 'low',
          recommendations: [],
          files_scanned: 0,
        }, null, 2),
      }],
    };
  }

  // Scan all files
  const allFindings: PermissionFinding[] = [];

  for (const file of filesToScan) {
    const findings = await scanFile(file, PROJECT_ROOT);
    allFindings.push(...findings);
  }

  // Sort by risk level (high first), then by file
  allFindings.sort((a, b) => {
    const riskOrder: Record<RiskLevel, number> = { high: 2, medium: 1, low: 0 };
    const riskDiff = riskOrder[b.risk_level] - riskOrder[a.risk_level];
    if (riskDiff !== 0) return riskDiff;
    return a.file.localeCompare(b.file);
  });

  // Calculate summary
  const summary: PermissionSummary = {
    filesystem: allFindings.filter(f => f.type === 'filesystem').length,
    network: allFindings.filter(f => f.type === 'network').length,
    process: allFindings.filter(f => f.type === 'process').length,
    crypto: allFindings.filter(f => f.type === 'crypto').length,
  };

  // Calculate overall risk
  const riskAssessment = calculateRiskAssessment(allFindings);

  // Generate recommendations
  const recommendations = generateRecommendations(allFindings);

  const result: PermissionsAnalysis = {
    permissions: allFindings,
    summary,
    risk_assessment: riskAssessment,
    recommendations,
    files_scanned: filesToScan.length,
  };

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(result, null, 2),
    }],
  };
}
