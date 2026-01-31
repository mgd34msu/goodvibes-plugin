import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ParsedTimeFilter, TokenUsage } from './types.js';
import { parseTimeFilter, walkDir, getProjectDirectories, extractMcpTool } from './parser.js';
import { getModelPricing } from './pricing.js';

export interface SubagentSession {
  id: string;
  path: string;
  project: string;
  calls: number;
  tokens: TokenUsage;
  cost: number;
  mcpCalls: number;
  nativeCalls: number;
  mcpTools: Record<string, number>;
  nativeTools: Record<string, number>;
  model: string;
}

export interface SubagentSummary {
  totalSessions: number;
  totalCalls: number;
  totalTokens: TokenUsage;
  totalCost: number;
  mcpCallPercent: number;
  nativeCallPercent: number;
  topAgents: SubagentSession[];
  sessions: SubagentSession[];
}

function extractAgentId(filePath: string): string {
  const match = filePath.match(/agent-([a-f0-9]+).jsonl/);
  return match ? match[1] : 'unknown';
}

function extractProjectName(filePath: string): string {
  const parts = filePath.replace(/\/g, '/').split('/');
  const projectsIdx = parts.indexOf('projects');
  if (projectsIdx >= 0 && parts[projectsIdx + 1]) {
    return parts[projectsIdx + 1];
  }
  return 'unknown';
}

export function findSubagentFiles(timeFilter?: ParsedTimeFilter): string[] {
  const filter = timeFilter || parseTimeFilter();
  const files: string[] = [];
  const directories = getProjectDirectories();
  
  for (const dir of directories) {
    const subagentsDir = path.join(dir);
    try {
      for (const projectDir of fs.readdirSync(subagentsDir)) {
        const subagentPath = path.join(subagentsDir, projectDir, 'subagents');
        if (!fs.existsSync(subagentPath)) continue;
        
        for (const file of fs.readdirSync(subagentPath)) {
          if (!file.startsWith('agent-') || !file.endsWith('.jsonl')) continue;
          const fullPath = path.join(subagentPath, file);
          try {
            const stat = fs.statSync(fullPath);
            const mtime = stat.mtime.getTime();
            if (mtime >= filter.startTime && mtime <= filter.endTime) {
              files.push(fullPath);
            }
          } catch { }
        }
      }
    } catch { }
  }
  
  return files;
}

export function parseSubagentSession(filePath: string, timeFilter?: ParsedTimeFilter): SubagentSession | null {
  const filter = timeFilter || parseTimeFilter();
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('
').filter(l => l.trim());
    
    const session: SubagentSession = {
      id: extractAgentId(filePath),
      path: filePath,
      project: extractProjectName(filePath),
      calls: 0,
      tokens: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      cost: 0,
      mcpCalls: 0,
      nativeCalls: 0,
      mcpTools: {},
      nativeTools: {},
      model: 'unknown'
    };
    
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== 'assistant') continue;
        
        if (entry.timestamp) {
          const ts = new Date(entry.timestamp).getTime();
          if (ts < filter.startTime || ts > filter.endTime) continue;
        }
        
        if (entry.message?.model) {
          session.model = entry.message.model;
        }
        
        if (entry.message?.usage) {
          const u = entry.message.usage;
          session.tokens.input_tokens += u.input_tokens || 0;
          session.tokens.output_tokens += u.output_tokens || 0;
          session.tokens.cache_read_input_tokens += u.cache_read_input_tokens || 0;
          session.tokens.cache_creation_input_tokens += u.cache_creation_input_tokens || 0;
        }
        
        const blocks = entry.message?.content || [];
        for (const block of blocks) {
          if (block.type === 'tool_use' && block.name) {
            session.calls++;
            
            if (block.name === 'Bash' && block.input?.command) {
              const mcpTool = extractMcpTool(block.input);
              if (mcpTool) {
                session.mcpCalls++;
                session.mcpTools[mcpTool] = (session.mcpTools[mcpTool] || 0) + 1;
              } else {
                session.nativeCalls++;
                session.nativeTools['Bash'] = (session.nativeTools['Bash'] || 0) + 1;
              }
            } else {
              session.nativeCalls++;
              session.nativeTools[block.name] = (session.nativeTools[block.name] || 0) + 1;
            }
          }
        }
      } catch { }
    }
    
    if (session.calls === 0) return null;
    
    // Calculate cost
    const pricing = getModelPricing(session.model);
    if (pricing) {
      session.cost = 
        (session.tokens.input_tokens * pricing.input / 1_000_000) +
        (session.tokens.output_tokens * pricing.output / 1_000_000) +
        ((session.tokens.cache_read_input_tokens || 0) * (pricing.cacheRead || pricing.input * 0.1) / 1_000_000);
    }
    
    return session;
  } catch {
    return null;
  }
}

export async function analyzeSubagents(timeFilter?: ParsedTimeFilter): Promise<SubagentSummary> {
  const filter = timeFilter || parseTimeFilter();
  const files = findSubagentFiles(filter);
  const sessions: SubagentSession[] = [];
  
  for (const file of files) {
    const session = parseSubagentSession(file, filter);
    if (session) {
      sessions.push(session);
    }
  }
  
  const totals: TokenUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let totalCalls = 0;
  let totalMcpCalls = 0;
  let totalNativeCalls = 0;
  let totalCost = 0;
  
  for (const s of sessions) {
    totalCalls += s.calls;
    totalMcpCalls += s.mcpCalls;
    totalNativeCalls += s.nativeCalls;
    totalCost += s.cost;
    totals.input_tokens += s.tokens.input_tokens;
    totals.output_tokens += s.tokens.output_tokens;
    totals.cache_read_input_tokens += s.tokens.cache_read_input_tokens || 0;
    totals.cache_creation_input_tokens += s.tokens.cache_creation_input_tokens || 0;
  }
  
  // Sort by MCP calls descending
  const topAgents = [...sessions].sort((a, b) => b.mcpCalls - a.mcpCalls).slice(0, 10);
  
  return {
    totalSessions: sessions.length,
    totalCalls,
    totalTokens: totals,
    totalCost,
    mcpCallPercent: totalCalls > 0 ? (totalMcpCalls / totalCalls) * 100 : 0,
    nativeCallPercent: totalCalls > 0 ? (totalNativeCalls / totalCalls) * 100 : 0,
    topAgents,
    sessions
  };
}
