# Runtime Engine Gap Analysis: vs OpenClaw

**Date**: 2026-03-03  
**Scope**: Non-WRFC gaps preventing the GoodVibes runtime engine from operating as a fully autonomous agent runtime comparable to OpenClaw.

---

## Executive Summary

The GoodVibes runtime engine is **architecturally more sophisticated** than OpenClaw in event processing, workflow orchestration, state management, API integration, and authentication. The service registry with precision_fetch provides an enterprise-grade API gateway that OpenClaw's basic skill system cannot match. **The single major gap is standalone daemon lifecycle** — the runtime dies when the Claude Code session ends, preventing proactive background automation.

---

## OpenClaw Overview

OpenClaw (released November 2025, 247K GitHub stars) is a local-first AI agent framework built by Peter Steinberger. Core architecture:

```
[ CHANNEL ] <----> [ GATEWAY (Node.js) ] <----> [ LLM BRAIN ]
(Telegram/WA)      (State/Execution)           (Claude/GPT/Ollama)
                          |
               [ SKILLS / TOOLBOX ]
               (Shell, Browser, Files)
```

Key differentiators:
- **Messaging as UI** — WhatsApp, Telegram, Slack, Discord as input channels
- **Heartbeat scheduler** — Proactive background tasks without user prompt
- **Always-on daemon** — Standalone background service, survives IDE restarts
- **Local-first** — Shell access, file access, browser automation
- **Soul.md** — Markdown-based persistent agent identity and preferences
- **ClawHub** — Community skill marketplace with permission inspection

---

## Where the Runtime Engine Beats OpenClaw

### 1. API Gateway + Service Registry

| Aspect | Runtime Engine | OpenClaw |
|---|---|---|
| Registered services | 21 production services | Per-skill API configs |
| Auth tiers | 5 (per-request → service → OAuth2 auto-refresh → session → cookie jar) | API key per skill |
| OAuth2 | Auto-refresh with 60s buffer, token storage, 401 retry | Manual |
| Cookie persistence | File-backed jar, domain matching, expiry, eviction policies | None |
| Secrets management | `.goodvibes.secrets.json` (0o600), env var resolution, auto-gitignore | Plain text config |
| Rate limiting | Per-domain concurrency + delay + Retry-After header parsing | None built-in |
| Content extraction | 12 modes (markdown, readable, structured CSS, code_blocks, tables, links, metadata, PDF) | Basic HTML |
| Batch operations | Parallel multi-URL with per-URL extraction overrides | Single request |

**Currently registered services:**
- **LLM backends**: Ollama (local RTX 5060 Ti — qwen2.5:14b, qwen3:14b), OpenAI (OAuth2), GeminiCLI (OAuth2)
- **Notifications**: ntfy (push to mobile/desktop)
- **Home automation**: HomeAssistant
- **Infrastructure**: Cloudflare (DNS/Workers/Tunnels), Portainer (containers), NginxProxyManager
- **Media**: Sonarr, Radarr, Lidarr, Prowlarr, Plex, Tautulli, SABnzbd
- **Knowledge**: Hoarder (bookmarks), Homebox (inventory)
- **Health**: Fitbit (OAuth2)
- **Usenet**: DrunkenSlug, NZBgeek, AltHub
- **Extensible**: Any HTTP API can be added via `precision_services add`

### 2. Event Processing + Workflows

| Aspect | Runtime Engine | OpenClaw |
|---|---|---|
| Event system | L1-L3 architecture: EventBus, EventQueue, EventProcessor, EventLog | None — linear request/response |
| Trigger system | Condition-based triggers with event matching, state checks, composite conditions | None |
| Workflow/FSM | WorkflowEngine with states, transitions, guards, entry/exit actions, timeout, max_active | None |
| State management | CoreStateStore (KV with dot-path, mutation events, persistence, snapshots) | Flat markdown file |
| Dead letter queue | Failed events captured for analysis | None |
| Metrics | Event counters, latency, trigger fire counts | None |

### 3. Quality Assurance (WRFC)

| Aspect | Runtime Engine | OpenClaw |
|---|---|---|
| Review loop | Directive-driven Work → Review → Fix → Check with configurable thresholds | None |
| Agent orchestration | Parallel agent chains with WRFC coordination | None |
| Quality gates | Configurable min_review_score, max_fix_attempts | None |

### 4. Inbound Event Reception

