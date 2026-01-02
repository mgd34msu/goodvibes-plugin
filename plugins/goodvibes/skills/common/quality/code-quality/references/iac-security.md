# Infrastructure as Code Security Patterns

Security scanning and best practices for Terraform, CloudFormation, Kubernetes, and other IaC tools.

## Terraform Security

### Common Vulnerabilities

#### 1. Exposed Resources

```hcl
# INSECURE: Public S3 bucket
resource "aws_s3_bucket" "data" {
  bucket = "my-data-bucket"
  acl    = "public-read"  # VULNERABLE
}

# SECURE: Private with encryption
resource "aws_s3_bucket" "data" {
  bucket = "my-data-bucket"
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket = aws_s3_bucket.data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}
```

#### 2. Overly Permissive Security Groups

```hcl
# INSECURE: Open to world
resource "aws_security_group" "web" {
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # VULNERABLE
  }
}

# SECURE: Restricted access
resource "aws_security_group" "web" {
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]  # Internal only
  }

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    cidr_blocks     = ["0.0.0.0/0"]  # OK for HTTPS
  }
}
```

#### 3. Hardcoded Secrets

```hcl
# INSECURE: Hardcoded credentials
resource "aws_db_instance" "main" {
  username = "admin"
  password = "super_secret_password"  # VULNERABLE
}

# SECURE: Use variables or secrets manager
variable "db_password" {
  type      = string
  sensitive = true
}

resource "aws_db_instance" "main" {
  username = "admin"
  password = var.db_password
}

# Or use Secrets Manager
data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = "prod/db/password"
}

resource "aws_db_instance" "main" {
  username = "admin"
  password = data.aws_secretsmanager_secret_version.db_password.secret_string
}
```

#### 4. Unencrypted Resources

```hcl
# INSECURE: Unencrypted EBS
resource "aws_ebs_volume" "data" {
  availability_zone = "us-east-1a"
  size              = 100
  # Missing encryption
}

# SECURE: Encrypted with KMS
resource "aws_ebs_volume" "data" {
  availability_zone = "us-east-1a"
  size              = 100
  encrypted         = true
  kms_key_id        = aws_kms_key.ebs.arn
}
```

### Scanning Tools

```bash
# tfsec (comprehensive)
tfsec .

# checkov (multi-framework)
checkov -d .

# terrascan
terrascan scan -i terraform

# Snyk IaC
snyk iac test
```

---

## CloudFormation Security

### Common Vulnerabilities

#### 1. Public Resources

```yaml
# INSECURE
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      AccessControl: PublicRead  # VULNERABLE

# SECURE
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: aws:kms
```

#### 2. Overly Permissive IAM

```yaml
# INSECURE: Admin access
Resources:
  MyRole:
    Type: AWS::IAM::Role
    Properties:
      Policies:
        - PolicyDocument:
            Statement:
              - Effect: Allow
                Action: "*"          # VULNERABLE
                Resource: "*"        # VULNERABLE

# SECURE: Least privilege
Resources:
  MyRole:
    Type: AWS::IAM::Role
    Properties:
      Policies:
        - PolicyDocument:
            Statement:
              - Effect: Allow
                Action:
                  - s3:GetObject
                  - s3:PutObject
                Resource:
                  - !Sub "arn:aws:s3:::${MyBucket}/*"
```

### Scanning Tools

```bash
# cfn-lint
cfn-lint template.yaml

# cfn_nag
cfn_nag_scan --input-path template.yaml

# checkov
checkov -f template.yaml
```

---

## Kubernetes Security

### Common Vulnerabilities

#### 1. Privileged Containers

```yaml
# INSECURE
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    securityContext:
      privileged: true           # VULNERABLE
      runAsRoot: true            # VULNERABLE

# SECURE
apiVersion: v1
kind: Pod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 1000
  containers:
  - name: app
    securityContext:
      privileged: false
      readOnlyRootFilesystem: true
      allowPrivilegeEscalation: false
      capabilities:
        drop:
          - ALL
```

#### 2. Missing Resource Limits

```yaml
# INSECURE: No limits
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    image: myapp:latest

# SECURE: With limits
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    image: myapp:1.2.3  # Pin version
    resources:
      requests:
        memory: "64Mi"
        cpu: "250m"
      limits:
        memory: "128Mi"
        cpu: "500m"
```

#### 3. Exposed Secrets

