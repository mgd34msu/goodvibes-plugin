/**
 * getApiRoutes extension for the api domain.
 *
 * Orchestrates framework detection and route parsing to produce
 * a complete list of API routes for the detected or specified framework.
 *
 * @module extensions/api/routes
 */

import * as path from 'node:path';

import { PROJECT_ROOT } from '../../shared/config.js';
import { createSuccessResponse, createErrorResponse } from '../../shared/response.js';
import type { ToolResponse } from '../../shared/response.js';

import type { ApiRoutesArgs, ApiRoutesResult, ApiRoute, Framework } from '../../core/api/types.js';
import { detectFramework } from '../../core/api/detection.js';
import { parseNextJsRoutes } from '../../core/api/parsers/nextjs.js';
import { parseExpressRoutes } from '../../core/api/parsers/express.js';
import { parseFastifyRoutes } from '../../core/api/parsers/fastify.js';
import { parseHonoRoutes } from '../../core/api/parsers/hono.js';

/**
 * Scans the project for API route definitions based on the detected or specified framework.
 *
 * Supports Next.js (App Router and Pages Router), Express, Fastify, and Hono.
 * When `framework` is 'auto', detects the framework from package.json.
 *
 * @param args - Tool arguments containing optional path and framework
 * @returns MCP tool response with JSON containing framework, routes array, and count
 *
 * @example
 * ```typescript
 * const result = await getApiRoutes({ framework: 'nextjs' });
 * // Returns all Next.js API routes with methods, paths, and handler locations
 * ```
 */
export function getApiRoutes(args: ApiRoutesArgs): ToolResponse {
  const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');
  const frameworkArg = args.framework || 'auto';

  let detectedFramework: Framework | null = null;
  let routes: ApiRoute[] = [];

  if (frameworkArg === 'auto') {
    detectedFramework = detectFramework(projectPath);
    if (!detectedFramework) {
      return createErrorResponse(
        'Could not auto-detect framework. Please specify framework parameter.',
        { hint: 'Supported frameworks: nextjs, express, fastify, hono' }
      );
    }
  } else {
    detectedFramework = frameworkArg as Framework;
  }

  switch (detectedFramework) {
    case 'nextjs':
      routes = parseNextJsRoutes(projectPath);
      break;
    case 'express':
      routes = parseExpressRoutes(projectPath);
      break;
    case 'fastify':
      routes = parseFastifyRoutes(projectPath);
      break;
    case 'hono':
      routes = parseHonoRoutes(projectPath);
      break;
  }

  const result: ApiRoutesResult = {
    framework: detectedFramework,
    routes,
    count: routes.length,
  };

  return createSuccessResponse(result);
}