| Aspect | Runtime Engine | OpenClaw |
|---|---|---|
| Webhook receiver | `POST /webhook/:source` with bearer token auth, timing-safe comparison, max payload enforcement | Telegram/WhatsApp bot webhook |
| Event normalization | NormalizerRegistry with GitHub built-in, generic fallback, extensible | Per-channel parsing |
| Ingestion pattern | File-drop → FileWatcher → EventQueue (decoupled, debuggable, manual injection supported) | Direct queue injection |
| Security | Localhost-only by default, optional bearer auth, disabled by default (zero attack surface) | API token per channel |

### 5. Multi-Model LLM Access

| Aspect | Runtime Engine | OpenClaw |
|---|---|---|
| Local models | Ollama registered (qwen2.5:14b fast, qwen3:14b reasoning) on dedicated GPU | Ollama support |
| Cloud models | OpenAI (OAuth2), GeminiCLI (OAuth2) in service registry | API key config |
| Auth handling | Auto OAuth2 refresh, session management | Manual key rotation |
| Model switching | Any registered service via precision_fetch `service` param | Config file change |

---

## Remaining Gaps

### Gap 1: Standalone Daemon Lifecycle (MAJOR — The Only Major Gap)

**OpenClaw**: Runs as a standalone background service via systemd/launchd. Survives terminal closes, IDE restarts, user logout. The "Heartbeat" scheduler wakes the agent to check emails, monitor markets, and run proactive tasks — all without user interaction.

**Runtime Engine**: Has all the infrastructure for daemon operation:
- `ExecutorModeManager` (daemon vs interactive modes)
- `TickDriver` with configurable intervals
- `DaemonTickHandler` for periodic event processing
- `TimePlugin` for time-based event injection
- `LoopLifecycleManager` for state transitions
- IPC server on Unix domain socket
- Persistence subsystem (checkpoints, snapshots, file-backed state)

**What's missing**: The runtime only operates within a Claude Code session. When the session ends, the process dies. No systemd unit file, no process supervisor, no session-independent startup.

**What's needed**:
- Systemd/launchd service definition for the runtime engine
- Session-independent startup path (bypass Claude Code hook system)
- Client connect/disconnect lifecycle (Claude Code sessions become clients, not hosts)
- Health monitoring and auto-restart

**Impact**: Without this, no proactive background tasks, no always-on monitoring, no responding to webhooks when nobody's at the terminal.

### Gap 2: Inbound Channel Adapters (SMALL)

**OpenClaw**: Telegram, WhatsApp, Slack, Discord as bidirectional channels.

**Runtime Engine**: HTTP webhook listener exists and works (`POST /webhook/:source`). Outbound messaging works via precision_fetch (ntfy, any API). Missing: dedicated polling/long-poll adapters for messaging platforms.

**What's needed**:
- Telegram Bot API normalizer (webhook mode — Telegram POSTs to `/webhook/telegram`)
- Slack Events API normalizer
- ntfy subscribe adapter (SSE/WebSocket listener for inbound notifications)
- Each is a plugin-level addition (~50-100 lines per normalizer)

**Impact**: Users can't text the agent from their phone and get a response. All pieces exist for this except the normalizers and the daemon (Gap 1).

### Gap 3: Independent LLM Reasoning (SMALL — Nearly Closed)

**OpenClaw**: Gateway calls LLM directly for reasoning on any incoming event.

**Runtime Engine**: Ollama is registered in the service registry. precision_fetch can POST to `http://192.168.0.85:11434/api/chat`. The runtime can already make LLM calls.

**What's needed**:
- A "reasoning action" in the trigger/action executor — when a trigger needs LLM reasoning, POST to Ollama via precision_fetch, parse response, emit result event
- ~100 lines of code: new action type `reason_with_llm` in ActionExecutor
- Template system for constructing prompts from event context + state

**Impact**: Without this, daemon-mode triggers can only do deterministic actions (API calls, state updates, notifications). With it, the runtime can reason about events autonomously.

### Gap 4: Agent Identity / Soul (SMALL)

**OpenClaw**: `soul.md` — markdown file defining agent personality, preferences, behavioral rules, accumulated knowledge. Fed to LLM at every interaction.

**Runtime Engine**: `.goodvibes/memory/` has structured JSON:
- `decisions.json` — architectural choices
- `patterns.json` — proven approaches
- `failures.json` — past mistakes
- `preferences.json` — project conventions

More structured than OpenClaw's flat markdown, but not unified into a coherent agent identity.

