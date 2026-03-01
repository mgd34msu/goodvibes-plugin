/**
 * Risk assessment and recommendation generation
 *
 * Calculates overall risk level from permission findings and
 * generates human-readable remediation recommendations.
 *
 * @module core/security/risk
 */

import type { PermissionFinding, RiskLevel } from './types.js';

/**
 * Minimal permission pattern interface used by the risk calculator.
 *
 * This is an intentionally narrowed subset of the full PermissionPattern interface
 * defined in extensions/security/permissions.ts. It lives here (core layer) to keep
 * the risk module decoupled from the extension layer — the core must not import
 * from extensions. Only the fields actually used by generateRecommendations are included.
 *
 * @internal
 */
interface PermissionPatternRef {
  api: string;
  recommendation?: string;
}

/**
 * Calculates the overall risk assessment from a set of permission findings.
 *
 * Risk escalation rules:
 * - 3+ high-risk findings → overall high
 * - 1+ high-risk OR 5+ medium-risk findings → overall medium
 * - Otherwise → low
 *
 * @param findings - Array of permission findings
 * @returns Overall risk level for the scanned code
 *
 * @example
 * calculateRiskAssessment(findings) // 'high' | 'medium' | 'low'
 */
export function calculateRiskAssessment(findings: PermissionFinding[]): RiskLevel {
  const highRiskCount = findings.filter(f => f.risk_level === 'high').length;
  const mediumRiskCount = findings.filter(f => f.risk_level === 'medium').length;

  if (highRiskCount >= 3) return 'high';
  if (highRiskCount >= 1 || mediumRiskCount >= 5) return 'medium';
  return 'low';
}

/**
 * Generates remediation recommendations from permission findings.
 *
 * Produces up to 10 recommendations prioritizing high-risk findings,
 * then adding general recommendations for common patterns.
 *
 * @param findings - Array of permission findings
 * @param patterns - Permission pattern definitions with recommendations
 * @returns Array of recommendation strings (max 10)
 *
 * @example
 * generateRecommendations(findings, PERMISSION_PATTERNS)
 * // Returns ['eval() in src/handler.ts:42 - Avoid eval()...', ...]
 */
export function generateRecommendations(
  findings: PermissionFinding[],
  patterns: PermissionPatternRef[]
): string[] {
  const recommendations: string[] = [];
  const seenApis = new Set<string>();

  // Recommendations for unique high-risk APIs
  for (const finding of findings) {
    if (finding.risk_level === 'high' && !seenApis.has(finding.api)) {
      seenApis.add(finding.api);
      const pattern = patterns.find(p => p.api === finding.api);
      if (pattern?.recommendation) {
        recommendations.push(
          `${finding.api} in ${finding.file}:${finding.line} - ${pattern.recommendation}`
        );
      }
    }
  }

  // General recommendation for exec usage
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

  // General recommendation for eval
  const evalCount = findings.filter(f => f.api === 'eval' || f.api === 'Function constructor').length;
  if (evalCount > 0) {
    recommendations.push(
      'Avoid eval() and new Function() - they pose significant security risks'
    );
  }

  return recommendations.slice(0, 10);
}
