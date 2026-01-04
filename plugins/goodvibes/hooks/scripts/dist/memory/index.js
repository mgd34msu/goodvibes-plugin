/**
 * Memory module - aggregates all memory subsystems.
 *
 * This module provides backward compatibility with the old memory.ts API
 * while delegating to the new modular implementation.
 */
import * as fs from 'fs';
import * as path from 'path';
import { debug, logError } from '../shared.js';
import { readDecisions, writeDecision } from './decisions.js';
import { readPatterns, writePattern } from './patterns.js';
import { readFailures, writeFailure } from './failures.js';
import { readPreferences, writePreference } from './preferences.js';
// Re-export all types from the individual modules
export * from './decisions.js';
export * from './patterns.js';
export * from './failures.js';
export * from './preferences.js';
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
    try {
        if (!fs.existsSync(goodVibesDir)) {
            fs.mkdirSync(goodVibesDir, { recursive: true });
            debug(`Created .goodvibes directory at ${goodVibesDir}`);
        }
    }
    catch (error) {
        logError('ensureGoodVibesDir:mkdir', error);
        throw new Error(`Failed to create .goodvibes directory: ${error}`);
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
    try {
        if (!fs.existsSync(memoryDir)) {
            fs.mkdirSync(memoryDir, { recursive: true });
            debug(`Created memory directory at ${memoryDir}`);
        }
    }
    catch (error) {
        logError('ensureMemoryDir:mkdir', error);
        throw new Error(`Failed to create memory directory: ${error}`);
    }
}
/**
 * Ensure .gitignore has comprehensive security patterns
 * Only adds patterns not already present
 */
export function ensureSecurityGitignore(cwd) {
    const gitignorePath = path.join(cwd, '.gitignore');
    try {
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
        // Build only the missing patterns to append
        const separator = existingContent.endsWith('\n') ? '' : '\n';
        const newPatternsBlock = '\n# GoodVibes Security Patterns\n' + patternsToAdd.join('\n') + '\n';
        // Write the updated .gitignore
        fs.writeFileSync(gitignorePath, existingContent + separator + newPatternsBlock);
        debug(`Added ${patternsToAdd.length} security patterns to .gitignore`);
    }
    catch (error) {
        logError('ensureSecurityGitignore', error);
        // Don't throw - gitignore is non-critical
    }
}
// ============================================================================
// Backward Compatibility API - Delegates to New Modular Implementation
// ============================================================================
/**
 * Load all memory files from the .goodvibes/memory directory
 * This is the old API name, delegates to loadProjectMemory
 */
export function loadMemory(cwd) {
    return loadProjectMemory(cwd);
}
/**
 * Loads all project memory (decisions, patterns, failures, preferences).
 */
export function loadProjectMemory(cwd) {
    return {
        decisions: readDecisions(cwd),
        patterns: readPatterns(cwd),
        failures: readFailures(cwd),
        preferences: readPreferences(cwd),
    };
}
/**
 * Append a new architectural decision to the decisions file
 */
export function appendDecision(cwd, decision) {
    try {
        ensureMemoryDir(cwd);
        writeDecision(cwd, decision);
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
        ensureMemoryDir(cwd);
        writePattern(cwd, pattern);
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
        ensureMemoryDir(cwd);
        writeFailure(cwd, failure);
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
        ensureMemoryDir(cwd);
        writePreference(cwd, preference);
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
    return new Date().toISOString().split('T')[0] ?? '';
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
            (d.alternatives && d.alternatives.some(matchesKeywords))),
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
/** Formats project memory into a human-readable context string. */
export function formatMemoryContext(memory) {
    const parts = [];
    if (memory.decisions.length > 0) {
        parts.push('Previous Decisions:');
        for (const d of memory.decisions.slice(-5)) {
            parts.push(`- ${d.title} (${d.rationale})`);
        }
    }
    if (memory.patterns.length > 0) {
        parts.push('\nEstablished Patterns:');
        for (const p of memory.patterns.slice(-3)) {
            const desc = p.description.length > 60 ? p.description.substring(0, 60) + '...' : p.description;
            parts.push(`- ${p.name}: ${desc}`);
        }
    }
    if (memory.failures.length > 0) {
        parts.push('\nKnown Failures (avoid):');
        for (const f of memory.failures.slice(-3)) {
            parts.push(`- ${f.approach}: ${f.reason}`);
        }
    }
    return parts.join('\n');
}
