# Operational Runbook Patterns

Templates and patterns for creating operational runbooks.

## Standard Runbook Structure

```markdown
# {Service Name} Runbook

## Metadata
- **Version:** 1.0
- **Last Updated:** {date}
- **Owner:** {team}
- **Review Cycle:** Quarterly

## Table of Contents
1. [Service Overview](#service-overview)
2. [Architecture](#architecture)
3. [Dependencies](#dependencies)
4. [Deployment](#deployment)
5. [Monitoring](#monitoring)
6. [Incident Response](#incident-response)
7. [Common Issues](#common-issues)
8. [Maintenance](#maintenance)
```

---

## Service Overview Template

```markdown
## Service Overview

### Purpose
{What does this service do? What business problem does it solve?}

### SLOs (Service Level Objectives)
| Metric | Target | Measurement |
|--------|--------|-------------|
| Availability | 99.9% | Uptime over 30 days |
| Latency (p99) | < 200ms | Request duration |
| Error Rate | < 0.1% | 5xx responses / total |

### Team
| Role | Person | Contact |
|------|--------|---------|
| Primary Owner | {name} | {email/slack} |
| Secondary Owner | {name} | {email/slack} |
| On-call Rotation | {team} | {pagerduty link} |

### Resources
- Repository: {git repo URL}
- Documentation: {wiki/docs URL}
- Dashboard: {monitoring URL}
- Runbook: {this document URL}
```

---

## Architecture Template

```markdown
## Architecture

### System Diagram
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Load       │────▶│   Service    │────▶│   Database   │
│   Balancer   │     │   (3 pods)   │     │   (Primary)  │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────▼───────┐
                     │    Redis     │
                     │   (Cache)    │
                     └──────────────┘
```

### Components
| Component | Technology | Purpose |
|-----------|------------|---------|
| API Server | Node.js 20 | REST API endpoints |
| Database | PostgreSQL 15 | Data persistence |
| Cache | Redis 7 | Session storage, rate limiting |
| Queue | RabbitMQ | Async job processing |

### Infrastructure
| Resource | Type | Region | Purpose |
|----------|------|--------|---------|
| EKS Cluster | t3.medium x3 | us-east-1 | Application hosting |
| RDS | db.r6g.large | us-east-1 | Primary database |
| ElastiCache | cache.r6g.large | us-east-1 | Redis cache |

### Data Flow
1. Request arrives at load balancer
2. Routed to healthy service pod
3. Service checks Redis cache
4. If cache miss, queries PostgreSQL
5. Result returned and cached
```

---

## Dependencies Template

```markdown
## Dependencies

### Upstream (We depend on)
| Service | Protocol | Criticality | Fallback |
|---------|----------|-------------|----------|
| Auth Service | gRPC | Critical | None |
| Payment API | HTTPS | Critical | Queue for retry |
| Email Service | HTTPS | High | Queue for retry |
| Analytics | HTTPS | Low | Fire and forget |

### Downstream (Depends on us)
| Service | Protocol | Impact if we're down |
|---------|----------|---------------------|
| Web Frontend | HTTPS | User-facing errors |
| Mobile App | HTTPS | App functionality degraded |
| Reporting | HTTPS | Reports delayed |

### External Services
| Service | Purpose | Status Page |
|---------|---------|-------------|
| Stripe | Payments | status.stripe.com |
| SendGrid | Email | status.sendgrid.com |
| AWS | Infrastructure | status.aws.amazon.com |
```

---

## Deployment Template

```markdown
## Deployment

### Prerequisites
- [ ] Access to Kubernetes cluster
- [ ] AWS credentials configured
- [ ] VPN connected

### Environments
| Environment | URL | Kubernetes Namespace |
|-------------|-----|---------------------|
| Development | dev.example.com | dev |
| Staging | staging.example.com | staging |
| Production | api.example.com | production |

### Standard Deployment

1. **Verify changes are ready:**
   ```bash
   git checkout main
   git pull origin main
   git log --oneline -5  # Review recent commits
   ```

2. **Deploy to staging:**
   ```bash
   kubectl config use-context staging
   kubectl apply -k k8s/overlays/staging/
   kubectl rollout status deployment/api-server -n staging
   ```

