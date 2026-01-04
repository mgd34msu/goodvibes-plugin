/**
 * Memory module - aggregates all memory subsystems.
 *
 * This module provides backward compatibility with the old memory.ts API
 * while delegating to the new modular implementation.
 */
import type { ProjectMemory } from '../types/memory.js';
export * from './decisions.js';
export * from './patterns.js';
export * from './failures.js';
export * from './preferences.js';
import type { MemoryDecision, MemoryPattern, MemoryFailure, MemoryPreference } from '../types/memory.js';
export type Decision = MemoryDecision;
export type Pattern = MemoryPattern;
export type Failure = MemoryFailure;
export type Preference = MemoryPreference;
export type { ProjectMemory };
declare const MEMORY_FILES: {
    readonly decisions: "decisions.md";
    readonly patterns: "patterns.md";
    readonly failures: "failures.md";
    readonly preferences: "preferences.md";
};
/**
 * Comprehensive gitignore patterns organized by category.
 * These patterns protect sensitive files from being committed.
 */
export declare const SECURITY_GITIGNORE_PATTERNS = "\n# ============================================================================\n# GoodVibes Security-Hardened .gitignore\n# Auto-generated patterns to protect sensitive files\n# ============================================================================\n\n# ----------------------------------------------------------------------------\n# Environment Variables & Secrets\n# ----------------------------------------------------------------------------\n.env\n.env.*\n.env.local\n.env.development\n.env.test\n.env.production\n.env.staging\n.env*.local\n*.env\nenv.js\nenv.ts\nsecrets.json\nsecrets.yaml\nsecrets.yml\n.secrets\n.secret\n*.secret\n*.secrets\n\n# ----------------------------------------------------------------------------\n# API Keys & Tokens\n# ----------------------------------------------------------------------------\n*.key\n*.pem\n*.p12\n*.pfx\n*.crt\n*.cer\n*.der\n*.csr\napi_keys.json\napi_keys.yaml\ntokens.json\ntokens.yaml\naccess_tokens.*\nrefresh_tokens.*\noauth_tokens.*\njwt_secret*\nsigning_key*\n\n# ----------------------------------------------------------------------------\n# SSH Keys & Certificates\n# ----------------------------------------------------------------------------\nid_rsa\nid_rsa.pub\nid_dsa\nid_dsa.pub\nid_ecdsa\nid_ecdsa.pub\nid_ed25519\nid_ed25519.pub\n*.ppk\nknown_hosts\nauthorized_keys\nssh_host_*\n.ssh/\n\n# ----------------------------------------------------------------------------\n# AWS Configuration\n# ----------------------------------------------------------------------------\n.aws/\naws_credentials\naws_config\n*.aws\ncredentials\nconfig.aws\n.boto\n.s3cfg\ns3_credentials\n\n# ----------------------------------------------------------------------------\n# Google Cloud Platform\n# ----------------------------------------------------------------------------\n.gcloud/\ngcloud.json\nservice-account*.json\ngcp-key*.json\ngoogle-credentials*.json\napplication_default_credentials.json\n.gcp/\n\n# ----------------------------------------------------------------------------\n# Azure Configuration\n# ----------------------------------------------------------------------------\n.azure/\nazure.json\nazure-credentials*.json\nservicePrincipal*.json\n.azureauth\n\n# ----------------------------------------------------------------------------\n# Database Credentials & Files\n# ----------------------------------------------------------------------------\n*.sqlite\n*.sqlite3\n*.db\n*.db3\n*.mdb\n*.accdb\ndatabase.json\ndatabase.yaml\ndatabase.yml\ndb_credentials.*\nmysql.cnf\n.my.cnf\npgpass\n.pgpass\nmongodb.conf\nredis.conf\n*.dump\n*.sql.gz\n\n# ----------------------------------------------------------------------------\n# Terraform State & Secrets\n# ----------------------------------------------------------------------------\n*.tfstate\n*.tfstate.*\n*.tfvars\n*.tfvars.json\nterraform.tfstate.backup\n.terraform/\n.terraform.lock.hcl\noverride.tf\noverride.tf.json\n*_override.tf\n*_override.tf.json\n\n# ----------------------------------------------------------------------------\n# Ansible & Infrastructure\n# ----------------------------------------------------------------------------\n*.vault\nvault_pass*\nansible_vault*\ngroup_vars/*/vault*\nhost_vars/*/vault*\ninventory*.ini\ninventory*.yaml\n*.retry\n\n# ----------------------------------------------------------------------------\n# Docker Secrets\n# ----------------------------------------------------------------------------\ndocker-compose.override.yml\ndocker-compose.override.yaml\n.docker/\ndocker_secrets/\n*.dockercfg\n.dockerconfigjson\n\n# ----------------------------------------------------------------------------\n# Kubernetes Secrets\n# ----------------------------------------------------------------------------\nkubeconfig\n.kube/\n*-kubeconfig\n*.kubeconfig\nsecrets.yaml\nsecrets.yml\nsealed-secrets.yaml\n\n# ----------------------------------------------------------------------------\n# HashiCorp Vault\n# ----------------------------------------------------------------------------\n.vault-token\nvault.hcl\nvault.json\n\n# ----------------------------------------------------------------------------\n# CI/CD Secrets\n# ----------------------------------------------------------------------------\n.travis.yml.local\n.circleci/config.local.yml\n.github/secrets/\njenkins_credentials*\nbuildspec.local.yml\n\n# ----------------------------------------------------------------------------\n# Package Manager Credentials\n# ----------------------------------------------------------------------------\n.npmrc\n.yarnrc\n.npmrc.local\n.yarnrc.yml.local\n.pip/\npip.conf\n.pypirc\n.gem/credentials\n.nuget/\nNuGet.Config.local\n.cargo/credentials\n\n# ----------------------------------------------------------------------------\n# IDE & Editor Secrets\n# ----------------------------------------------------------------------------\n.idea/\n.vscode/settings.json\n.vscode/launch.json\n*.sublime-workspace\n.project\n.classpath\n.settings/\n\n# ----------------------------------------------------------------------------\n# Application-Specific Secrets\n# ----------------------------------------------------------------------------\nconfig/secrets.yml\nconfig/credentials.yml.enc\nmaster.key\ncredentials.yml.enc\nconfig/master.key\nconfig/credentials/\nwp-config.php\nLocalSettings.php\nsettings_local.py\nlocal_settings.py\nconfiguration.php\n.htpasswd\npasswd\nshadow\n\n# ----------------------------------------------------------------------------\n# Log Files (may contain sensitive data)\n# ----------------------------------------------------------------------------\n*.log\nlogs/\nlog/\nnpm-debug.log*\nyarn-debug.log*\nyarn-error.log*\nlerna-debug.log*\ndebug.log\nerror.log\naccess.log\n\n# ----------------------------------------------------------------------------\n# Cache & Temp Files\n# ----------------------------------------------------------------------------\n.cache/\n*.cache\n.tmp/\ntmp/\ntemp/\n*.tmp\n*.temp\n*.swp\n*.swo\n*~\n\n# ----------------------------------------------------------------------------\n# OS-Generated Files\n# ----------------------------------------------------------------------------\n.DS_Store\n.DS_Store?\n._*\n.Spotlight-V100\n.Trashes\nehthumbs.db\nThumbs.db\ndesktop.ini\n\n# ----------------------------------------------------------------------------\n# Backup Files\n# ----------------------------------------------------------------------------\n*.bak\n*.backup\n*.old\n*.orig\n*~\n\n# ----------------------------------------------------------------------------\n# Build Artifacts (may contain embedded secrets)\n# ----------------------------------------------------------------------------\ndist/\nbuild/\nout/\ntarget/\n*.war\n*.ear\n*.jar\nnode_modules/\nvendor/\n__pycache__/\n*.pyc\n*.pyo\n\n# ----------------------------------------------------------------------------\n# Test Coverage (may expose code structure)\n# ----------------------------------------------------------------------------\ncoverage/\n.nyc_output/\n*.lcov\n.coverage\nhtmlcov/\n\n# ----------------------------------------------------------------------------\n# GoodVibes Plugin Files\n# ----------------------------------------------------------------------------\n.goodvibes/\n";
/**
 * Get the path to the .goodvibes directory
 */
