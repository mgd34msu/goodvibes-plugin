/**
 * MCP tool schema definitions for all runtime-engine tools (Phase 1-5).
 * Returned verbatim in response to ListToolsRequestSchema.
 */
export const allSchemas = [
  {
    name: 'runtime_status',
    description:
      'Get the current health, uptime, and operational status of the runtime engine. ' +
      'Returns process metrics, feature flags, and individual health check results.',
    inputSchema: {
      type: 'object',
      properties: {
        include: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['workflows', 'agents', 'queue', 'triggers', 'budget', 'health'],
          },
          description:
            'Subsystems to include in the response. Omit to return all available data.',
        },
        verbosity: {
          type: 'string',
          enum: ['count_only', 'minimal', 'standard', 'verbose'],
          default: 'standard',
          description: 'Response verbosity level.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_config',
    description:
      'Read or modify runtime-engine configuration. ' +
      'Use get to read (full config or a single dot-separated key), ' +
      'set to persist a single key-value pair, ' +
      'or reset to restore factory defaults.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set', 'reset'],
          description: 'Operation to perform.',
        },
        key: {
          type: 'string',
          description:
            'Dot-separated configuration key (e.g. "server.log_level"). ' +
            'Required for set; optional for get (returns full config if omitted).',
        },
        value: {
          description:
            'Value to assign. Required for set. Accepts any JSON-serialisable value.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_events',
    description:
      'Query the runtime event log: filter by type, source, time range. ' +
      'Inspect event history and queue statistics.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['query', 'tail', 'stats', 'directives'],
          description:
            'query: filter event log (persistent), ' +
            'tail: recent events from in-memory bus history, ' +
            'stats: log and queue statistics, ' +
            'directives: query the DirectiveQueue for pending orchestrator directives.',
        },
        mode: {
          type: 'string',
          enum: ['peek', 'drain'],
          default: 'peek',
          description: '(directives action only) peek: return directives without removing them (default), drain: return and remove directives.'
        },
        target: {
          type: 'string',
          default: 'subagent_stop',
          description: '(directives action only) Hook target queue to query (e.g. subagent_stop).',
        },
        filter: {
          type: 'object',
          properties: {
            types: {
              type: 'array',
              items: { type: 'string' },
              description: "Event type patterns to filter (supports glob: 'hook:*', '*').",
            },
            source_kind: {
              type: 'string',
              description: 'Filter by event source kind (e.g. hook, agent, system).',
            },
            since: {
              type: 'string',
              description: "Start time (ISO timestamp or relative: '5m', '1h', '30s').",
            },
            until: {
              type: 'string',
              description: 'End time (ISO timestamp).',
            },
            correlation_id: {
              type: 'string',
              description: 'Filter by correlation ID.',
            },
            limit: {
              type: 'number',
              default: 50,
              description: 'Maximum number of events to return.',
            },
          },
          additionalProperties: false,
        },
        verbosity: {
          type: 'string',
          enum: ['count_only', 'minimal', 'standard', 'verbose'],
          default: 'standard',
          description: 'Response verbosity level.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_emit',
    description:
      'Emit a custom event into the runtime event bus. ' +
      'Useful for manual workflow advancement, trigger testing, or custom automation.',
    inputSchema: {
      type: 'object',
      required: ['event_type'],
      properties: {
        event_type: {
          type: 'string',
          description: "Event type to emit (e.g. 'system:health_check', 'trigger:fired').",
        },
        payload: {
          type: 'object',
          description: 'Event payload data.',
        },
        correlation_id: {
          type: 'string',
          description: 'Link to a related event chain.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_workflow',
    description:
      'Manage WRFC and fix-loop workflows: create, query, advance state, cancel. ' +
      'Formal state machines for orchestration.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'get', 'list', 'advance', 'cancel', 'history'],
        },
        workflow_type: {
          type: 'string',
          enum: ['wrfc_loop', 'fix_loop', 'custom'],
          description: 'Workflow definition to instantiate (for create)',
        },
        workflow_id: { type: 'string' },
        event: {
          type: 'string',
          description: 'Event type to send (for advance)',
        },
        context: {
          type: 'object',
          description: 'Context data (for create/advance)',
        },
        reason: {
          type: 'string',
          description: 'Cancellation reason (for cancel)',
        },
        filter: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['active', 'completed', 'failed', 'cancelled', 'timed_out'],
            },
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_triggers',
    description:
      'Manage event triggers: list, create, enable/disable, test conditions. ' +
      'Declarative event-driven automation.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'get', 'create', 'update', 'delete', 'enable', 'disable', 'test'],
        },
        trigger_id: { type: 'string' },
        trigger: {
          type: 'object',
          description: 'TriggerDefinition for create/update',
        },
        test_event: {
          type: 'object',
          description: 'Mock event to test conditions against',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_agents',
    description:
      'Manage coordinated agents: spawn with workflow context, track WRFC chains, ' +
      'monitor budgets, view execution plans. Workflow-aware agent orchestration.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'list', 'get', 'spawn', 'cancel', 'budget', 'plan'],
        },
        agent_id: { type: 'string' },
        workflow_id: { type: 'string' },
        filter: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
            },
            type: { type: 'string' },
            workflow_id: { type: 'string' },
          },
        },
        spawn: {
          type: 'object',
          required: ['type', 'task'],
          properties: {
            type: { type: 'string' },
            task: { type: 'string' },
            budget: { type: 'number' },
            priority: { type: 'number' },
            depends_on: { type: 'array', items: { type: 'string' } },
            workflow_id: { type: 'string' },
            workflow_phase: {
              type: 'string',
              description: 'Workflow phase this agent is executing (e.g. gather, plan, write, review, fix)',
            },
          },
        },
        reason: {
          type: 'string',
          description: 'Cancellation reason',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_state',
    description:
      'Query the runtime engine in-memory state store. ' +
      'Read plugin state by key, list keys in a namespace, discover namespaces, or take snapshots. ' +
      'Use to inspect agent-tracker data, WRFC state, or any plugin state.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'list', 'namespaces', 'snapshot'],
          description:
            'get: read a specific key, ' +
            'list: list keys under a namespace prefix, ' +
            'namespaces: discover top-level state namespaces, ' +
            'snapshot: dump state (optionally filtered by namespace).',
        },
        key: {
          type: 'string',
          description: 'Dot-separated state key (for get action).',
        },
        namespace: {
          type: 'string',
          description: 'Namespace prefix to filter (for list/snapshot actions). E.g. "agent_tracker".',
        },
        prefix: {
          type: 'string',
          description: 'Alias for namespace.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_daemon',
    description:
      'Manage the GoodVibes runtime daemon process. ' +
      'Start, stop, restart, check status, or list connected sessions.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'stop', 'restart', 'status', 'sessions'],
          description: 'Daemon management action. Use restart to stop and re-start with updated code.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_schedule',
    description:
      'Manage named event schedules: list, create, cancel, pause, resume. ' +
      'Supports heartbeat, cron, and one-shot types with preset interval names.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'create', 'cancel', 'get', 'pause', 'resume', 'heartbeat'],
          description: 'Schedule management action.',
        },
        schedule_id: {
          type: 'string',
          description: 'Unique schedule identifier.',
        },
        type: {
          type: 'string',
          enum: ['heartbeat', 'cron', 'one_shot'],
          description: 'Schedule type (for create action). Defaults to \'heartbeat\' if omitted.',
        },
        filter: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['heartbeat', 'cron', 'one_shot'],
              description: 'Filter listed items by schedule type.',
            },
          },
          description: 'Optional filter for the list action.',
        },
        event_type: {
          type: 'string',
          description: 'Event type to emit when the schedule fires.',
        },
        interval_ms: {
          type: 'number',
          description: 'Recurrence interval in milliseconds.',
        },
        delay_ms: {
          type: 'number',
          description: 'Delay before firing in milliseconds (one_shot only).',
        },
        preset: {
          type: 'string',
          enum: ['every_minute', 'every_5_minutes', 'every_15_minutes', 'every_hour', 'every_6_hours', 'daily'],
          description: 'Named interval preset (alternative to interval_ms).',
        },
        payload: {
          type: 'object',
          description: 'Arbitrary payload forwarded into the emitted event.',
        },
        ttl: {
          type: 'number',
          description: 'Maximum fires before the schedule is auto-removed.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'runtime_external',
    description:
      'Inspect the ExternalPlugin: HTTP webhook listener status, normalizer registry, ' +
      'payload normalization testing, and ingestion stats.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'normalizers', 'test_normalize', 'stats', 'queue'],
          description: 'External plugin action.',
        },
        source: {
          type: 'string',
          description: 'Normalizer source name (for test_normalize).',
        },
        payload: {
          type: 'object',
          description: 'Raw webhook payload to normalize.',
        },
        headers: {
          type: 'object',
          description: 'HTTP headers accompanying the payload.',
        },
        since: {
          type: 'string',
          description: "Start time for filtering (ISO timestamp or relative: '5m', '1h').",
        },
      },
      additionalProperties: false,
    },
  },
] as const;
