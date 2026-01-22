/**
 * Integration tests for file structure management
 * Tests plugin structure (14.1) and project state structure (14.2)
 * @see SPEC-v2 Section 14
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PLUGIN_STRUCTURE,
  SKILLS_STRUCTURE,
  TOOLS_STRUCTURE,
  AGENTS_STRUCTURE,
  HOOKS_STRUCTURE,
  OUTPUT_STYLES_STRUCTURE,
  COMMANDS_STRUCTURE,
  TEMPLATES_STRUCTURE,
} from '../interfaces/plugin-structure.js';
import {
  PROJECT_STATE_STRUCTURE,
  STATE_FILES,
  MEMORY_FILES,
  TELEMETRY_FILES,
  LOG_FILES,
  CACHE_FILES,
  getAllDirectories,
  getRequiredFiles,
  resolveGoodvibesPath,
  getFullStatePath,
  getFullMemoryPath,
  getFullTelemetryPath,
  getFullLogPath,
  getFullCachePath,
  getFileCategory,
  isGoodvibesPath,
} from '../interfaces/project-structure.js';

describe('File Structure Management', () => {
  let mockFileSystem: MockFileSystem;

  beforeEach(() => {
    mockFileSystem = new MockFileSystem();
  });

  afterEach(() => {
    mockFileSystem.reset();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Section 14.1: Plugin Structure
  // ═══════════════════════════════════════════════════════════════════════

  describe('Section 14.1: Plugin Structure', () => {
    describe('Plugin Manifest', () => {
      it('verifies plugin manifest exists at .claude-plugin/plugin.json', async () => {
        // Arrange
        const manifestPath = `${PLUGIN_STRUCTURE.root}/${PLUGIN_STRUCTURE.files.plugin_manifest}`;
        await mockFileSystem.createFile(manifestPath, JSON.stringify({ name: 'goodvibes', version: '1.0.0' }));

        // Act
        const exists = await mockFileSystem.fileExists(manifestPath);
        const content = await mockFileSystem.readFile(manifestPath);

        // Assert
        expect(exists).toBe(true);
        expect(manifestPath).toBe('plugins/goodvibes/.claude-plugin/plugin.json');
        expect(JSON.parse(content)).toMatchObject({ name: 'goodvibes', version: expect.any(String) });
      });

      it('validates plugin manifest structure', async () => {
        // Arrange
        const manifestPath = `${PLUGIN_STRUCTURE.root}/${PLUGIN_STRUCTURE.files.plugin_manifest}`;
        const manifest = {
          name: 'goodvibes',
          version: '2.0.0',
          description: 'GoodVibes Plugin',
          agents: ['engineer', 'tester'],
          skills: ['core'],
          tools: ['batch-engine'],
        };
        await mockFileSystem.createFile(manifestPath, JSON.stringify(manifest));

        // Act
        const content = JSON.parse(await mockFileSystem.readFile(manifestPath));

        // Assert
        expect(content).toHaveProperty('name');
        expect(content).toHaveProperty('version');
        expect(content).toHaveProperty('description');
        expect(content.agents).toBeInstanceOf(Array);
        expect(content.skills).toBeInstanceOf(Array);
        expect(content.tools).toBeInstanceOf(Array);
      });
    });

    describe('MCP Configuration', () => {
      it('verifies MCP configuration exists at .mcp.json', async () => {
        // Arrange
        const mcpPath = `${PLUGIN_STRUCTURE.root}/${PLUGIN_STRUCTURE.files.mcp_config}`;
        await mockFileSystem.createFile(mcpPath, JSON.stringify({ mcpServers: {} }));

        // Act
        const exists = await mockFileSystem.fileExists(mcpPath);

        // Assert
        expect(exists).toBe(true);
        expect(mcpPath).toBe('plugins/goodvibes/.mcp.json');
      });

      it('validates MCP configuration structure', async () => {
        // Arrange
        const mcpPath = `${PLUGIN_STRUCTURE.root}/${PLUGIN_STRUCTURE.files.mcp_config}`;
        const mcpConfig = {
          mcpServers: {
            'batch-engine': {
              command: 'node',
              args: ['dist/index.js'],
            },
          },
        };
        await mockFileSystem.createFile(mcpPath, JSON.stringify(mcpConfig));

        // Act
        const content = JSON.parse(await mockFileSystem.readFile(mcpPath));

        // Assert
        expect(content).toHaveProperty('mcpServers');
        expect(typeof content.mcpServers).toBe('object');
      });
    });

    describe('Agents Directory Structure', () => {
      it('verifies agents directory exists', async () => {
        // Arrange
        const agentsDir = `${PLUGIN_STRUCTURE.root}/${PLUGIN_STRUCTURE.directories.agents}`;
        await mockFileSystem.createDirectory(agentsDir);

        // Act
        const exists = await mockFileSystem.directoryExists(agentsDir);

        // Assert
        expect(exists).toBe(true);
        expect(agentsDir).toBe('plugins/goodvibes/agents');
      });

      it('verifies agents registry exists', async () => {
        // Arrange
        const registryPath = `${PLUGIN_STRUCTURE.root}/${AGENTS_STRUCTURE.registry}`;
        await mockFileSystem.createFile(registryPath, '# Agents Registry\nagents: []');

        // Act
        const exists = await mockFileSystem.fileExists(registryPath);

        // Assert
        expect(exists).toBe(true);
        expect(registryPath).toBe('plugins/goodvibes/agents/_registry.yaml');
      });

      it('verifies all 6 consolidated agent types are defined', async () => {
        // Arrange
        const expectedAgents = ['engineer', 'reviewer', 'tester', 'architect', 'deployer', 'integrator'];

        // Act
        const actualAgents = AGENTS_STRUCTURE.agents;

        // Assert
        expect(actualAgents).toEqual(expectedAgents);
        expect(actualAgents).toHaveLength(6);
      });

      it('creates agent files for each consolidated agent', async () => {
        // Arrange
        const agentsDir = `${PLUGIN_STRUCTURE.root}/${PLUGIN_STRUCTURE.directories.agents}`;
        await mockFileSystem.createDirectory(agentsDir);

        // Act: Create agent files
        for (const agent of AGENTS_STRUCTURE.agents) {
          const agentPath = `${agentsDir}/${agent}.md`;
          await mockFileSystem.createFile(agentPath, `# ${agent} agent`);
        }

        // Assert: Verify all files exist
        const files = await mockFileSystem.listFiles(agentsDir);
        expect(files).toHaveLength(6);
        expect(files.map(f => f.name)).toContain('engineer.md');
        expect(files.map(f => f.name)).toContain('reviewer.md');
        expect(files.map(f => f.name)).toContain('tester.md');
        expect(files.map(f => f.name)).toContain('architect.md');
        expect(files.map(f => f.name)).toContain('deployer.md');
        expect(files.map(f => f.name)).toContain('integrator.md');
      });
    });

    describe('Skills Directory Structure', () => {
      it('verifies skills directory exists', async () => {
        // Arrange
        const skillsDir = `${PLUGIN_STRUCTURE.root}/${PLUGIN_STRUCTURE.directories.skills}`;
        await mockFileSystem.createDirectory(skillsDir);

        // Act
        const exists = await mockFileSystem.directoryExists(skillsDir);

        // Assert
        expect(exists).toBe(true);
        expect(skillsDir).toBe('plugins/goodvibes/skills');
      });

      it('verifies core skills directory exists', async () => {
        // Arrange
        const coreDir = `${PLUGIN_STRUCTURE.root}/${SKILLS_STRUCTURE.core}`;
        await mockFileSystem.createDirectory(coreDir);

        // Act
        const exists = await mockFileSystem.directoryExists(coreDir);

        // Assert
        expect(exists).toBe(true);
        expect(coreDir).toBe('plugins/goodvibes/skills/core');
      });

      it('verifies stack-specific skills directories', async () => {
        // Arrange
        const stacks = ['react', 'node', 'python'];

        // Act & Assert
        for (const stack of stacks) {
          const stackDir = `${PLUGIN_STRUCTURE.root}/${SKILLS_STRUCTURE.stacks[stack as keyof typeof SKILLS_STRUCTURE.stacks]}`;
          await mockFileSystem.createDirectory(stackDir);
          const exists = await mockFileSystem.directoryExists(stackDir);
          expect(exists).toBe(true);
          expect(stackDir).toBe(`plugins/goodvibes/skills/stacks/${stack}`);
        }
      });

      it('verifies skills registry exists', async () => {
        // Arrange
        const registryPath = `${PLUGIN_STRUCTURE.root}/${SKILLS_STRUCTURE.registry}`;
        await mockFileSystem.createFile(registryPath, '# Skills Registry\nskills: []');

        // Act
        const exists = await mockFileSystem.fileExists(registryPath);

        // Assert
        expect(exists).toBe(true);
        expect(registryPath).toBe('plugins/goodvibes/skills/_registry.yaml');
      });
    });

    describe('Tools Directory Structure', () => {
      it('verifies tools directory exists', async () => {
        // Arrange
        const toolsDir = `${PLUGIN_STRUCTURE.root}/${PLUGIN_STRUCTURE.directories.tools}`;
        await mockFileSystem.createDirectory(toolsDir);

        // Act
        const exists = await mockFileSystem.directoryExists(toolsDir);

        // Assert
        expect(exists).toBe(true);
        expect(toolsDir).toBe('plugins/goodvibes/tools');
      });

      it('verifies tools definitions directory exists', async () => {
        // Arrange
        const defsDir = `${PLUGIN_STRUCTURE.root}/${TOOLS_STRUCTURE.definitions}`;
        await mockFileSystem.createDirectory(defsDir);

        // Act
        const exists = await mockFileSystem.directoryExists(defsDir);

        // Assert
        expect(exists).toBe(true);
        expect(defsDir).toBe('plugins/goodvibes/tools/definitions');
      });

      it('verifies tools implementations directory exists', async () => {
        // Arrange
        const implDir = `${PLUGIN_STRUCTURE.root}/${TOOLS_STRUCTURE.implementations}`;
        await mockFileSystem.createDirectory(implDir);

        // Act
        const exists = await mockFileSystem.directoryExists(implDir);

        // Assert
        expect(exists).toBe(true);
        expect(implDir).toBe('plugins/goodvibes/tools/implementations');
      });

      it('verifies tools registry exists', async () => {
        // Arrange
        const registryPath = `${PLUGIN_STRUCTURE.root}/${TOOLS_STRUCTURE.registry}`;
        await mockFileSystem.createFile(registryPath, '# Tools Registry\ntools: []');

        // Act
        const exists = await mockFileSystem.fileExists(registryPath);

        // Assert
        expect(exists).toBe(true);
        expect(registryPath).toBe('plugins/goodvibes/tools/_registry.yaml');
      });
    });

    describe('Hooks Directory Structure', () => {
      it('verifies hooks directory exists', async () => {
        // Arrange
        const hooksDir = `${PLUGIN_STRUCTURE.root}/${HOOKS_STRUCTURE.directory}`;
        await mockFileSystem.createDirectory(hooksDir);

        // Act
        const exists = await mockFileSystem.directoryExists(hooksDir);

        // Assert
        expect(exists).toBe(true);
        expect(hooksDir).toBe('plugins/goodvibes/hooks');
      });

      it('verifies hooks scripts directory exists', async () => {
        // Arrange
        const scriptsDir = `${PLUGIN_STRUCTURE.root}/${HOOKS_STRUCTURE.scripts}`;
        await mockFileSystem.createDirectory(scriptsDir);

        // Act
        const exists = await mockFileSystem.directoryExists(scriptsDir);

        // Assert
        expect(exists).toBe(true);
        expect(scriptsDir).toBe('plugins/goodvibes/hooks/scripts');
      });
    });

    describe('Output Styles Directory Structure', () => {
      it('verifies output-styles directory exists', async () => {
        // Arrange
        const stylesDir = `${PLUGIN_STRUCTURE.root}/${OUTPUT_STYLES_STRUCTURE.directory}`;
        await mockFileSystem.createDirectory(stylesDir);

        // Act
        const exists = await mockFileSystem.directoryExists(stylesDir);

        // Assert
        expect(exists).toBe(true);
        expect(stylesDir).toBe('plugins/goodvibes/output-styles');
      });

      it('verifies vibecoding and justvibes styles are defined', async () => {
        // Arrange
        const expectedStyles = ['vibecoding', 'justvibes'];

        // Act
        const actualStyles = OUTPUT_STYLES_STRUCTURE.styles;

        // Assert
        expect(actualStyles).toEqual(expectedStyles);
      });
    });

    describe('Commands Directory Structure', () => {
      it('verifies commands directory exists', async () => {
        // Arrange
        const commandsDir = `${PLUGIN_STRUCTURE.root}/${COMMANDS_STRUCTURE.directory}`;
        await mockFileSystem.createDirectory(commandsDir);

        // Act
        const exists = await mockFileSystem.directoryExists(commandsDir);

        // Assert
        expect(exists).toBe(true);
        expect(commandsDir).toBe('plugins/goodvibes/commands');
      });

      it('verifies all core commands are defined', async () => {
        // Arrange
        const expectedCommands = ['batch', 'status', 'recover', 'mode'];

        // Act
        const actualCommands = COMMANDS_STRUCTURE.commands;

        // Assert
        expect(actualCommands).toEqual(expectedCommands);
      });
    });

    describe('Templates Directory Structure', () => {
      it('verifies templates directory exists', async () => {
        // Arrange
        const templatesDir = `${PLUGIN_STRUCTURE.root}/${TEMPLATES_STRUCTURE.directory}`;
        await mockFileSystem.createDirectory(templatesDir);

        // Act
        const exists = await mockFileSystem.directoryExists(templatesDir);

        // Assert
        expect(exists).toBe(true);
        expect(templatesDir).toBe('plugins/goodvibes/templates');
      });

      it('verifies core templates are defined', async () => {
        // Arrange
        const expectedTemplates = ['agent-prompt.hbs', 'error-report.hbs', 'batch-summary.hbs'];

        // Act
        const actualTemplates = TEMPLATES_STRUCTURE.templates;

        // Assert
        expect(actualTemplates).toEqual(expectedTemplates);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Section 14.2: Project State Structure
  // ═══════════════════════════════════════════════════════════════════════

  describe('Section 14.2: Project State Structure', () => {
    describe('Root Directory Creation', () => {
      it('creates .goodvibes root directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const goodvibesRoot = `${projectRoot}/${PROJECT_STATE_STRUCTURE.root}`;

        // Act
        await mockFileSystem.createDirectory(goodvibesRoot);
        const exists = await mockFileSystem.directoryExists(goodvibesRoot);

        // Assert
        expect(exists).toBe(true);
        expect(PROJECT_STATE_STRUCTURE.root).toBe('.goodvibes');
      });

      it('verifies .goodvibes is at project root level', async () => {
        // Arrange
        const projectRoot = '/project';

        // Act
        const goodvibesPath = resolveGoodvibesPath(projectRoot, '');

        // Assert
        expect(goodvibesPath).toBe('/project/.goodvibes/');
      });
    });

    describe('State Directory Creation', () => {
      it('creates .goodvibes/state/ directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const stateDir = `${projectRoot}/${PROJECT_STATE_STRUCTURE.root}/${PROJECT_STATE_STRUCTURE.directories.state}`;

        // Act
        await mockFileSystem.createDirectory(stateDir);
        const exists = await mockFileSystem.directoryExists(stateDir);

        // Assert
        expect(exists).toBe(true);
        expect(stateDir).toBe('/project/.goodvibes/state');
      });

      it('creates session.json in state directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const sessionPath = `${projectRoot}/${getFullStatePath('session')}`;

        // Act
        await mockFileSystem.createFile(sessionPath, JSON.stringify({ mode: 'vibecoding' }));
        const exists = await mockFileSystem.fileExists(sessionPath);

        // Assert
        expect(exists).toBe(true);
        expect(sessionPath).toBe('/project/.goodvibes/state/session.json');
      });

      it('creates agents.json in state directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const agentsPath = `${projectRoot}/${getFullStatePath('agents')}`;

        // Act
        await mockFileSystem.createFile(agentsPath, JSON.stringify({ agents: [] }));
        const exists = await mockFileSystem.fileExists(agentsPath);

        // Assert
        expect(exists).toBe(true);
        expect(agentsPath).toBe('/project/.goodvibes/state/agents.json');
      });

      it('creates locks.json in state directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const locksPath = `${projectRoot}/${getFullStatePath('locks')}`;

        // Act
        await mockFileSystem.createFile(locksPath, JSON.stringify({ locks: [] }));
        const exists = await mockFileSystem.fileExists(locksPath);

        // Assert
        expect(exists).toBe(true);
        expect(locksPath).toBe('/project/.goodvibes/state/locks.json');
      });

      it('creates health.json in state directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const healthPath = `${projectRoot}/${getFullStatePath('health')}`;

        // Act
        await mockFileSystem.createFile(healthPath, JSON.stringify({ status: 'healthy' }));
        const exists = await mockFileSystem.fileExists(healthPath);

        // Assert
        expect(exists).toBe(true);
        expect(healthPath).toBe('/project/.goodvibes/state/health.json');
      });
    });

    describe('Memory Directory Creation', () => {
      it('creates .goodvibes/memory/ directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const memoryDir = `${projectRoot}/${PROJECT_STATE_STRUCTURE.root}/${PROJECT_STATE_STRUCTURE.directories.memory}`;

        // Act
        await mockFileSystem.createDirectory(memoryDir);
        const exists = await mockFileSystem.directoryExists(memoryDir);

        // Assert
        expect(exists).toBe(true);
        expect(memoryDir).toBe('/project/.goodvibes/memory');
      });

      it('creates decisions.md in memory directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const decisionsPath = `${projectRoot}/${getFullMemoryPath('decisions')}`;

        // Act
        await mockFileSystem.createFile(decisionsPath, '# Decisions\n');
        const exists = await mockFileSystem.fileExists(decisionsPath);

        // Assert
        expect(exists).toBe(true);
        expect(decisionsPath).toBe('/project/.goodvibes/memory/decisions.md');
      });

      it('creates patterns.md in memory directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const patternsPath = `${projectRoot}/${getFullMemoryPath('patterns')}`;

        // Act
        await mockFileSystem.createFile(patternsPath, '# Patterns\n');
        const exists = await mockFileSystem.fileExists(patternsPath);

        // Assert
        expect(exists).toBe(true);
        expect(patternsPath).toBe('/project/.goodvibes/memory/patterns.md');
      });

      it('creates failures.md in memory directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const failuresPath = `${projectRoot}/${getFullMemoryPath('failures')}`;

        // Act
        await mockFileSystem.createFile(failuresPath, '# Failures\n');
        const exists = await mockFileSystem.fileExists(failuresPath);

        // Assert
        expect(exists).toBe(true);
        expect(failuresPath).toBe('/project/.goodvibes/memory/failures.md');
      });

      it('creates preferences.json in memory directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const preferencesPath = `${projectRoot}/${getFullMemoryPath('preferences')}`;

        // Act
        await mockFileSystem.createFile(preferencesPath, JSON.stringify({ preferences: {} }));
        const exists = await mockFileSystem.fileExists(preferencesPath);

        // Assert
        expect(exists).toBe(true);
        expect(preferencesPath).toBe('/project/.goodvibes/memory/preferences.json');
      });

      it('creates index.json in memory directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const indexPath = `${projectRoot}/${getFullMemoryPath('index')}`;

        // Act
        await mockFileSystem.createFile(indexPath, JSON.stringify({ index: {} }));
        const exists = await mockFileSystem.fileExists(indexPath);

        // Assert
        expect(exists).toBe(true);
        expect(indexPath).toBe('/project/.goodvibes/memory/index.json');
      });
    });

    describe('Checkpoints Directory Creation', () => {
      it('creates .goodvibes/checkpoints/ directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const checkpointsDir = `${projectRoot}/${PROJECT_STATE_STRUCTURE.root}/${PROJECT_STATE_STRUCTURE.directories.checkpoints}`;

        // Act
        await mockFileSystem.createDirectory(checkpointsDir);
        const exists = await mockFileSystem.directoryExists(checkpointsDir);

        // Assert
        expect(exists).toBe(true);
        expect(checkpointsDir).toBe('/project/.goodvibes/checkpoints');
      });

      it('creates checkpoint subdirectories with timestamp format', async () => {
        // Arrange
        const projectRoot = '/project';
        const checkpointId = 'cp_20240101_120000';
        const checkpointDir = `${projectRoot}/.goodvibes/checkpoints/${checkpointId}`;

        // Act
        await mockFileSystem.createDirectory(checkpointDir);
        const exists = await mockFileSystem.directoryExists(checkpointDir);

        // Assert
        expect(exists).toBe(true);
        expect(checkpointId).toMatch(/^cp_\d{8}_\d{6}$/);
      });

      it('creates checkpoint manifest.json', async () => {
        // Arrange
        const projectRoot = '/project';
        const checkpointId = 'cp_20240101_120000';
        const manifestPath = `${projectRoot}/.goodvibes/checkpoints/${checkpointId}/manifest.json`;

        // Act
        await mockFileSystem.createFile(
          manifestPath,
          JSON.stringify({ id: checkpointId, created_at: new Date().toISOString() })
        );
        const exists = await mockFileSystem.fileExists(manifestPath);

        // Assert
        expect(exists).toBe(true);
      });
    });

    describe('Telemetry Directory Creation', () => {
      it('creates .goodvibes/telemetry/ directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const telemetryDir = `${projectRoot}/${PROJECT_STATE_STRUCTURE.root}/${PROJECT_STATE_STRUCTURE.directories.telemetry}`;

        // Act
        await mockFileSystem.createDirectory(telemetryDir);
        const exists = await mockFileSystem.directoryExists(telemetryDir);

        // Assert
        expect(exists).toBe(true);
        expect(telemetryDir).toBe('/project/.goodvibes/telemetry');
      });

      it('creates current_session.json in telemetry directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const currentPath = `${projectRoot}/${getFullTelemetryPath('current_session')}`;

        // Act
        await mockFileSystem.createFile(currentPath, JSON.stringify({ metrics: {} }));
        const exists = await mockFileSystem.fileExists(currentPath);

        // Assert
        expect(exists).toBe(true);
        expect(currentPath).toBe('/project/.goodvibes/telemetry/current_session.json');
      });

      it('creates aggregations.json in telemetry directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const aggregationsPath = `${projectRoot}/${getFullTelemetryPath('aggregations')}`;

        // Act
        await mockFileSystem.createFile(aggregationsPath, JSON.stringify({ aggregations: {} }));
        const exists = await mockFileSystem.fileExists(aggregationsPath);

        // Assert
        expect(exists).toBe(true);
        expect(aggregationsPath).toBe('/project/.goodvibes/telemetry/aggregations.json');
      });

      it('creates history subdirectory in telemetry', async () => {
        // Arrange
        const projectRoot = '/project';
        const historyDir = `${projectRoot}/${PROJECT_STATE_STRUCTURE.root}/${TELEMETRY_FILES.history}`;

        // Act
        await mockFileSystem.createDirectory(historyDir);
        const exists = await mockFileSystem.directoryExists(historyDir);

        // Assert
        expect(exists).toBe(true);
        expect(historyDir).toBe('/project/.goodvibes/telemetry/history');
      });
    });

    describe('Logs Directory Creation', () => {
      it('creates .goodvibes/logs/ directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const logsDir = `${projectRoot}/${PROJECT_STATE_STRUCTURE.root}/${PROJECT_STATE_STRUCTURE.directories.logs}`;

        // Act
        await mockFileSystem.createDirectory(logsDir);
        const exists = await mockFileSystem.directoryExists(logsDir);

        // Assert
        expect(exists).toBe(true);
        expect(logsDir).toBe('/project/.goodvibes/logs');
      });

      it('creates justvibes-log.md in logs directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const logPath = `${projectRoot}/${getFullLogPath('justvibes_log')}`;

        // Act
        await mockFileSystem.createFile(logPath, '# Activity Log\n');
        const exists = await mockFileSystem.fileExists(logPath);

        // Assert
        expect(exists).toBe(true);
        expect(logPath).toBe('/project/.goodvibes/logs/justvibes-log.md');
      });

      it('creates justvibes-errors.md in logs directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const errorsPath = `${projectRoot}/${getFullLogPath('justvibes_errors')}`;

        // Act
        await mockFileSystem.createFile(errorsPath, '# Error Log\n');
        const exists = await mockFileSystem.fileExists(errorsPath);

        // Assert
        expect(exists).toBe(true);
        expect(errorsPath).toBe('/project/.goodvibes/logs/justvibes-errors.md');
      });

      it('creates activity.log in logs directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const activityPath = `${projectRoot}/${getFullLogPath('activity')}`;

        // Act
        await mockFileSystem.createFile(activityPath, '');
        const exists = await mockFileSystem.fileExists(activityPath);

        // Assert
        expect(exists).toBe(true);
        expect(activityPath).toBe('/project/.goodvibes/logs/activity.log');
      });

      it('creates decisions.log in logs directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const decisionsPath = `${projectRoot}/${getFullLogPath('decisions')}`;

        // Act
        await mockFileSystem.createFile(decisionsPath, '');
        const exists = await mockFileSystem.fileExists(decisionsPath);

        // Assert
        expect(exists).toBe(true);
        expect(decisionsPath).toBe('/project/.goodvibes/logs/decisions.log');
      });
    });

    describe('Cache Directory Creation', () => {
      it('creates .goodvibes/cache/ directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const cacheDir = `${projectRoot}/${PROJECT_STATE_STRUCTURE.root}/${PROJECT_STATE_STRUCTURE.directories.cache}`;

        // Act
        await mockFileSystem.createDirectory(cacheDir);
        const exists = await mockFileSystem.directoryExists(cacheDir);

        // Assert
        expect(exists).toBe(true);
        expect(cacheDir).toBe('/project/.goodvibes/cache');
      });

      it('creates stack.json in cache directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const stackPath = `${projectRoot}/${getFullCachePath('stack_detection')}`;

        // Act
        await mockFileSystem.createFile(stackPath, JSON.stringify({ stack: {} }));
        const exists = await mockFileSystem.fileExists(stackPath);

        // Assert
        expect(exists).toBe(true);
        expect(stackPath).toBe('/project/.goodvibes/cache/stack.json');
      });

      it('creates symbols.json in cache directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const symbolsPath = `${projectRoot}/${getFullCachePath('symbol_index')}`;

        // Act
        await mockFileSystem.createFile(symbolsPath, JSON.stringify({ symbols: [] }));
        const exists = await mockFileSystem.fileExists(symbolsPath);

        // Assert
        expect(exists).toBe(true);
        expect(symbolsPath).toBe('/project/.goodvibes/cache/symbols.json');
      });

      it('creates deps.json in cache directory', async () => {
        // Arrange
        const projectRoot = '/project';
        const depsPath = `${projectRoot}/${getFullCachePath('dependency_graph')}`;

        // Act
        await mockFileSystem.createFile(depsPath, JSON.stringify({ dependencies: {} }));
        const exists = await mockFileSystem.fileExists(depsPath);

        // Assert
        expect(exists).toBe(true);
        expect(depsPath).toBe('/project/.goodvibes/cache/deps.json');
      });
    });

    describe('Runtime Initialization', () => {
      it('initializes all required directories on startup', async () => {
        // Arrange
        const projectRoot = '/project';
        const requiredDirs = getAllDirectories();

        // Act: Initialize all directories
        for (const dir of requiredDirs) {
          await mockFileSystem.createDirectory(`${projectRoot}/${dir}`);
        }

        // Assert: Verify all directories exist
        for (const dir of requiredDirs) {
          const exists = await mockFileSystem.directoryExists(`${projectRoot}/${dir}`);
          expect(exists).toBe(true);
        }

        expect(requiredDirs).toContain('.goodvibes');
        expect(requiredDirs).toContain('.goodvibes/state');
        expect(requiredDirs).toContain('.goodvibes/memory');
        expect(requiredDirs).toContain('.goodvibes/checkpoints');
        expect(requiredDirs).toContain('.goodvibes/telemetry');
        expect(requiredDirs).toContain('.goodvibes/logs');
        expect(requiredDirs).toContain('.goodvibes/cache');
      });

      it('initializes all required files with default content', async () => {
        // Arrange
        const projectRoot = '/project';
        const requiredFiles = getRequiredFiles();

        // Act: Initialize all files with defaults
        for (const file of requiredFiles) {
          const defaultContent = file.endsWith('.json') ? '{}' : '';
          await mockFileSystem.createFile(`${projectRoot}/${file}`, defaultContent);
        }

        // Assert: Verify all files exist
        for (const file of requiredFiles) {
          const exists = await mockFileSystem.fileExists(`${projectRoot}/${file}`);
          expect(exists).toBe(true);
        }

        expect(requiredFiles.length).toBeGreaterThan(0);
      });
    });

    describe('Path Resolution Utilities', () => {
      it('resolves state file paths correctly', async () => {
        // Act
        const sessionPath = getFullStatePath('session');
        const agentsPath = getFullStatePath('agents');
        const locksPath = getFullStatePath('locks');
        const healthPath = getFullStatePath('health');

        // Assert
        expect(sessionPath).toBe('.goodvibes/state/session.json');
        expect(agentsPath).toBe('.goodvibes/state/agents.json');
        expect(locksPath).toBe('.goodvibes/state/locks.json');
        expect(healthPath).toBe('.goodvibes/state/health.json');
      });

      it('resolves memory file paths correctly', async () => {
        // Act
        const decisionsPath = getFullMemoryPath('decisions');
        const patternsPath = getFullMemoryPath('patterns');
        const failuresPath = getFullMemoryPath('failures');

        // Assert
        expect(decisionsPath).toBe('.goodvibes/memory/decisions.md');
        expect(patternsPath).toBe('.goodvibes/memory/patterns.md');
        expect(failuresPath).toBe('.goodvibes/memory/failures.md');
      });

      it('determines file category from path', async () => {
        // Act & Assert
        expect(getFileCategory('state/session.json')).toBe('state');
        expect(getFileCategory('memory/decisions.md')).toBe('memory');
        expect(getFileCategory('checkpoints/cp_20240101_120000/manifest.json')).toBe('checkpoints');
        expect(getFileCategory('telemetry/current_session.json')).toBe('telemetry');
        expect(getFileCategory('logs/activity.log')).toBe('logs');
        expect(getFileCategory('cache/stack.json')).toBe('cache');
        expect(getFileCategory('unknown/file.txt')).toBe('unknown');
      });

      it('identifies goodvibes paths correctly', async () => {
        // Act & Assert
        expect(isGoodvibesPath('.goodvibes/state/session.json')).toBe(true);
        expect(isGoodvibesPath('/project/.goodvibes/memory/decisions.md')).toBe(true);
        expect(isGoodvibesPath('C:\\Users\\test\\project\\.goodvibes\\cache\\stack.json')).toBe(true);
        expect(isGoodvibesPath('.goodvibes')).toBe(true);
        expect(isGoodvibesPath('/project/src/main.ts')).toBe(false);
        expect(isGoodvibesPath('package.json')).toBe(false);
      });
    });
  });
});

// ============================================================================
// Mock Implementations
// ============================================================================

interface FileEntry {
  path: string;
  content: string;
  type: 'file' | 'directory';
}

class MockFileSystem {
  private files: Map<string, FileEntry> = new Map();

  async createDirectory(path: string): Promise<void> {
    const normalized = this.normalizePath(path);
    this.files.set(normalized, { path: normalized, content: '', type: 'directory' });

    // Create parent directories recursively
    const parts = normalized.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      const parentPath = '/' + parts.slice(0, i).join('/');
      if (!this.files.has(parentPath)) {
        this.files.set(parentPath, { path: parentPath, content: '', type: 'directory' });
      }
    }
  }

  async createFile(path: string, content: string): Promise<void> {
    const normalized = this.normalizePath(path);

    // Create parent directory
    const parentDir = normalized.substring(0, normalized.lastIndexOf('/'));
    if (parentDir && !this.files.has(parentDir)) {
      await this.createDirectory(parentDir);
    }

    this.files.set(normalized, { path: normalized, content, type: 'file' });
  }

  async fileExists(path: string): Promise<boolean> {
    const normalized = this.normalizePath(path);
    const entry = this.files.get(normalized);
    return entry !== undefined && entry.type === 'file';
  }

  async directoryExists(path: string): Promise<boolean> {
    const normalized = this.normalizePath(path);
    const entry = this.files.get(normalized);
    return entry !== undefined && entry.type === 'directory';
  }

  async readFile(path: string): Promise<string> {
    const normalized = this.normalizePath(path);
    const entry = this.files.get(normalized);
    if (!entry || entry.type !== 'file') {
      throw new Error(`File not found: ${path}`);
    }
    return entry.content;
  }

  async listFiles(directory: string): Promise<Array<{ name: string; path: string }>> {
    const normalized = this.normalizePath(directory);
    const results: Array<{ name: string; path: string }> = [];

    for (const [path, entry] of this.files.entries()) {
      if (entry.type === 'file' && path.startsWith(normalized + '/')) {
        const relativePath = path.substring(normalized.length + 1);
        // Only immediate children, not nested
        if (!relativePath.includes('/')) {
          results.push({
            name: relativePath,
            path: path,
          });
        }
      }
    }

    return results;
  }

  reset(): void {
    this.files.clear();
  }

  private normalizePath(path: string): string {
    // Normalize path separators and remove trailing slashes
    let normalized = path.replace(/\\/g, '/');
    if (normalized.endsWith('/') && normalized.length > 1) {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    return normalized;
  }
}