```yaml
# INSECURE: Plain text secrets
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    env:
    - name: DB_PASSWORD
      value: "plaintext_password"  # VULNERABLE

# SECURE: Use Kubernetes Secrets
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    env:
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: db-credentials
          key: password
```

### Scanning Tools

```bash
# kubesec
kubesec scan pod.yaml

# kube-bench (CIS benchmarks)
kube-bench

# kube-linter
kube-linter lint manifests/

# checkov
checkov -d manifests/

# Polaris
polaris audit --audit-path manifests/
```

---

## Docker Security

### Dockerfile Best Practices

```dockerfile
# INSECURE
FROM ubuntu:latest           # Unpinned version
USER root                    # Running as root
COPY . /app                  # Copies secrets

# SECURE
FROM ubuntu:22.04@sha256:abc123...  # Pinned with digest
RUN useradd -r -u 1001 appuser
USER appuser
COPY --chown=appuser:appuser app/ /app/

# Multi-stage build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM gcr.io/distroless/nodejs20
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
USER nonroot
CMD ["dist/main.js"]
```

### Scanning Tools

```bash
# Trivy
trivy image myapp:latest
trivy config Dockerfile

# Hadolint
hadolint Dockerfile

# Snyk Container
snyk container test myapp:latest

# Docker Scout
docker scout cves myapp:latest
```

---

## CI/CD Security Integration

### GitHub Actions

```yaml
name: IaC Security
on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: tfsec
        uses: aquasecurity/tfsec-action@v1.0.0
        with:
          soft_fail: false

      - name: checkov
        uses: bridgecrewio/checkov-action@v12
        with:
          directory: terraform/
          framework: terraform

      - name: trivy
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'config'
          scan-ref: '.'
```

### Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/antonbabenko/pre-commit-terraform
    rev: v1.88.0
    hooks:
      - id: terraform_tfsec
      - id: terraform_checkov

  - repo: https://github.com/hadolint/hadolint
    rev: v2.12.0
    hooks:
      - id: hadolint

  - repo: https://github.com/zricethezav/gitleaks
    rev: v8.18.1
    hooks:
      - id: gitleaks
```

---

## Security Checklist by Resource Type

### Compute Resources

- [ ] No SSH/RDP open to 0.0.0.0/0
- [ ] IMDSv2 required (AWS EC2)
- [ ] No public IP unless required
- [ ] Encrypted volumes
- [ ] Hardened AMI/image

### Storage Resources

- [ ] Encryption at rest enabled
- [ ] Encryption in transit required
- [ ] No public access
- [ ] Versioning enabled (for data protection)
- [ ] Access logging enabled

### Database Resources

- [ ] Encryption at rest
- [ ] TLS required for connections
- [ ] No public accessibility
- [ ] Automated backups enabled
- [ ] Secrets in secrets manager

### Network Resources

- [ ] Least privilege security groups
- [ ] VPC flow logs enabled
- [ ] No default VPC usage
- [ ] Private subnets for backend
- [ ] WAF for public endpoints

### IAM Resources

- [ ] No wildcard actions
- [ ] No wildcard resources
- [ ] MFA required for humans
- [ ] Short-lived credentials
- [ ] Regular access reviews

---

## Policy as Code

### OPA/Rego Policies

```rego
# deny_public_s3.rego
package terraform

deny[msg] {
    resource := input.resource.aws_s3_bucket[name]
    resource.acl == "public-read"
    msg := sprintf("S3 bucket %s should not be public", [name])
}

deny[msg] {
    resource := input.resource.aws_security_group[name]
    rule := resource.ingress[_]
    rule.cidr_blocks[_] == "0.0.0.0/0"
    rule.from_port <= 22
    rule.to_port >= 22
    msg := sprintf("Security group %s allows SSH from anywhere", [name])
}
```

### Sentinel Policies (Terraform Enterprise)

```hcl
# require_encryption.sentinel
import "tfplan/v2" as tfplan

aws_s3_buckets = filter tfplan.resource_changes as _, rc {
    rc.type is "aws_s3_bucket" and
    rc.mode is "managed" and
    (rc.change.actions contains "create" or rc.change.actions contains "update")
}

all_encrypted = rule {
    all aws_s3_buckets as _, bucket {
        bucket.change.after.server_side_encryption_configuration is not null
    }
}

main = rule {
    all_encrypted
}
```
