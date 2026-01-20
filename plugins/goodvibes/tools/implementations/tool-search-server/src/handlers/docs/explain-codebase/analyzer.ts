/**
 * Analyzer Module for Explain Codebase
 *
 * Contains the core analysis logic including LLM integration, caching,
 * and codebase information gathering.
 *
 * @module handlers/docs/explain-codebase/analyzer
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

import { readJsonFile, fileExists } from '../../../utils.js';
import { handleDetectStack } from '../../context.js';
import { handleGetApiRoutes } from '../../schema/index.js';
import { handleGetConventions, type GetConventionsArgs } from '../../project/conventions.js';

import type {
  CodebaseInfo,
  CachedExplanation,
  ExplainCodebaseResult,
  PackageJsonData,
  StackData,
  ApiRoutesData,
  ConventionsData,
} from './types.js';

import {
  getDirectoryStructure,
  findKeyFiles,
  findEntryPoints,
  generateProjectHash,
  MAX_STRUCTURE_DEPTH,
} from './parser.js';

// Constants
const CACHE_DIR = '.goodvibes/cache';
const CACHE_FILE = 'codebase-explanation.json';
const CACHE_VERSION = 1;

/** Get cached explanation if valid */
export async function getCachedExplanation(projectPath: string): Promise<CachedExplanation | null> {
  const cachePath = path.join(projectPath, CACHE_DIR, CACHE_FILE);

  try {
    if (!(await fileExists(cachePath))) {
      return null;
    }

    const content = await fsPromises.readFile(cachePath, 'utf-8');
    const cached = JSON.parse(content) as CachedExplanation;

    // Check cache version
    if (cached.cache_version !== CACHE_VERSION) {
      return null;
    }

    // Check if project has changed
    const currentHash = await generateProjectHash(projectPath);
    if (cached.project_hash !== currentHash) {
      return null;
    }

    return cached;
  } catch {
    return null;
  }
}

/**
 * Save explanation to cache
 */
export async function cacheExplanation(
  projectPath: string,
  result: ExplainCodebaseResult,
): Promise<void> {
  const cacheDir = path.join(projectPath, CACHE_DIR);
  const cachePath = path.join(cacheDir, CACHE_FILE);

  try {
    await fsPromises.mkdir(cacheDir, { recursive: true });

    const cached: CachedExplanation = {
      ...result,
      cache_version: CACHE_VERSION,
      project_hash: await generateProjectHash(projectPath),
    };

    await fsPromises.writeFile(cachePath, JSON.stringify(cached, null, 2));
  } catch {
    // Cache write failed, non-critical
  }
}

// =============================================================================
// LLM Integration
// =============================================================================

/**
 * Spawn Claude CLI and get JSON response
 */
