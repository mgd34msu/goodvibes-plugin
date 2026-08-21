/**
 * `db_schema` usage mode, Prisma call-chain mapping.
 *
 * Ported from v1 project-engine `core/database/prisma-utils.ts`
 * (`extensions/database/prisma.ts`'s N+1 detector), REWIRED onto the shared
 * intel compiler host per §3.3/§4.4.3 ("usage mode rides the shared host"):
 * file discovery uses `findSourceFiles` instead of the v1 bespoke walker, and
 * the AST comes from ONE shared `Program` (`getServiceForFiles`) instead of a
 * throwaway `ts.createSourceFile` per file. `query-analysis.ts`'s raw-SQL
 * read/write classifiers do NOT port here, they analyze SQL query text, not
 * TypeScript call chains, and belong to connect's `db_query` trust model
 * (§4.3), not this static analyzer.
 *
 * Recommendation generation (`generatePrismaRecommendations`) and the
 * standalone N+1-only tool shape do not port either: the tribunal's merged
 * `db_schema` usage shape (§4.4.3) is `call_sites` (with a per-site `in_loop`
 * flag) + `frequency`, not a prose recommendation list.
 *
 * @module lib/db/prisma-usage
 */

import * as fs from 'node:fs/promises';
import ts from 'typescript';

import { getCompilerHost, toTsPath, makeRelativePath, toLineColumn, findSourceFiles } from '../../host/index.js';
import { PRISMA_OPERATIONS, LOOP_KEYWORDS } from './constants.js';
import type { UsageCallSite, UsageFrequency } from './types.js';

/** Extensions worth AST-parsing for Prisma call sites. */
const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

const PRISMA_FILE_PATTERNS = [/@prisma\/client/, /from\s+['"].*prisma['"]/, /require\s*\(\s*['"].*prisma['"]\s*\)/, /PrismaClient/, /prisma\./];

/** Cheap pre-filter: does this file even look like it touches Prisma? */
function fileUsesPrisma(content: string): boolean {
  return PRISMA_FILE_PATTERNS.some((p) => p.test(content));
}

/** True when a call's arguments include `include:`/`select: { ... }` (loads relations). */
function hasRelationInclusion(node: ts.CallExpression, sourceFile: ts.SourceFile): boolean {
  for (const arg of node.arguments) {
    const text = arg.getText(sourceFile);
    if (text.includes('include:') || text.includes('include :')) {return true;}
    if (text.includes('select:') && text.includes(': {')) {return true;}
  }
  return false;
}

/** Recognize `prisma.model.operation()` / `this.db.model.operation()` call chains. */
function extractModelFromPrismaCall(node: ts.CallExpression, sourceFile: ts.SourceFile): { model: string; operation: string } | null {
  const expr = node.expression;
  if (!ts.isPropertyAccessExpression(expr)) {return null;}

  const operation = expr.name.getText(sourceFile);
  if (!PRISMA_OPERATIONS.includes(operation)) {return null;}

  const modelAccess = expr.expression;
  if (!ts.isPropertyAccessExpression(modelAccess)) {return null;}

  const model = modelAccess.name.getText(sourceFile);
  const clientExpr = modelAccess.expression;
  const clientText = clientExpr.getText(sourceFile);

  const validClients = ['prisma', 'db', 'client', 'this.prisma', 'this.db', 'ctx.prisma', 'ctx.db'];
  const isValidClient = validClients.some((c) => clientText === c || clientText.endsWith('.' + c.split('.').pop()));
  if (!isValidClient) {return null;}

  return { model, operation };
}

/** True when `node` sits inside a for/while loop OR an iteration-callback (forEach/map/...). */
function isInsideLoop(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (ts.isForStatement(current) || ts.isForInStatement(current) || ts.isForOfStatement(current)) {return true;}
    if (ts.isWhileStatement(current) || ts.isDoStatement(current)) {return true;}

    if (ts.isCallExpression(current)) {
      const callExpr = current.expression;
      if (ts.isPropertyAccessExpression(callExpr)) {
        const methodName = callExpr.name.getText(sourceFile);
        if (LOOP_KEYWORDS.includes(methodName)) {return true;}
      }
    }

    current = current.parent;
  }

  return false;
}

/**
 * Scan a project for Prisma call sites: model + operation, file/line, whether
 * the call sits inside a loop (N+1 risk), and per-model call frequency.
 *
 * @param baseDir - absolute project directory to scan
 * @param signal - optional cooperative budget signal; scanning stops early when aborted
 */
export async function scanPrismaUsage(
  baseDir: string,
  signal?: { aborted: boolean },
): Promise<{ call_sites: UsageCallSite[]; frequency: UsageFrequency[] }> {
  const allFiles = (await findSourceFiles(baseDir)).filter((f) => SCAN_EXT.test(f) && !f.endsWith('.d.ts'));

  const candidateFiles: string[] = [];
  for (const file of allFiles) {
    if (signal?.aborted) {break;}
    const content = await fs.readFile(file, 'utf-8').catch(() => null);
    if (content !== null && fileUsesPrisma(content)) {candidateFiles.push(file);}
  }

  if (candidateFiles.length === 0 || signal?.aborted) {
    return { call_sites: [], frequency: [] };
  }

  const host = getCompilerHost();
  const { program } = host.getServiceForFiles(candidateFiles.map(toTsPath));

  const callSites: UsageCallSite[] = [];
  const modelCounts = new Map<string, number>();

  for (const file of candidateFiles) {
    if (signal?.aborted) {break;}
    const sourceFile = program.getSourceFile(toTsPath(file));
    if (!sourceFile) {continue;}

    const relativePath = makeRelativePath(file, baseDir);

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const prismaCall = extractModelFromPrismaCall(node, sourceFile);
        if (prismaCall) {
          const { line } = toLineColumn(sourceFile, node.getStart(sourceFile));
          callSites.push({
            model: prismaCall.model,
            operation: prismaCall.operation,
            file: relativePath,
            resolved_path: file,
            line,
            in_loop: isInsideLoop(node, sourceFile),
            includes_relation: hasRelationInclusion(node, sourceFile),
          });
          modelCounts.set(prismaCall.model, (modelCounts.get(prismaCall.model) ?? 0) + 1);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  callSites.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const frequency: UsageFrequency[] = Array.from(modelCounts.entries())
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model));

  return { call_sites: callSites, frequency };
}
