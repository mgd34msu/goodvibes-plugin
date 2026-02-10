---
description: Manage precision_fetch service registry (add, remove, test, auth)
argument-hint: <subcommand> [name] [options]
allowed-tools:
  - mcp__plugin_goodvibes_precision-engine__precision_config
  - mcp__plugin_goodvibes_precision-engine__precision_fetch
---

# Precision Fetch Service Registry

Manage authenticated service configurations for `precision_fetch`. Services provide base URLs, authentication strategies, and default headers for API requests.

## Usage

```
/goodvibes:services <subcommand> [name] [options]
```

## Subcommands

| Subcommand | Description |
|------------|-------------|
| `list` | List all registered services |
| `add <name>` | Add a new service configuration |
| `remove <name>` | Remove a service configuration |
| `show <name>` | Show detailed service configuration |
| `test <name>` | Test service connectivity |
| `auth <name>` | Trigger authentication flow |
| `refresh <name>` | Refresh OAuth2 tokens (handled automatically) |
| `set-secret <name>` | Set service credentials |
| `cookies [clear\|show] [domain]` | Manage cookie jar |

## Instructions

Parse the subcommand and arguments from $ARGUMENTS.

### `list` — List all registered services

1. Call `precision_config` to get service list:
   ```json
   {"action": "get", "key": "fetch.services"}
   ```

2. If the response is empty or null, display:
   ```
   No services registered.

   Add your first service: /goodvibes:services add <name>
   ```

3. Call `precision_config` to get auth status:
   ```json
   {"action": "get", "key": "fetch.auth_status"}
   ```

4. Format as a table:

```
Registered Services
===================

| Service Name | Base URL | Auth Type | Status |
|--------------|----------|-----------|--------|
| github       | https://api.github.com | oauth2 | ✓ Authenticated |
| confluence   | https://company.atlassian.net | session | ✓ Active |
| internal-api | https://api.internal.com | bearer | ✓ Configured |

Total: {count} services

Add a service: /goodvibes:services add <name>
Show details: /goodvibes:services show <name>
```

### `add <name>` — Add a new service

Parse `<name>` from $ARGUMENTS.

1. Prompt the user for required information:
   - **Base URL**: Service API base URL (e.g., `https://api.github.com`)
   - **Auth Type**: `bearer`, `basic`, `api-key`, `oauth2`, `session`, `custom-headers`, or `none`
   - **Default Headers** (optional): JSON object of headers to include in all requests

2. Based on auth type, collect additional configuration:

   **For `bearer`:**
   - No additional configuration needed (credentials set via `/goodvibes:services set-secret <name>`)

   **For `basic`:**
   - No additional configuration needed (credentials set via `/goodvibes:services set-secret <name>`)

   **For `api-key`:**
   - Header name (e.g., `X-API-Key`, `Authorization`)
   - Instructions to set secret via `/goodvibes:services set-secret <name>`

   **For `oauth2`:**
   - Client ID (non-secret, stored in config)
   - Client Secret (secret, stored in `.goodvibes/goodvibes.secrets.json`)
   - Auth URL (non-secret)
   - Token URL (non-secret)
   - Scopes (space-separated)
   - Redirect URI (default: `http://localhost:3000/oauth/callback`)

   **For `session`:**
   - Login URL
   - Login credentials format (what fields the login endpoint expects)
   - Instructions for browser authentication

   **For `custom-headers`:**
   - Header names that will be used for authentication
   - Instructions to set secret via `/goodvibes:services set-secret <name>`

   **For `none`:**
   - No additional configuration needed

3. Call `precision_config` to save the service configuration (non-secret data only):

   **For `none`, `bearer`, or `basic` auth:**
   ```json
   {
     "action": "set",
     "key": "fetch.services.<name>",
     "value": {
       "base_url": "<base_url>",
       "auth_type": "<auth_type>",
       "default_headers": {}
     }
   }
   ```

   **For `api-key` or `oauth2` auth:**
   ```json
   {
     "action": "set",
     "key": "fetch.services.<name>",
     "value": {
       "base_url": "<base_url>",
       "auth_type": "<auth_type>",
       "default_headers": {}
     }
   }
   ```
   
   Note: Auth-specific fields (API key header name, OAuth2 client secret, etc.) are configured via `/goodvibes:services set-secret <name>`.

   **For `custom-headers` auth:**
   ```json
   {
     "action": "set",
     "key": "fetch.services.<name>",
     "value": {
       "base_url": "<base_url>",
       "auth_type": "custom-headers",
       "default_headers": {}
     }
   }
   ```

   **For `session` auth:**
   ```json
   {
     "action": "set",
     "key": "fetch.services.<name>",
     "value": {
       "base_url": "<base_url>",
       "auth_type": "session",
       "default_headers": {}
     }
   }
   ```

