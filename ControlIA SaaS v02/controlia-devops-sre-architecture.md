# SISTEMA DEVOPS/SRE ENTERPRISE - ControlIA
## Plataforma de Agentes de IA Empresarial

**Version:** 1.0  
**Fecha:** Enero 2025  
**Autor:** Equipo DevOps/SRE  
**Clasificacion:** Arquitectura Enterprise

---

## INDICE

1. [Vision General](#vision-general)
2. [CI/CD Pipeline Enterprise](#cicd-pipeline-enterprise)
3. [Infraestructura como Codigo](#infraestructura-como-codigo)
4. [Contenedores y Orquestacion](#contenedores-y-orquestacion)
5. [Observabilidad](#observabilidad)
6. [Practicas SRE](#practicas-sre)
7. [Testing Strategy](#testing-strategy)
8. [Security en CI/CD](#security-en-cicd)
9. [Platform Engineering](#platform-engineering)
10. [Runbooks de Operacion](#runbooks-de-operacion)
11. [Checklist de Deployment](#checklist-de-deployment)

---

## 1. VISION GENERAL

### 1.1 Arquitectura de Alto Nivel

```
+-----------------------------------------------------------------------------+
|                           CONTROLIA PLATFORM                                 |
|                    Sistema de Agentes de IA Empresarial                     |
+-----------------------------------------------------------------------------+
|                                                                              |
|  +-------------+  +-------------+  +-------------+  +-------------+         |
|  |   Web App   |  |  Telegram   |  |    API      |  |  Dashboard  |         |
|  |   (Next.js) |  |    Bot      |  |  (FastAPI)  |  |  (React)    |         |
|  +------+------+  +------+------+  +------+------+  +------+------+         |
|         +------------------+------------------+------------------+          |
|                                    |                                         |
|                    +---------------+---------------+                         |
|                    |      API Gateway (Kong)       |                         |
|                    |   Rate Limiting, Auth, SSL    |                         |
|                    +---------------+---------------+                         |
|                                    |                                         |
|  +---------------------------------+---------------------------------+      |
|  |                    KUBERNETES CLUSTER (EKS)                       |      |
|  |  +-------------+  +-------------+  +-------------+  +----------+  |      |
|  |  |   Core      |  |   Agents    |  |  Analytics  |  |  Billing |  |      |
|  |  |  Services   |  |  Engine     |  |   Service   |  |  Service |  |      |
|  |  +-------------+  +-------------+  +-------------+  +----------+  |      |
|  |                                                                   |      |
|  |  +-------------+  +-------------+  +-------------+  +----------+  |      |
|  |  |    LLM      |  |   Vector    |  |    Cache    |  |  Queue   |  |      |
|  |  |  Gateway    |  |    DB       |  |   (Redis)   |  | (Rabbit) |  |      |
|  |  +-------------+  +-------------+  +-------------+  +----------+  |      |
|  +-------------------------------------------------------------------+      |
|                                    |                                         |
|  +---------------------------------+---------------------------------+      |
|  |                         DATA LAYER                                 |      |
|  |  +-------------+  +-------------+  +-------------+  +----------+  |      |
|  |  | PostgreSQL  |  |   MongoDB   |  |Elasticsearch|  |   S3     |  |      |
|  |  |  (Primary)  |  |  (Documents)|  |  (Search)   |  | (Files)  |  |      |
|  |  +-------------+  +-------------+  +-------------+  +----------+  |      |
|  +-------------------------------------------------------------------+      |
|                                                                              |
+-----------------------------------------------------------------------------+
```

### 1.2 Principios Fundamentales

| Principio | Descripcion | Implementacion |
|-----------|-------------|----------------|
| **GitOps** | Todo en Git, despliegue automatico | ArgoCD + GitHub |
| **IaC** | Infraestructura versionada | Terraform + Pulumi |
| **Observabilidad** | Metricas, logs, traces unificados | OpenTelemetry stack |
| **Seguridad Shift-Left** | Seguridad desde el desarrollo | DevSecOps pipeline |
| **SRE** | Confiabilidad medida con SLOs | Error budgets, SLIs |
| **Self-Service** | Developers autonomos | Backstage portal |

---

## 2. CI/CD PIPELINE ENTERPRISE

### 2.1 Comparativa: GitHub Actions vs GitLab CI vs Jenkins

| Criterio | GitHub Actions | GitLab CI | Jenkins |
|----------|---------------|-----------|---------|
| **Integracion** | Nativa con GitHub | Nativa con GitLab | Requiere plugins |
| **Escalabilidad** | GitHub-hosted runners | Auto-scaling runners | Con Kubernetes |
| **Costo** | Gratis 2000 min/mes | 400 min CI gratis | Open source |
| **Seguridad** | OIDC, secrets | Vault integration | Con plugins |
| **Community** | Marketplace enorme | Buena documentacion | Muy maduro |
| **Cache** | GitHub Cache | Distributed cache | Con plugins |

### DECISION: GitHub Actions + GitLab CI (hibrido)

- **GitHub Actions**: Para repositorios de aplicaciones, integracion nativa
- **GitLab CI**: Para infraestructura, mejor soporte para Terraform

### 2.2 Pipeline Completo (GitHub Actions)

```yaml
# .github/workflows/enterprise-pipeline.yml
name: Enterprise CI/CD Pipeline

on:
  push:
    branches: [main, develop, 'release/*']
  pull_request:
    branches: [main, develop]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}
  AWS_REGION: us-east-1
  EKS_CLUSTER: controlia-production

jobs:
  # STAGE 1: PRE-COMMIT & VALIDATION
  pre-commit:
    name: Pre-commit Checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run pre-commit hooks
        uses: pre-commit/action@v3.0.0
      - name: Lint commits
        uses: wagoid/commitlint-github-action@v5

  # STAGE 2: BUILD & UNIT TESTS
  build:
    name: Build & Unit Tests
    runs-on: ubuntu-latest
    needs: pre-commit
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Run unit tests with coverage
        run: npm run test:unit -- --coverage
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
      - name: Build application
        run: npm run build

  # STAGE 3: SECURITY SCANNING
  security-sast:
    name: SAST Security Scan
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
      - name: Run SonarQube Scan
        uses: SonarSource/sonarqube-scan-action@master
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
      - name: Run Snyk Code Test
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          command: code test
          args: --severity-threshold=high

  security-sca:
    name: Dependency Scan
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
      - name: Run Snyk to check dependencies
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

  security-secrets:
    name: Secret Detection
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Run TruffleHog
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: main
          head: HEAD
          extra_args: --debug --only-verified

  # STAGE 4: CONTAINER BUILD & SCAN
  container-build:
    name: Container Build & Scan
    runs-on: ubuntu-latest
    needs: [security-sast, security-sca, security-secrets]
    permissions:
      contents: read
      packages: write
      security-events: write
    outputs:
      image_tag: ${{ steps.meta.outputs.tags }}
      image_digest: ${{ steps.build.outputs.digest }}
    steps:
      - uses: actions/checkout@v4
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=sha,prefix={{branch}}-
            type=semver,pattern={{version}}
      - name: Build and push
        id: build
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          platforms: linux/amd64,linux/arm64
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          format: 'sarif'
          output: 'trivy-results.sarif'
      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'

  # STAGE 5: INTEGRATION TESTS
  integration-tests:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: container-build
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: controlia_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/controlia_test
          REDIS_URL: redis://localhost:6379

  # STAGE 6: E2E TESTS
  e2e-tests:
    name: E2E Tests (Playwright)
    runs-on: ubuntu-latest
    needs: container-build
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright
        run: npx playwright install --with-deps
      - name: Run E2E tests
        run: npx playwright test
      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30

  # STAGE 7: LOAD TESTING
  load-tests:
    name: Load Testing (k6)
    runs-on: ubuntu-latest
    needs: container-build
    steps:
      - uses: actions/checkout@v4
      - name: Run k6 load test
        uses: grafana/k6-action@v0.3.1
        with:
          filename: ./tests/load/k6-load-test.js

  # STAGE 8: DEPLOY TO STAGING
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: [integration-tests, e2e-tests]
    if: github.ref == 'refs/heads/develop'
    environment:
      name: staging
      url: https://staging.controlia.io
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}
      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name ${{ env.EKS_CLUSTER }}-staging
      - name: Deploy to Staging (ArgoCD)
        run: |
          argocd app sync controlia-staging \
            --server argocd.controlia.io \
            --auth-token ${{ secrets.ARGOCD_TOKEN }}

  # STAGE 9: CANARY DEPLOYMENT TO PRODUCTION
  deploy-production-canary:
    name: Canary Deployment
    runs-on: ubuntu-latest
    needs: [integration-tests, e2e-tests, load-tests]
    if: github.ref == 'refs/heads/main'
    environment:
      name: production
      url: https://controlia.io
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}
      - name: Deploy Canary (Flagger)
        run: |
          kubectl apply -f k8s/canary/flagger-canary.yaml
          kubectl wait --for=condition=Promoted canary/controlia-api --timeout=600s

  # STAGE 10: DAST & PRODUCTION VALIDATION
  dast-scan:
    name: DAST Security Scan
    runs-on: ubuntu-latest
    needs: deploy-production-canary
    steps:
      - name: OWASP ZAP Full Scan
        uses: zaproxy/action-full-scan@v0.7.0
        with:
          target: 'https://controlia.io'
          rules_file_name: '.zap/rules.tsv'
          cmd_options: '-a'

  # STAGE 11: SMOKE TESTS & ROLLBACK CHECK
  smoke-tests:
    name: Smoke Tests
    runs-on: ubuntu-latest
    needs: deploy-production-canary
    steps:
      - uses: actions/checkout@v4
      - name: Run smoke tests
        run: ./scripts/smoke-tests.sh https://controlia.io
      - name: Check error rate
        run: |
          ERROR_RATE=$(curl -s "https://grafana.controlia.io/api/datasources/proxy/1/api/v1/query?query=rate(http_requests_total{status=~\"5..\"}[5m])" | jq '.data.result[0].value[1]')
          if (( $(echo "$ERROR_RATE > 0.01" | bc -l) )); then
            echo "Error rate too high: $ERROR_RATE"
            exit 1
          fi

  # STAGE 12: PROMOTE TO FULL PRODUCTION
  promote-production:
    name: Promote to Production
    runs-on: ubuntu-latest
    needs: [dast-scan, smoke-tests]
    steps:
      - name: Promote canary to 100%
        run: |
          kubectl patch canary controlia-api -p '{"spec":{"targetWeight":100}}' --type=merge
      - name: Notify Slack
        uses: slackapi/slack-github-action@v1.24.0
        with:
          payload: |
            {
              "text": "ControlIA deployed to production successfully!",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Deployment Successful*\nVersion: ${{ github.sha }}\nEnvironment: Production"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### 2.3 Feature Flags con LaunchDarkly

```javascript
// config/feature-flags.js
import { init } from 'launchdarkly-node-server-sdk';

const ldClient = init(process.env.LD_SDK_KEY);

export async function isFeatureEnabled(featureKey, user, defaultValue = false) {
  await ldClient.waitForInitialization();
  return ldClient.variation(featureKey, user, defaultValue);
}

// Feature flags para ControlIA
export const FEATURES = {
  NEW_AGENT_UI: 'new-agent-ui',
  ADVANCED_ANALYTICS: 'advanced-analytics',
  MULTI_LANGUAGE: 'multi-language-support',
  ENTERPRISE_BILLING: 'enterprise-billing',
  AI_MODEL_GPT4: 'ai-model-gpt4',
  REALTIME_NOTIFICATIONS: 'realtime-notifications',
  CUSTOM_INTEGRATIONS: 'custom-integrations',
};

// Uso en el codigo
const user = {
  key: userId,
  email: userEmail,
  custom: {
    plan: userPlan,
    companySize: companySize,
  },
};

if (await isFeatureEnabled(FEATURES.NEW_AGENT_UI, user)) {
  // Mostrar nueva UI
}
```

### 2.4 Canary Deployment con Flagger

```yaml
# k8s/canary/flagger-canary.yaml
apiVersion: flagger.app/v1beta1
kind: Canary
metadata:
  name: controlia-api
  namespace: production
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: controlia-api
  service:
    port: 8080
    gateways:
      - istio-gateway
    hosts:
      - api.controlia.io
  analysis:
    interval: 1m
    threshold: 5
    maxWeight: 50
    stepWeight: 10
    metrics:
      - name: request-success-rate
        thresholdRange:
          min: 99
        interval: 1m
      - name: request-duration
        thresholdRange:
          max: 500
        interval: 1m
    webhooks:
      - name: load-test
        url: http://flagger-loadtester.test/
        timeout: 5s
        metadata:
          cmd: "hey -z 1m -q 10 -c 2 http://controlia-api:8080/health"
      - name: conformance-test
        type: pre-rollout
        url: http://flagger-loadtester.test/
        timeout: 30s
        metadata:
          type: bash
          cmd: "curl -sf http://controlia-api:8080/ready"
      - name: rollback
        type: rollback
        url: http://flagger-loadtester.test/
        timeout: 5s
        metadata:
          cmd: "curl -X POST https://pagerduty.com/integration/rollback"
```

### 2.5 Rollback Automatico

```yaml
# .github/workflows/rollback.yml
name: Emergency Rollback

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to rollback'
        required: true
        default: 'production'
        type: choice
        options:
          - staging
          - production
      revision:
        description: 'Revision to rollback to (git SHA)'
        required: true

jobs:
  rollback:
    runs-on: ubuntu-latest
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1
      
      - name: Rollback deployment
        run: |
          kubectl rollout undo deployment/controlia-api -n ${{ github.event.inputs.environment }}
          kubectl rollout status deployment/controlia-api -n ${{ github.event.inputs.environment }}
      
      - name: Verify rollback
        run: |
          kubectl get pods -n ${{ github.event.inputs.environment }} -l app=controlia-api
      
      - name: Create incident
        run: |
          curl -X POST https://api.pagerduty.com/incidents \
            -H "Authorization: Bearer ${{ secrets.PAGERDUTY_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{
              "incident": {
                "type": "incident",
                "title": "Emergency Rollback Executed",
                "service": {"id": "CONTROLIA_SERVICE", "type": "service_reference"},
                "urgency": "high",
                "body": {"type": "incident_body", "details": "Rollback to ${{ github.event.inputs.revision }}"}
              }
            }'
```

---

## 3. INFRAESTRUCTURA COMO CODIGO

### 3.1 Comparativa: Terraform vs Pulumi vs CloudFormation

| Criterio | Terraform | Pulumi | CloudFormation |
|----------|-----------|--------|----------------|
| **Lenguaje** | HCL | TypeScript/Python/Go | YAML/JSON |
| **Multi-cloud** | Multi-cloud | Multi-cloud | AWS only |
| **State** | Remote backends | Built-in | AWS managed |
| **Testing** | Terratest | Unit tests | Limited |
| **Modularity** | Modules | Packages | Nested stacks |
| **Community** | Enorme | Creciente | AWS focused |
| **IDE Support** | Bueno | Excelente | Basico |

### DECISION: Terraform + Pulumi (hibrido)

- **Terraform**: Infraestructura base (VPC, EKS, RDS)
- **Pulumi**: Recursos dinamicos, aplicaciones complejas

### 3.2 Estructura de Terraform

```
terraform/
├── environments/
│   ├── dev/
│   ├── staging/
│   └── production/
├── modules/
│   ├── vpc/
│   ├── eks/
│   ├── rds/
│   ├── s3/
│   ├── iam/
│   └── monitoring/
├── global/
│   ├── iam/
│   └── route53/
└── backend.tf
```

### 3.3 Modulo VPC (Terraform)

```hcl
# terraform/modules/vpc/main.tf
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  common_tags = {
    Project     = "ControlIA"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# VPC Principal
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "controlia-vpc-${var.environment}"
  })
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags = merge(local.common_tags, {
    Name = "controlia-igw-${var.environment}"
  })
}

# Subnets Publicas
resource "aws_subnet" "public" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "controlia-public-${count.index + 1}"
    Type = "public"
    "kubernetes.io/role/elb" = "1"
  })
}

# Subnets Privadas
resource "aws_subnet" "private" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = var.availability_zones[count.index]

  tags = merge(local.common_tags, {
    Name = "controlia-private-${count.index + 1}"
    Type = "private"
    "kubernetes.io/role/internal-elb" = "1"
  })
}

# NAT Gateways
resource "aws_nat_gateway" "main" {
  count         = length(var.availability_zones)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(local.common_tags, {
    Name = "controlia-nat-${count.index + 1}"
  })

  depends_on = [aws_internet_gateway.main]
}

resource "aws_eip" "nat" {
  count  = length(var.availability_zones)
  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "controlia-eip-nat-${count.index + 1}"
  })
}

# Flow Logs para VPC
resource "aws_flow_log" "main" {
  vpc_id                   = aws_vpc.main.id
  traffic_type             = "ALL"
  log_destination_type     = "s3"
  log_destination          = aws_s3_bucket.flow_logs.arn
  max_aggregation_interval = 60
  tags = local.common_tags
}

resource "aws_s3_bucket" "flow_logs" {
  bucket = "controlia-vpc-flowlogs-${var.environment}"
  tags = local.common_tags
}
```

### 3.4 Modulo EKS (Terraform)

```hcl
# terraform/modules/eks/main.tf
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = "controlia-${var.environment}"
  cluster_version = "1.28"

  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true

  vpc_id     = var.vpc_id
  subnet_ids = var.private_subnet_ids

  # EKS Managed Node Groups
  eks_managed_node_groups = {
    general = {
      desired_size = var.node_desired_size
      min_size     = var.node_min_size
      max_size     = var.node_max_size

      instance_types = var.instance_types
      capacity_type  = "ON_DEMAND"

      labels = { workload = "general" }

      update_config = {
        max_unavailable_percentage = 25
      }

      tags = {
        "k8s.io/cluster-autoscaler/enabled" = "true"
        "k8s.io/cluster-autoscaler/controlia-${var.environment}" = "owned"
      }
    }

    spot = {
      desired_size = var.spot_desired_size
      min_size     = var.spot_min_size
      max_size     = var.spot_max_size

      instance_types = ["m6i.large", "m5.large", "m5a.large"]
      capacity_type  = "SPOT"

      labels = { workload = "spot" }

      taints = [{
        key    = "spot"
        value  = "true"
        effect = "NO_SCHEDULE"
      }]
    }
  }

  # Addons
  cluster_addons = {
    coredns = { most_recent = true }
    kube-proxy = { most_recent = true }
    vpc-cni = { most_recent = true }
    aws-ebs-csi-driver = { most_recent = true }
    aws-efs-csi-driver = { most_recent = true }
  }

  # IRSA (IAM Roles for Service Accounts)
  enable_irsa = true
  tags = var.common_tags
}
```

### 3.5 State Management Remoto

```hcl
# terraform/backend.tf
terraform {
  backend "s3" {
    bucket         = "controlia-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "controlia-terraform-locks"
    workspace_key_prefix = "environments"
  }
}

# DynamoDB para locking
resource "aws_dynamodb_table" "terraform_locks" {
  name         = "controlia-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name = "Terraform State Lock Table"
  }
}
```

### 3.6 GitOps con ArgoCD

```yaml
# argocd/applications/controlia-core.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: controlia-core
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
  annotations:
    argocd.argoproj.io/sync-wave: "1"
