#!/usr/bin/env node
/**
 * Registry Engine MCP Server
 *
 * Provides plugin discovery tools for searching and accessing GoodVibes
 * skills, agents, and tools registries.
 */

import { bootstrap } from './plugins/server.js';
import { logger } from './shared/logger.js';

bootstrap().catch((error) => {
  logger.error('Failed to start', error);
  process.exit(1);
});
