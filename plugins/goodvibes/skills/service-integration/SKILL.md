---
name: service-integration
description: How to reach authenticated APIs and project databases through the connect trust boundary — register a service or connection, store credentials safely, then call api_request / db_query. Load when a task needs an authenticated HTTP call or a live database query (not a public URL — use native WebFetch for that).
---

# service-integration

connect is the only goodvibes server that holds credentials, so it is deliberately conservative.
This skill is the usage guide for its three tools and the trust model they enforce. If you only
need to read a public web page or hit a one-off unauthenticated URL, use the native `WebFetch`
tool instead — connect is not a general web reader.

## The three tools

| Tool | Use it for |
|---|---|
| `mcp__connect__service` | Registry CRUD: register/remove services and DB connections, store credentials, set read-only vs write access, manage the destination allowlist, report trust status. |
| `mcp__connect__api_request` | One or more HTTP requests to a registered service (or an allowlisted URL). Batched, per-entry error isolation, response capping, secret redaction on echoed responses. |
| `mcp__connect__db_query` | A SQL query against a registered Postgres / MySQL / SQLite connection. Read-only by default; drivers resolve from the target project. |

The `/goodvibes:services` command is a guided wrapper over the `service` tool for the common
registry operations.

## Trust model (enforced by the server)

- **Credentials are pinned to their registered origin** and never sent elsewhere. Not toggleable.
- **Destination allowlist is on by default** — registered services and explicitly allowlisted
  hosts only. In restricted mode, an unregistered `url` (api_request) or bare `database_url`
  (db_query) is refused.
- **Read-only by default.** Write HTTP methods require a per-service opt-in; `db_query` writes
  require `write: true` AND a target that permits writes (a connection `allow_writes` opt-in, or
  open mode).
- **Open (unrestricted) mode is human-only and out-of-band** — set by a config-file edit,
  announced at session start, and reverting to restricted next session unless a separate, loud
  `dangerously_persist_across_sessions` flag is set. Agents cannot enable it.
- Every response carries a `mode: restricted | open` stamp.
- **Secrets are write-only.** `set_auth` stores at mode 0600 and never echoes the value back;
  `get`/`list`/`status` return an auth STATUS only, never the secret.

## Typical flow

1. `service` `status` — check the current mode and what is already registered.
2. `service` `register` — register the API service (base_url, url pattern, allowed methods). Prefer
   `{$ENV_VAR}` indirection for any secret over a literal value.
3. `service` `set_auth` — store the credential (0600, never echoed).
4. `api_request` — call the registered service by `service` name + `path`. Batch related calls; each
   result is keyed and error-isolated. Choose `extract`: json | text | headers | status.
5. For databases: `service` `register_connection`, then `db_query` with the `connection` name.
   SELECTs auto-LIMIT (default 100); pass `write: true` only for a connection that permits writes.

## Credential hygiene

- Never paste a raw secret into a prompt or a committed file. Use `{$ENV_VAR}` indirection.
- The connect commit-guard hook warns once, then blocks, on a `git add`/`commit` of a known
  credential file — do not work around it; move the secret out of the tree.
- Removing a service (`service` `remove`) purges its stored credentials.