4. Confirm to the user:
```
Service '{name}' added successfully!

Base URL: {base_url}
Auth Type: {auth_type}

Next steps:
  - Set credentials: /goodvibes:services set-secret {name} (if auth requires secrets)
  - Test connection: /goodvibes:services test {name}
  - Authenticate: /goodvibes:services auth {name} (for oauth2/session)
```

### `remove <name>` — Remove a service

Parse `<name>` from $ARGUMENTS.

1. Confirm the service exists by calling:
   ```json
   {"action": "get", "key": "fetch.services.<name>"}
   ```

2. If it doesn't exist, inform the user:
   ```
   Service '{name}' not found.

   List services: /goodvibes:services list
   ```

3. Remove the service using read-modify-write pattern:
   - Get the full fetch section: `{"action": "get", "key": "fetch"}`
   - Remove the service entry from `services.<name>`
   - Write back the modified fetch section: `{"action": "set", "key": "fetch", "value": {...}}`

4. Remove secrets using `precision_write`:
   - Read `.goodvibes/goodvibes.secrets.json`
   - Delete the `services.<name>` entry
   - Write back the modified secrets file

5. Confirm to the user:
```
Service '{name}' removed successfully.

Note: Credentials have been removed from .goodvibes/goodvibes.secrets.json
```

### `show <name>` — Show service details

Parse `<name>` from $ARGUMENTS.

1. Call `precision_config` to get service configuration:
   ```json
   {"action": "get", "key": "fetch.services.<name>"}
   ```

2. Call `precision_config` to get auth status:
   ```json
   {"action": "get", "key": "fetch.auth_status"}
   ```
   Extract the status for `<name>` from the returned status map.

3. Display full configuration. **IMPORTANT**: Show `client_id`, `auth_url`, `token_url` as they are non-secret configuration values. Display actual secrets (client_secret, tokens, passwords, API keys) as `[REDACTED]`.

```
Service: {name}
================

Base URL: {base_url}
Auth Type: {auth_type}
Status: {status}

Default Headers:
  {header}: {value}
  ...

OAuth2 Configuration (if auth_type is oauth2):
  Client ID: {client_id}
  Client Secret: [REDACTED]
  Auth URL: {auth_url}
  Token URL: {token_url}
  Scopes: {scopes}
  Redirect URI: {redirect_uri}
  Access Token: [REDACTED]
  Refresh Token: [REDACTED]

URL Patterns:
  {pattern} → {name}
  ...

Actions:
  Test: /goodvibes:services test {name}
  Authenticate: /goodvibes:services auth {name}
  Remove: /goodvibes:services remove {name}
```

### `test <name>` — Test service connectivity

Parse `<name>` from $ARGUMENTS.

1. Call `precision_fetch` to make a test request:
   ```json
   {
     "url": "{base_url}/",
     "method": "HEAD",
     "service": "<name>",
     "timeout": 5000
   }
   ```

   If HEAD fails, try GET with the base URL.

2. Report results:

```
Testing service '{name}'...

✓ Connection successful
  Status: {status_code}
  Response Time: {time_ms}ms
  Auth Status: {authenticated ? "Authenticated" : "Not authenticated"}

Service is ready to use.
```

Or on failure:
```
✗ Connection failed
  Error: {error_message}

Troubleshooting:
  - Check base URL: {base_url}
  - Verify authentication: /goodvibes:services auth {name}
  - Check credentials: /goodvibes:services set-secret {name}
```

### `auth <name>` — Trigger authentication

Parse `<name>` from $ARGUMENTS.

1. Get service config to determine auth type:
   ```json
   {"action": "get", "key": "fetch.services.<name>"}
   ```

2. Check current auth status:
   ```json
   {"action": "get", "key": "fetch.auth_status"}
   ```
   Extract the status for `<name>` from the returned status map.

3. Based on auth type:

   **For `oauth2`:**
   - Check if status is `needs_browser_auth`
   - If yes, inform the user:
     ```
     OAuth2 browser authentication required for '{name}'.

     Browser-based OAuth2 flows are not yet automated via slash command.
     Please use precision_fetch directly with the service, which will handle
     the OAuth2 flow automatically when authentication is needed.

     The flow will:
     1. Open your default browser
     2. Navigate to the authorization URL
     3. Capture the authorization code
     4. Exchange it for access/refresh tokens
     5. Store tokens securely in .goodvibes/goodvibes.secrets.json

     Test after setup: /goodvibes:services test {name}
     ```
   - If already authenticated, display: `Service '{name}' is already authenticated.`

   **For `session`:**
   - Use `precision_fetch` to POST credentials to the login URL:
     ```json
     {
       "url": "{login_url}",
       "method": "POST",
       "service": "<name>",
       "body": {
         "username": "{username}",
         "password": "{password}"
       }
     }
     ```
   - Display: `Authenticating with {login_url}...`
   - Cookies will be captured automatically and stored

   **For `bearer`, `basic`, `api-key`, or `custom-headers`:**
   - Display: `{auth_type} auth requires credentials to be set manually`
   - Instruct: `/goodvibes:services set-secret {name}`

   **For `none`:**
   - Display: `This service does not require authentication`