spec:
  project: controlia
  source:
    repoURL: https://github.com/controlia/infrastructure.git
    targetRevision: HEAD
    path: k8s/overlays/production
    helm:
      valueFiles:
        - values-production.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
      - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas
```

### 3.7 App of Apps Pattern

```yaml
# argocd/app-of-apps.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: controlia-app-of-apps
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/controlia/infrastructure.git
    targetRevision: HEAD
    path: argocd/applications
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

---

## 4. CONTENEDORES Y ORQUESTACION

### 4.1 Dockerfile Optimizado (Multi-stage)

```dockerfile
# Dockerfile
# STAGE 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# STAGE 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production
RUN npm run build

# STAGE 3: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV PORT 3000

# Crear usuario no-root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copiar solo lo necesario
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV HOSTNAME "0.0.0.0"

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
```

### 4.2 Docker Compose para Desarrollo

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/controlia
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    networks:
      - controlia-network

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: controlia
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - controlia-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - controlia-network

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    networks:
      - controlia-network

volumes:
  postgres_data:
  redis_data:
  minio_data:

networks:
  controlia-network:
    driver: bridge
```

### 4.3 Helm Chart para ControlIA

```yaml
# helm/controlia/Chart.yaml
apiVersion: v2
name: controlia
description: ControlIA - Enterprise AI Agent Platform
type: application
version: 1.0.0
appVersion: "1.0.0"

