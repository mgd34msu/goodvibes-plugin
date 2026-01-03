/**
 * Persistent Memory System for GoodVibes
 *
 * Stores project-specific learnings in .goodvibes/memory/:
 * - decisions.md - Architectural decisions with rationale
 * - patterns.md - Project-specific code patterns
 * - failures.md - Approaches that failed (don't repeat)
 * - preferences.md - User preferences for this project
 *
 * All operations are lazy - directories/files only created when writing.
 */
import * as fs from 'fs';
import * as path from 'path';
import { debug, logError } from './shared.js';
// ============================================================================
// Constants
// ============================================================================
const GOODVIBES_DIR = '.goodvibes';
const MEMORY_DIR = 'memory';
const MEMORY_FILES = {
    decisions: 'decisions.md',
    patterns: 'patterns.md',
    failures: 'failures.md',
    preferences: 'preferences.md',
};
// ============================================================================
// Markdown Templates
// ============================================================================
const DECISIONS_HEADER = `# Architectural Decisions

This file records architectural decisions made for this project.
Each decision includes the date, alternatives considered, rationale, and the agent that made it.

---

`;
const PATTERNS_HEADER = `# Project-Specific Patterns

This file documents code patterns specific to this project.
These patterns help maintain consistency across the codebase.

---

`;
const FAILURES_HEADER = `# Failed Approaches

This file records approaches that were tried and failed.
Reference this to avoid repeating unsuccessful strategies.

---

`;
const PREFERENCES_HEADER = `# User Preferences

This file stores user preferences for this project.
These preferences guide agent behavior and decision-making.

---

`;
// ============================================================================
// Security-Hardened .gitignore Patterns
// ============================================================================
/**
 * Comprehensive gitignore patterns organized by category.
 * These patterns protect sensitive files from being committed.
 */
