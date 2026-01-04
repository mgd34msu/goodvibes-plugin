/**
 * Security-hardened gitignore patterns
 *
 * Comprehensive gitignore patterns organized by category to protect sensitive files
 * from being committed to version control.
 */

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