dependencies:
  - name: postgresql
    version: 12.12.10
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled
  
  - name: redis
    version: 18.6.1
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled
```

```yaml
# helm/controlia/values-production.yaml
global:
  environment: production
  domain: controlia.io

api:
  replicaCount: 5
  
  image:
    repository: ghcr.io/controlia/api
    tag: latest
    pullPolicy: Always
  
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 4Gi
  
  autoscaling:
    enabled: true
    minReplicas: 5
    maxReplicas: 50
    targetCPUUtilizationPercentage: 70
    targetMemoryUtilizationPercentage: 80
  
  podDisruptionBudget:
    enabled: true
    minAvailable: 3
  
  service:
    type: ClusterIP
    port: 8080
  
  ingress:
    enabled: true
    className: nginx
    annotations:
      nginx.ingress.kubernetes.io/ssl-redirect: "true"
      nginx.ingress.kubernetes.io/proxy-body-size: "50m"
      cert-manager.io/cluster-issuer: "letsencrypt-prod"
    hosts:
      - host: api.controlia.io
        paths:
          - path: /
            pathType: Prefix
    tls:
      - secretName: api-controlia-tls
        hosts:
          - api.controlia.io
  
  livenessProbe:
    httpGet:
      path: /health
      port: 8080
    initialDelaySeconds: 30
    periodSeconds: 10
    timeoutSeconds: 5
    failureThreshold: 3
  
  readinessProbe:
    httpGet:
      path: /ready
      port: 8080
    initialDelaySeconds: 5
    periodSeconds: 5
    timeoutSeconds: 3
    failureThreshold: 3

