---
description: Toggle precision-engine path sandboxing (allow/restrict external paths)
argument-hint: [true|false]
---

# Precision Engine Sandbox Control

Toggle path boundary enforcement for precision-engine tools. When sandbox is enabled (default), tools like `discover`, `precision_glob`, and `precision_grep` are restricted to the project root directory. When disabled, they can access any path on the filesystem.

## Usage

```
/goodvibes:sandbox          # Show current sandbox status
/goodvibes:sandbox false    # Disable sandbox (allow external paths)
/goodvibes:sandbox true     # Enable sandbox (restrict to project root)
```

## Instructions

Parse the argument from $ARGUMENTS.

### No argument (show status)

If $ARGUMENTS is empty or not provided:

1. Call the `precision_config` MCP tool with `{"action": "get", "key": "sandbox"}`
2. Display the result:

```
Precision Engine Sandbox: {ENABLED|DISABLED}

When enabled (default), precision-engine tools are restricted to the project root.
When disabled, tools can read/write/search any accessible path on the filesystem.

Toggle with: /goodvibes:sandbox false
```

### `false` argument (disable sandbox)

1. Call the `precision_config` MCP tool with `{"action": "set", "key": "sandbox", "value": false}`
2. Confirm to the user:

```
Precision Engine Sandbox: DISABLED

Tools can now access paths outside the project root.
This setting persists for the current session and is saved to config.

Re-enable with: /goodvibes:sandbox true
```

### `true` argument (enable sandbox)

1. Call the `precision_config` MCP tool with `{"action": "set", "key": "sandbox", "value": true}`
2. Confirm to the user:

```
Precision Engine Sandbox: ENABLED

Tools are restricted to the project root directory.

Disable with: /goodvibes:sandbox false
```

### Invalid argument

If the argument is anything other than empty, "true", or "false":

```
Invalid argument: {argument}

Usage:
  /goodvibes:sandbox          Show current status
  /goodvibes:sandbox false    Disable sandbox (allow external paths)
  /goodvibes:sandbox true     Enable sandbox (restrict to project root)
```

## Arguments

$ARGUMENTS
