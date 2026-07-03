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

- **Credentials are pinned to their registered origin** (protocol + host + port) and never sent
  elsewhere. Not toggleable — open mode widens *where* you may go, never *where secrets may travel*.
- **Destination allowlist is on by default.** In restricted mode a destination is reachable only if
  its origin is a registered service origin or its host is on the allowlist. An unregistered,
  non-allowlisted `url` (api_request) or a bare `database_url` (db_query) is refused.
- **Read-only by default.** HTTP write methods (anything beyond GET/HEAD/OPTIONS) require the
  service's `write_methods` opt-in; `db_query` writes require `write: true` AND a target that permits
  writes (a connection `allow_writes` opt-in, or open mode for a bare `database_url`).
- **Open (unrestricted) mode is human-only and out-of-band** — a person edits
  `.goodvibes/config.json`, it is announced at session start, and it reverts to restricted the
  next session unless the separate, loud `dangerously_persist_across_sessions` flag is set. Agents
  cannot enable it.
- Every response carries a `mode: restricted | open` stamp.
- **Secrets are write-only.** `set_auth` stores at mode 0600 and never echoes the value back; `get`
  returns an auth STATUS, and `list`/`status` return names and summaries only — never the secret.

## Typical flow

1. `service` `status` — check the current mode and what is already registered.
2. `service` `register` — register the API service (`config.base_url` required). Add `write_methods`
   only if the service needs non-GET methods.
3. `service` `set_auth` — store the credential (0600, never echoed). Prefer `{ "$env": "VAR_NAME" }`
   env references over a literal secret value.
4. `api_request` — call the registered service by `service` name + `path` (or an allowlisted `url`).
   Batch related calls; each result is keyed by `id` (or array index) and error-isolated. Choose
   `extract`: json | text | headers | status (default json).
5. For databases: `service` `register_connection` (`url` for a secret-free target such as a SQLite
   file, or `url_env` naming an env var that holds the connection URL), then `db_query` with the
   `connection` name. SELECT/WITH queries auto-LIMIT (default 100); pass `write: true` only for a
   connection registered with `allow_writes`.

## Credential hygiene

- Never paste a raw secret into a prompt or a committed file. Use a `{ "$env": "VAR_NAME" }` env
  reference in the `auth` object, or `url_env` for a database connection.
- The connect commit-guard hook warns once, then blocks, on a `git add`/`commit` of a known
  credential file — do not work around it; move the secret out of the tree.
- Removing a service (`service` `remove`) purges its stored credentials.