export async function spawnClaude(prompt: string, timeout: number = 90000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const args = ['--print', '-p', prompt];
    const child = spawn('claude', args, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        return;
      }

      // Try to extract JSON from the response
      try {
        // Look for JSON block in the output
        const jsonMatch = stdout.match(/```json\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
          resolve(JSON.parse(jsonMatch[1]));
          return;
        }

        // Try parsing the whole output as JSON
        const trimmed = stdout.trim();
        const startIdx = trimmed.indexOf('{');
        const endIdx = trimmed.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          resolve(JSON.parse(trimmed.substring(startIdx, endIdx + 1)));
          return;
        }

        reject(new Error('No valid JSON found in Claude response'));
      } catch (parseError) {
        reject(new Error(`Failed to parse Claude response: ${parseError}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });

    // Timeout
    const timeoutId = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude CLI timed out after ${timeout / 1000} seconds`));
    }, timeout);

    child.on('close', () => clearTimeout(timeoutId));
  });
}

// =============================================================================
// Prompt Building
// =============================================================================

/**
 * Build the LLM analysis prompt
 */
export function buildAnalysisPrompt(
  info: CodebaseInfo,
  focus: string[],
  depth: string,
): string {
  const focusText = focus.length > 0
    ? `Focus especially on: ${focus.join(', ')}`
    : 'Provide a general overview';

  const depthInstructions: Record<string, string> = {
    shallow: 'Be concise. 1-2 paragraphs for summary.',
    medium: 'Be moderately detailed. 2-3 paragraphs for summary.',
    deep: 'Be thorough. 3-4 paragraphs with comprehensive analysis.',
  };

  return `Analyze this codebase and provide a comprehensive explanation.

## Project Info
Name: ${info.packageJson?.name || 'Unknown'}
Description: ${info.packageJson?.description || 'No description'}
Version: ${info.packageJson?.version || 'Unknown'}

## Technology Stack
${JSON.stringify(info.stack, null, 2)}

## Directory Structure
${info.structure || 'Not available'}

## API Routes (first 15)
${JSON.stringify(info.apiRoutes.routes?.slice(0, 15), null, 2)}

## Key Files
${info.keyFiles.map(f => `- ${f.path} (${f.importance}): ${f.purpose}`).join('\n')}

## Entry Points
${info.entryPoints.join('\n')}

## Detected Conventions
${JSON.stringify(info.conventions, null, 2)}

## Analysis Instructions
${focusText}
${depthInstructions[depth] || depthInstructions.medium}

Respond with ONLY a JSON object (no markdown fences, no explanation) with this exact structure:
{
  "summary": "2-3 paragraph overview of what this project is and does",
  "architecture": {
    "type": "monolith|microservices|modular-monolith|serverless|spa|jamstack",
    "description": "Explanation of the architecture pattern used",
    "layers": ["layer1", "layer2", "layer3"]
  },
  "main_features": ["feature1", "feature2", "feature3"],
  "dependencies_summary": "Brief summary of key dependencies and their purpose",
  "patterns_used": ["pattern1", "pattern2"],
  "conventions": ["convention1", "convention2"],
  "concerns": ["potential issue 1", "tech debt item"]
}

Important:
- summary should explain WHAT the project does, WHO it's for, and HOW it works at a high level
- architecture.type should reflect the actual pattern (not just the framework)
- main_features should be inferred from routes, components, and structure
- patterns_used should identify actual design patterns (Repository, Factory, MVC, etc.)
- concerns should highlight genuine issues, not generic advice`;
}

// =============================================================================
// Codebase Info Gathering
// =============================================================================

/**
 * Gather all codebase information
 */
export async function gatherCodebaseInfo(
  projectPath: string,
  depth: 'shallow' | 'medium' | 'deep',
): Promise<CodebaseInfo> {
  // Read package.json
  const packageJson = await readJsonFile(path.join(projectPath, 'package.json')) as PackageJsonData | null;

  // Detect stack (parse the response)
  const stackResponse = await handleDetectStack({ path: projectPath });
  let stack: StackData = {};
  try {
    const stackText = stackResponse.content[0].text;
    stack = JSON.parse(stackText);
  } catch {
    // Stack detection failed, use empty
  }

  // Get API routes (parse the response)
  const apiResponse = await handleGetApiRoutes({ path: projectPath });
  let apiRoutes: ApiRoutesData = {};
  try {
    const apiText = apiResponse.content[0].text;
    apiRoutes = JSON.parse(apiText);
  } catch {
    // API routes detection failed, use empty
  }

  // Get conventions (for medium/deep analysis only)
  let conventions: ConventionsData = {};
  if (depth !== 'shallow') {
    try {
      const convArgs: GetConventionsArgs = { path: projectPath };
      const convResponse = await handleGetConventions(convArgs);
      const convText = convResponse.content[0].text;
      conventions = JSON.parse(convText);
    } catch {
      // Conventions detection failed, use empty
    }
  }

  // Get directory structure
  const maxDepth = MAX_STRUCTURE_DEPTH[depth] || 3;
  const structure = await getDirectoryStructure(projectPath, projectPath, maxDepth);

  // Find key files
  const keyFiles = await findKeyFiles(projectPath);

  // Find entry points
  const entryPoints = await findEntryPoints(projectPath, packageJson);

  return {
    packageJson,
    stack,
    apiRoutes,
    conventions,
    structure,
    keyFiles,
    entryPoints,
  };
}