### `refresh <name>` — Refresh OAuth2 tokens

Parse `<name>` from $ARGUMENTS.

**NOTE**: Token refresh is handled automatically by `precision_fetch` when it detects expired tokens. This subcommand is for manual refresh or checking status.

1. Verify service uses OAuth2 by calling `precision_config`:
   ```json
   {"action": "get", "key": "fetch.services.<name>"}
   ```

2. If not OAuth2:
   ```
   Service '{name}' does not use OAuth2 authentication.
   Current auth type: {auth_type}
   ```

3. Check auth status by calling `precision_config`:
   ```json
   {"action": "get", "key": "fetch.auth_status"}
   ```
   Extract the status for `<name>` from the returned status map.

4. Inform the user:
```
OAuth2 token refresh for '{name}':

Current status: {status}
Token expiry: {expiry_time}

Note: precision_fetch automatically refreshes tokens when needed.
Simply make a request with the service, and tokens will be refreshed
if they are expired or about to expire.

Example:
Call precision_fetch with:
{
  "url": "{base_url}/endpoint",
  "service": "{name}"
}

The tool will automatically:
1. Detect expired tokens
2. Use the refresh token to get new access tokens
3. Update stored tokens in .goodvibes/goodvibes.secrets.json
4. Retry the original request with the new token
```

### `set-secret <name>` — Set service credentials

Parse `<name>` from $ARGUMENTS.

1. Get service config to determine auth requirements by calling `precision_config`:
   ```json
   {"action": "get", "key": "fetch.services.<name>"}
   ```

2. Based on auth type, prompt for appropriate credentials:

   **Note:** The examples below show the ServiceAuth object to place at `services.<name>` in the secrets file. Read the existing `.goodvibes/goodvibes.secrets.json` file, add or update the entry at `services.<name>` with this object, then write back. Preserve existing service entries.

   **For `bearer`:**
   - Prompt: "Enter bearer token (API key, JWT, etc.):"
   - Collect the token from the user
   - Write to secrets file:
     ```json
     {
       "services": {
         "<name>": {
           "type": "bearer",
           "token": "<user_input>"
         }
       },
       "global": {}
     }
     ```

   **For `basic`:**
   - Prompt: "Enter username:" and "Enter password:"
   - Collect both values from the user
   - Write to secrets file:
     ```json
     {
       "services": {
         "<name>": {
           "type": "basic",
           "username": "<user_input_username>",
           "password": "<user_input_password>"
         }
       },
       "global": {}
     }
     ```

   **For `api-key`:**
   - Prompt: "Enter header name (e.g., X-API-Key, Authorization):" and "Enter API key:"
   - Collect the header name and key from the user
   - Write to secrets file:
     ```json
     {
       "services": {
         "<name>": {
           "type": "api-key",
           "header": "<user_input_header>",
           "key": "<user_input_key>"
         }
       },
       "global": {}
     }
     ```

   **For `custom-headers`:**
   - Prompt: "Enter header names (comma-separated, e.g., X-Custom-Auth,X-Request-ID):"
   - For each header name, prompt: "Enter value for {header_name}:"
   - Collect all header values from the user
   - Write to secrets file:
     ```json
     {
       "services": {
         "<name>": {
           "type": "custom-headers",
           "headers": {
             "<header_name_1>": "<user_input_1>",
             "<header_name_2>": "<user_input_2>"
           }
         }
       },
       "global": {}
     }
     ```

   **For `oauth2`:**
   - Prompt: "Enter client secret:"
   - Collect the client secret from the user
   - Get client_id, auth_url, token_url, scopes, redirect_uri from service config
   - Write to secrets file:
     ```json
     {
       "services": {
         "<name>": {
           "type": "oauth2",
           "client_id": "<from_config>",
           "client_secret": "<user_input>",
           "token_url": "<from_config>",
           "authorize_url": "<from_config>",
           "redirect_uri": "<from_config>",
           "scopes": ["<from_config>"]
         }
       },
       "global": {}
     }
     ```
     
     Note: While ServiceAuth supports both config fields (client_id, token_url, etc.) and secrets (client_secret), the non-secret OAuth2 config can optionally be stored in the config file instead. The secrets file is the single source of truth when both exist.

   **For `session`:**
   - Prompt: "Enter username:" and "Enter password:"
   - Optionally prompt: "Enter token path (e.g., 'data.access_token') or leave blank:"
   - Get login_url from service config
   - Write to secrets file:
     ```json
     {
       "services": {
         "<name>": {
           "type": "session",
           "login_url": "<from_config>",
           "login_body": {
             "username": "<user_input_username>",
             "password": "<user_input_password>"
           },
           "token_path": "data.access_token"
         }
       },
       "global": {}
     }
     ```
     
     Note: `token_path` is optional and specifies where in a JSON response body to find a session token (e.g., "data.access_token"). Omit if the session uses cookies only.

   **For `none`:**
   - Display: "This service does not require credentials."
   - No action needed

