# Fly.io Configuration Reference

## fly.toml Complete Structure

```toml
# App name (must be unique on Fly.io)
app = "my-app"

# Primary region for new machines
primary_region = "ord"

# Kill signal
kill_signal = "SIGINT"

# Kill timeout
kill_timeout = "5s"

# Console command for `fly ssh console`
console_command = "/bin/bash"

# Build configuration
[build]
  # Use Dockerfile
  dockerfile = "Dockerfile"

  # Or specify builder image
  # builder = "paketobuildpacks/builder:base"

  # Build target (multi-stage)
  target = "production"

  # Build arguments
  [build.args]
    NODE_ENV = "production"

# Environment variables
[env]
  NODE_ENV = "production"
  LOG_LEVEL = "info"

# HTTP service configuration
[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1
  max_machines_running = 10

  # Concurrency limits
  [http_service.concurrency]
    type = "requests"  # or "connections"
    hard_limit = 250
    soft_limit = 200

  # Health checks
  [[http_service.checks]]
    grace_period = "5s"
    interval = "10s"
    timeout = "2s"
    path = "/health"
    method = "GET"
    protocol = "http"

  # TLS options
  [http_service.tls_options]
    alpn = ["h2", "http/1.1"]
    versions = ["TLSv1.2", "TLSv1.3"]

# TCP services (non-HTTP)
[[services]]
  protocol = "tcp"
  internal_port = 5432

  [[services.ports]]
    port = 5432
    handlers = ["pg_tls"]

  [[services.tcp_checks]]
    grace_period = "10s"
    interval = "10s"
    timeout = "2s"

# Processes (multi-process apps)
[processes]
  web = "node dist/server.js"
  worker = "node dist/worker.js"
  cron = "node dist/cron.js"

# VM configuration
[[vm]]
  memory = "256mb"  # 256mb, 512mb, 1gb, 2gb, 4gb, 8gb
  cpu_kind = "shared"  # shared, performance
  cpus = 1

# Mounts (persistent storage)
[mounts]
  source = "mydata"
  destination = "/data"

# Deploy configuration
[deploy]
  strategy = "rolling"  # rolling, immediate, canary, bluegreen
  max_unavailable = 0.25

# Experimental features
[experimental]
  auto_rollback = true
```

## Build Options

### Dockerfile Build

```toml
[build]
  dockerfile = "Dockerfile"
  target = "production"
  ignorefile = ".dockerignore"

  [build.args]
    NODE_ENV = "production"
    NEXT_PUBLIC_API = "https://api.example.com"
```

### Buildpack Build

```toml
[build]
  builder = "paketobuildpacks/builder:base"

  [build.buildpacks]
    name = "paketo-buildpacks/nodejs"
```

### Remote Build

```bash
# Build remotely (default)
fly deploy

# Build locally
fly deploy --local-only

# Remote build with specific machine
fly deploy --remote-only
```

## HTTP Service Options

### Concurrency

```toml
[http_service.concurrency]
  type = "requests"     # Count requests
  # type = "connections"  # Count connections

  soft_limit = 100      # Start scaling
  hard_limit = 250      # Reject after this
```

### Auto-scaling

```toml
[http_service]
  auto_stop_machines = true   # Stop when idle
  auto_start_machines = true  # Start on request
  min_machines_running = 1    # Always keep 1 running
  max_machines_running = 10   # Max machines
```

### Headers

```toml
[http_service]
  [http_service.http_options]
    response = { headers = { "x-custom" = "value" } }
```

## Health Checks

### HTTP Check

```toml
[[http_service.checks]]
  grace_period = "10s"   # Wait after start
  interval = "15s"       # Check frequency
  timeout = "5s"         # Timeout per check
  path = "/health"
  method = "GET"
  protocol = "http"
  tls_skip_verify = false
```

### TCP Check

```toml
[[services.tcp_checks]]
  grace_period = "10s"
  interval = "15s"
  timeout = "5s"
```

## Processes

### Multiple Processes

```toml
[processes]
  web = "node dist/server.js"
  worker = "node dist/worker.js"

# Assign HTTP service to process
[http_service]
  processes = ["web"]
  internal_port = 3000

# Worker service (no HTTP)
[[services]]
  processes = ["worker"]
  internal_port = 0
```

### Process-Specific VMs

```toml
[[vm]]
  processes = ["web"]
  memory = "256mb"
  cpus = 1

[[vm]]
  processes = ["worker"]
  memory = "512mb"
  cpus = 2
```

## VM Sizes

| Size | Memory | CPU | Type |
|------|--------|-----|------|
| `shared-cpu-1x` | 256MB | 1 shared | Default |
| `shared-cpu-2x` | 512MB | 2 shared | |
| `shared-cpu-4x` | 1GB | 4 shared | |
| `dedicated-cpu-1x` | 2GB | 1 dedicated | |
| `dedicated-cpu-2x` | 4GB | 2 dedicated | |
| `dedicated-cpu-4x` | 8GB | 4 dedicated | |
| `dedicated-cpu-8x` | 16GB | 8 dedicated | |

```toml
[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

## Mounts

### Persistent Volumes

```bash
# Create volume first
fly volumes create mydata --size 1 --region ord
```

```toml
[mounts]
  source = "mydata"
  destination = "/data"
  initial_size = "1gb"
```

### LiteFS

```toml
[mounts]
  source = "litefs"
  destination = "/var/lib/litefs"
```

## Statics (File Serving)

```toml
[[statics]]
  guest_path = "/app/public"
  url_prefix = "/static"
```

## Deploy Strategies

### Rolling (Default)

```toml
[deploy]
  strategy = "rolling"
  max_unavailable = 0.25  # 25% can be down
```

### Immediate

```toml
[deploy]
  strategy = "immediate"  # All at once
```

### Canary

```toml
[deploy]
  strategy = "canary"  # Deploy one, verify, then rest
```

### Blue-Green

```toml
[deploy]
  strategy = "bluegreen"  # New alongside old
```

## Regions

```bash
# Available regions
ams  # Amsterdam
cdg  # Paris
dfw  # Dallas
ewr  # New Jersey
fra  # Frankfurt
gru  # Sao Paulo
hkg  # Hong Kong
iad  # Virginia
lax  # Los Angeles
lhr  # London
maa  # Chennai
mad  # Madrid
mia  # Miami
nrt  # Tokyo
ord  # Chicago
otp  # Bucharest
scl  # Santiago
sea  # Seattle
sin  # Singapore
sjc  # San Jose
syd  # Sydney
yul  # Montreal
yyz  # Toronto
```

## Secrets Management

```bash
# Set secrets
fly secrets set \
  DATABASE_URL="postgres://..." \
  API_KEY="secret" \
  JWT_SECRET="..."

# Import from file
fly secrets import < secrets.env

# List (names only)
fly secrets list

# Unset
fly secrets unset API_KEY
```

## Postgres Configuration

```bash
# Create cluster
fly postgres create \
  --name my-pg \
  --region ord \
  --vm-size shared-cpu-1x \
  --volume-size 10

# Attach to app
fly postgres attach my-pg -a my-app

# Connection string is auto-set as DATABASE_URL
```

## Metrics & Logging

```bash
# Stream logs
fly logs

# Recent logs
fly logs --app my-app

# Specific instance
fly logs --instance <id>

# Open metrics dashboard
fly dashboard
```
