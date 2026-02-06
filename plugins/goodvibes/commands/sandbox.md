---
description: Toggle precision-engine path sandboxing (allow/restrict external paths)
argument-hint: [true|false]
---

# Precision Engine Sandbox Control

Toggle path boundary enforcement for precision-engine tools. When sandbox is disabled (default), tools can access any path on the filesystem. When enabled, tools like `discover`, `precision_glob`, and `precision_grep` are restricted to the project root directory.

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

When disabled (default), precision-engine tools can access any path on the filesystem.
When enabled, tools are restricted to the project root.

Toggle with: /goodvibes:sandbox true
```

### `false` argument (disable sandbox)

1. Call the `precision_config` MCP tool with `{"action": "set", "key": "sandbox", "value": false}`
2. Confirm to the user:

```
Precision Engine Sandbox: DISABLED

Tools can now access paths outside the project root.
This setting is saved to .goodvibes/goodvibes.json and persists across sessions.

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
