# goodvibes-connect

Registered HTTP and database access under an explicit trust boundary — **3
tools**, one MCP server. The "connect on demand" member of the goodvibes v2 line:
a separate plugin so that users who never call an authenticated API or database
never have credential-holding code on disk or a server in memory.

> Status: **v2.0.0-alpha.1**.

## Tools

| Tool | What it does |
|---|---|
| `api_request` | Batched HTTP requests to a **registered** service (or an allowlisted URL), with per-entry error isolation, response capping, and a redaction pass over echoed responses |
| `service` | Manage the service registry: register a service, store credentials (0600, `{$env}` indirection), set per-service read-only vs write-methods, remove/purge |
| `db_query` | Query a **registered** database connection (Postgres / MySQL / SQLite), read-only by default, drivers resolved from the target project |

Tools surface as `mcp__goodvibes-connect__api_request`, etc.

## Trust boundary

connect is the only goodvibes plugin that holds credentials, so its defaults are
conservative:

- **Credentials are pinned to their registered origin** and never sent elsewhere
  (not toggleable).
- **Destination allowlist is on by default.** Registered services and
  explicitly allowlisted URLs only.
- **Read-only by default per service / connection.** Write methods are an
  explicit opt-in.
- **Open mode is human-only and ephemeral.** Enabling it is announced at session
  start and reverts to restricted next session unless a separate, loud
  `dangerously_persist_across_sessions` flag is set. Agents cannot toggle it.
- Every response carries a `mode: restricted | open` stamp.

## Token cost

Tool schemas are deferred behind Tool Search (client default). Always-on
metadata:

| Component | Always-on tokens (measured via `claude plugin details`) |
|---|---|
| goodvibes-connect | **~19** |

## When native tools are the right choice

- **Reading a public web page or a one-off unauthenticated URL** — use the native
  `WebFetch` tool. connect deliberately **dropped** the page-reading /
  HTML-to-markdown stack; it is not a general web reader. Reach for connect only
  when you need *authenticated, registered-service* calls or live database
  access under the trust boundary above.
- If you never call authenticated APIs and never query a project database, **you
  don't need this plugin** — install `goodvibes-intel` (and optionally
  `goodvibes-analytics`) and skip connect.

## Content

- **Hooks:** a SessionStart open-mode announcement and a warn-first secrets
  commit guard (`git add`/`commit` of a known credential file warns once, then
  blocks). Both yield silently if the v1 `goodvibes` plugin is installed
  alongside.
- Service and connection management is driven through the **`service` tool**. A
  dedicated `/goodvibes-connect:services` command and a service-integration skill
  are **not yet included in this alpha** — manage the registry via the tool for now.

## Install

```sh
claude plugin marketplace add mgd34msu/goodvibes-plugin
claude plugin install goodvibes-connect@goodvibes-market
```

Database drivers are resolved from your target project (per the v1 pattern), so
they are not bundled; `db_query` prints an honest install hint when a driver is
missing.

## Tests

`npx vitest run --project connect` — 265 passing (HTTP client, cookie jar,
service registry/resolver, secrets store/guard, auth orchestrator, trust
boundary, db driver resolution). `npx tsc --noEmit -p packages/connect` — zero
errors.