web:
  replicaCount: 3
  image:
    repository: ghcr.io/controlia/web
    tag: latest
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 20
```

### 4.4 Service Mesh con Istio

```yaml
# istio/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    istio-injection: enabled
---
# istio/peer-authentication.yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: production
spec:
  mtls:
    mode: STRICT
---
# istio/destination-rule.yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: controlia-api
  namespace: production
spec:
  host: controlia-api
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        http1MaxPendingRequests: 100
        http2MaxRequests: 1000
    loadBalancer:
      simple: LEAST_REQUEST
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 30s
      baseEjectionTime: 30s
  subsets:
    - name: stable
      labels:
        version: stable
    - name: canary
      labels:
        version: canary
---
# istio/virtual-service.yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: controlia-api
  namespace: production
spec:
  hosts:
    - api.controlia.io
  gateways:
    - controlia-gateway
  http:
    - match:
        - headers:
            canary:
              exact: "true"
      route:
        - destination:
            host: controlia-api
            subset: canary
          weight: 100
    - route:
        - destination:
            host: controlia-api
            subset: stable
          weight: 90
        - destination:
            host: controlia-api
            subset: canary
          weight: 10
      retries:
        attempts: 3
        perTryTimeout: 2s
      timeout: 10s
```

---

## 5. OBSERVABILIDAD

### 5.1 Stack de Observabilidad Completo

```
+-----------------------------------------------------------------------------+
|                    OBSERVABILITY STACK - ControlIA                          |
+-----------------------------------------------------------------------------+
|                                                                              |
|  +-----------------------------------------------------------------------+   |
|  |                        VISUALIZATION LAYER                             |   |
|  |  +-------------+  +-------------+  +-------------+  +----------+      |   |
|  |  |   Grafana   |  |  Custom     |  |   Kibana    |  | Jaeger   |      |   |
|  |  | (Metrics)   |  |  Dashboards |  |   (Logs)    |  | (Traces) |      |   |
|  |  +-------------+  +-------------+  +-------------+  +----------+      |   |
|  +-----------------------------------------------------------------------+   |
|                                    |                                         |
|  +---------------------------------+-------------------------------------+  |
|  |                    COLLECTION & STORAGE LAYER                        |  |
|  |                                                                      |  |
|  |  METRICS          LOGS            TRACES           ALERTS            |  |
|  |  +---------+    +---------+    +---------+      +---------+        |  |
|  |  |Prometheus|   |  Loki   |    | Tempo   |      | Alert   |        |  |
|  |  |  (TSDB) |    | (Log DB)|    |(TraceDB)|      | Manager |        |  |
|  |  +----+----+    +----+----+    +----+----+      +----+----+        |  |
|  |       |              |              |                |              |  |
|  |  +----+----+    +----+----+    +----+----+      +----+----+        |  |
|  |  |Promtail |    |Promtail |    | Open-   |      | Pager-  |        |  |
|  |  |(Agent)  |    |(Agent)  |    |Telemetry|      |  Duty   |        |  |
|  |  +---------+    +---------+    +---------+      +---------+        |  |
|  +---------------------------------------------------------------------+  |
|                                    |                                         |
|  +---------------------------------+-------------------------------------+  |
|  |                         INSTRUMENTATION LAYER                        |  |
|  |                                                                      |  |
|  |  +-------------+  +-------------+  +-------------+  +----------+    |  |
|  |  |  Open-      |  |  Node.js    |  |  Python     |  |  Go      |    |  |
|  |  | Telemetry   |  |  SDK        |  |  SDK        |  |  SDK     |    |  |
|  |  |  (Auto)     |  |  (Manual)   |  |  (Manual)   |  |  (Auto)  |    |  |
|  |  +-------------+  +-------------+  +-------------+  +----------+    |  |
|  +---------------------------------------------------------------------+  |
|                                                                              |
+-----------------------------------------------------------------------------+
```

### 5.2 Prometheus + Grafana Stack

```yaml
# monitoring/prometheus-values.yaml
prometheus:
  prometheusSpec:
    retention: 30d
    retentionSize: "50GB"
    scrapeInterval: 15s
    evaluationInterval: 15s
    
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: gp3
          resources:
            requests:
              storage: 100Gi
    
    additionalScrapeConfigs:
      - job_name: 'controlia-api'
        kubernetes_sd_configs:
          - role: pod
            namespaces:
              names:
                - production
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
            action: keep
            regex: true

    additionalPrometheusRulesMap:
      controlia-rules:
        groups:
          - name: controlia-slo
            interval: 30s
            rules:
              # Availability SLO: 99.9%
              - alert: HighErrorRate
                expr: |
                  sum(rate(http_requests_total{status=~"5.."}[5m])) 
                  / sum(rate(http_requests_total[5m])) > 0.001
                for: 2m
                labels:
                  severity: critical
                  team: sre
                annotations:
                  summary: "High error rate detected"
                  description: "Error rate is {{ $value }}"
              
              # Latency SLO: 95th percentile < 200ms
              - alert: HighLatency
                expr: |
                  histogram_quantile(0.95, 
                    sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
                  ) > 0.2
                for: 5m
                labels:
                  severity: warning
                  team: sre
                annotations:
                  summary: "High latency detected"

grafana:
  enabled: true
  adminPassword: admin
  persistence:
    enabled: true
    size: 10Gi
  
  datasources:
    datasources.yaml:
      apiVersion: 1
      datasources:
        - name: Prometheus
          type: prometheus
          url: http://prometheus-server.monitoring.svc.cluster.local
          access: proxy
          isDefault: true
        - name: Loki
          type: loki
          url: http://loki.monitoring.svc.cluster.local:3100
        - name: Tempo
          type: tempo
          url: http://tempo.monitoring.svc.cluster.local:3100
