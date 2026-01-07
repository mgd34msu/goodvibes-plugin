/**
 * Tests for security-patterns.ts
 *
 * This file exports the SECURITY_GITIGNORE_PATTERNS constant containing
 * comprehensive gitignore patterns to protect sensitive files.
 */

import { describe, it, expect } from 'vitest';
import { SECURITY_GITIGNORE_PATTERNS } from '../../shared/security-patterns.js';

describe('security-patterns', () => {
  describe('SECURITY_GITIGNORE_PATTERNS export', () => {
    it('should export a non-empty string', () => {
      expect(typeof SECURITY_GITIGNORE_PATTERNS).toBe('string');
      expect(SECURITY_GITIGNORE_PATTERNS.length).toBeGreaterThan(0);
    });

    it('should contain header comment', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain(
        'GoodVibes Security-Hardened .gitignore'
      );
    });
  });

  describe('Environment Variables & Secrets patterns', () => {
    it('should include .env patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.env');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.env.*');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.env.local');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.env.development');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.env.test');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.env.production');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.env.staging');
    });

    it('should include secrets file patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('secrets.json');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('secrets.yaml');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.secrets');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.secret');
    });
  });

  describe('API Keys & Tokens patterns', () => {
    it('should include key file patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.key');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.pem');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.p12');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.pfx');
    });

    it('should include certificate patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.crt');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.cer');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.der');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.csr');
    });

    it('should include token file patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('api_keys.json');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('tokens.json');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('jwt_secret*');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('signing_key*');
    });
  });

  describe('SSH Keys & Certificates patterns', () => {
    it('should include SSH key patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('id_rsa');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('id_rsa.pub');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('id_dsa');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('id_ecdsa');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('id_ed25519');
    });

    it('should include SSH config patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('known_hosts');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('authorized_keys');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.ssh/');
    });
  });

  describe('AWS Configuration patterns', () => {
    it('should include AWS credential patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.aws/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('aws_credentials');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.aws');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('credentials');
    });

    it('should include S3 config patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.boto');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.s3cfg');
    });
  });

  describe('Google Cloud Platform patterns', () => {
    it('should include GCP credential patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.gcloud/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('gcloud.json');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('service-account*.json');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('gcp-key*.json');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('google-credentials*.json');
    });
  });

  describe('Azure Configuration patterns', () => {
    it('should include Azure credential patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.azure/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('azure.json');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('azure-credentials*.json');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('servicePrincipal*.json');
    });
  });

  describe('Database Credentials & Files patterns', () => {
    it('should include database file patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.sqlite');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.sqlite3');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.db');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.mdb');
    });

    it('should include database config patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('database.json');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('mysql.cnf');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.my.cnf');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.pgpass');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('mongodb.conf');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('redis.conf');
    });
  });

  describe('Terraform State & Secrets patterns', () => {
    it('should include Terraform state patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.tfstate');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.tfstate.*');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.tfvars');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.terraform/');
    });
  });

  describe('Ansible & Infrastructure patterns', () => {
    it('should include Ansible vault patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.vault');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('vault_pass*');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('ansible_vault*');
    });

    it('should include inventory patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('inventory*.ini');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('inventory*.yaml');
    });
  });

  describe('Docker Secrets patterns', () => {
    it('should include Docker patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain(
        'docker-compose.override.yml'
      );
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.docker/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('docker_secrets/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.dockercfg');
    });
  });

  describe('Kubernetes Secrets patterns', () => {
    it('should include Kubernetes patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('kubeconfig');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.kube/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*-kubeconfig');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('secrets.yaml');
    });
  });

  describe('HashiCorp Vault patterns', () => {
    it('should include Vault patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.vault-token');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('vault.hcl');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('vault.json');
    });
  });

  describe('CI/CD Secrets patterns', () => {
    it('should include CI/CD patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.travis.yml.local');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain(
        '.circleci/config.local.yml'
      );
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.github/secrets/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('jenkins_credentials*');
    });
  });

  describe('Package Manager Credentials patterns', () => {
    it('should include npm/yarn patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.npmrc');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.yarnrc');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.npmrc.local');
    });

    it('should include other package manager patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.pip/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.pypirc');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.gem/credentials');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.cargo/credentials');
    });
  });

  describe('IDE & Editor Secrets patterns', () => {
    it('should include IDE patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.idea/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.vscode/settings.json');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.sublime-workspace');
    });
  });

  describe('Application-Specific Secrets patterns', () => {
    it('should include Rails patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('config/secrets.yml');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('master.key');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('credentials.yml.enc');
    });

    it('should include PHP patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('wp-config.php');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('LocalSettings.php');
    });

    it('should include Python patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('settings_local.py');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('local_settings.py');
    });

    it('should include password file patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.htpasswd');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('passwd');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('shadow');
    });
  });

  describe('Log Files patterns', () => {
    it('should include log patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.log');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('logs/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('log/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('npm-debug.log*');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('yarn-debug.log*');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('debug.log');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('error.log');
    });
  });

  describe('Cache & Temp Files patterns', () => {
    it('should include cache patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.cache/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.cache');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.tmp/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('tmp/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('temp/');
    });

    it('should include swap file patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.swp');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.swo');
    });
  });

  describe('OS-Generated Files patterns', () => {
    it('should include macOS patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.DS_Store');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('._*');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.Spotlight-V100');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.Trashes');
    });

    it('should include Windows patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('ehthumbs.db');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('Thumbs.db');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('desktop.ini');
    });
  });

  describe('Backup Files patterns', () => {
    it('should include backup patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.bak');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.backup');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.old');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.orig');
    });
  });

  describe('Build Artifacts patterns', () => {
    it('should include build directory patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('dist/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('build/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('out/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('target/');
    });

    it('should include dependency patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('node_modules/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('vendor/');
    });

    it('should include compiled file patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.war');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.ear');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.jar');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.pyc');
    });
  });

  describe('Test Coverage patterns', () => {
    it('should include coverage patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('coverage/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.nyc_output/');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('*.lcov');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.coverage');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('htmlcov/');
    });
  });

  describe('GoodVibes Plugin Files patterns', () => {
    it('should include GoodVibes patterns', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('.goodvibes/');
    });
  });

  describe('section organization', () => {
    it('should have section headers', () => {
      expect(SECURITY_GITIGNORE_PATTERNS).toContain(
        '# Environment Variables & Secrets'
      );
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('# API Keys & Tokens');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain(
        '# SSH Keys & Certificates'
      );
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('# AWS Configuration');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('# Google Cloud Platform');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('# Azure Configuration');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain(
        '# Database Credentials & Files'
      );
      expect(SECURITY_GITIGNORE_PATTERNS).toContain(
        '# Terraform State & Secrets'
      );
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('# Docker Secrets');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('# Kubernetes Secrets');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('# CI/CD Secrets');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('# Log Files');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('# Cache & Temp Files');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('# OS-Generated Files');
      expect(SECURITY_GITIGNORE_PATTERNS).toContain('# Build Artifacts');
    });
  });
});