export const SECURITY_GITIGNORE_PATTERNS = `
# ============================================================================
# GoodVibes Security-Hardened .gitignore
# Auto-generated patterns to protect sensitive files
# ============================================================================

# ----------------------------------------------------------------------------
# Environment Variables & Secrets
# ----------------------------------------------------------------------------
.env
.env.*
.env.local
.env.development
.env.test
.env.production
.env.staging
.env*.local
*.env
env.js
env.ts
secrets.json
secrets.yaml
secrets.yml
.secrets
.secret
*.secret
*.secrets

# ----------------------------------------------------------------------------
# API Keys & Tokens
# ----------------------------------------------------------------------------
*.key
*.pem
*.p12
*.pfx
*.crt
*.cer
*.der
*.csr
api_keys.json
api_keys.yaml
tokens.json
tokens.yaml
access_tokens.*
refresh_tokens.*
oauth_tokens.*
jwt_secret*
signing_key*

# ----------------------------------------------------------------------------
# SSH Keys & Certificates
# ----------------------------------------------------------------------------
id_rsa
id_rsa.pub
id_dsa
id_dsa.pub
id_ecdsa
id_ecdsa.pub
id_ed25519
id_ed25519.pub
*.ppk
known_hosts
authorized_keys
ssh_host_*
.ssh/

# ----------------------------------------------------------------------------
# AWS Configuration
# ----------------------------------------------------------------------------
.aws/
aws_credentials
aws_config
*.aws
credentials
config.aws
.boto
.s3cfg
s3_credentials

# ----------------------------------------------------------------------------
# Google Cloud Platform
# ----------------------------------------------------------------------------
.gcloud/
gcloud.json
service-account*.json
gcp-key*.json
google-credentials*.json
application_default_credentials.json
.gcp/

# ----------------------------------------------------------------------------
# Azure Configuration
# ----------------------------------------------------------------------------
.azure/
azure.json
azure-credentials*.json
servicePrincipal*.json
.azureauth

# ----------------------------------------------------------------------------
# Database Credentials & Files
# ----------------------------------------------------------------------------
*.sqlite
*.sqlite3
*.db
*.db3
*.mdb
*.accdb
database.json
database.yaml
database.yml
db_credentials.*
mysql.cnf
.my.cnf
pgpass
.pgpass
mongodb.conf
redis.conf
*.dump
*.sql.gz

# ----------------------------------------------------------------------------
# Terraform State & Secrets
# ----------------------------------------------------------------------------
*.tfstate
*.tfstate.*
*.tfvars
*.tfvars.json
terraform.tfstate.backup
.terraform/
.terraform.lock.hcl
override.tf
override.tf.json
*_override.tf
*_override.tf.json

# ----------------------------------------------------------------------------
# Ansible & Infrastructure
# ----------------------------------------------------------------------------
*.vault
vault_pass*
ansible_vault*
group_vars/*/vault*
host_vars/*/vault*
inventory*.ini
inventory*.yaml
*.retry

# ----------------------------------------------------------------------------
# Docker Secrets
# ----------------------------------------------------------------------------
docker-compose.override.yml
docker-compose.override.yaml
.docker/
docker_secrets/
*.dockercfg
.dockerconfigjson

# ----------------------------------------------------------------------------
# Kubernetes Secrets
# ----------------------------------------------------------------------------
kubeconfig
.kube/
*-kubeconfig
*.kubeconfig
secrets.yaml
secrets.yml
sealed-secrets.yaml

# ----------------------------------------------------------------------------
# HashiCorp Vault
# ----------------------------------------------------------------------------
.vault-token
vault.hcl
vault.json

# ----------------------------------------------------------------------------
# CI/CD Secrets
# ----------------------------------------------------------------------------
.travis.yml.local
.circleci/config.local.yml
.github/secrets/
jenkins_credentials*
buildspec.local.yml

# ----------------------------------------------------------------------------
# Package Manager Credentials
# ----------------------------------------------------------------------------
.npmrc
.yarnrc
.npmrc.local
.yarnrc.yml.local
.pip/
pip.conf
.pypirc
.gem/credentials
.nuget/
NuGet.Config.local
.cargo/credentials

# ----------------------------------------------------------------------------
# IDE & Editor Secrets
# ----------------------------------------------------------------------------
.idea/
.vscode/settings.json
.vscode/launch.json
*.sublime-workspace
.project
.classpath
.settings/

# ----------------------------------------------------------------------------
# Application-Specific Secrets
# ----------------------------------------------------------------------------
config/secrets.yml
config/credentials.yml.enc
master.key
credentials.yml.enc
config/master.key
config/credentials/
wp-config.php
LocalSettings.php
settings_local.py
local_settings.py
configuration.php
.htpasswd
passwd
shadow

# ----------------------------------------------------------------------------
# Log Files (may contain sensitive data)
# ----------------------------------------------------------------------------
*.log
logs/
log/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*
debug.log
error.log
access.log

# ----------------------------------------------------------------------------
# Cache & Temp Files
# ----------------------------------------------------------------------------
.cache/
*.cache
.tmp/
tmp/
temp/
*.tmp
*.temp
*.swp
*.swo
*~

# ----------------------------------------------------------------------------
# OS-Generated Files
# ----------------------------------------------------------------------------
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db
desktop.ini

# ----------------------------------------------------------------------------
# Backup Files
# ----------------------------------------------------------------------------
*.bak
*.backup
*.old
*.orig
*~

# ----------------------------------------------------------------------------
# Build Artifacts (may contain embedded secrets)
# ----------------------------------------------------------------------------
dist/
build/
out/
target/
*.war
*.ear
*.jar
node_modules/
vendor/
__pycache__/
*.pyc
*.pyo

# ----------------------------------------------------------------------------
# Test Coverage (may expose code structure)
# ----------------------------------------------------------------------------
coverage/
.nyc_output/
*.lcov
.coverage
htmlcov/

# ----------------------------------------------------------------------------
# GoodVibes Plugin Files
# ----------------------------------------------------------------------------
.goodvibes/
`;
// ============================================================================
// Path Utilities
// ============================================================================
/**
 * Get the path to the .goodvibes directory
 */
export function getGoodVibesDir(cwd) {
    return path.join(cwd, GOODVIBES_DIR);
}
/**
 * Get the path to the memory directory
 */
export function getMemoryDir(cwd) {
    return path.join(cwd, GOODVIBES_DIR, MEMORY_DIR);
}
/**
 * Get the path to a specific memory file
 */