```

### 5.3 Logging con Loki

```yaml
# monitoring/loki-values.yaml
loki:
  enabled: true
  config:
    auth_enabled: false
    server:
      http_listen_port: 3100
    common:
      path_prefix: /loki
      storage:
        filesystem:
          chunks_directory: /loki/chunks
          rules_directory: /loki/rules
    schema_config:
      configs:
        - from: 2020-10-24
          store: boltdb-shipper
          object_store: filesystem
          schema: v11
          index:
            prefix: index_
            period: 24h
    limits_config:
      retention_period: 720h  # 30 dias
      ingestion_rate_mb: 10
      ingestion_burst_size_mb: 20

promtail:
  enabled: true
  config:
    snippets:
      pipelineStages:
        - docker: {}
        - cri: {}
        - match:
            selector: '{app="controlia-api"}'
            stages:
              - json:
                  expressions:
                    level: level
                    message: message
                    trace_id: trace_id
              - labels:
                  level:
                  trace_id:
    clients:
      - url: http://loki:3100/loki/api/v1/push
```

### 5.4 Distributed Tracing con OpenTelemetry + Tempo

```yaml
# monitoring/opentelemetry-collector.yaml
apiVersion: opentelemetry.io/v1alpha1
kind: OpenTelemetryCollector
metadata:
  name: controlia
  namespace: monitoring
spec:
  mode: deployment
  config: |
    receivers:
      otlp:
        protocols:
          grpc:
            endpoint: 0.0.0.0:4317
          http:
            endpoint: 0.0.0.0:4318
    
    processors:
      batch:
        timeout: 1s
        send_batch_size: 1024
      memory_limiter:
        limit_mib: 512
        spike_limit_mib: 128
      resource:
        attributes:
          - key: environment
            value: production
            action: upsert
      tail_sampling:
        decision_wait: 10s
        num_traces: 100
        policies:
          - name: errors
            type: status_code
            status_code: {status_codes: [ERROR]}
          - name: latency
            type: latency
            latency: {threshold_ms: 1000}
    
    exporters:
      otlp/tempo:
        endpoint: tempo.monitoring.svc.cluster.local:4317
        tls:
          insecure: true
      prometheusremotewrite:
        endpoint: http://prometheus-server.monitoring.svc.cluster.local/api/v1/write
    
    service:
      pipelines:
        traces:
          receivers: [otlp]
          processors: [batch, resource, tail_sampling]
          exporters: [otlp/tempo]
        metrics:
          receivers: [otlp]
          processors: [batch, resource]
          exporters: [prometheusremotewrite]
```

### 5.5 Instrumentacion en Aplicacion (Node.js)

```javascript
// observability/tracing.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: process.env.SERVICE_NAME || 'controlia-api',
  [SemanticResourceAttributes.SERVICE_VERSION]: process.env.SERVICE_VERSION || '1.0.0',
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
  [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'controlia',
});

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
});

const sdk = new NodeSDK({
  resource,
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('Tracing terminated'))
    .finally(() => process.exit(0));
});

module.exports = sdk;
```

### 5.6 Alerting con Alertmanager + PagerDuty

```yaml
# monitoring/alertmanager-config.yaml
global:
  slack_api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'
  pagerduty_url: 'https://events.pagerduty.com/v2/enqueue'

route:
  receiver: 'default'
  group_by: ['alertname', 'severity', 'team']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      continue: true
      group_wait: 0s
    - match:
        severity: warning
      receiver: 'slack-warnings'
      group_wait: 1m

receivers:
  - name: 'default'
    slack_configs:
      - channel: '#alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ .CommonAnnotations.summary }}'
  
  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'
        severity: critical
        description: '{{ .GroupLabels.alertname }}: {{ .CommonAnnotations.summary }}'
  
  - name: 'slack-warnings'
    slack_configs:
      - channel: '#warnings'
        send_resolved: true
        title: 'Warning: {{ .GroupLabels.alertname }}'
        text: |
          {{ range .Alerts }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          Severity: {{ .Labels.severity }}
          {{ end }}

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'namespace']
```

---

## 6. PRACTICAS SRE

### 6.1 Definicion de SLOs/SLIs/SLAs

| Servicio | SLO | SLI | Error Budget (30d) |
|----------|-----|-----|-------------------|
| API Availability | 99.9% | Uptime | 43.2 min/mes |
| API Latency (P95) | < 200ms | Response time | 5% requests |
| Agent Response | 95% < 5s | AI response time | 5% requests |

```yaml
# sre/slo-definitions.yaml
apiVersion: openslo/v1
kind: SLO
metadata:
  name: controlia-api-availability
  displayName: ControlIA API Availability
spec:
  service: controlia-api
  description: The API should be available 99.9% of the time
  budgetingMethod: Occurrences
  objectives:
    - displayName: High Availability
      op: gte
      target: 0.999
      timeWindow:
        - duration: 30d
          isRolling: true
```

### 6.2 Error Budget Policy

```
Error Budget = 100% - SLO Target

VERDE (0-50% budget):
- Deployments normales permitidos
- Experimentacion OK
- No hay restricciones

AMARILLO (50-75% budget):
- Deployments requieren aprobacion
- No experimentacion en produccion
- Review semanal obligatorio

ROJO (75-100% budget):
- FREEZE de deployments
- Solo hotfixes criticos
- War room obligatorio

AGOTADO (>100% budget):
- EMERGENCY MODE
- Todo el equipo en incidente
- Escalacion a VP Engineering
```

### 6.3 Incident Response

| Severidad | Nombre | Response Time | Ejemplos |
|-----------|--------|---------------|----------|
| SEV1 | Critical | 5 min | Outage total, data loss |
| SEV2 | High | 15 min | 50%+ agents down |
| SEV3 | Medium | 1 hour | Feature no funciona |
| SEV4 | Low | Next business day | UI glitches |

### 6.4 Post-Mortem Template

```markdown
# Post-Mortem: [Incident Title]

**Date:** YYYY-MM-DD  
**Incident ID:** INC-XXXX  
**Severity:** SEV1/SEV2/SEV3/SEV4  
**Status:** Resolved  

## Executive Summary
[2-3 sentences describing what happened]

## Timeline (UTC)
| Time | Event | Owner |
|------|-------|-------|
| 14:00 | Alert fired | PagerDuty |
| 14:05 | On-call paged | @engineer1 |
| 14:30 | Root cause identified | @engineer2 |
| 15:00 | Service restored | @engineer1 |

## Impact
- Duration: X minutes
- Affected Users: X%
- Error Rate: Peak X%

## Root Cause Analysis
### 5 Whys
1. Why did the service fail?
2. Why did [answer] happen?
...
5. ROOT CAUSE

## Action Items
| ID | Action | Owner | Due Date |
|----|--------|-------|----------|
| AI-1 | [Action] | @owner | YYYY-MM-DD |
```

---

## 7. TESTING STRATEGY

### 7.1 Piramide de Testing

```
                    /\
                   /  \
                  / E2E \         <- 10% de tests (Slow)
                 /-------\
                /Integration\      <- 30% de tests (Medium)
               /-------------\
              /   Unit Tests   \    <- 60% de tests (Fast)
             /-------------------\