3. **Verify staging:**
   - [ ] Health endpoint returns 200
   - [ ] Smoke tests pass
   - [ ] No errors in logs

4. **Deploy to production:**
   ```bash
   kubectl config use-context production
   kubectl apply -k k8s/overlays/production/
   kubectl rollout status deployment/api-server -n production
   ```

5. **Verify production:**
   - [ ] Health endpoint returns 200
   - [ ] Metrics look normal
   - [ ] No increase in error rate

### Rollback Procedure

**Automatic rollback (if health checks fail):**
Kubernetes will automatically rollback if readiness probes fail.

**Manual rollback:**
```bash
# View rollout history
kubectl rollout history deployment/api-server -n production

# Rollback to previous version
kubectl rollout undo deployment/api-server -n production

# Rollback to specific revision
kubectl rollout undo deployment/api-server -n production --to-revision=3
```

### Database Migrations

**Forward migration:**
```bash
# Run in production pod
kubectl exec -it deployment/api-server -n production -- npm run db:migrate
```

**Rollback migration:**
```bash
# CAUTION: Data loss possible
kubectl exec -it deployment/api-server -n production -- npm run db:migrate:undo
```
```

---

## Monitoring Template

```markdown
## Monitoring

### Dashboards
| Dashboard | Purpose | URL |
|-----------|---------|-----|
| Service Overview | High-level health | [Grafana](#) |
| API Latency | Request performance | [Grafana](#) |
| Error Tracking | Application errors | [Sentry](#) |
| Infrastructure | Resource usage | [CloudWatch](#) |

### Key Metrics
| Metric | Query/Source | Normal Range | Alert Threshold |
|--------|--------------|--------------|-----------------|
| Request Rate | `rate(http_requests_total[5m])` | 100-500/s | > 1000/s |
| Error Rate | `rate(http_errors_total[5m])` | < 0.1% | > 1% |
| Latency p99 | `histogram_quantile(0.99, ...)` | < 200ms | > 500ms |
| CPU Usage | CloudWatch | < 60% | > 80% |
| Memory Usage | CloudWatch | < 70% | > 85% |
| DB Connections | `pg_stat_activity` | < 50 | > 80 |

### Alerts

| Alert | Severity | Response Time | Runbook Section |
|-------|----------|---------------|-----------------|
| High Error Rate | P1 | 5 min | [#high-error-rate] |
| High Latency | P2 | 15 min | [#high-latency] |
| Pod Crash Loop | P1 | 5 min | [#pod-crashes] |
| Database Connection Exhausted | P1 | 5 min | [#db-connections] |

### Log Queries

**Find errors:**
```
{service="api-server"} |= "error" | json
```

**Slow requests:**
```
{service="api-server"} | json | duration > 1s
```

**Specific user:**
```
{service="api-server"} | json | user_id = "12345"
```
```

---

## Incident Response Template

```markdown
## Incident Response

### Severity Levels

| Level | Description | Response Time | Escalation |
|-------|-------------|---------------|------------|
| P1 | Service completely down | 15 min | Immediate page |
| P2 | Partial outage, degraded | 30 min | Page on-call |
| P3 | Minor impact, workaround exists | 4 hours | Ticket |
| P4 | No immediate impact | Next business day | Ticket |

### Initial Response Checklist

1. **Acknowledge the alert** (PagerDuty/OpsGenie)

2. **Assess impact:**
   - [ ] Which customers/users affected?
   - [ ] What functionality is impacted?
   - [ ] What is the error rate/latency increase?

3. **Create incident channel:** `#incident-{date}-{brief-description}`

4. **Post initial update:**
   ```
   INVESTIGATING: {Brief description}
   Impact: {Who is affected}
   Status: Investigating root cause
   Next update: {time}
   ```

5. **Begin investigation** (see Common Issues below)

6. **Post updates every 15 minutes**

### Escalation Path

```
On-call Engineer
      ↓
Team Lead (if unresolved in 30 min)
      ↓
Engineering Manager (if P1 for > 1 hour)
      ↓
VP Engineering (if P1 for > 2 hours)
```

### Post-Incident

1. Write incident summary within 24 hours
2. Schedule blameless post-mortem within 3 days
3. Create action items with owners and due dates
4. Update runbook with new learnings
```

---

## Common Issues Template

```markdown
## Common Issues

### High Error Rate

**Symptoms:**
- Alert: "Error rate > 1%"
- Users reporting errors

**Possible Causes:**
1. Deployment introduced bug
2. Downstream service failure
3. Database issues
4. Resource exhaustion

**Investigation Steps:**
```bash
# Check recent deployments
kubectl rollout history deployment/api-server -n production

# Check error logs
kubectl logs -l app=api-server -n production --since=10m | grep -i error

# Check downstream services
curl -s http://auth-service/health
curl -s http://db-service/health
```

**Resolution:**
- If deployment issue: Rollback
- If downstream issue: Check dependency status
- If database issue: See Database Issues section

---

### High Latency

**Symptoms:**
- Alert: "P99 latency > 500ms"
- Slow API responses

**Possible Causes:**
1. Slow database queries
2. External API slowdown
3. Resource contention
4. Increased traffic

**Investigation Steps:**
```bash
# Check slow queries
kubectl exec -it deployment/api-server -- npm run db:slow-queries

# Check external API latency
curl -w "@curl-format.txt" -s https://external-api.com/health

# Check pod resources
kubectl top pods -n production
```

**Resolution:**
- Scale pods if resource constrained
- Add database indexes if slow queries
- Enable caching for expensive operations

---

### Pod Crashes

**Symptoms:**
- Alert: "Pod crash loop"
- `CrashLoopBackOff` status

**Investigation Steps:**
```bash
# Get pod status
kubectl get pods -n production -l app=api-server

# Check logs from crashed pod
kubectl logs <pod-name> -n production --previous

# Describe pod for events
kubectl describe pod <pod-name> -n production
```

**Common Causes:**
- OOM (Out of Memory): Increase memory limits
- Failed health checks: Check probe configuration
- Application error: Check logs for stack trace
- Missing config/secrets: Verify ConfigMaps/Secrets
```

---

## Maintenance Template

```markdown
## Maintenance

### Scheduled Maintenance Windows
- **Weekly:** Sunday 2-4 AM UTC (low traffic)
- **Monthly:** First Sunday 2-6 AM UTC

### Regular Tasks

#### Weekly
- [ ] Review error trends
- [ ] Check disk usage
- [ ] Review slow query log

#### Monthly
- [ ] Rotate secrets/credentials
- [ ] Review and apply security patches
- [ ] Audit access logs
- [ ] Test backup restoration

#### Quarterly
- [ ] Review and update runbook
- [ ] Disaster recovery drill
- [ ] Capacity planning review

### Database Maintenance

**Vacuum and analyze (PostgreSQL):**
```sql
VACUUM ANALYZE;
```

**Reindex if needed:**
```sql
REINDEX DATABASE mydb;
```

### Certificate Renewal

Certificates expire: {date}

**Renewal process:**
```bash
# Renew certificate
certbot renew

# Update Kubernetes secret
kubectl create secret tls api-tls \
  --cert=fullchain.pem \
  --key=privkey.pem \
  -n production \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart ingress
kubectl rollout restart deployment/ingress-nginx -n ingress
```
```

---

## Quick Reference Card

```markdown
## Quick Reference

### Important URLs
| Resource | URL |
|----------|-----|
| Production API | https://api.example.com |
| Grafana | https://grafana.internal |
| PagerDuty | https://example.pagerduty.com |
| GitHub | https://github.com/org/repo |

### Common Commands
```bash
# Check pod status
kubectl get pods -n production -l app=api-server

# View logs
kubectl logs -f -l app=api-server -n production

# Restart deployment
kubectl rollout restart deployment/api-server -n production

# Scale up
kubectl scale deployment/api-server --replicas=5 -n production

# Port forward for local access
kubectl port-forward svc/api-server 3000:80 -n production
```

### Key Contacts
| Role | Name | Contact |
|------|------|---------|
| On-call | Rotation | {pagerduty} |
| Team Lead | {name} | {slack} |
| DBA | {name} | {slack} |
```
