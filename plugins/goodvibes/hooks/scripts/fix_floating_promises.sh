#!/bin/bash

# Fix notification.ts
sed -i 's/^runNotificationHook();$/runNotificationHook().catch((error: unknown) => {\n  logError('\''Notification uncaught'\'', error);\n  respond(createResponse(\`Notification error: \${error instanceof Error ? error.message : String(error)}\`));\n});/' src/notification.ts

# Fix permission-request.ts
sed -i 's/^runPermissionRequestHook();$/runPermissionRequestHook().catch((error: unknown) => {\n  logError('\''PermissionRequest uncaught'\'', error);\n  respond(createPermissionResponse('\''ask'\''));\n});/' src/permission-request.ts

# Fix stop.ts
sed -i 's/^runStopHook();$/runStopHook().catch((error: unknown) => {\n  logError('\''Stop uncaught'\'', error);\n  respond(createResponse({ systemMessage: \`Cleanup error: \${error instanceof Error ? error.message : String(error)}\` }));\n});/' src/stop.ts

# Fix session-start.ts
sed -i 's/^runSessionStartHook();$/runSessionStartHook().catch((error: unknown) => {\n  logError('\''SessionStart uncaught'\'', error);\n  respond(createResponse());\n});/' src/session-start.ts

# Fix session-end.ts
sed -i 's/^runSessionEndHook();$/runSessionEndHook().catch((error: unknown) => {\n  logError('\''SessionEnd uncaught'\'', error);\n  respond(createResponse());\n});/' src/session-end.ts

# Fix pre-compact.ts
sed -i 's/^runPreCompactHook();$/runPreCompactHook().catch((error: unknown) => {\n  logError('\''PreCompact uncaught'\'', error);\n  respond(createResponse());\n});/' src/pre-compact.ts
