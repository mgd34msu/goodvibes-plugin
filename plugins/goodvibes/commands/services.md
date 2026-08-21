---
description: Manage the connect service registry. Register API services and database connections, store credentials, set read-only vs write access, manage the destination allowlist, and report trust status
argument-hint: "[list|status|get|register|remove|set-auth|set-url-pattern|allow|unallow|register-connection|remove-connection] [name]"
allowed-tools:
  - mcp__connect__service
  - mcp__connect__api_request
  - mcp__connect__db_query
---

# Services (connect trust boundary)

Manage the registry that the connect server uses for authenticated HTTP and database access. All
registry operations go through the single `mcp__connect__service` tool; this command is a thin,
guided wrapper over its actions.

Trust invariants (enforced by the server, not this command):

- Credentials are pinned to their registered origin (protocol + host + port) and never sent
  elsewhere, even in open mode.
- The destination allowlist is on by default: registered service origins and explicitly
  allowlisted hosts only.
- Read-only by default: a service opts specific HTTP methods in via `write_methods`; a connection
  opts writes in via `allow_writes`.
- Open (unrestricted) mode is human-only and out-of-band. A person edits `.goodvibes/config.json`,
  and it is announced at session start. It reverts to restricted next session unless
  `dangerously_persist_across_sessions` is set. This command and the `service` tool cannot flip the
  trust mode.
- `set_auth` stores secrets at mode 0600 and never echoes them back; no action ever returns a secret
  value. `get` returns an auth STATUS, `list`/`status` return names and summaries only.

## Usage

```
/goodvibes:services                       # list registered services + connections + allowlist
/goodvibes:services status                # trust mode + persist flag + registered names + allowlist
/goodvibes:services list                  # registered service summaries and connection names
/goodvibes:services get <name>            # credential-free summary + auth status of one service
/goodvibes:services register <name>       # register an API service (guided)
/goodvibes:services remove <name>         # remove a service and purge its credentials
/goodvibes:services set-auth <name>       # store credentials for a service (0600, never echoed)
/goodvibes:services set-url-pattern <name>       # map an extra hostname to a registered service
/goodvibes:services allow <hostname>      # add a destination host to the allowlist
/goodvibes:services unallow <hostname>    # remove a host from the allowlist
/goodvibes:services register-connection <name>   # register a DB connection (Postgres/MySQL/SQLite)
/goodvibes:services remove-connection <name>     # remove a DB connection
```

## Instructions

Parse the subcommand and optional name from $ARGUMENTS. Map each to a single `mcp__connect__service`
call with the matching `action`, then present the credential-free result.

| Subcommand | `service` action | Notes |
|---|---|---|
| (none) / `list` | `list` | Service summaries, connection names, allowlist, mode. No secrets. |
| `status` | `status` | Reports `mode: restricted \| open`, `dangerously_persist_across_sessions`, the registered service and connection names, and the allowlist. (Per-service auth status comes from `get`, not here.) |
| `get <name>` | `get` | Credential-free summary of one service plus its auth STATUS. |
| `register <name>` | `register` | Pass `config.base_url` (required); optional `default_headers`, `auth_type`, `description`, `timeout_ms`, `rate_limit_rps`, and `write_methods` (the per-service write opt-in). Confirm the destination before registering. Pass `force: true` only to overwrite an existing service. |
| `remove <name>` | `remove` | Purges the service's stored credentials and URL patterns. |
| `set-auth <name>` | `set_auth` | Pass the `auth` object: one mode per service, carrying only that mode's fields. `{"type":"none"}`, `{"type":"bearer","token":...}`, `{"type":"basic","username":...,"password":...}`, `{"type":"api-key","header":...,"key":...}`, `{"type":"custom-headers","headers":{...}}`, `{"type":"oauth2","client_id":...,"token_url":...,"authorize_url":...,"scopes":[...]}`, or `{"type":"session","login_url":...,"login_body":{...},"token_path":...}`. Mixing two modes is rejected with the offending fields named. Prefer `{ "$env": "VAR_NAME" }` env references over literal secrets. Never print the value back. |
| `set-url-pattern <name>` | `set_url_pattern` | Requires `hostname` and `name`. Maps an extra hostname to this registered service, so a bare-`url` request to that host resolves to the service (and its origin-pinned credentials). |
| `allow <hostname>` | `allow` | Adds a destination host to the allowlist. |
| `unallow <hostname>` | `unallow` | Removes a host from the allowlist. |
| `register-connection <name>` | `register_connection` | Provide `connection.url` (for secret-free targets such as SQLite file paths) or `connection.url_env` (the name of an env var holding the full connection URL, preferred for networked DBs). Read-only unless `allow_writes: true`. |
| `remove-connection <name>` | `remove_connection` | Removes a registered DB connection. |

After a change, call `action: status` and show the resulting trust posture (mode + allowlist).
For an unknown subcommand, list the available ones above.

Once a service or connection is registered, use `mcp__connect__api_request` (HTTP) and
`mcp__connect__db_query` (SQL) to call it. In restricted mode `api_request` refuses any destination
that is neither a registered service origin nor an allowlisted host, `db_query` refuses a bare
`database_url`, and both refuse write methods without the matching opt-in.

An `api_request` entry may also carry a per-request `auth` override, applied to the headers when
the request is built: `{ "type": "none" }`, `{ "type": "bearer", "token": ... }`,
`{ "type": "basic", "username": ..., "password": ... }`,
`{ "type": "api-key", "header": ..., "key": ... }`, or
`{ "type": "custom-headers", "headers": {...} }`. It is caller-supplied, not origin-pinned. Use it
for one-off credentials on allowlisted URLs. When the entry names a registered service whose origin
matches the final URL, the stored service credential is applied after the override and wins on the
same header (usually `Authorization`), so registered credentials cannot be displaced by it.

## Arguments

$ARGUMENTS