**What's needed**:
- A synthesis step that aggregates memory JSON into a system prompt for LLM calls (for Gap 3)
- Or a `soul.md` equivalent that maintains a rolling summary of preferences, personality, and context
- Mostly a presentation issue, not an infrastructure gap

---

## Gaps That Don't Exist (Previously Misidentified)

| Previously Identified Gap | Why It's Not a Gap |
|---|---|
| Multi-Model / LLM Abstraction | Ollama, OpenAI, GeminiCLI already registered with OAuth2 auto-auth |
| External Service Integration | 21 services with 5-tier auth, rate limiting, cookie persistence |
| Browser Automation | Chrome DevTools MCP exists, available as tool |
| Skill Marketplace | Service registry IS the marketplace — add any HTTP API |
| Permission Model | Secrets store (0o600), sandbox mode, env var indirection, auto-gitignore |
| Notifications/Messaging | ntfy registered, can push to mobile/desktop now |
| Inbound Events | HTTP webhook listener with auth, normalizers, file-drop pattern |

---

## Competitive Summary

| Capability | Runtime Engine | OpenClaw | Winner |
|---|---|---|---|
| API gateway + auth | Enterprise-grade (5-tier, OAuth2 refresh, cookies, rate limiting) | Basic API keys | **Runtime** |
| Service ecosystem | 21 production services, extensible | Community skills (security concerns) | **Runtime** |
| Event processing | L1-L3 (EventBus, triggers, conditions, workflows, FSM) | None | **Runtime** |
| State management | KV store with dot-path, mutation events, persistence | Flat markdown | **Runtime** |
| Quality assurance | WRFC directive-driven review loops | None | **Runtime** |
| Content extraction | 12 modes including PDF, readable, structured | Basic scraping | **Runtime** |
| Multi-model LLM | Ollama + OpenAI + Gemini with auto-auth | Same models, manual auth | **Runtime** |
| Rate limiting | Per-domain with Retry-After parsing | None | **Runtime** |
| Inbound webhooks | HTTP listener + normalizers + file-drop | Telegram/WhatsApp bots | **Tie** |
| Messaging UI | ntfy outbound (add normalizers for inbound) | Full bidirectional (TG/WA/Slack) | **OpenClaw** |
| Always-on daemon | Infrastructure exists, session-bound | Full standalone service | **OpenClaw** |
| Proactive scheduling | TickDriver + TimePlugin (session-bound) | Heartbeat (always-on) | **OpenClaw** |
| Agent identity | Structured JSON memory | soul.md personality | **Tie** |
| Community ecosystem | Private/extensible | ClawHub marketplace | **OpenClaw** |

---

## The One Architecture Unlock

**Make the runtime engine a standalone daemon.**

Everything else is already built or trivially extensible:
- Ollama for independent reasoning
- precision_fetch for all API interactions (with full auth stack)
- ntfy for push notifications
- EventBus + TriggerRegistry for reactive automation
- TickDriver + TimePlugin for proactive scheduling
- CoreStateStore for persistence
- HTTP webhook listener for inbound events
- WorkflowEngine for complex multi-step processes

The daemon needs to run independently of Claude Code. Claude Code sessions become *one of many clients* connecting to the runtime via IPC, rather than the sole host. This single change transforms the runtime from a "session enhancement" into a "personal agent runtime" that competes directly with — and in most dimensions exceeds — OpenClaw.

---

## Recommended Implementation Order

1. **Daemon service wrapper** — Systemd unit + startup script that launches the runtime engine independently. Wire existing TickDriver + DaemonTickHandler + IPC server.
2. **LLM reasoning action** — New `reason_with_llm` action type in ActionExecutor. POST to Ollama, parse response, emit event. ~100 LOC.
3. **Telegram normalizer** — Webhook normalizer for Telegram Bot API. Register bot, set webhook URL to runtime's HTTP listener. ~50 LOC.
4. **ntfy subscribe adapter** — SSE/long-poll listener for ntfy topics. Bidirectional messaging from phone. ~80 LOC.
5. **Soul synthesis** — Aggregate memory JSON into a unified system prompt for daemon-mode LLM calls.

Total estimated effort: Steps 1-5 could be completed in 2-3 focused sessions.

---

*Sources: [OpenClaw GitHub](https://github.com/openclaw/openclaw), [OpenClaw 2026 Guide](https://alphatechfinance.com/productivity-app/openclaw-ai-agent-2026-guide/), [OpenClaw Wikipedia](https://en.wikipedia.org/wiki/OpenClaw)*