```

### 7.2 Unit Tests (Jest)

```javascript
// tests/unit/agent.service.test.js
describe('AgentService', () => {
  describe('createAgent', () => {
    it('should create an agent with valid data', async () => {
      const agentData = {
        name: 'Test Agent',
        description: 'Test description',
        model: 'gpt-4',
      };

      mockRepository.create.mockResolvedValue({
        id: 'agent-123',
        ...agentData,
      });

      const result = await agentService.createAgent(agentData);

      expect(result).toHaveProperty('id');
      expect(result.name).toBe(agentData.name);
    });

    it('should throw error for invalid model', async () => {
      const agentData = { name: 'Test Agent', model: 'invalid-model' };
      await expect(agentService.createAgent(agentData))
        .rejects.toThrow('Invalid AI model specified');
    });
  });
});
```

### 7.3 Integration Tests

```javascript
// tests/integration/api.test.js
describe('API Integration Tests', () => {
  describe('POST /api/agents', () => {
    it('should create a new agent', async () => {
      const response = await request(app)
        .post('/api/agents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Sales Agent',
          description: 'Agent for sales inquiries',
          model: 'gpt-4',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });

    it('should return 401 without auth', async () => {
      const response = await request(app)
        .post('/api/agents')
        .send({ name: 'Test Agent' });

      expect(response.status).toBe(401);
    });
  });
});
```

### 7.4 E2E Tests con Playwright

```javascript
// tests/e2e/agent-creation.spec.js
test.describe('Agent Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'test@controlia.io');
    await page.fill('[data-testid="password"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
  });

  test('user can create a new agent', async ({ page }) => {
    await page.click('[data-testid="create-agent-button"]');
    await page.fill('[data-testid="agent-name"]', 'Test Sales Agent');
    await page.selectOption('[data-testid="agent-model"]', 'gpt-4');
    await page.click('[data-testid="save-agent-button"]');

    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
  });
});
```

### 7.5 Load Testing con k6

```javascript
// tests/load/k6-load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up
    { duration: '5m', target: 100 },   // Steady state
    { duration: '2m', target: 200 },   // Spike
    { duration: '5m', target: 200 },   // Sustained load
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],  // 95% under 200ms
    http_req_failed: ['rate<0.01'],    // Error rate < 1%
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://api.controlia.io';

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  
  check(res, {
    'health check passes': (r) => r.status === 200,
    'response time OK': (r) => r.timings.duration < 100,
  });

  sleep(1);
}
```

### 7.6 Chaos Engineering con Litmus

```yaml
# chaos/litmus-experiments.yaml
apiVersion: litmuschaos.io/v1alpha1
kind: ChaosEngine
metadata:
  name: controlia-chaos
  namespace: litmus
spec:
  appinfo:
    appns: 'production'
    applabel: 'app=controlia-api'
    appkind: 'deployment'
  engineState: 'active'
  experiments:
    - name: pod-delete
      spec:
        components:
          env:
            - name: TOTAL_CHAOS_DURATION
              value: '30'
            - name: PODS_AFFECTED_PERC
              value: '50'
    - name: pod-cpu-hog
      spec:
        components:
          env:
            - name: CPU_CORES
              value: '2'
            - name: TOTAL_CHAOS_DURATION
              value: '60'
    - name: network-latency
      spec:
        components:
          env:
            - name: NETWORK_LATENCY
              value: '2000'
            - name: TOTAL_CHAOS_DURATION
              value: '60'
```

---

## 8. SECURITY EN CI/CD

### 8.1 Pipeline de Seguridad Completo

```yaml
# .github/workflows/security-pipeline.yml
name: Security Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

jobs:
  # SAST - Static Application Security Testing
  sast-sonarqube:
    name: SonarQube SAST
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: SonarQube Scan
        uses: SonarSource/sonarqube-scan-action@master
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}

  sast-semgrep:
    name: Semgrep SAST
    runs-on: ubuntu-latest
    container:
      image: returntocorp/semgrep
    steps:
      - uses: actions/checkout@v4
      - name: Run Semgrep
        run: |
          semgrep --config=auto \
                  --config=p/security-audit \
                  --config=p/owasp-top-ten \
                  --error

  sast-codeql:
    name: CodeQL Analysis
    runs-on: ubuntu-latest
    permissions:
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - name: Initialize CodeQL
        uses: github/codeql-action/init@v2
        with:
          languages: javascript, typescript, python
      - name: Autobuild
        uses: github/codeql-action/autobuild@v2
      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v2

  # SCA - Software Composition Analysis
  sca-snyk:
    name: Snyk Dependency Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Snyk
        uses: snyk/actions/node@master
        continue-on-error: true
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high --sarif-file-output=snyk.sarif
      - name: Upload result
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: snyk.sarif

  # Secret Scanning
  secrets-trufflehog:
    name: TruffleHog Secret Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: TruffleHog OSS
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: main
          head: HEAD
          extra_args: --debug --only-verified

  # Container Security
  container-trivy:
    name: Trivy Container Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build image
        run: docker build -t controlia:test .
      - name: Run Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'controlia:test'
          format: 'sarif'
          output: 'trivy-results.sarif'
      - name: Upload results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'

  # IaC Security
  iac-checkov:
    name: Checkov IaC Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Checkov
        uses: bridgecrewio/checkov-action@master
        with:
          directory: ./terraform
          framework: terraform

  # DAST - Dynamic Application Security Testing
  dast-zap:
    name: OWASP ZAP DAST
    runs-on: ubuntu-latest
    needs: [deploy-staging]
    steps:
      - name: ZAP Full Scan
        uses: zaproxy/action-full-scan@v0.7.0
        with:
          target: 'https://staging.controlia.io'
          cmd_options: '-a'

  # SBOM Generation
  sbom-generation:
    name: Generate SBOM
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Generate SBOM with Syft
        uses: anchore/sbom-action@v0
        with:
          format: spdx-json
          output-file: sbom.spdx.json
```

### 8.2 Politicas OPA para Kubernetes

```rego
# policies/k8s.rego
package kubernetes.admission

import future.keywords.if

# Deny containers running as root
deny[msg] if {
    input.request.kind.kind == "Pod"
    container := input.request.object.spec.containers[_]
    not container.securityContext.runAsNonRoot
    msg := sprintf("Container %s must not run as root", [container.name])
}

# Deny containers without resource limits
deny[msg] if {
    input.request.kind.kind == "Pod"
    container := input.request.object.spec.containers[_]
    not container.resources.limits.memory
    msg := sprintf("Container %s must have memory limits", [container.name])
}

deny[msg] if {
    input.request.kind.kind == "Pod"
    container := input.request.object.spec.containers[_]
    not container.resources.limits.cpu
    msg := sprintf("Container %s must have CPU limits", [container.name])
}

# Deny images from untrusted registries
deny[msg] if {
    input.request.kind.kind == "Pod"
    container := input.request.object.spec.containers[_]
    not starts_with(container.image, "ghcr.io/controlia/")
    msg := sprintf("Container %s uses untrusted image", [container.name])
}

