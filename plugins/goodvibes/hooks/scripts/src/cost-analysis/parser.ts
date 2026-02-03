import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import type { JournalEntry, TokenUsage, ParsedTimeFilter, TimeFilter } from './types.js';
import { validateJournalEntry } from './types.js';

export function getProjectDirectories(): string[] {
  const homeDir = os.homedir();
  return [
    path.join(homeDir, '.claude', 'projects'),
    path.join(homeDir, '.config', 'claude', 'projects')
  ].filter(dir => {
    try {
      return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  });
}

export function* walkDir(dir: string): Generator<string> {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip subagent directories - handled separately by analyzeSubagents()
        if (entry.name === 'subagents') {
          continue;
        }
        yield* walkDir(fullPath);
      } else if (entry.name.endsWith('.jsonl')) {
        yield fullPath;
      }
    }
  } catch (error) {}
}

export function findJSONLFiles(): string[] {
  const directories = getProjectDirectories();
  const files: string[] = [];
  for (const dir of directories) {
    for (const file of walkDir(dir)) {
      files.push(file);
    }
  }
  return files;
}

export function getProjectName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  const projectsIdx = parts.indexOf('projects');
  if (projectsIdx >= 0 && parts[projectsIdx + 1]) {
    return parts[projectsIdx + 1];
  }
  return 'unknown';
}

export function extractMcpTool(bashInput: unknown): string | null {
  if (!bashInput || typeof bashInput !== 'object') return null;
  const input = bashInput as { command?: string };
  if (!input.command) return null;
  const mcpMatch = input.command.match(/mcp-cli\s+(call|info)\s+([^\s'"]+)/);
  if (mcpMatch) {
    return `mcp:${mcpMatch[1]}:${mcpMatch[2]}`;
  }
  return null;
}

export function createEntryHash(entry: JournalEntry): string {
  const parts = [entry.message?.id || '', entry.requestId || ''];
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

export function parseTimeFilter(filter?: TimeFilter): ParsedTimeFilter {
  const now = Date.now();
  if (!filter) {
    return { startTime: now - 30 * 24 * 60 * 60 * 1000, endTime: now, description: 'Last 30 days' };
  }
  if (filter.type === 'absolute') {
    const startTime = filter.startDate ? new Date(filter.startDate).getTime() : 0;
    const endTime = filter.endDate ? new Date(filter.endDate).getTime() : now;
    return { startTime, endTime, description: `${filter.startDate || 'All time'} - ${filter.endDate || 'Now'}` };
  }
  const match = filter.relativeStart?.match(/^(\d+)([hdwmy])$/);
  if (!match) {
    return { startTime: now - 30 * 24 * 60 * 60 * 1000, endTime: now, description: 'Last 30 days' };
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  let milliseconds: number;
  let description: string;
  switch (unit) {
    case 'h': milliseconds = value * 60 * 60 * 1000; description = `Last ${value} hour${value > 1 ? 's' : ''}`; break;
    case 'd': milliseconds = value * 24 * 60 * 60 * 1000; description = `Last ${value} day${value > 1 ? 's' : ''}`; break;
    case 'w': milliseconds = value * 7 * 24 * 60 * 60 * 1000; description = `Last ${value} week${value > 1 ? 's' : ''}`; break;
    case 'm': milliseconds = value * 30 * 24 * 60 * 60 * 1000; description = `Last ${value} month${value > 1 ? 's' : ''}`; break;
    case 'y': milliseconds = value * 365 * 24 * 60 * 60 * 1000; description = `Last ${value} year${value > 1 ? 's' : ''}`; break;
    default: milliseconds = 30 * 24 * 60 * 60 * 1000; description = 'Last 30 days';
  }
  return { startTime: now - milliseconds, endTime: now, description };
}

export interface ParsedEntry {
  model: string;
  usage: TokenUsage;
  tools: string[];
}

export function parseJournalFile(filePath: string, timeFilter: ParsedTimeFilter, seenHashes: Set<string>): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  // Aggregate entries by hash to handle streaming/incremental updates
  // Same msgId+reqId may appear multiple times with different tool_use blocks
  const entryMap = new Map<string, { model: string; usage: TokenUsage; tools: Set<string> }>();

  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const contentLines = fileContent.trim().split(String.fromCharCode(10));
    for (const line of contentLines) {
      if (!line.trim()) continue;
      try {
        const raw = JSON.parse(line);
        const entry = validateJournalEntry(raw);
        if (!entry || entry.type !== 'assistant') continue;
        if (!entry.message?.usage) continue;
        if (entry.timestamp) {
          const timestamp = new Date(entry.timestamp).getTime();
          if (timestamp < timeFilter.startTime || timestamp > timeFilter.endTime) continue;
        }
        const hash = createEntryHash(entry);

        // Extract tools from this entry
        const entryTools: string[] = [];
        if (Array.isArray(entry.message.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_use' && block.name) {
              if (block.name === 'Bash' && block.input) {
                const mcpTool = extractMcpTool(block.input);
                entryTools.push(mcpTool || 'Bash');
              } else {
                entryTools.push(block.name);
              }
            }
          }
        }

        // Aggregate with existing entry or create new (within this file)
        if (entryMap.has(hash)) {
          const existing = entryMap.get(hash)!;
          // Add new tools (use Set to avoid duplicates)
          for (const tool of entryTools) {
            existing.tools.add(tool);
          }
          // Keep the latest usage stats (they accumulate)
          existing.usage = entry.message.usage;
        } else {
          entryMap.set(hash, {
            model: entry.message.model || 'unknown',
            usage: entry.message.usage,
            tools: new Set(entryTools)
          });
        }
      } catch (error) {}
    }
  } catch (error) {}

  // Convert aggregated entries to output format, checking global dedup
  for (const [hash, data] of entryMap) {
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);

    const tools = Array.from(data.tools);
    if (tools.length === 0) tools.push('__text_response__');
    entries.push({ model: data.model, usage: data.usage, tools });
  }

  return entries;
}

export interface ParsedProject {
  projectName: string;
  entries: ParsedEntry[];
}

export interface ParseAllProjectsOptions {
  timeFilter?: TimeFilter;
  projectFilter?: string[];
  modelFilter?: string[];
}

export function parseAllProjects(options: ParseAllProjectsOptions = {}): ParsedProject[] {
  const timeRange = parseTimeFilter(options.timeFilter);
  const seenHashes = new Set<string>();
  const projectMap = new Map<string, ParsedEntry[]>();
  const files = findJSONLFiles();
  for (const file of files) {
    const projectName = getProjectName(file);
    if (options.projectFilter && !options.projectFilter.includes(projectName)) continue;
    const entries = parseJournalFile(file, timeRange, seenHashes);
    const filteredEntries = options.modelFilter
      ? entries.filter(e => options.modelFilter!.includes(e.model))
      : entries;
    if (filteredEntries.length > 0) {
      const existing = projectMap.get(projectName) || [];
      projectMap.set(projectName, [...existing, ...filteredEntries]);
    }
  }
  return Array.from(projectMap.entries()).map(([projectName, entries]) => ({ projectName, entries }));
}