3. Write credentials to `.goodvibes/goodvibes.secrets.json`:
   - Read existing file (create `{"services": {}, "global": {}}` if doesn't exist)
   - Add or update the key at `services.<name>` with the full ServiceAuth object
   - Write back to file

4. Confirm:
```
Credentials saved for service '{name}'.

Credentials are stored in:
  .goodvibes/goodvibes.secrets.json (never committed to git)

Note: Secret values can use environment variable references:
  { "$env": "MY_API_KEY" } instead of literal values

Test connection: /goodvibes:services test {name}
```

**Security reminder:**
- Never display secrets in output
- Confirm `.goodvibes/goodvibes.secrets.json` is in `.gitignore`
- Use `[REDACTED]` when showing config with secrets
- Mention `$env` reference support for environment variables

### `cookies` — Manage cookie jar

Parse subcommand and optional domain from $ARGUMENTS.

#### `cookies show` — Display stored cookies

1. Call `precision_config` to get cookies:
   ```json
   {"action": "get", "key": "fetch.cookies"}
   ```

2. Group cookies by domain and display:

```
Stored Cookies
==============

github.com (3 cookies):
  - user_session (expires: {date})
  - logged_in (expires: {date})
  - __Host-user_id (expires: {date})

atlassian.net (2 cookies):
  - cloud.session.token (expires: {date})
  - tenant.session.token (expires: {date})

Total: {count} cookies across {domain_count} domains

Clear cookies: /goodvibes:services cookies clear [domain]
```

#### `cookies clear [domain]` — Clear cookies

If domain is specified:
1. Clear cookies for that domain only using read-modify-write pattern:
   - Get fetch.cookies: `{"action": "get", "key": "fetch.cookies"}`
   - Remove the domain entry from the cookies object
   - Write back: `{"action": "set", "key": "fetch.cookies", "value": {...}}`
2. Confirm: `Cleared {count} cookies for {domain}`

If no domain specified:
1. Clear all cookies:
   - Set to empty object: `{"action": "set", "key": "fetch.cookies", "value": {}}`
2. Confirm: `Cleared all cookies ({count} total)`

### Unknown subcommand

If the subcommand is not recognized:

```
Unknown subcommand: {subcommand}

Available subcommands:
  list                - List all registered services
  add <name>          - Add a new service
  remove <name>       - Remove a service
  show <name>         - Show service details
  test <name>         - Test service connectivity
  auth <name>         - Trigger authentication
  refresh <name>      - Check token status (auto-refresh handled by precision_fetch)
  set-secret <name>   - Set service credentials
  cookies [show|clear] [domain] - Manage cookie jar

Examples:
  /goodvibes:services list
  /goodvibes:services add github
  /goodvibes:services test github
  /goodvibes:services auth github
```

## Storage Locations

- **Service registry**: `.goodvibes/goodvibes.json` under `fetch.services`
- **Credentials/Secrets**: `.goodvibes/goodvibes.secrets.json` under `services.<name>` (NO `fetch` prefix)
- **Cookies**: `.goodvibes/goodvibes.json` under `fetch.cookies`
- **Auth status**: `.goodvibes/goodvibes.json` under `fetch.auth_status`

**Note:** `goodvibes.secrets.json` is automatically added to `.gitignore` and should never be committed.

**Storage Path Rules:**
- Non-secret config (base_url, client_id, auth_url, token_url, etc.) goes to `goodvibes.json`
- Secret data (api_key, client_secret, tokens, passwords) goes to `goodvibes.secrets.json`
- Secrets support environment variable references: `{ "$env": "VAR_NAME" }` instead of literal values
- Secrets file has two top-level keys: `services` (per-service auth) and `global` (shared secrets)

## Arguments

$ARGUMENTS