# Deny use of latest tag
deny[msg] if {
    input.request.kind.kind == "Pod"
    container := input.request.object.spec.containers[_]
    endswith(container.image, ":latest")
    msg := sprintf("Container %s must not use 'latest' tag", [container.name])
}

# Deny missing liveness probe
deny[msg] if {
    input.request.kind.kind == "Deployment"
    container := input.request.object.spec.template.spec.containers[_]
    not container.livenessProbe
    msg := sprintf("Container %s must have livenessProbe", [container.name])
}

# Deny missing readiness probe
deny[msg] if {
    input.request.kind.kind == "Deployment"
    container := input.request.object.spec.template.spec.containers[_]
    not container.readinessProbe
    msg := sprintf("Container %s must have readinessProbe", [container.name])
}

# Allow if no denies
allow if {
    count(deny) == 0
}
```

---

## 9. PLATFORM ENGINEERING

### 9.1 Backstage Developer Portal

```yaml
# backstage/app-config.yaml
app:
  title: ControlIA Developer Portal
  baseUrl: https://backstage.controlia.io

organization:
  name: ControlIA

backend:
  baseUrl: https://backstage.controlia.io
  listen:
    port: 7007
  database:
    client: pg
    connection:
      host: ${POSTGRES_HOST}
      port: ${POSTGRES_PORT}
      user: ${POSTGRES_USER}
      password: ${POSTGRES_PASSWORD}

integrations:
  github:
    - host: github.com
      token: ${GITHUB_TOKEN}

proxy:
  '/grafana/api':
    target: https://grafana.controlia.io/api
    headers:
      Authorization: Bearer ${GRAFANA_TOKEN}

auth:
  environment: production
  providers:
    github:
      production:
        clientId: ${GITHUB_CLIENT_ID}
        clientSecret: ${GITHUB_CLIENT_SECRET}

scaffolder:
  locations:
    - type: url
      target: https://github.com/controlia/backstage-templates/blob/main/templates.yaml

catalog:
  import:
    entityFilename: catalog-info.yaml
  locations:
    - type: github-org
      target: https://github.com/controlia
    - type: url
      target: https://github.com/controlia/services/blob/main/catalog-info.yaml

kubernetes:
  serviceLocatorMethod:
    type: 'multiTenant'
  clusterLocatorMethods:
    - type: 'config'
      clusters:
        - url: ${EKS_CLUSTER_URL}
          name: production
          authProvider: 'aws'
```

### 9.2 Software Templates (Golden Paths)

```yaml
# backstage/templates/new-service/template.yaml
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: controlia-service-template
  title: New ControlIA Service
  description: Create a new microservice with best practices
  tags:
    - recommended
    - nodejs
    - typescript
spec:
  owner: platform-team
  type: service
  
  parameters:
    - title: Service Information
      required:
        - name
        - owner
        - description
      properties:
        name:
          title: Service Name
          type: string
          description: Unique name for the service
        owner:
          title: Owner
          type: string
          description: Team owning this service
          ui:field: OwnerPicker
        description:
          title: Description
          type: string
        type:
          title: Service Type
          type: string
          default: backend
          enum:
            - backend
            - frontend
            - worker
    
    - title: Infrastructure
      properties:
        database:
          title: Database
          type: string
          default: postgresql
          enum:
            - none
            - postgresql
            - mongodb
        cache:
          title: Cache
          type: boolean
          default: true
  
  steps:
    - id: fetch-base
      name: Fetch Base Template
      action: fetch:template
      input:
        url: ./skeleton
        values:
          name: ${{ parameters.name }}
          owner: ${{ parameters.owner }}
          description: ${{ parameters.description }}
    
    - id: fetch-ci
      name: Fetch CI/CD Template
      action: fetch:template
      input:
        url: ./ci-templates
        targetPath: ./.github/workflows
    
    - id: publish
      name: Publish to GitHub
      action: publish:github
      input:
        allowedHosts: ['github.com']
        description: ${{ parameters.description }}
        repoUrl: github.com?owner=controlia&repo=${{ parameters.name }}
        defaultBranch: main
    
    - id: register
      name: Register in Catalog
      action: catalog:register
      input:
        repoContentsUrl: ${{ steps.publish.output.repoContentsUrl }}
        catalogInfoPath: '/catalog-info.yaml'
  
  output:
    links:
      - title: Repository
        url: ${{ steps.publish.output.remoteUrl }}
      - title: Open in catalog
        icon: catalog
        entityRef: ${{ steps.register.output.entityRef }}
```

### 9.3 Catalog Info Template

```yaml
# skeleton/catalog-info.yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: ${{ values.name }}
  description: ${{ values.description }}
  annotations:
    github.com/project-slug: controlia/${{ values.name }}
    argocd/app-name: ${{ values.name }}
    grafana/dashboard-selector: "tags @> 'service:${{ values.name }}'"
    backstage.io/techdocs-ref: dir:.
  tags:
    - ${{ values.type }}
    - nodejs
    - typescript
spec:
  type: ${{ values.type }}
  lifecycle: production
  owner: ${{ values.owner }}
  system: controlia-core
  providesApis:
    - ${{ values.name }}-api
```

---

## 10. RUNBOOKS DE OPERACION

### 10.1 Runbook: High Error Rate

```markdown
# Runbook: High Error Rate

## Symptoms
- Alert: HighErrorRate firing
- Error rate > 0.1% for 2 minutes
- P95 latency elevated

## Immediate Actions (First 5 minutes)

### 1. Verify the Alert
```bash
# Check current error rate
kubectl exec -it deploy/prometheus -- \
  promql 'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))'

# Check error distribution by endpoint
kubectl exec -it deploy/prometheus -- \
  promql 'topk(10, sum(rate(http_requests_total{status=~"5.."}[5m])) by (handler))'
```

### 2. Identify Affected Services
```bash
# Check pod status
kubectl get pods -n production --sort-by='.status.containerStatuses[0].restartCount'

# Check recent events
kubectl get events -n production --sort-by='.lastTimestamp' | tail -20

# Check logs for errors
kubectl logs -n production -l app=controlia-api --tail=100 | grep ERROR
```

### 3. Check Recent Deployments
```bash
# Last deployment
kubectl rollout history deployment/controlia-api -n production

# If recent deployment, consider rollback
kubectl rollout undo deployment/controlia-api -n production
```

## Mitigation Options

### Option 1: Scale Up
```bash
kubectl scale deployment controlia-api -n production --replicas=10
```

### Option 2: Rollback Deployment
```bash
kubectl rollout undo deployment/controlia-api -n production
kubectl rollout status deployment/controlia-api -n production
```

## Validation
After mitigation:
1. Monitor error rate for 5 minutes
2. Verify all health checks pass
3. Check user-facing functionality
4. Confirm alert resolves
```

### 10.2 Runbook: Database Connection Issues

```markdown
# Runbook: Database Connection Issues

## Symptoms
- pg_stat_activity_count high
- Connection timeout errors
- "too many connections" errors

## Immediate Actions