export function getMemoryFilePath(cwd, type) {
    return path.join(getMemoryDir(cwd), MEMORY_FILES[type]);
}
// ============================================================================
// Directory Management (Lazy Creation)
// ============================================================================
/**
 * Ensure the .goodvibes directory exists (lazy creation)
 * Also ensures .gitignore has comprehensive security patterns
 */
export function ensureGoodVibesDir(cwd) {
    const goodVibesDir = getGoodVibesDir(cwd);
    if (!fs.existsSync(goodVibesDir)) {
        fs.mkdirSync(goodVibesDir, { recursive: true });
        debug(`Created .goodvibes directory at ${goodVibesDir}`);
    }
    // Ensure security-hardened .gitignore
    ensureSecurityGitignore(cwd);
}
/**
 * Ensure the memory directory exists (lazy creation)
 */
export function ensureMemoryDir(cwd) {
    ensureGoodVibesDir(cwd);
    const memoryDir = getMemoryDir(cwd);
    if (!fs.existsSync(memoryDir)) {
        fs.mkdirSync(memoryDir, { recursive: true });
        debug(`Created memory directory at ${memoryDir}`);
    }
}
/**
 * Ensure .gitignore has comprehensive security patterns
 * Only adds patterns not already present
 */
export function ensureSecurityGitignore(cwd) {
    const gitignorePath = path.join(cwd, '.gitignore');
    let existingContent = '';
    if (fs.existsSync(gitignorePath)) {
        existingContent = fs.readFileSync(gitignorePath, 'utf-8');
    }
    // Parse security patterns into individual lines
    const securityLines = SECURITY_GITIGNORE_PATTERNS.split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
    // Parse existing patterns
    const existingPatterns = new Set(existingContent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#')));
    // Find patterns that need to be added
    const patternsToAdd = securityLines.filter((pattern) => !existingPatterns.has(pattern));
    if (patternsToAdd.length === 0) {
        debug('.gitignore already has all security patterns');
        return;
    }
    // Build the new content to append
    const separator = existingContent.endsWith('\n') ? '' : '\n';
    const newPatterns = SECURITY_GITIGNORE_PATTERNS;
    // Write the updated .gitignore
    fs.writeFileSync(gitignorePath, existingContent + separator + newPatterns);
    debug(`Added ${patternsToAdd.length} security patterns to .gitignore`);
}
// ============================================================================
// Memory File Loading
// ============================================================================
/**
 * Parse decisions from markdown content
 */
function parseDecisions(content) {
    const decisions = [];
    const blocks = content.split(/\n## /).slice(1);
    for (const block of blocks) {
        try {
            const lines = block.split('\n');
            const title = lines[0]?.trim() || '';
            let date = '';
            let alternatives = [];
            let rationale = '';
            let agent = '';
            let context = '';
            let currentSection = '';
            for (const line of lines.slice(1)) {
                if (line.startsWith('**Date:**')) {
                    date = line.replace('**Date:**', '').trim();
                }
                else if (line.startsWith('**Agent:**')) {
                    agent = line.replace('**Agent:**', '').trim();
                }
                else if (line.startsWith('**Alternatives:**')) {
                    currentSection = 'alternatives';
                }
                else if (line.startsWith('**Rationale:**')) {
                    currentSection = 'rationale';
                }
                else if (line.startsWith('**Context:**')) {
                    currentSection = 'context';
                }
                else if (line.startsWith('- ') && currentSection === 'alternatives') {
                    alternatives.push(line.replace('- ', '').trim());
                }
                else if (currentSection === 'rationale' && line.trim()) {
                    rationale += line.trim() + ' ';
                }
                else if (currentSection === 'context' && line.trim()) {
                    context += line.trim() + ' ';
                }
            }
            if (title && date && rationale) {
                decisions.push({
                    title,
                    date,
                    alternatives,
                    rationale: rationale.trim(),
                    agent: agent || undefined,
                    context: context.trim() || undefined,
                });
            }
        }
        catch (error) {
            logError('parseDecisions', error);
        }
    }
    return decisions;
}
/**
 * Parse patterns from markdown content
 */
function parsePatterns(content) {
    const patterns = [];
    const blocks = content.split(/\n## /).slice(1);
    for (const block of blocks) {
        try {
            const lines = block.split('\n');
            const name = lines[0]?.trim() || '';
            let date = '';
            let description = '';
            let example = '';
            let files = [];
            let currentSection = '';
            let inCodeBlock = false;
            for (const line of lines.slice(1)) {
                if (line.startsWith('```')) {
                    inCodeBlock = !inCodeBlock;
                    if (inCodeBlock && currentSection === 'example') {
                        example += line + '\n';
                    }
                    else if (!inCodeBlock && currentSection === 'example') {
                        example += line + '\n';
                    }
                    continue;
                }
                if (inCodeBlock && currentSection === 'example') {
                    example += line + '\n';
                    continue;
                }
                if (line.startsWith('**Date:**')) {
                    date = line.replace('**Date:**', '').trim();
                }
                else if (line.startsWith('**Description:**')) {
                    currentSection = 'description';
                }
                else if (line.startsWith('**Example:**')) {
                    currentSection = 'example';
                }
                else if (line.startsWith('**Files:**')) {
                    currentSection = 'files';
                }
                else if (line.startsWith('- ') && currentSection === 'files') {
                    files.push(line.replace('- ', '').trim());
                }
                else if (currentSection === 'description' && line.trim()) {
                    description += line.trim() + ' ';
                }
            }
            if (name && date && description) {
                patterns.push({
                    name,
                    date,
                    description: description.trim(),
                    example: example.trim() || undefined,
                    files: files.length > 0 ? files : undefined,
                });
            }
        }
        catch (error) {
            logError('parsePatterns', error);
        }
    }
    return patterns;
}
/**
 * Parse failures from markdown content
 */
function parseFailures(content) {
    const failures = [];
    const blocks = content.split(/\n## /).slice(1);
    for (const block of blocks) {
        try {
            const lines = block.split('\n');
            const approach = lines[0]?.trim() || '';
            let date = '';
            let reason = '';
            let context = '';
            let suggestion = '';
            let currentSection = '';
            for (const line of lines.slice(1)) {
                if (line.startsWith('**Date:**')) {
                    date = line.replace('**Date:**', '').trim();
                }
                else if (line.startsWith('**Reason:**')) {
                    currentSection = 'reason';
                }
                else if (line.startsWith('**Context:**')) {
                    currentSection = 'context';
                }
                else if (line.startsWith('**Suggestion:**')) {
                    currentSection = 'suggestion';
                }
                else if (currentSection === 'reason' && line.trim()) {
                    reason += line.trim() + ' ';
                }
                else if (currentSection === 'context' && line.trim()) {
                    context += line.trim() + ' ';
                }
                else if (currentSection === 'suggestion' && line.trim()) {
                    suggestion += line.trim() + ' ';
                }
            }
            if (approach && date && reason) {
                failures.push({
                    approach,
                    date,
                    reason: reason.trim(),
                    context: context.trim() || undefined,
                    suggestion: suggestion.trim() || undefined,
                });
            }
        }
        catch (error) {
            logError('parseFailures', error);
        }
    }
    return failures;
}
/**
 * Parse preferences from markdown content
 */
function parsePreferences(content) {
    const preferences = [];
    const blocks = content.split(/\n## /).slice(1);
    for (const block of blocks) {
        try {
            const lines = block.split('\n');
            const key = lines[0]?.trim() || '';
            let value = '';
            let date = '';
            let notes = '';
            let currentSection = '';
            for (const line of lines.slice(1)) {
                if (line.startsWith('**Value:**')) {
                    value = line.replace('**Value:**', '').trim();
                }
                else if (line.startsWith('**Date:**')) {
                    date = line.replace('**Date:**', '').trim();
                }
                else if (line.startsWith('**Notes:**')) {
                    currentSection = 'notes';
                }
                else if (currentSection === 'notes' && line.trim()) {
                    notes += line.trim() + ' ';
                }
            }
            if (key && value && date) {
                preferences.push({
                    key,
                    value,
                    date,
                    notes: notes.trim() || undefined,
                });
            }
        }
        catch (error) {
            logError('parsePreferences', error);
        }
    }
    return preferences;
}
/**
 * Load all memory files from the .goodvibes/memory directory
 */
export function loadMemory(cwd) {
    const memoryDir = getMemoryDir(cwd);
    const memory = {
        decisions: [],
        patterns: [],
        failures: [],
        preferences: [],
    };
    if (!fs.existsSync(memoryDir)) {
        debug('Memory directory does not exist yet');
        return memory;
    }
    // Load decisions
    const decisionsPath = getMemoryFilePath(cwd, 'decisions');
    if (fs.existsSync(decisionsPath)) {
        const content = fs.readFileSync(decisionsPath, 'utf-8');
        memory.decisions = parseDecisions(content);
        debug(`Loaded ${memory.decisions.length} decisions`);
    }
    // Load patterns
    const patternsPath = getMemoryFilePath(cwd, 'patterns');
    if (fs.existsSync(patternsPath)) {
        const content = fs.readFileSync(patternsPath, 'utf-8');
        memory.patterns = parsePatterns(content);
        debug(`Loaded ${memory.patterns.length} patterns`);
    }
    // Load failures
    const failuresPath = getMemoryFilePath(cwd, 'failures');
    if (fs.existsSync(failuresPath)) {
        const content = fs.readFileSync(failuresPath, 'utf-8');
        memory.failures = parseFailures(content);
        debug(`Loaded ${memory.failures.length} failures`);
    }
    // Load preferences
    const preferencesPath = getMemoryFilePath(cwd, 'preferences');
    if (fs.existsSync(preferencesPath)) {
        const content = fs.readFileSync(preferencesPath, 'utf-8');
        memory.preferences = parsePreferences(content);
        debug(`Loaded ${memory.preferences.length} preferences`);
    }
    return memory;
}
// ============================================================================
// Memory File Appending
// ============================================================================
/**
 * Ensure a memory file exists with its header
 */
function ensureMemoryFile(cwd, type, header) {
    ensureMemoryDir(cwd);
    const filePath = getMemoryFilePath(cwd, type);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, header);
        debug(`Created ${type} memory file`);
    }
}
/**
 * Format a decision as markdown
 */
function formatDecision(decision) {
    let md = `\n## ${decision.title}\n\n`;
    md += `**Date:** ${decision.date}\n`;
    if (decision.agent) {
        md += `**Agent:** ${decision.agent}\n`;
    }
    md += '\n**Alternatives:**\n';
    for (const alt of decision.alternatives) {
        md += `- ${alt}\n`;
    }
    md += '\n**Rationale:**\n';
    md += `${decision.rationale}\n`;
    if (decision.context) {
        md += '\n**Context:**\n';
        md += `${decision.context}\n`;
    }
    md += '\n---\n';
    return md;
}
/**
 * Format a pattern as markdown
 */
function formatPattern(pattern) {
    let md = `\n## ${pattern.name}\n\n`;
    md += `**Date:** ${pattern.date}\n`;
    md += '\n**Description:**\n';
    md += `${pattern.description}\n`;
    if (pattern.example) {
        md += '\n**Example:**\n';
        md += `${pattern.example}\n`;
    }
    if (pattern.files && pattern.files.length > 0) {
        md += '\n**Files:**\n';
        for (const file of pattern.files) {
            md += `- ${file}\n`;
        }
    }
    md += '\n---\n';
    return md;
}
/**
 * Format a failure as markdown
 */
function formatFailure(failure) {
    let md = `\n## ${failure.approach}\n\n`;
    md += `**Date:** ${failure.date}\n`;
    md += '\n**Reason:**\n';
    md += `${failure.reason}\n`;
    if (failure.context) {
        md += '\n**Context:**\n';
        md += `${failure.context}\n`;
    }
    if (failure.suggestion) {
        md += '\n**Suggestion:**\n';
        md += `${failure.suggestion}\n`;
    }
    md += '\n---\n';
    return md;
}
/**
 * Format a preference as markdown
 */
function formatPreference(preference) {
    let md = `\n## ${preference.key}\n\n`;
    md += `**Value:** ${preference.value}\n`;
    md += `**Date:** ${preference.date}\n`;
    if (preference.notes) {
        md += '\n**Notes:**\n';
        md += `${preference.notes}\n`;
    }
    md += '\n---\n';
    return md;
}
/**
 * Append a new architectural decision to the decisions file
 */
export function appendDecision(cwd, decision) {
    try {
        ensureMemoryFile(cwd, 'decisions', DECISIONS_HEADER);
        const filePath = getMemoryFilePath(cwd, 'decisions');
        const formatted = formatDecision(decision);
        fs.appendFileSync(filePath, formatted);
        debug(`Appended decision: ${decision.title}`);
    }
    catch (error) {
        logError('appendDecision', error);
        throw error;
    }
}
/**
 * Append a new code pattern to the patterns file
 */
export function appendPattern(cwd, pattern) {
    try {
        ensureMemoryFile(cwd, 'patterns', PATTERNS_HEADER);
        const filePath = getMemoryFilePath(cwd, 'patterns');
        const formatted = formatPattern(pattern);
        fs.appendFileSync(filePath, formatted);
        debug(`Appended pattern: ${pattern.name}`);
    }
    catch (error) {
        logError('appendPattern', error);
        throw error;
    }
}
/**
 * Append a failed approach to the failures file
 */
export function appendFailure(cwd, failure) {
    try {
        ensureMemoryFile(cwd, 'failures', FAILURES_HEADER);
        const filePath = getMemoryFilePath(cwd, 'failures');
        const formatted = formatFailure(failure);
        fs.appendFileSync(filePath, formatted);
        debug(`Appended failure: ${failure.approach}`);
    }
    catch (error) {
        logError('appendFailure', error);
        throw error;
    }
}
/**
 * Append a user preference to the preferences file
 */
export function appendPreference(cwd, preference) {
    try {
        ensureMemoryFile(cwd, 'preferences', PREFERENCES_HEADER);
        const filePath = getMemoryFilePath(cwd, 'preferences');
        const formatted = formatPreference(preference);
        fs.appendFileSync(filePath, formatted);
        debug(`Appended preference: ${preference.key}`);
    }
    catch (error) {
        logError('appendPreference', error);
        throw error;
    }
}
// ============================================================================
// Utility Functions
// ============================================================================
/**
 * Get current date in ISO format (YYYY-MM-DD)
 */
export function getCurrentDate() {
    return new Date().toISOString().split('T')[0];
}
/**
 * Check if memory exists for a project
 */
export function hasMemory(cwd) {
    return fs.existsSync(getMemoryDir(cwd));
}
/**
 * Get a summary of the project memory
 */
export function getMemorySummary(cwd) {
    if (!hasMemory(cwd)) {
        return {
            hasMemory: false,
            decisionsCount: 0,
            patternsCount: 0,
            failuresCount: 0,
            preferencesCount: 0,
        };
    }
    const memory = loadMemory(cwd);
    return {
        hasMemory: true,
        decisionsCount: memory.decisions.length,
        patternsCount: memory.patterns.length,
        failuresCount: memory.failures.length,
        preferencesCount: memory.preferences.length,
    };
}
/**
 * Search memory for relevant entries based on keywords
 */
export function searchMemory(cwd, keywords) {
    const memory = loadMemory(cwd);
    const lowerKeywords = keywords.map((k) => k.toLowerCase());
    const matchesKeywords = (text) => {
        const lowerText = text.toLowerCase();
        return lowerKeywords.some((keyword) => lowerText.includes(keyword));
    };
    return {
        decisions: memory.decisions.filter((d) => matchesKeywords(d.title) ||
            matchesKeywords(d.rationale) ||
            (d.context && matchesKeywords(d.context)) ||
            d.alternatives.some(matchesKeywords)),
        patterns: memory.patterns.filter((p) => matchesKeywords(p.name) ||
            matchesKeywords(p.description) ||
            (p.example && matchesKeywords(p.example)) ||
            (p.files && p.files.some(matchesKeywords))),
        failures: memory.failures.filter((f) => matchesKeywords(f.approach) ||
            matchesKeywords(f.reason) ||
            (f.context && matchesKeywords(f.context)) ||
            (f.suggestion && matchesKeywords(f.suggestion))),
        preferences: memory.preferences.filter((p) => matchesKeywords(p.key) ||
            matchesKeywords(p.value) ||
            (p.notes && matchesKeywords(p.notes))),
    };
}
