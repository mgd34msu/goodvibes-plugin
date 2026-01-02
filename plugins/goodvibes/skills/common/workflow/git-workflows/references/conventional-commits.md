# Conventional Commits Reference

Complete guide to the Conventional Commits specification.

## Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Types

### Primary Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature for users | `feat: add user registration` |
| `fix` | Bug fix for users | `fix: correct password validation` |

### Other Types

| Type | Description | Example |
|------|-------------|---------|
| `docs` | Documentation only | `docs: update API readme` |
| `style` | Formatting, no code change | `style: fix indentation` |
| `refactor` | Code change, no feature/fix | `refactor: extract validation` |
| `perf` | Performance improvement | `perf: cache database queries` |
| `test` | Adding/updating tests | `test: add auth unit tests` |
| `build` | Build system changes | `build: update webpack config` |
| `ci` | CI configuration | `ci: add GitHub Actions` |
| `chore` | Other maintenance | `chore: update .gitignore` |
| `revert` | Revert previous commit | `revert: feat: add feature` |

## Scope

Optional component/area affected.

```
feat(auth): add OAuth2 support
fix(api): correct rate limiting
docs(readme): update installation
refactor(utils): simplify date formatting
```

### Common Scopes

| Scope | When to Use |
|-------|-------------|
| `api` | Backend API changes |
| `ui` | User interface changes |
| `auth` | Authentication/authorization |
| `db` | Database changes |
| `config` | Configuration changes |
| `deps` | Dependency updates |
| `core` | Core functionality |
| `cli` | CLI changes |

## Description

- Use imperative mood: "add" not "added" or "adds"
- Don't capitalize first letter
- No period at end
- Max ~50 characters

### Good Examples
```
add user search functionality
fix memory leak in cache
update readme with examples
remove deprecated endpoints
```

### Bad Examples
```
Added user search              # Past tense
Adds user search               # Third person
Add user search functionality. # Period at end
ADD USER SEARCH                # Caps
```

## Body

- Separate from description with blank line
- Explain what and why, not how
- Wrap at 72 characters
- Can have multiple paragraphs

```
fix(auth): prevent session fixation attack

The session ID was not being regenerated after login, allowing
attackers to fixate a session ID and hijack user sessions.

This change regenerates the session ID after successful
authentication while preserving session data.
```

## Footer

### Issue References

```
Closes #123
Fixes #456
Resolves #789
```

### Co-authors

```
Co-authored-by: Alice <alice@example.com>
Co-authored-by: Bob <bob@example.com>
```

### Breaking Changes

```
BREAKING CHANGE: remove deprecated v1 API

The v1 API endpoints have been removed. All clients must
migrate to v2 API before upgrading.

Migration guide: https://docs.example.com/migrate-v1-v2
```

## Breaking Changes

Two ways to indicate:

### 1. Exclamation Mark

```
feat!: remove deprecated API
feat(api)!: change response format
```

### 2. Footer

```
feat(api): change response format

BREAKING CHANGE: Response is now wrapped in { data: ... }
```

## Complete Examples

### Simple Fix
```
fix: correct typo in welcome message
```

### Feature with Scope
```
feat(auth): add two-factor authentication

Implement TOTP-based 2FA using authenticator apps.
Users can enable 2FA from their security settings.

Closes #234
```

### Breaking Change
```
feat(api)!: change pagination format

BREAKING CHANGE: The `offset` parameter is replaced with `cursor`.

Before:
  GET /users?offset=20&limit=10

After:
  GET /users?cursor=abc123&limit=10

The cursor is returned in the response for the next page.

Migration: Replace offset calculations with cursor from previous response.

Closes #567
```

### Refactoring
```
refactor(utils): simplify date formatting functions

Extract common date formatting logic into a single utility.
No functional changes, just code organization.

- Combine formatDate and formatTime into formatDateTime
- Add format string parameter for flexibility
- Improve JSDoc documentation
```

### Dependency Update
```
build(deps): update lodash to 4.17.21

Security update to address prototype pollution vulnerability.

CVE-2021-23337
```

### Revert
```
revert: feat(auth): add OAuth2 support

This reverts commit abc123def456.

The OAuth2 implementation is causing issues with existing
sessions. Reverting while we investigate.

Related: #890
```

## Commit Message Template

Create `.gitmessage` file:

```
# <type>(<scope>): <description>
# |<----  Using a Maximum Of 50 Characters  ---->|

# Explain why this change is being made
# |<----   Try To Limit Each Line to a Maximum Of 72 Characters   ---->|

# Provide links to any relevant tickets, articles, or other resources
# Example: Closes #23

# --- COMMIT END ---
# Type can be:
#   feat     - new feature for users
#   fix      - bug fix for users
#   docs     - documentation
#   style    - formatting
#   refactor - code restructuring
#   perf     - performance improvement
#   test     - tests
#   build    - build system
#   ci       - CI config
#   chore    - maintenance
#   revert   - revert commit
# --------------------
# Remember to:
#   - Use the imperative mood ("add" not "added")
#   - Don't capitalize first letter
#   - No period at end
#   - Separate subject from body with blank line
# --------------------
```

Configure git to use template:
```bash
git config --global commit.template ~/.gitmessage
```

## Validation

### commitlint

```bash
npm install -D @commitlint/cli @commitlint/config-conventional
```

`commitlint.config.js`:
```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', ['api', 'ui', 'auth', 'db', 'core']],
    'subject-case': [2, 'always', 'lower-case'],
  },
};
```

### Husky Hook

```bash
npx husky add .husky/commit-msg 'npx commitlint --edit $1'
```

## Benefits

1. **Automated changelogs**: Generate from commit history
2. **Semantic versioning**: Determine version bump automatically
3. **Clear history**: Understand changes at a glance
4. **Better collaboration**: Consistent format across team
5. **Tooling integration**: Works with release tools

## Tools

| Tool | Purpose |
|------|---------|
| `commitlint` | Validate commit messages |
| `conventional-changelog` | Generate changelogs |
| `standard-version` | Automate versioning and changelog |
| `semantic-release` | Fully automated releases |
| `commitizen` | Interactive commit helper |