export declare function getGoodVibesDir(cwd: string): string;
/**
 * Get the path to the memory directory
 */
export declare function getMemoryDir(cwd: string): string;
/**
 * Get the path to a specific memory file
 */
export declare function getMemoryFilePath(cwd: string, type: keyof typeof MEMORY_FILES): string;
/**
 * Ensure the .goodvibes directory exists (lazy creation)
 * Also ensures .gitignore has comprehensive security patterns
 */
export declare function ensureGoodVibesDir(cwd: string): void;
/**
 * Ensure the memory directory exists (lazy creation)
 */
export declare function ensureMemoryDir(cwd: string): void;
/**
 * Ensure .gitignore has comprehensive security patterns
 * Only adds patterns not already present
 */
export declare function ensureSecurityGitignore(cwd: string): void;
/**
 * Load all memory files from the .goodvibes/memory directory
 * This is the old API name, delegates to loadProjectMemory
 */
export declare function loadMemory(cwd: string): ProjectMemory;
/**
 * Loads all project memory (decisions, patterns, failures, preferences).
 */
export declare function loadProjectMemory(cwd: string): ProjectMemory;
/**
 * Append a new architectural decision to the decisions file
 */
export declare function appendDecision(cwd: string, decision: Decision): void;
/**
 * Append a new code pattern to the patterns file
 */
export declare function appendPattern(cwd: string, pattern: Pattern): void;
/**
 * Append a failed approach to the failures file
 */
export declare function appendFailure(cwd: string, failure: Failure): void;
/**
 * Append a user preference to the preferences file
 */
export declare function appendPreference(cwd: string, preference: Preference): void;
/**
 * Get current date in ISO format (YYYY-MM-DD)
 */
export declare function getCurrentDate(): string;
/**
 * Check if memory exists for a project
 */
export declare function hasMemory(cwd: string): boolean;
/**
 * Get a summary of the project memory
 */
export declare function getMemorySummary(cwd: string): {
    hasMemory: boolean;
    decisionsCount: number;
    patternsCount: number;
    failuresCount: number;
    preferencesCount: number;
};
/**
 * Search memory for relevant entries based on keywords
 */
export declare function searchMemory(cwd: string, keywords: string[]): {
    decisions: Decision[];
    patterns: Pattern[];
    failures: Failure[];
    preferences: Preference[];
};
/** Formats project memory into a human-readable context string. */
export declare function formatMemoryContext(memory: ProjectMemory): string;