### 1. Check Current Connections
```bash
# Active connections
kubectl exec -it deploy/postgres -n production -- psql -U controlia -c "
SELECT count(*), state FROM pg_stat_activity 
WHERE datname = 'controlia' GROUP BY state;"

# Long-running queries
kubectl exec -it deploy/postgres -n production -- psql -U controlia -c "
SELECT pid, now() - query_start AS duration, query 
FROM pg_stat_activity WHERE state != 'idle' 
ORDER BY duration DESC LIMIT 10;"
```

### 2. Kill Blocking Queries
```bash
kubectl exec -it deploy/postgres -n production -- psql -U controlia -c "
SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
WHERE state = 'idle in transaction' 
AND now() - query_start > interval '5 minutes';"
```

### 3. Scale Connection Pool
```bash
kubectl set env deployment/controlia-api -n production DB_POOL_MAX_SIZE=50
kubectl rollout restart deployment/controlia-api -n production
```
```

### 10.3 Runbook: LLM API Outage

```markdown
# Runbook: LLM API Outage

## Symptoms
- LLM requests failing
- Fallback model being used
- High latency on AI features

## Immediate Actions

### 1. Check LLM Provider Status
- OpenAI Status: https://status.openai.com
- Anthropic Status: https://status.anthropic.com

### 2. Switch to Fallback Model
```bash
curl -X PATCH https://api.launchdarkly.com/api/v2/flags/default/ai-model-primary \
  -H "Authorization: $LD_API_KEY" \
  -d '{
    "environments": {
      "production": {
        "on": false
      }
    }
  }'
```

### 3. Queue Requests for Retry
```bash
# Check queue depth
kubectl exec -it deploy/rabbitmq -n production -- rabbitmqctl list_queues
```

## Communication
- Notify customers of degraded AI features
- Update status page
- Set expected resolution time
```

---

## 11. CHECKLIST DE DEPLOYMENT

### 11.1 Pre-Deployment Checklist

```markdown
# Pre-Deployment Checklist

## Code Quality
- [ ] All unit tests passing (>80% coverage)
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Code review completed
- [ ] No critical/high security findings
- [ ] SonarQube quality gate passed

## Documentation
- [ ] CHANGELOG.md updated
- [ ] API documentation updated
- [ ] Runbooks updated if needed

## Testing
- [ ] Load testing completed (k6)
- [ ] Chaos testing completed (Litmus)
- [ ] Security scanning passed (SAST, DAST, SCA)

## Infrastructure
- [ ] Terraform plan reviewed
- [ ] Database migrations tested
- [ ] Feature flags configured
- [ ] Monitoring dashboards updated
- [ ] Alerts configured

## Rollback Plan
- [ ] Rollback procedure documented
- [ ] Database rollback scripts ready
- [ ] Previous version artifacts available
- [ ] Rollback tested in staging

## Communication
- [ ] Deployment announced in #deployments
- [ ] On-call engineer notified
- [ ] Status page update ready
```

### 11.2 Deployment Day Checklist

```markdown
# Deployment Day Checklist

## Before Deployment
- [ ] Error budget check (< 50% consumed)
- [ ] No active incidents
- [ ] All pre-deployment checks passed
- [ ] Deployment window confirmed
- [ ] Rollback plan reviewed

## During Deployment
- [ ] Monitor canary metrics (error rate, latency)
- [ ] Check logs for errors
- [ ] Verify health checks passing
- [ ] Monitor database performance

## Post-Deployment
- [ ] Smoke tests passing
- [ ] Error rate < 0.1%
- [ ] P95 latency < 200ms
- [ ] All pods healthy
- [ ] No new alerts
- [ ] Customer-facing features working

## Sign-off
- [ ] Deployment completed
- [ ] Monitoring stable for 1 hour
- [ ] Incident response team notified
```

### 11.3 Production Readiness Checklist

| Categoria | Item | Requerido | Verificacion |
|-----------|------|-----------|--------------|
| Reliability | SLOs defined and monitored | Si | Grafana dashboard exists |
| Reliability | Error budget policy documented | Si | Document in wiki |
| Reliability | On-call rotation configured | Si | PagerDuty schedule active |
| Reliability | Runbooks created | Si | Runbooks in /runbooks |
| Observability | Metrics exposed (Prometheus) | Si | /metrics endpoint returns data |
| Observability | Structured logging implemented | Si | JSON logs with correlation IDs |
| Observability | Distributed tracing enabled | Si | Traces visible in Jaeger |
| Observability | Alerts configured | Si | Alertmanager rules in place |
| Security | Security scan passed | Si | No critical/high findings |
| Security | Secrets management implemented | Si | Using Vault or AWS Secrets Manager |
| Security | Network policies configured | Si | Kubernetes NetworkPolicies applied |
| Security | mTLS enabled | Si | Istio PeerAuthentication STRICT |
| Scalability | Horizontal Pod Autoscaler configured | Si | HPA resource exists |
| Scalability | Resource limits defined | Si | CPU/memory limits in deployment |
| Scalability | Load testing completed | Si | k6 test results documented |
| Operability | Health checks implemented | Si | /health and /ready endpoints |
| Operability | Graceful shutdown handling | Si | SIGTERM handler implemented |
| Operability | Configuration externalized | Si | ConfigMaps/Secrets used |

---

## 12. REFERENCIAS Y RECURSOS

### Documentacion Oficial
- GitHub Actions: https://docs.github.com/en/actions
- Terraform: https://www.terraform.io/docs
- Kubernetes: https://kubernetes.io/docs
- Istio: https://istio.io/latest/docs
- Prometheus: https://prometheus.io/docs
- Grafana: https://grafana.com/docs
- ArgoCD: https://argo-cd.readthedocs.io
- Backstage: https://backstage.io/docs

### Libros Recomendados
- "Site Reliability Engineering" - Google
- "The Phoenix Project" - Gene Kim
- "Continuous Delivery" - Jez Humble
- "Kubernetes Up & Running" - Kelsey Hightower
- "Terraform: Up & Running" - Yevgeniy Brikman

### Comunidades
- CNCF: https://www.cncf.io/
- DevOps subreddit: https://reddit.com/r/devops
- Kubernetes Slack: https://kubernetes.slack.com

---

## 13. GLOSARIO

| Termino | Definicion |
|---------|------------|
| **SLO** | Service Level Objective - Objetivo medible de confiabilidad |
| **SLI** | Service Level Indicator - Metrica que mide el SLO |
| **SLA** | Service Level Agreement - Acuerdo contractual con clientes |
| **GitOps** | Operaciones gestionadas mediante Git como fuente de verdad |
| **IaC** | Infrastructure as Code - Infraestructura definida en codigo |
| **Canary** | Despliegue gradual a un subconjunto de usuarios |
| **Blue-Green** | Despliegue con dos entornos identicos |
| **mTLS** | Mutual TLS - Autenticacion bidireccional con certificados |
| **Chaos Engineering** | Practica de introducir fallos controlados |
| **Golden Path** | Ruta recomendada para desarrolladores |

---

*Documento generado para ControlIA - Sistema de Agentes de IA Empresarial*  
*Ultima actualizacion: Enero 2025*
