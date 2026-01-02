# Branch Strategies Comparison

Detailed comparison of popular branching strategies.

## GitFlow

### Overview

Structured branching model with dedicated branches for features, releases, and hotfixes.

```
main (production) ─────●───────────────────●───────────────────●────
                       │                   │                   │
                       │    release/1.0    │    release/1.1    │
                       │   ┌──────●────┐   │   ┌──────●────┐   │
develop ───────●───────●───┴────────────●──●───┴────────────●──●────
               │       │                │      │            │
feature/a ─────●───────┘                │      │            │
feature/b ─────────────●────────────────┘      │            │
                                        hotfix/1.0.1────────┘
```

### Branch Types

| Branch | Purpose | Base | Merges Into |
|--------|---------|------|-------------|
| `main` | Production code | - | - |
| `develop` | Integration branch | main | release/* |
| `feature/*` | New features | develop | develop |
| `release/*` | Release preparation | develop | main, develop |
| `hotfix/*` | Production fixes | main | main, develop |

### Workflow

**Feature development:**
```bash
# Create feature branch
git checkout develop
git checkout -b feature/user-auth

# Work on feature...
git commit -m "feat(auth): add login endpoint"

# Merge back to develop
git checkout develop
git merge --no-ff feature/user-auth
git branch -d feature/user-auth
```

**Release:**
```bash
# Create release branch
git checkout develop
git checkout -b release/1.2.0

# Bump version, fix bugs...
git commit -m "chore: bump version to 1.2.0"

# Merge to main and tag
git checkout main
git merge --no-ff release/1.2.0
git tag -a v1.2.0

# Merge back to develop
git checkout develop
git merge --no-ff release/1.2.0
git branch -d release/1.2.0
```

**Hotfix:**
```bash
# Create hotfix from main
git checkout main
git checkout -b hotfix/1.2.1

# Fix and bump patch version
git commit -m "fix: security vulnerability"

# Merge to main and develop
git checkout main
git merge --no-ff hotfix/1.2.1
git tag -a v1.2.1
git checkout develop
git merge --no-ff hotfix/1.2.1
git branch -d hotfix/1.2.1
```

### Pros and Cons

**Pros:**
- Clear separation of concerns
- Supports parallel development
- Good for scheduled releases
- Audit trail for releases

**Cons:**
- Complex for small teams
- Many merge commits
- Can be slow for CI/CD
- develop branch can diverge from main

### Best For

- Large teams (10+)
- Products with scheduled releases
- Support for multiple versions
- Enterprise environments

---

## GitHub Flow

### Overview

Simplified workflow with feature branches and continuous deployment to main.

```
main ───●───●───●───●───●───●───●───●───●───●───●───●───
        │   │       │       │       │       │
        │   └───────│───────│───────│───────│── PR merged
        │           │       │       │       │
feature/a ──●───●───┘       │       │       │
feature/b ──────────●───●───┘       │       │
feature/c ──────────────────●───●───┘       │
feature/d ──────────────────────────●───●───┘
```

### Branch Types

| Branch | Purpose |
|--------|---------|
| `main` | Always deployable, production-ready |
| `feature/*` | All changes (features, fixes, etc.) |

### Workflow

```bash
# 1. Create branch from main
git checkout main
git pull
git checkout -b feature/add-user-api

# 2. Make commits
git commit -m "feat: add user registration endpoint"
git commit -m "test: add user registration tests"

# 3. Push and create PR
git push -u origin feature/add-user-api
gh pr create --fill

# 4. After review, merge
gh pr merge --squash

# 5. Deploy automatically from main
```

### Rules

1. **main is always deployable**
2. **Branch from main, merge to main**
3. **Use pull requests for all changes**
4. **Deploy immediately after merging**
5. **Delete branches after merging**

### Pros and Cons

**Pros:**
- Simple to understand
- Fast feedback loop
- Encourages CI/CD
- Clear what's in production

**Cons:**
- No staging/release concept
- Requires solid CI/CD
- May need feature flags
- Less structured for large teams

### Best For

- Small to medium teams
- Web applications
- Continuous deployment
- Teams new to git workflows

---

## Trunk-Based Development

### Overview

All developers work on a single branch (trunk/main) with short-lived feature branches.

```
main ──●──●──●──●──●──●──●──●──●──●──●──●──●──●──●──
       │     │     │     │     │     │     │
       └─●───┘     └─●───┘     └─●───┘     └─●───┘
       (< 1 day)  (< 1 day)  (< 1 day)  (< 1 day)
```

### Key Principles

1. **Short-lived branches** (< 1 day)
2. **Small, frequent commits**
3. **Feature flags for incomplete work**
4. **Comprehensive automated testing**
5. **No long-running branches**

### Workflow

```bash
# 1. Pull latest main
git checkout main
git pull

# 2. Create short-lived branch (optional)
git checkout -b small-change

# 3. Make small, complete changes
git commit -m "feat: add email validation"

# 4. Merge quickly (same day)
git checkout main
git merge small-change
git push

# Or commit directly to main
git checkout main
git commit -m "fix: correct email regex"
git push
```

### Feature Flags

```javascript
// For incomplete features, use flags
const features = {
  newCheckout: process.env.FEATURE_NEW_CHECKOUT === 'true',
};

function renderCheckout() {
  if (features.newCheckout) {
    return <NewCheckout />;
  }
  return <LegacyCheckout />;
}
```

### Pros and Cons

**Pros:**
- Fastest feedback loop
- No merge conflicts
- Simple mental model
- Encourages small changes

**Cons:**
- Requires strong CI/CD
- Needs feature flags
- Must trust the team
- Not for immature teams

### Best For

- Experienced teams
- High CI/CD maturity
- Continuous deployment
- Google, Facebook-style development

---

## Release Branching

### Overview

Long-lived release branches for supporting multiple versions.

```
main ────●────●────●────●────●────●────●────●────
         │         │         │
release/1.x ──●────●────●────│────●────●────
              │    │    │    │
           1.0.0 1.0.1 1.0.2 │
                             │
release/2.x ─────────────────●────●────●────
                             │    │
                          2.0.0 2.0.1
```

### When to Use

- Supporting multiple product versions
- Enterprise software with slow upgrade cycles
- SaaS with tiered customers
- Mobile apps with staged rollouts

### Workflow

```bash
# Create release branch for major version
git checkout main
git checkout -b release/2.x
git tag -a v2.0.0

# Backport fixes to release branch
git checkout release/1.x
git cherry-pick <commit-hash>
git tag -a v1.0.3
```

---

## Comparison Table

| Aspect | GitFlow | GitHub Flow | Trunk-Based |
|--------|---------|-------------|-------------|
| Complexity | High | Low | Low |
| Branch lifetime | Long | Medium | Short |
| Merge frequency | Low | Medium | High |
| CI/CD requirement | Medium | High | Very High |
| Team size | Large | Small-Medium | Any |
| Release frequency | Scheduled | Continuous | Continuous |
| Feature flags | Optional | Recommended | Required |
| Parallel releases | Yes | No | No |

---

## Choosing a Strategy

### Decision Tree

```
Do you support multiple versions simultaneously?
├── Yes → Release Branching or GitFlow
└── No
    └── Do you deploy continuously?
        ├── Yes
        │   └── Is your team experienced with CI/CD?
        │       ├── Yes → Trunk-Based
        │       └── No → GitHub Flow
        └── No → GitFlow
```

### Migration Path

**From GitFlow to GitHub Flow:**
1. Merge develop into main
2. Delete develop branch
3. Update CI/CD to deploy from main
4. Train team on PR workflow

**From GitHub Flow to Trunk-Based:**
1. Implement feature flags
2. Strengthen CI/CD
3. Reduce branch lifetime
4. Eventually commit to main directly

---

## Branch Protection Rules

### GitHub Settings

```yaml
# For main branch
protection_rules:
  main:
    required_status_checks:
      strict: true
      contexts:
        - ci/test
        - ci/lint
    required_pull_request_reviews:
      required_approving_review_count: 1
      dismiss_stale_reviews: true
    enforce_admins: true
    restrictions: null
```

### Required Checks

| Check | Purpose |
|-------|---------|
| `ci/test` | All tests pass |
| `ci/lint` | No linting errors |
| `ci/build` | Build succeeds |
| `ci/security` | No vulnerabilities |
| `coverage` | Coverage threshold met |
