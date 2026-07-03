---
description: Manage the connect service registry — register API services and database connections, store credentials, set read-only vs write access, toggle the destination allowlist, and report trust status
argument-hint: "[list|status|register|remove|set-auth|allow|unallow|register-connection|remove-connection] [name]"
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

- Credentials are pinned to their registered origin and never sent elsewhere.
- The destination allowlist is on by default — registered services and explicitly allowlisted
  hosts only.
- Read-only by default per service / connection; write methods are an explicit opt-in.
- Open (unrestricted) mode is human-only and out-of-band — a config-file edit, announced at
  session start. This command and the `service` tool cannot flip the trust mode.
- `set_auth` stores secrets at mode 0600 and never echoes them back; `get`/`list` return only an
  auth STATUS, never a secret value.

## Usage

```
/goodvibes:services                       # list registered services + trust status
/goodvibes:services status                # trust mode + allowlist + per-service auth status
/goodvibes:services list                  # registered service and connection names
/goodvibes:services register <name>       # register an API service (guided)
/goodvibes:services remove <name>         # remove a service and purge its credentials
/goodvibes:services set-auth <name>       # store credentials for a service (0600, never echoed)
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
| (none) / `list` | `list` | Summaries only — no secrets. |
| `status` | `status` | Reports `mode: restricted \| open`, the allowlist, and per-service auth status. |
| `get <name>` | `get` | Credential-free summary of one service. |
| `register <name>` | `register` | Pass the service `config` (base_url, url patterns, allowed methods). Confirm the destination before registering. |
| `remove <name>` | `remove` | Purges stored credentials for the service. |
| `set-auth <name>` | `set_auth` | Prefer `{$ENV_VAR}` indirection over literal secrets. Never print the value back. |
| `set-url-pattern <name>` | `set_url_pattern` | Restrict which paths/hosts a service may reach. |
| `allow <hostname>` | `allow` | Adds a destination host to the allowlist. |
| `unallow <hostname>` | `unallow` | Removes a host from the allowlist. |
| `register-connection <name>` | `register_connection` | Register a Postgres/MySQL/SQLite connection for `db_query`. Read-only unless `allow_writes` is set. |
| `remove-connection <name>` | `remove_connection` | Removes a registered DB connection. |

After a change, call `action: status` and show the resulting trust posture (mode + allowlist).
For an unknown subcommand, list the available ones above.

Once a service or connection is registered, use `mcp__connect__api_request` (HTTP) and
`mcp__connect__db_query` (SQL) to call it. Both refuse unregistered destinations in restricted mode
and require an explicit opt-in for write methods.

## Arguments

$ARGUMENTS
