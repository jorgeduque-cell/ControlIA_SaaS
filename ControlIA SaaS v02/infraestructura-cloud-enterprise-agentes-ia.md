# 🏗️ INFRAESTRUCTURA CLOUD ENTERPRISE
## Sistema de Agente Empresarial - Latinoamérica

**Versión:** 1.0  
**Fecha:** 2024  
**Arquitecto:** Especialista Cloud DevOps  
**SLA Objetivo:** 99.99% (52.6 minutos downtime/año)

---

## 📋 ÍNDICE

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Estrategia de Proveedor Cloud](#2-estrategia-de-proveedor-cloud)
3. [Arquitectura de Red](#3-arquitectura-de-red)
4. [Capa de Compute](#4-capa-de-compute)
5. [Capa de Storage](#5-capa-de-storage)
6. [Capa de Datos](#6-capa-de-datos)
7. [Servicios Administrados](#7-servicios-administrados)
8. [Disaster Recovery](#8-disaster-recovery)
9. [Cost Optimization](#9-cost-optimization)
10. [Runbooks de Operación](#10-runbooks-de-operación)
11. [Estimación de Costos](#11-estimación-de-costos)

---

## 1. RESUMEN EJECUTIVO

### 1.1 Visión General

La plataforma de Agentes Empresariales de IA requiere una infraestructura cloud de clase mundial que soporte:

- **Escalabilidad:** Manejo de 10,000+ agentes concurrentes
- **Baja Latencia:** <100ms para operaciones críticas en LATAM
- **Alta Disponibilidad:** 99.99% SLA con multi-region
- **Seguridad:** Enterprise-grade con compliance
- **Costo-eficiencia:** Optimización continua

### 1.2 Decisión Clave: AWS como Primary Cloud

| Criterio | AWS | Azure | GCP |
|----------|-----|-------|-----|
| **Presencia LATAM** | ⭐⭐⭐ São Paulo, próximos: Bogotá, Santiago | ⭐⭐ São Paulo, México | ⭐⭐ São Paulo, Santiago |
| **Servicios IA/ML** | ⭐⭐⭐ Bedrock, SageMaker | ⭐⭐ OpenAI, Cognitive | ⭐⭐⭐ Vertex AI |
| **Kubernetes** | ⭐⭐⭐ EKS maduro | ⭐⭐ AKS | ⭐⭐⭐ GKE |
| **Ecosistema** | ⭐⭐⭐ Más completo | ⭐⭐ Bueno | ⭐⭐ Bueno |
| **Soporte Enterprise** | ⭐⭐⭐ Excelente | ⭐⭐⭐ Excelente | ⭐⭐ Bueno |
| **Costo** | ⭐⭐ Moderado | ⭐⭐ Moderado | ⭐⭐⭐ Más económico |

**Decisión:** AWS como cloud primario con estrategia multi-cloud de contingencia.

---

## 2. ESTRATEGIA DE PROVEEDOR CLOUD

### 2.1 Arquitectura Multi-Region AWS

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ARQUITECTURA MULTI-REGION AWS                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────┐         ┌─────────────────┐                      │
│   │  PRIMARY REGION │         │ SECONDARY REGION│                      │
│   │  sa-east-1      │◄───────►│  us-east-1      │                      │
│   │  São Paulo, BR  │  Replication│  N. Virginia  │                      │
│   │                 │         │                 │                      │
│   │  • EKS Cluster  │         │  • EKS Standby  │                      │
│   │  • RDS Primary  │         │  • RDS Replica  │                      │
│   │  • S3 Primary   │         │  • S3 Replica   │                      │
│   └────────┬────────┘         └─────────────────┘                      │
│            │                                                            │
│            ▼                                                            │
│   ┌─────────────────────────────────────────────────────┐              │
│   │              EDGE LOCATIONS (CloudFront)            │              │
│   │  • São Paulo    • Rio de Janeiro  • Buenos Aires   │              │
│   │  • Santiago     • Bogotá          • Ciudad México  │              │
│   │  • Lima         • Miami           • Dallas         │              │
│   └─────────────────────────────────────────────────────┘              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Regiones y Zonas de Disponibilidad

| Región | Código | AZs | Uso Principal | Latencia LATAM |
|--------|--------|-----|---------------|----------------|
| **São Paulo** | sa-east-1 | 3 | **PRIMARY** | Base (0ms) |
| **N. Virginia** | us-east-1 | 6 | DR/Secondary | ~120ms |
| **Oregón** | us-west-2 | 4 | Tertiary/Backup | ~180ms |

### 2.3 Edge Locations CloudFront (LATAM)

```
Países con Edge Locations:
├── Brasil (São Paulo, Rio, Fortaleza)
├── Argentina (Buenos Aires)
├── Chile (Santiago)
├── Colombia (Bogotá)
├── México (Ciudad de México, Querétaro)
├── Perú (Lima)
└── Estados Unidos (Miami, Dallas, Los Angeles)
```

### 2.4 Estrategia Multi-Cloud (Contingencia)

```
┌────────────────────────────────────────────────────────────┐
│              ESTRATEGIA MULTI-CLOUD                        │
├────────────────────────────────────────────────────────────┤
│                                                            │
│   PRIMARY (90% workload)      CONTINGENCY (10% workload)  │
│   ┌─────────────────┐         ┌─────────────────┐         │
│   │      AWS        │         │      GCP        │         │
│   │   São Paulo     │◄───────►│   Santiago      │         │
│   │                 │  Failover│                 │         │
│   │  • EKS          │         │  • GKE Standby  │         │
│   │  • RDS          │         │  • Cloud SQL    │         │
│   │  • S3           │         │  • Cloud Storage│         │
│   └─────────────────┘         └─────────────────┘         │
│                                                            │
│   Trigger de Failover:                                     │
│   • AWS sa-east-1 downtime > 5 minutos                    │
│   • Latencia > 500ms por más de 10 minutos                │
│   • Error rate > 5% por más de 5 minutos                  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 3. ARQUITECTURA DE RED

### 3.1 VPC Design - São Paulo (sa-east-1)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    VPC: agentes-enterprise-prod                         │
│                    CIDR: 10.0.0.0/16 (65,536 IPs)                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      PUBLIC SUBNETS                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │   │
│  │  │ 10.0.1.0/24  │  │ 10.0.2.0/24  │  │ 10.0.3.0/24  │           │   │
│  │  │   AZ-1a      │  │   AZ-1b      │  │   AZ-1c      │           │   │
│  │  │              │  │              │  │              │           │   │
│  │  │ • ALB        │  │ • ALB        │  • NAT Gateway │           │   │
│  │  │ • NAT GW     │  │ • NAT GW     │  • Bastion Host│           │   │
│  │  │ • Bastion    │  │ • Bastion    │                │           │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     PRIVATE SUBNETS - APP                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │   │
│  │  │ 10.0.10.0/24 │  │ 10.0.11.0/24 │  │ 10.0.12.0/24 │           │   │
│  │  │   AZ-1a      │  │   AZ-1b      │  │   AZ-1c      │           │   │
│  │  │              │  │              │  │              │           │   │
│  │  │ • EKS Nodes  │  │ • EKS Nodes  │  │ • EKS Nodes  │           │   │
│  │  │ • App Pods   │  │ • App Pods   │  │ • App Pods   │           │   │
│  │  │ • Microsvc   │  │ • Microsvc   │  │ • Microsvc   │           │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     PRIVATE SUBNETS - DATA                       │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │   │
│  │  │ 10.0.20.0/24 │  │ 10.0.21.0/24 │  │ 10.0.22.0/24 │           │   │
│  │  │   AZ-1a      │  │   AZ-1b      │  │   AZ-1c      │           │   │
│  │  │              │  │              │  │              │           │   │
│  │  │ • RDS        │  │ • RDS        │  │ • RDS        │           │   │
│  │  │ • ElastiCache│  │ • ElastiCache│  │ • ElastiCache│           │   │
│  │  │ • MSK Kafka  │  │ • MSK Kafka  │  │ • MSK Kafka  │           │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     VPC ENDPOINTS                                │   │
│  │  • S3 Gateway Endpoint                                          │   │
│  │  • ECR Interface Endpoint                                       │   │
│  │  • CloudWatch Interface Endpoint                                │   │
│  │  • Secrets Manager Interface Endpoint                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Subnet Allocation

| Tipo | Subnet CIDR | AZ | Uso | IPs Disponibles |
|------|-------------|-----|-----|-----------------|
| Public-1a | 10.0.1.0/24 | sa-east-1a | ALB, NAT, Bastion | 251 |
| Public-1b | 10.0.2.0/24 | sa-east-1b | ALB, NAT, Bastion | 251 |
| Public-1c | 10.0.3.0/24 | sa-east-1c | ALB, NAT, Bastion | 251 |
| Private-App-1a | 10.0.10.0/24 | sa-east-1a | EKS Worker Nodes | 251 |
| Private-App-1b | 10.0.11.0/24 | sa-east-1b | EKS Worker Nodes | 251 |
| Private-App-1c | 10.0.12.0/24 | sa-east-1c | EKS Worker Nodes | 251 |
| Private-Data-1a | 10.0.20.0/24 | sa-east-1a | RDS, Redis, Kafka | 251 |
| Private-Data-1b | 10.0.21.0/24 | sa-east-1b | RDS, Redis, Kafka | 251 |
| Private-Data-1c | 10.0.22.0/24 | sa-east-1c | RDS, Redis, Kafka | 251 |

### 3.3 Load Balancers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    LOAD BALANCER ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    APPLICATION LOAD BALANCER                     │  │
│   │                    (api.agentes-ia.com)                          │  │
│   │                                                                  │  │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │  │
│   │  │  Listener   │  │  Listener   │  │  Listener   │              │  │
│   │  │   :443      │  │   :443      │  │   :443      │              │  │
│   │  │  (HTTPS)    │  │  (HTTPS)    │  │  (HTTPS)    │              │  │
│   │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │  │
│   │         │                │                │                      │  │
│   │  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐              │  │
│   │  │ TargetGroup │  │ TargetGroup │  │ TargetGroup │              │  │
│   │  │  /api/v1/*  │  │ /agents/*   │  │ /webhook/*  │              │  │
│   │  │  EKS:8080   │  │  EKS:8080   │  │  EKS:8080   │              │  │
│   │  └─────────────┘  └─────────────┘  └─────────────┘              │  │
│   │                                                                  │  │
│   │  Configuración:                                                  │  │
│   │  • Cross-Zone Load Balancing: ENABLED                           │  │
│   │  • Health Check: /health, Interval: 30s                         │  │
│   │  • Deregistration Delay: 60s                                    │  │
│   │  • Stickiness: 1 hour (para sesiones de agentes)                │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    NETWORK LOAD BALANCER                         │  │
│   │                    (WebSocket/Realtime)                          │  │
│   │                                                                  │  │
│   │  ┌─────────────┐  ┌─────────────┐                              │  │
│   │  │  Listener   │  │  Listener   │                              │  │
│   │  │   :8080     │  │   :9092     │                              │  │
│   │  │  (TCP)      │  │  (TCP)      │                              │  │
│   │  │  WebSocket  │  │  Kafka      │                              │  │
│   │  └─────────────┘  └─────────────┘                              │  │
│   │                                                                  │  │
│   │  Configuración:                                                  │  │
│   │  • Cross-Zone: ENABLED                                          │  │
│   │  • Preserve Client IP: ENABLED                                  │  │
│   │  • Health Check: TCP                                            │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.4 CDN - CloudFront Distribution

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CLOUDFRONT DISTRIBUTION                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Origins:                                                              │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │  Origin 1: ALB (api.agentes-ia.com)                             │  │
│   │  • Path: /api/*, /agents/*, /webhook/*                          │  │
│   │  • Protocol: HTTPS-only                                         │  │
│   │  • Origin Shield: ENABLED (São Paulo)                           │  │
│   │                                                                  │  │
│   │  Origin 2: S3 (static.agentes-ia.com)                           │  │
│   │  • Path: /static/*, /assets/*                                   │  │
│   │  • OAI: ENABLED                                                 │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   Cache Behaviors:                                                      │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │  Behavior              │  TTL    │  Cache Policy                  │  │
│   │  ──────────────────────┼─────────┼─────────────────────────────  │  │
│   │  /api/v1/agents/*      │  0s     │  CachingDisabled               │  │
│   │  /api/v1/status/*      │  60s    │  Custom: 60s                   │  │
│   │  /static/*             │  86400s │  Managed-CachingOptimized      │  │
│   │  /assets/*             │  604800s│  Managed-CachingOptimized      │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   Security:                                                             │
│   • AWS WAF Web ACL (Rate limiting, SQL injection, XSS)               │
│   • AWS Shield Advanced (DDoS protection)                             │
│   • Field-level encryption para PII                                   │
│   • Signed URLs para contenido privado                                │
│                                                                         │
│   Edge Locations LATAM:                                                 │
│   • São Paulo, Rio, Buenos Aires, Santiago, Bogotá, CDMX, Lima        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.5 DNS - Route53 Configuration

```hcl
# Route53 Hosted Zone Configuration
resource "aws_route53_zone" "primary" {
  name = "agentes-ia.com"
}

# Health Checks
resource "aws_route53_health_check" "primary" {
  fqdn              = "api-sa.agentes-ia.com"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = 3
  request_interval  = 30
}

# Failover Routing Policy
resource "aws_route53_record" "api_failover" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "api.agentes-ia.com"
  type    = "A"
  
  failover_routing_policy {
    type = "PRIMARY"
  }
  
  alias {
    name                   = aws_lb.primary.dns_name
    zone_id                = aws_lb.primary.zone_id
    evaluate_target_health = true
  }
  
  health_check_id = aws_route53_health_check.primary.id
  set_identifier  = "primary"
}

# Latency-Based Routing para Edge
resource "aws_route53_record" "api_latency" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "edge.agentes-ia.com"
  type    = "A"
  
  latency_routing_policy {
    region = "sa-east-1"
  }
  
  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = "Z2FDTNDATAQYW2"  # CloudFront zone_id
    evaluate_target_health = false
  }
  
  set_identifier = "sa-east-1"
}
```

---

## 4. CAPA DE COMPUTE

### 4.1 Kubernetes (EKS) Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AMAZON EKS CLUSTER                                   │
│                    "agentes-enterprise-prod"                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    CONTROL PLANE (Managed)                       │   │
│  │                                                                  │   │
│  │  • Kubernetes Version: 1.29                                     │   │
│  │  • API Server Endpoint: Private + Public                        │   │
│  │  • Authentication: IAM + OIDC                                   │   │
│  │  • Logging: API, Audit, Authenticator, Controller, Scheduler    │   │
│  │  • Encryption: KMS (secrets at rest)                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    NODE GROUPS                                   │   │
│  │                                                                  │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │  NODE GROUP: general-workloads (ON-DEMAND)               │   │   │
│  │  │  ──────────────────────────────────────────────────────  │   │   │
│  │  │  • Instance: m6i.2xlarge (8 vCPU, 32 GB)                 │   │   │
│  │  │  • Count: 3-12 nodes (min-desired-max)                   │   │   │
│  │  │  • AZs: sa-east-1a, 1b, 1c                               │   │   │
│  │  │  • Workloads: API Gateway, Auth, Core Services           │   │   │
│  │  │  • Labels: workload=general, critical=true               │   │   │
│  │  └──────────────────────────────────────────────────────────┘   │   │
│  │                                                                  │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │  NODE GROUP: ai-workloads (ON-DEMAND + GPU)              │   │   │
│  │  │  ──────────────────────────────────────────────────────  │   │   │
│  │  │  • Instance: g5.2xlarge (8 vCPU, 32 GB, 1x A10G)         │   │   │
│  │  │  • Count: 0-6 nodes (min-desired-max)                    │   │   │
│  │  │  • AZs: sa-east-1a, 1b                                   │   │   │
│  │  │  • Workloads: LLM Inference, Embedding Generation        │   │   │
│  │  │  • Labels: workload=ai, gpu=true, nvidia.com/gpu=present │   │   │
│  │  │  • Taints: nvidia.com/gpu=true:NoSchedule                │   │   │
│  │  └──────────────────────────────────────────────────────────┘   │   │
│  │                                                                  │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │  NODE GROUP: spot-workloads (SPOT INSTANCES)             │   │   │
│  │  │  ──────────────────────────────────────────────────────  │   │   │
│  │  │  • Instance Types: m6i.xlarge, m5.xlarge, c6i.xlarge     │   │   │
│  │  │  • Count: 0-50 nodes (min-desired-max)                   │   │   │
│  │  │  • AZs: sa-east-1a, 1b, 1c                               │   │   │
│  │  │  • Workloads: Background Jobs, Data Processing           │   │   │
│  │  │  • Labels: workload=spot, interruptible=true             │   │   │
│  │  │  • Tolerations: spot=true:NoSchedule                     │   │   │
│  │  └──────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    FARGATE PROFILES                              │   │
│  │                                                                  │   │
│  │  • Namespace: serverless-workloads                              │   │
│  │  • Use Case: Event-driven processing, Lambda-style workloads    │   │
│  │  • Selectors: app=serverless, managed-by=fargate                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 EKS Node Groups Configuration

```yaml
# eks-node-groups.yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: agentes-enterprise-prod
  region: sa-east-1
  version: "1.29"

managedNodeGroups:
  # General Workloads - On-Demand
  - name: general-workloads
    instanceType: m6i.2xlarge
    minSize: 3
    maxSize: 12
    desiredCapacity: 6
    volumeSize: 100
    volumeType: gp3
    privateNetworking: true
    labels:
      workload: general
      critical: "true"
    tags:
      CostCenter: platform
      Environment: production
      WorkloadType: general
    iam:
      withAddonPolicies:
        autoScaler: true
        cloudWatch: true
        ebs: true
        efs: true

  # AI Workloads - GPU
  - name: ai-workloads
    instanceType: g5.2xlarge
    minSize: 0
    maxSize: 6
    desiredCapacity: 2
    volumeSize: 200
    volumeType: gp3
    privateNetworking: true
    labels:
      workload: ai
      gpu: "true"
    taints:
      - key: nvidia.com/gpu
        value: "true"
        effect: NoSchedule
    tags:
      CostCenter: ai-platform
      Environment: production
      WorkloadType: ai

  # Spot Workloads - Cost Optimization
  - name: spot-workloads
    instanceTypes:
      - m6i.xlarge
      - m5.xlarge
      - c6i.xlarge
    minSize: 0
    maxSize: 50
    desiredCapacity: 10
    volumeSize: 50
    volumeType: gp3
    privateNetworking: true
    spot: true
    labels:
      workload: spot
      interruptible: "true"
    taints:
      - key: spot
        value: "true"
        effect: NoSchedule
    tags:
      CostCenter: platform
      Environment: production
      WorkloadType: spot
```

### 4.3 Auto-Scaling Configuration

```yaml
# cluster-autoscaler.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  minReplicas: 3
  maxReplicas: 50
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
        - type: Pods
          value: 4
          periodSeconds: 15
      selectPolicy: Max

---
# Vertical Pod Autoscaler
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: agent-service-vpa
  namespace: production
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: agent-service
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
      - containerName: agent-service
        minAllowed:
          cpu: 100m
          memory: 256Mi
        maxAllowed:
          cpu: 4
          memory: 8Gi
        controlledResources: ["cpu", "memory"]
```

### 4.4 Serverless Workloads (Lambda)

```yaml
# lambda-functions.yaml
# Funciones Lambda para procesamiento asíncrono

AgentEventProcessor:
  runtime: python3.11
  handler: handler.process_event
  memorySize: 512
  timeout: 30
  reservedConcurrency: 100
  environment:
    STAGE: production
    REDIS_HOST: ${ElastiCache_ENDPOINT}
  vpcConfig:
    securityGroupIds:
      - sg-lambda-processor
    subnetIds:
      - subnet-private-app-1a
      - subnet-private-app-1b
  eventSourceMappings:
    - eventSourceArn: ${SQS_AGENT_EVENTS_ARN}
      batchSize: 10
      maximumBatchingWindowInSeconds: 5

AgentWebhookHandler:
  runtime: nodejs20.x
  handler: index.handler
  memorySize: 256
  timeout: 10
  reservedConcurrency: 200
  environment:
    STAGE: production
    API_ENDPOINT: https://api.agentes-ia.com
  urlConfig:
    cors:
      allowOrigins: ["*"]
      allowMethods: ["POST"]
      maxAge: 86400

AgentReportGenerator:
  runtime: python3.11
  handler: handler.generate_report
  memorySize: 2048
  timeout: 900  # 15 minutos
  ephemeralStorageSize: 2048
  environment:
    STAGE: production
    S3_BUCKET: agentes-reports-production
  layers:
    - arn:aws:lambda:sa-east-1:123456789:layer:pandas:1
```

---

## 5. CAPA DE STORAGE

### 5.1 Object Storage (S3) Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AMAZON S3 BUCKETS                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  BUCKET: agentes-enterprise-assets-production                    │   │
│  │  ──────────────────────────────────────────────────────────────  │   │
│  │  Uso: Static assets, images, documents                           │   │
│  │                                                                  │   │
│  │  Configuration:                                                  │   │
│  │  • Versioning: ENABLED                                          │   │
│  │  • Encryption: SSE-KMS (AES-256)                                │   │
│  │  • Public Access: BLOCKED (via CloudFront OAI)                  │   │
│  │  • CORS: ENABLED (para uploads directos)                        │   │
│  │                                                                  │   │
│  │  Lifecycle Policy:                                               │   │
│  │  ├── Current versions → IA after 90 days                        │   │
│  │  ├── Current versions → Glacier after 1 year                    │   │
│  │  ├── Non-current → Delete after 30 days                         │   │
│  │  └── Incomplete uploads → Delete after 7 days                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  BUCKET: agentes-enterprise-data-production                      │   │
│  │  ──────────────────────────────────────────────────────────────  │   │
│  │  Uso: Data exports, backups, reports                             │   │
│  │                                                                  │   │
│  │  Configuration:                                                  │   │
│  │  • Versioning: ENABLED                                          │   │
│  │  • Encryption: SSE-KMS                                          │   │
│  │  • Public Access: BLOCKED                                       │   │
│  │  • Object Lock: COMPLIANCE mode (para compliance)               │   │
│  │                                                                  │   │
│  │  Cross-Region Replication:                                       │   │
│  │  └── Replicate to us-east-1 for DR                              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  BUCKET: agentes-enterprise-logs-production                      │   │
│  │  ──────────────────────────────────────────────────────────────  │   │
│  │  Uso: Application logs, audit logs                               │   │
│  │                                                                  │   │
│  │  Configuration:                                                  │   │
│  │  • Versioning: DISABLED                                         │   │
│  │  • Encryption: SSE-S3                                           │   │
│  │  • Intelligent-Tiering: ENABLED                                 │   │
│  │                                                                  │   │
│  │  Lifecycle Policy:                                               │   │
│  │  ├── Transition to IA after 30 days                             │   │
│  │  ├── Transition to Glacier after 90 days                        │   │
│  │  └── Delete after 7 years (compliance)                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Block Storage (EBS)

```yaml
# ebs-volumes.yaml
# Configuración de volúmenes EBS para EKS

StorageClass:
  gp3-general:
    provisioner: ebs.csi.aws.com
    volumeBindingMode: WaitForFirstConsumer
    allowVolumeExpansion: true
    parameters:
      type: gp3
      encrypted: "true"
      kmsKeyId: alias/aws/ebs
      iops: "3000"
      throughput: "125"
    reclaimPolicy: Retain

  gp3-fast:
    provisioner: ebs.csi.aws.com
    volumeBindingMode: WaitForFirstConsumer
    allowVolumeExpansion: true
    parameters:
      type: gp3
      encrypted: "true"
      kmsKeyId: alias/aws/ebs
      iops: "16000"
      throughput: "1000"
    reclaimPolicy: Retain

  io2-critical:
    provisioner: ebs.csi.aws.com
    volumeBindingMode: WaitForFirstConsumer
    allowVolumeExpansion: true
    parameters:
      type: io2
      encrypted: "true"
      kmsKeyId: alias/aws/ebs
      iopsPerGB: "50"
    reclaimPolicy: Retain
```

### 5.3 File Storage (EFS)

```hcl
# efs.tf
resource "aws_efs_file_system" "shared_storage" {
  creation_token   = "agentes-enterprise-efs"
  encrypted        = true
  kms_key_id       = aws_kms_key.efs.arn
  performance_mode = "generalPurpose"
  throughput_mode  = "bursting"
  
  lifecycle_policy {
    transition_to_ia = "AFTER_30_DAYS"
  }
  
  lifecycle_policy {
    transition_to_primary_storage_class = "AFTER_1_ACCESS"
  }
  
  tags = {
    Name        = "agentes-enterprise-efs"
    Environment = "production"
  }
}

# Mount targets en cada AZ
resource "aws_efs_mount_target" "main" {
  count           = 3
  file_system_id  = aws_efs_file_system.shared_storage.id
  subnet_id       = element(aws_subnet.private_app[*].id, count.index)
  security_groups = [aws_security_group.efs.id]
}

# Access Point para cada workload
resource "aws_efs_access_point" "agent_models" {
  file_system_id = aws_efs_file_system.shared_storage.id
  
  posix_user {
    gid = 1000
    uid = 1000
  }
  
  root_directory {
    path = "/agent-models"
    creation_info {
      owner_gid   = 1000
      owner_uid   = 1000
      permissions = "755"
    }
  }
}
```

### 5.4 Backup Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AWS BACKUP STRATEGY                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Backup Plans:                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  PLAN: Critical Resources (RPO: 4h, RTO: 2h)                    │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Resources: RDS Primary, ElastiCache, EBS Volumes               │   │
│  │  Schedule: Every 4 hours                                        │   │
│  │  Retention: 35 days (daily), 12 months (monthly)                │   │
│  │  Vault: agentes-backup-vault-critical                           │   │
│  │  Encryption: KMS                                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  PLAN: Standard Resources (RPO: 24h, RTO: 4h)                   │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Resources: EFS, S3, Secondary RDS                              │   │
│  │  Schedule: Daily at 2:00 AM UTC-3                               │   │
│  │  Retention: 30 days                                             │   │
│  │  Vault: agentes-backup-vault-standard                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  PLAN: Long-term Archive (Compliance)                           │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Resources: Audit logs, Financial data                          │   │
│  │  Schedule: Monthly                                              │   │
│  │  Retention: 7 years                                             │   │
│  │  Vault: agentes-backup-vault-archive (Glacier)                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Cross-Region Copy:                                                     │
│  └── All backups copied to us-east-1 for DR                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. CAPA DE DATOS

### 6.1 PostgreSQL (RDS)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AMAZON RDS POSTGRESQL                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    PRIMARY INSTANCE                              │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Instance Class: db.r6g.2xlarge                                 │   │
│  │  Engine: PostgreSQL 15.4                                        │   │
│  │  Storage: 500 GB (gp3), autoscaling to 2TB                      │   │
│  │  Multi-AZ: ENABLED (synchronous standby)                        │   │
│  │  Encryption: AES-256 (KMS)                                      │   │
│  │  Backup Window: 03:00-04:00 UTC-3                               │   │
│  │  Backup Retention: 35 days                                      │   │
│  │  Performance Insights: ENABLED (7 days retention)               │   │
│  │  Enhanced Monitoring: ENABLED (60s interval)                    │   │
│  │                                                                  │   │
│  │  Parameter Group Customizations:                                 │   │
│  │  ├── max_connections: 500                                       │   │
│  │  ├── shared_buffers: 8GB (25% RAM)                              │   │
│  │  ├── effective_cache_size: 24GB                                 │   │
│  │  ├── work_mem: 16MB                                             │   │
│  │  ├── maintenance_work_mem: 2GB                                  │   │
│  │  ├── random_page_cost: 1.1 (SSD optimized)                      │   │
│  │  └── pgvector extension: ENABLED                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    READ REPLICAS                                 │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Replica 1: db.r6g.xlarge (São Paulo AZ-1b)                     │   │
│  │  Replica 2: db.r6g.xlarge (São Paulo AZ-1c)                     │   │
│  │  Cross-Region: db.r6g.xlarge (us-east-1) for DR                 │   │
│  │                                                                  │   │
│  │  Use Cases:                                                      │   │
│  │  ├── Read-heavy queries (analytics)                             │   │
│  │  ├── Reporting workloads                                        │   │
│  │  └── Failover target                                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    PROXY (RDS Proxy)                             │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Engine Family: POSTGRESQL                                      │   │
│  │  Max Connections: 1000 (pooling)                                │   │
│  │  Connection Borrow Timeout: 120s                                │   │
│  │  Idle Client Timeout: 1800s                                     │   │
│  │  Benefits:                                                      │   │
│  │  ├── Connection pooling (reduce overhead)                       │   │
│  │  ├── Faster failover (66% reduction)                            │   │
│  │  └── IAM authentication support                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Redis/ElastiCache

```hcl
# elasticache.tf
# Redis Cluster para caching y sesiones

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "agentes-redis-prod"
  description          = "Redis cluster for Agentes Enterprise"
  
  node_type            = "cache.r6g.xlarge"
  num_cache_clusters   = 3  # 1 por AZ
  automatic_failover_enabled = true
  multi_az_enabled     = true
  
  engine               = "redis"
  engine_version       = "7.1"
  port                 = 6379
  
  parameter_group_name = aws_elasticache_parameter_group.redis.name
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]
  
  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  auth_token                  = var.redis_auth_token
  
  snapshot_retention_limit    = 7
  snapshot_window             = "05:00-06:00"
  maintenance_window          = "sun:07:00-sun:08:00"
  
  apply_immediately           = false
  auto_minor_version_upgrade  = true
  
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }
  
  tags = {
    Name = "agentes-redis-prod"
    Environment = "production"
  }
}

# Parameter Group
resource "aws_elasticache_parameter_group" "redis" {
  family = "redis7"
  name   = "agentes-redis-params"
  
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }
  
  parameter {
    name  = "activedefrag"
    value = "yes"
  }
}
```

### 6.3 MongoDB Atlas

```yaml
# mongodb-atlas.yaml
# Configuración de MongoDB Atlas para documentos flexibles

cluster:
  name: agentes-enterprise-prod
  provider: AWS
  region: SA-EAST-1
  
  tier: M40  # 16 GB RAM, 4 vCPU
  type: REPLICASET
  
  replicationSpecs:
    - zoneName: Zone 1
      numShards: 1
      regionsConfig:
        SA-EAST-1:
          electableNodes: 3
          priority: 7
          readOnlyNodes: 0
        US-EAST-1:
          electableNodes: 2
          priority: 6
          readOnlyNodes: 1
  
  backup:
    enabled: true
    provider: AWS
    frequency: daily
    retention: 30
    
  biConnector:
    enabled: false
    
  encryptionAtRestProvider: AWS
  
  labels:
    - key: environment
      value: production
    - key: project
      value: agentes-enterprise

  # Auto-scaling
  autoScaling:
    diskGBEnabled: true
    compute:
      enabled: true
      scaleDownEnabled: false
      minInstanceSize: M30
      maxInstanceSize: M60

# Use Cases:
# - Agent configurations (esquema flexible)
# - Conversation history
# - User profiles
# - Analytics events
```

### 6.4 Vector Database

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    VECTOR DATABASE ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Estrategia: pgvector (PostgreSQL) + Pinecone (híbrido)                │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    PGVECTOR (PRIMARY)                            │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Ubicación: RDS PostgreSQL (misma instancia)                    │   │
│  │                                                                  │   │
│  │  Uso:                                                            │   │
│  │  ├── Embeddings de agentes (< 1M vectores)                      │   │
│  │  ├── Knowledge base pequeña/medium                              │   │
│  │  ├── RAG con documentos empresariales                           │   │
│  │  └── Similarity search para matching                            │   │
│  │                                                                  │   │
│  │  Configuración:                                                  │   │
│  │  ├── Extension: pgvector v0.5.1                                 │   │
│  │  ├── Dimensiones: 1536 (OpenAI), 768 (local models)             │   │
│  │  ├── Índice: ivfflat (para <100k), hnsw (para >100k)            │   │
│  │  └── lists: sqrt(n) donde n = número de vectores                │   │
│  │                                                                  │   │
│  │  Tablas:                                                         │   │
│  │  ├── agent_embeddings (agent_id, embedding, metadata)           │   │
│  │  ├── document_chunks (doc_id, chunk_id, embedding, content)     │   │
│  │  └── conversation_embeddings (conv_id, embedding, summary)      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    PINECONE (SCALE)                              │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Plan: Enterprise (dedicated infrastructure)                    │   │
│  │                                                                  │   │
│  │  Uso:                                                            │   │
│  │  ├── Embeddings a gran escala (> 10M vectores)                  │   │
│  │  ├── Multi-tenant (un índice por cliente enterprise)            │   │
│  │  ├── Alta concurrencia de búsqueda                              │   │
│  │  └── Hybrid search (vector + metadata filtering)                │   │
│  │                                                                  │   │
│  │  Configuración:                                                  │   │
│  │  ├── Environment: us-east-1-aws (cerca de DR)                   │   │
│  │  ├── Pod Type: p1.x2 (2 replicas, alta disponibilidad)          │   │
│  │  ├── Dimensiones: 1536                                          │   │
│  │  ├── Metric: cosine (para embeddings de texto)                  │   │
│  │  └── Metadata config: tenant_id, category, timestamp            │   │
│  │                                                                  │   │
│  │  Índices:                                                        │   │
│  │  ├── enterprise-knowledge-base (compartido)                     │   │
│  │  └── tenant-{id}-embeddings (dedicado por cliente)              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Decision Tree:                                                         │
│  ├── < 100k vectores → pgvector only                                   │
│  ├── 100k - 1M vectores → pgvector (con hnsw)                          │
│  ├── 1M - 10M vectores → pgvector + Pinecone (migración gradual)       │
│  └── > 10M vectores → Pinecone primary, pgvector cache                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. SERVICIOS ADMINISTRADOS

### 7.1 Message Queues (SQS)

```hcl
# sqs-queues.tf
# Colas SQS para procesamiento asíncrono

# High Priority Queue
resource "aws_sqs_queue" "agent_commands_high" {
  name                        = "agent-commands-high-priority"
  visibility_timeout_seconds  = 300
  message_retention_seconds   = 86400  # 1 día
  max_message_size            = 262144  # 256 KB
  delay_seconds               = 0
  receive_wait_time_seconds   = 20
  
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.agent_commands_dlq.arn
    maxReceiveCount     = 3
  })
  
  kms_master_key_id = aws_kms_key.sqs.arn
  
  tags = {
    Priority = "high"
    Workload = "agent-commands"
  }
}

# Standard Queue
resource "aws_sqs_queue" "agent_events" {
  name                        = "agent-events"
  visibility_timeout_seconds  = 180
  message_retention_seconds   = 345600  # 4 días
  
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.agent_events_dlq.arn
    maxReceiveCount     = 5
  })
  
  kms_master_key_id = aws_kms_key.sqs.arn
}

# FIFO Queue (para orden garantizado)
resource "aws_sqs_queue" "agent_state_updates" {
  name                        = "agent-state-updates.fifo"
  fifo_queue                  = true
  content_based_deduplication = true
  visibility_timeout_seconds  = 60
  message_retention_seconds   = 86400
  
  kms_master_key_id = aws_kms_key.sqs.arn
}

# Dead Letter Queues
resource "aws_sqs_queue" "agent_commands_dlq" {
  name              = "agent-commands-dlq"
  kms_master_key_id = aws_kms_key.sqs.arn
}

resource "aws_sqs_queue" "agent_events_dlq" {
  name              = "agent-events-dlq"
  kms_master_key_id = aws_kms_key.sqs.arn
}
```

### 7.2 Event Streaming (MSK Kafka)

```hcl
# msk-kafka.tf
# Amazon MSK para event streaming

resource "aws_msk_cluster" "agentes_events" {
  cluster_name           = "agentes-events-prod"
  kafka_version          = "3.5.1"
  number_of_broker_nodes = 6  # 2 por AZ
  
  broker_node_group_info {
    instance_type   = "kafka.m5.large"
    client_subnets  = aws_subnet.private_data[*].id
    security_groups = [aws_security_group.msk.id]
    
    storage_info {
      ebs_storage_info {
        volume_size = 1000
        provisioned_throughput {
          enabled           = true
          volume_throughput = 250
        }
      }
    }
  }
  
  encryption_info {
    encryption_at_rest_kms_key_arn = aws_kms_key.msk.arn
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }
  
  client_authentication {
    sasl {
      iam = true
    }
  }
  
  configuration_info {
    arn      = aws_msk_configuration.agentes.arn
    revision = aws_msk_configuration.agentes.latest_revision
  }
  
  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk.name
      }
      s3 {
        enabled = true
        bucket  = aws_s3_bucket.logs.id
        prefix  = "msk-logs/"
      }
    }
  }
  
  tags = {
    Name = "agentes-events-prod"
    Environment = "production"
  }
}

# MSK Configuration
resource "aws_msk_configuration" "agentes" {
  kafka_versions = ["3.5.1"]
  name           = "agentes-kafka-config"
  
  server_properties = <<PROPERTIES
auto.create.topics.enable=false
default.replication.factor=3
min.insync.replicas=2
num.io.threads=8
num.network.threads=5
num.partitions=12
num.replica.fetchers=2
replica.lag.time.max.ms=30000
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600
socket.send.buffer.bytes=102400
unclean.leader.election.enable=false
PROPERTIES
}

# Topics
# agent-events: Eventos de agentes (partitions: 12, RF: 3)
# agent-commands: Comandos a agentes (partitions: 6, RF: 3)
# conversation-stream: Stream de conversaciones (partitions: 24, RF: 3)
# analytics-raw: Datos para analytics (partitions: 12, RF: 3)
```

### 7.3 Search (OpenSearch)

```hcl
# opensearch.tf
# Amazon OpenSearch para búsqueda full-text

resource "aws_opensearch_domain" "agentes_search" {
  domain_name    = "agentes-search-prod"
  engine_version = "OpenSearch_2.11"
  
  cluster_config {
    instance_type          = "r6g.large.search"
    instance_count         = 3
    dedicated_master_enabled = true
    dedicated_master_type    = "r6g.large.search"
    dedicated_master_count   = 3
    zone_awareness_enabled   = true
    zone_awareness_config {
      availability_zone_count = 3
    }
    warm_enabled = true
    warm_type    = "ultrawarm1.medium.search"
    warm_count   = 2
  }
  
  ebs_options {
    ebs_enabled = true
    volume_size = 500
    volume_type = "gp3"
    iops        = 3000
  }
  
  vpc_options {
    subnet_ids         = aws_subnet.private_data[*].id
    security_group_ids = [aws_security_group.opensearch.id]
  }
  
  encrypt_at_rest {
    enabled = true
  }
  
  node_to_node_encryption {
    enabled = true
  }
  
  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }
  
  advanced_security_options {
    enabled                        = true
    internal_user_database_enabled = true
    master_user_options {
      master_user_name     = "admin"
      master_user_password = var.opensearch_master_password
    }
  }
  
  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch_index.arn
    log_type                 = "INDEX_SLOW_LOGS"
  }
  
  log_publishing_options {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.opensearch_search.arn
    log_type                 = "SEARCH_SLOW_LOGS"
  }
  
  auto_tune_options {
    desired_state = "ENABLED"
    rollback_on_disable = "NO_ROLLBACK"
    maintenance_schedule {
      start_at = timeadd(timestamp(), "24h")
      duration {
        value = 2
        unit  = "HOURS"
      }
      cron_expression_for_recurrence = "cron(0 3 ? * SUN *)"
    }
  }
  
  tags = {
    Name = "agentes-search-prod"
    Environment = "production"
  }
}

# Índices:
# - agent-logs: Logs de agentes con full-text search
# - conversation-history: Historial de conversaciones
# - knowledge-articles: Base de conocimiento
# - audit-trail: Auditoría de acciones
```

### 7.4 Monitoring Stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MONITORING & OBSERVABILITY                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    CLOUDWATCH (AWS Native)                       │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Metrics:                                                        │   │
│  │  ├── Custom metrics from aplicaciones (via SDK)                 │   │
│  │  ├── Container Insights (EKS)                                   │   │
│  │  ├── RDS Performance Insights                                   │   │
│  │  └── API Gateway metrics                                        │   │
│  │                                                                  │   │
│  │  Logs:                                                           │   │
│  │  ├── Application logs (via Fluent Bit → CloudWatch)             │   │
│  │  ├── Infrastructure logs (VPC Flow, ALB, etc.)                  │   │
│  │  └── Audit logs (CloudTrail)                                    │   │
│  │                                                                  │   │
│  │  Alarms:                                                         │   │
│  │  ├── High CPU (>80% for 5 min)                                  │   │
│  │  ├── High Memory (>85% for 5 min)                               │   │
│  │  ├── Error Rate (>1% for 2 min)                                 │   │
│  │  ├── Latency P99 (>500ms for 5 min)                             │   │
│  │  └── Database connections (>80% of max)                         │   │
│  │                                                                  │   │
│  │  Dashboards:                                                     │   │
│  │  ├── Executive Dashboard (SLA, costs, key metrics)              │   │
│  │  ├── Operations Dashboard (health, alerts)                      │   │
│  │  └── Engineering Dashboard (detailed metrics)                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    DATADOG (Primary Observability)               │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Plan: Enterprise                                               │   │
│  │                                                                  │   │
│  │  Features:                                                       │   │
│  │  ├── APM (Distributed Tracing)                                  │   │
│  │  ├── Infrastructure Monitoring                                  │   │
│  │  ├── Log Management                                             │   │
│  │  ├── Real User Monitoring (RUM)                                 │   │
│  │  ├── Synthetic Monitoring                                       │   │
│  │  ├── Security Monitoring                                        │   │
│  │  └── Custom Dashboards & Alerts                                 │   │
│  │                                                                  │   │
│  │  Integrations:                                                   │   │
│  │  ├── AWS (CloudWatch, X-Ray, etc.)                              │   │
│  │  ├── Kubernetes (EKS)                                           │   │
│  │  ├── PostgreSQL (RDS)                                           │   │
│  │  ├── Redis (ElastiCache)                                        │   │
│  │  └── Kafka (MSK)                                                │   │
│  │                                                                  │   │
│  │  SLOs:                                                           │   │
│  │  ├── API Availability: 99.99%                                   │   │
│  │  ├── API Latency P99: <200ms                                    │   │
│  │  └── Agent Response Time: <500ms                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    GRAFANA (Visualization)                       │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Deployment: Grafana Cloud (managed)                            │   │
│  │                                                                  │   │
│  │  Data Sources:                                                   │   │
│  │  ├── CloudWatch                                                 │   │
│  │  ├── Prometheus (via remote write)                              │   │
│  │  ├── Loki (logs)                                                │   │
│  │  └── Tempo (traces)                                             │   │
│  │                                                                  │   │
│  │  Dashboards:                                                     │   │
│  │  ├── Kubernetes Cluster Overview                                │   │
│  │  ├── Application Performance                                    │   │
│  │  ├── Database Health                                            │   │
│  │  └── Cost & Resource Utilization                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    PAGERDUTY (Incident Management)               │   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Escalation Policies:                                            │   │
│  │  ├── P1 (Critical): 5 min response, 15 min resolution           │   │
│  │  ├── P2 (High): 15 min response, 1 hour resolution              │   │
│  │  ├── P3 (Medium): 1 hour response, 4 hours resolution           │   │
│  │  └── P4 (Low): 4 hours response, 24 hours resolution            │   │
│  │                                                                  │   │
│  │  On-Call Rotations:                                              │   │
│  │  ├── Primary: Platform Team (weekly rotation)                   │   │
│  │  ├── Secondary: SRE Team                                        │   │
│  │  └── Escalation: Engineering Managers                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. DISASTER RECOVERY

### 8.1 RPO y RTO Objetivos

| Tier | Servicio | RPO | RTO | Estrategia |
|------|----------|-----|-----|------------|
| **Critical** | API Gateway, Auth | 0 min | 5 min | Multi-AZ + Hot Standby |
| **Critical** | PostgreSQL Primary | 5 min | 10 min | Multi-AZ + Cross-Region Replica |
| **High** | Agent Service | 15 min | 30 min | EKS Multi-AZ + Automated Recovery |
| **High** | Redis Cache | 0 min | 5 min | Redis Cluster + Persistence |
| **Medium** | Analytics, Reports | 1 hour | 2 hours | S3 Cross-Region + Batch Recovery |
| **Low** | Logs, Archives | 24 hours | 24 hours | S3 Glacier + Manual Recovery |

### 8.2 Multi-Region Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DISASTER RECOVERY ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   PRIMARY REGION                    SECONDARY REGION                    │
│   sa-east-1 (São Paulo)             us-east-1 (N. Virginia)             │
│                                                                         │
│   ┌─────────────────┐               ┌─────────────────┐                │
│   │   ACTIVE        │               │   STANDBY       │                │
│   │                 │               │                 │                │
│   │  ┌───────────┐  │  Replication  │  ┌───────────┐  │                │
│   │  │   EKS     │  │◄─────────────►│  │   EKS     │  │                │
│   │  │  Cluster  │  │   (ArgoCD)    │  │  Standby  │  │                │
│   │  └───────────┘  │               │  └───────────┘  │                │
│   │                 │               │                 │                │
│   │  ┌───────────┐  │  Sync         │  ┌───────────┐  │                │
│   │  │    RDS    │  │◄─────────────►│  │   RDS     │  │                │
│   │  │  Primary  │  │  (Streaming)  │  │  Replica  │  │                │
│   │  └───────────┘  │               │  └───────────┘  │                │
│   │                 │               │                 │                │
│   │  ┌───────────┐  │  CRR          │  ┌───────────┐  │                │
│   │  │    S3     │  │◄─────────────►│  │    S3     │  │                │
│   │  │  Primary  │  │               │  │  Replica  │  │                │
│   │  └───────────┘  │               │  └───────────┘  │                │
│   │                 │               │                 │                │
│   │  ┌───────────┐  │  Replication  │  ┌───────────┐  │                │
│   │  │  Redis    │  │◄─────────────►│  │  Redis    │  │                │
│   │  │  Cluster  │  │   (AOF)       │  │  Replica  │  │                │
│   │  └───────────┘  │               │  └───────────┘  │                │
│   └─────────────────┘               └─────────────────┘                │
│                                                                         │
│   FAILOVER TRIGGERS:                                                    │
│   ├── Regional outage (AWS sa-east-1 unavailable)                       │
│   ├── Latency > 500ms for > 10 minutes                                  │
│   ├── Error rate > 5% for > 5 minutes                                   │
│   └── Manual trigger (planned maintenance)                              │
│                                                                         │
│   FAILOVER PROCESS (Automated):                                         │
│   1. Route53 detecta health check failure (30s)                         │
│   2. DNS failover a us-east-1 (propagation: 60s)                        │
│   3. RDS replica promoted to primary (2-3 min)                          │
│   4. EKS standby scaled up (ArgoCD sync: 3-5 min)                       │
│   5. Total RTO: ~5-10 minutes                                           │
│                                                                         │
│   FAILBACK PROCESS (Manual):                                            │
│   1. Verify sa-east-1 health                                            │
│   2. Sync data from us-east-1 to sa-east-1                              │
│   3. Promote sa-east-1 RDS to primary                                   │
│   4. Update Route53 to point to sa-east-1                               │
│   5. Scale down us-east-1 EKS                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Backup Automation

```yaml
# backup-plans.yaml
# AWS Backup Plans

BackupPlan_Critical:
  name: agentes-critical-backup
  rules:
    - rule_name: continuous-backup
      target_resource_types:
        - RDS
        - DynamoDB
      schedule: CONTINUOUS
      lifecycle:
        delete_after: 35
      copy_actions:
        - destination_region: us-east-1
          lifecycle:
            delete_after: 35
    
    - rule_name: hourly-snapshot
      target_resource_types:
        - EBS
      schedule: cron(0 * * * ? *)
      lifecycle:
        move_to_cold_storage_after: 30
        delete_after: 120
      copy_actions:
        - destination_region: us-east-1

BackupPlan_Standard:
  name: agentes-standard-backup
  rules:
    - rule_name: daily-backup
      target_resource_types:
        - EFS
        - S3
      schedule: cron(0 5 ? * * *)
      lifecycle:
        delete_after: 30
      copy_actions:
        - destination_region: us-east-1

BackupPlan_Archive:
  name: agentes-archive-backup
  rules:
    - rule_name: monthly-archive
      target_resource_types:
        - S3
      schedule: cron(0 5 1 * ? *)
      lifecycle:
        move_to_cold_storage_after: 1
        delete_after: 2555  # 7 years
      copy_actions:
        - destination_region: us-east-1
          lifecycle:
            delete_after: 2555
```

### 8.4 Runbooks de Recuperación

```markdown
# RUNBOOK: RDS Failover

## Escenario
RDS Primary en sa-east-1 no responde o tiene degradación severa.

## Detección
- CloudWatch Alarm: DatabaseConnections > 80%
- CloudWatch Alarm: CPUUtilization > 90%
- Datadog Alert: Query latency P99 > 1000ms
- Manual detection

## Procedimiento

### Paso 1: Verificar Estado (1 minuto)
```bash
aws rds describe-db-instances \
  --db-instance-identifier agentes-postgres-primary \
  --region sa-east-1
```

### Paso 2: Promover Replica (2-3 minutos)
```bash
aws rds promote-read-replica \
  --db-instance-identifier agentes-postgres-replica \
  --region sa-east-1
```

### Paso 3: Actualizar Secrets Manager (1 minuto)
```bash
aws secretsmanager put-secret-value \
  --secret-id prod/agentes/database/endpoint \
  --secret-string '{"host":"NEW_ENDPOINT","port":5432}'
```

### Paso 4: Verificar Aplicación (2 minutos)
- Check application logs
- Verify connection pool recovery
- Run health check endpoint

### Paso 5: Notificar (1 minuto)
- Post in #incidents Slack channel
- Update PagerDuty incident
- Notify stakeholders

## Rollback
- Si el failover fue manual y el primary se recupera:
  1. No hacer rollback inmediato (causa más downtime)
  2. Planear maintenance window para failback
  3. Sincronizar datos antes del failback

---

# RUNBOOK: EKS Cluster Recovery

## Escenario
EKS Cluster en sa-east-1 no está disponible o tiene nodos fallando.

## Detección
- Datadog Alert: Kubernetes API Server latency > 500ms
- CloudWatch Alarm: ClusterFailedNodeCount > 0
- Manual detection

## Procedimiento

### Paso 1: Verificar Estado del Cluster
```bash
aws eks describe-cluster \
  --name agentes-enterprise-prod \
  --region sa-east-1

kubectl get nodes
kubectl get pods --all-namespaces
```

### Paso 2: Activar Standby Cluster (us-east-1)
```bash
# Scale up standby cluster
aws eks update-nodegroup-config \
  --cluster-name agentes-enterprise-dr \
  --nodegroup-name general-workloads \
  --scaling-config minSize=3,maxSize=12,desiredSize=6 \
  --region us-east-1

# Sync applications
argocd app sync agentes-enterprise --dest-server https://DR_CLUSTER_ENDPOINT
```

### Paso 3: Actualizar DNS
```bash
# Update Route53 to point to DR ALB
aws route53 change-resource-record-sets \
  --hosted-zone-id ZONE_ID \
  --change-batch file://dr-failover.json
```

### Paso 4: Verificar Aplicación
```bash
curl -f https://api.agentes-ia.com/health
```

---

# RUNBOOK: S3 Data Recovery

## Escenario
Datos corruptos o eliminados accidentalmente en S3.

## Procedimiento

### Paso 1: Identificar Objetos Afectados
```bash
aws s3api list-object-versions \
  --bucket agentes-enterprise-data-production \
  --prefix path/to/affected/data
```

### Paso 2: Restaurar desde Versiones
```bash
# Restore specific version
aws s3api copy-object \
  --bucket agentes-enterprise-data-production \
  --copy-source agentes-enterprise-data-production/object.txt?versionId=VERSION_ID \
  --key object.txt
```

### Paso 3: Restaurar desde Cross-Region Replica
```bash
aws s3 sync \
  s3://agentes-enterprise-data-production-replica \
  s3://agentes-enterprise-data-production \
  --source-region us-east-1
```

### Paso 4: Verificar Integridad
```bash
aws s3api head-object \
  --bucket agentes-enterprise-data-production \
  --key restored-object.txt
```
```

---

## 9. COST OPTIMIZATION

### 9.1 Reserved Instances Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    RESERVED INSTANCES STRATEGY                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Workload Analysis (30-day baseline):                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Service              │  Baseline │  Strategy    │  Savings     │   │
│  │  ─────────────────────┼───────────┼──────────────┼────────────  │   │
│  │  EKS General Nodes    │  6 nodes  │  1-Year All  │  30-40%      │   │
│  │  RDS PostgreSQL       │  db.r6g.2x│  1-Year All  │  40-45%      │   │
│  │  ElastiCache Redis    │  3 nodes  │  1-Year All  │  35-40%      │   │
│  │  MSK Kafka            │  6 brokers│  1-Year All  │  30-35%      │   │
│  │  OpenSearch           │  3 nodes  │  1-Year All  │  30-35%      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Savings Plans:                                                         │
│  ├── Compute Savings Plan: 70% of baseline compute                    │
│  │   └── Covers: EC2, Fargate, Lambda                                  │
│  │   └── Term: 1-year, All Upfront                                     │
│  │   └── Savings: ~25-30%                                              │
│  │                                                                     │
│  └── EC2 Instance Savings Plan: 30% of baseline                       │
│      └── Covers: Specific instance families (m6i, r6g)                │
│      └── Term: 1-year, Partial Upfront                                │
│      └── Savings: ~35-40%                                             │
│                                                                         │
│  Spot Instances:                                                        │
│  ├── Use Case: Background jobs, batch processing, CI/CD               │
│  ├── Coverage: 60-70% of non-critical workloads                       │
│  └── Savings: ~60-70% vs On-Demand                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Resource Tagging Strategy

```hcl
# tagging-policy.tf
# Mandatory Tags para todos los recursos

locals {
  mandatory_tags = {
    # Identificación
    Project     = "agentes-enterprise"
    Application = "agent-platform"
    
    # Ambiente
    Environment = "production"  # production, staging, development
    
    # Propósito
    Purpose     = "api-gateway"  # api-gateway, database, cache, etc.
    
    # Ownership
    Owner       = "platform-team"
    CostCenter  = "engineering"
    
    # Automatización
    AutoStop    = "false"  # true para dev/test
    Backup      = "critical"  # critical, standard, none
    
    # Compliance
    DataClass   = "confidential"  # public, internal, confidential, restricted
    Compliance  = "soc2,iso27001"
  }
}

# AWS Config Rule para enforce tagging
resource "aws_config_config_rule" "required_tags" {
  name = "required-tags"
  
  source {
    owner             = "AWS"
    source_identifier = "REQUIRED_TAGS"
  }
  
  input_parameters = jsonencode({
    tag1Key = "Project"
    tag2Key = "Environment"
    tag3Key = "Owner"
    tag4Key = "CostCenter"
    tag5Key = "Purpose"
  })
}
```

### 9.3 Cost Allocation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    COST ALLOCATION STRUCTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Cost Centers:                                                          │
│  ├── platform-core: Infraestructura base (EKS, VPC, ALB)              │
│  ├── ai-platform: Servicios de IA (GPU, modelos, embeddings)          │
│  ├── data-platform: Bases de datos y storage                          │
│  ├── observability: Monitoring y logging                              │
│  ├── security: WAF, Shield, KMS, Secrets Manager                      │
│  └── shared: Servicios compartidos (DNS, CDN, etc.)                   │
│                                                                         │
│  Chargeback Model:                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Tenant        │  Compute    │  Storage   │  Network   │  Total │   │
│  │  ──────────────┼─────────────┼────────────┼────────────┼─────── │   │
│  │  Tenant A      │  $1,200     │  $300      │  $150      │  $1,650│   │
│  │  Tenant B      │  $800       │  $200      │  $100      │  $1,100│   │
│  │  Tenant C      │  $2,000     │  $500      │  $250      │  $2,750│   │
│  │  ──────────────┼─────────────┼────────────┼────────────┼─────── │   │
│  │  Shared        │  $500       │  $100      │  $50       │  $650  │   │
│  │  ──────────────┼─────────────┼────────────┼────────────┼─────── │   │
│  │  TOTAL         │  $4,500     │  $1,100    │  $550      │  $6,150│   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Attribution:                                                           │
│  ├── Compute: Basado en pod labels (tenant-id)                        │
│  ├── Storage: Basado en bucket prefixes (tenant-id)                   │
│  └── Network: Basado en data transfer (CloudFront logs)               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.4 FinOps Practices

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    FINOPS PRACTICES                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. VISIBILITY                                                          │
│  ├── AWS Cost Explorer: Daily review de costos                        │
│  ├── AWS Budgets: Alertas al 80%, 100%, 120% del presupuesto          │
│  ├── Datadog Cloud Cost: Cost allocation por servicio                 │
│  └── Custom Dashboard: Costos por tenant, feature, equipo             │
│                                                                         │
│  2. OPTIMIZATION                                                        │
│  ├── Compute Optimizer: Recomendaciones de right-sizing               │
│  ├── Spot Instances: 60-70% de workloads no críticos                  │
│  ├── Reserved Capacity: 1-year All Upfront para baseline              │
│  ├── S3 Intelligent-Tiering: Automatización de lifecycle              │
│  └── Lambda: Right-sizing de memory y timeout                         │
│                                                                         │
│  3. GOVERNANCE                                                          │
│  ├── AWS Organizations: Consolidated billing                          │
│  ├── SCPs: Restricciones de servicios costosos                        │
│  ├── Tagging Policy: Mandatory tags para todos los recursos           │
│  └── Cost Anomaly Detection: Alertas de gastos inusuales              │
│                                                                         │
│  4. CULTURE                                                             │
│  ├── Monthly Cost Review: Revisión de costos con stakeholders         │
│  ├── Cost per Request: Métrica de costo por API call                  │
│  ├── Cost per Tenant: Chargeback a equipos/tenants                    │
│  └── Cost Optimization Sprints: Dedicación mensual a optimización     │
│                                                                         │
│  5. AUTOMATION                                                          │
│  ├── Auto-shutdown: Recursos de dev/test fuera de horario             │
│  ├── Rightsizing: Lambda para ajustar recursos basado en uso          │
│  ├── Storage Lifecycle: Automatización de S3/Glacier transitions      │
│  └── Spot Instance Management: Interruption handling                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 10. RUNBOOKS DE OPERACIÓN

### 10.1 Deployment Runbook

```markdown
# RUNBOOK: Application Deployment

## Pre-Deployment Checklist
- [ ] All tests passing in CI/CD
- [ ] Database migrations reviewed and tested
- [ ] Feature flags configured
- [ ] Rollback plan documented
- [ ] On-call engineer notified

## Deployment Steps

### 1. Pre-Deployment (5 min)
```bash
# Verify current state
kubectl get pods -n production
kubectl get nodes

# Check recent alerts
# Review Datadog dashboard
```

### 2. Database Migration (if needed) (10 min)
```bash
# Run migrations
kubectl apply -f k8s/migrations/job.yaml
kubectl wait --for=condition=complete job/db-migration -n production --timeout=600s
```

### 3. Application Deployment (5 min)
```bash
# Update image tag
kubectl set image deployment/api-gateway api-gateway=agentes/api-gateway:v1.2.3 -n production

# Monitor rollout
kubectl rollout status deployment/api-gateway -n production --timeout=300s
```

### 4. Post-Deployment Verification (10 min)
```bash
# Health checks
curl -f https://api.agentes-ia.com/health
curl -f https://api.agentes-ia.com/ready

# Smoke tests
./scripts/smoke-tests.sh production

# Monitor metrics
# Check error rates, latency, throughput
```

### 5. Rollback (if needed)
```bash
# Rollback deployment
kubectl rollout undo deployment/api-gateway -n production

# Verify rollback
kubectl rollout status deployment/api-gateway -n production
```

## Post-Deployment
- [ ] Monitor for 30 minutes
- [ ] Update deployment log
- [ ] Notify team in #deployments
```

### 10.2 Scaling Runbook

```markdown
# RUNBOOK: Manual Scaling

## Horizontal Pod Autoscaler Override

### Scale Up (Emergency)
```bash
# Override HPA temporarily
kubectl scale deployment api-gateway --replicas=20 -n production

# Verify scaling
kubectl get pods -n production -l app=api-gateway
```

### Scale Down
```bash
# Return control to HPA
kubectl patch hpa api-gateway -n production -p '{"spec":{"minReplicas":3}}'
```

## Node Scaling

### Add Nodes
```bash
# Update node group desired capacity
aws eks update-nodegroup-config \
  --cluster-name agentes-enterprise-prod \
  --nodegroup-name general-workloads \
  --scaling-config minSize=3,maxSize=20,desiredSize=15
```

### Remove Nodes
```bash
# Cordon nodes to prevent new pods
kubectl cordon <node-name>

# Drain nodes
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# Update node group desired capacity
aws eks update-nodegroup-config \
  --cluster-name agentes-enterprise-prod \
  --nodegroup-name general-workloads \
  --scaling-config minSize=3,maxSize=20,desiredSize=6
```
```

### 10.3 Security Runbook

```markdown
# RUNBOOK: Security Incident Response

## Detection
- GuardDuty Alert
- WAF Block
- Unusual API activity
- Manual report

## Response

### 1. Containment (Immediate)
```bash
# Isolate affected resources
kubectl taint nodes <node-name> security-incident=true:NoSchedule

# Block suspicious IPs in WAF
aws wafv2 update-ip-set \
  --name blocked-ips \
  --scope REGIONAL \
  --id <ip-set-id> \
  --addresses <suspicious-ip>/32
```

### 2. Investigation
```bash
# Collect logs
aws logs filter-log-events \
  --log-group-name /eks/agentes-enterprise-prod \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --filter-pattern '{ $.level = "ERROR" }'

# Review CloudTrail
aws cloudtrail lookup-events \
  --start-time $(date -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
  --lookup-attributes AttributeKey=EventSource,AttributeValue=iam.amazonaws.com
```

### 3. Eradication
- Remove compromised credentials
- Patch vulnerabilities
- Update security groups

### 4. Recovery
- Restore from clean backups if needed
- Re-enable services
- Monitor for recurrence

### 5. Post-Incident
- Document timeline
- Update runbooks
- Schedule security review
```

---

## 11. ESTIMACIÓN DE COSTOS

### 11.1 Costo Mensual Detallado

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ESTIMACIÓN DE COSTOS MENSUALES                       │
│                    (USD - Región São Paulo)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  COMPUTE                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Service              │  Specs          │  Monthly Cost        │   │
│  │  ─────────────────────┼─────────────────┼────────────────────  │   │
│  │  EKS Control Plane    │  Managed        │  $73.00              │   │
│  │  EKS General Nodes    │  6x m6i.2xlarge │  $1,440.00           │   │
│  │  EKS AI/GPU Nodes     │  2x g5.2xlarge  │  $1,200.00           │   │
│  │  EKS Spot Nodes       │  10x m6i.xlarge │  $400.00             │   │
│  │  Fargate (Serverless) │  ~500 vCPU-hrs  │  $200.00             │   │
│  │  Lambda               │  ~10M requests  │  $50.00              │   │
│  │  COMPUTE SUBTOTAL     │                 │  $3,363.00           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  DATABASE & STORAGE                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  RDS PostgreSQL       │  db.r6g.2xlarge │  $800.00             │   │
│  │  RDS Read Replicas    │  2x db.r6g.xl   │  $400.00             │   │
│  │  ElastiCache Redis    │  3x cache.r6g.xl│  $600.00             │   │
│  │  MongoDB Atlas        │  M40 (dedicated)│  $1,200.00           │   │
│  │  S3 Standard          │  ~2 TB          │  $46.00              │   │
│  │  S3 IA                │  ~5 TB          │  $63.00              │   │
│  │  EBS (gp3)            │  ~1.5 TB        │  $120.00             │   │
│  │  EFS                  │  ~500 GB        │ $150.00              │   │
│  │  DATABASE SUBTOTAL    │                 │  $3,379.00           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  NETWORKING                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ALB                  │  2 ALBs         │  $34.00              │   │
│  │  NLB                  │  1 NLB          │  $20.00              │   │
│  │  Data Transfer        │  ~5 TB/mes      │  $450.00             │   │
│  │  CloudFront           │  ~10 TB/mes     │  $850.00             │   │
│  │  Route53              │  1 hosted zone  │  $0.50               │   │
│  │  NAT Gateway          │  3 gateways     │  $96.00              │   │
│  │  NETWORKING SUBTOTAL  │                 │  $1,450.50           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  SERVICIOS ADMINISTRADOS                                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  MSK Kafka            │  6x kafka.m5.large│  $1,200.00         │   │
│  │  SQS                  │  ~100M messages │  $40.00              │   │
│  │  OpenSearch           │  3x r6g.large   │  $500.00             │   │
│  │  CloudWatch           │  Logs + Metrics │  $300.00             │   │
│  │  Secrets Manager      │  ~100 secrets   │  $40.00              │   │
│  │  KMS                  │  ~10K requests  │  $3.00               │   │
│  │  SERVICES SUBTOTAL    │                 │  $2,083.00           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  SEGURIDAD & MONITORING                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  WAF                  │  Web ACL + Rules  │  $50.00            │   │
│  │  Shield Advanced      │  DDoS protection  │  $3,000.00         │   │
│  │  GuardDuty            │  Threat detection │  $200.00           │   │
│  │  Datadog              │  Enterprise plan  │  $2,500.00         │   │
│  │  PagerDuty            │  Business plan    │  $500.00           │   │
│  │  SECURITY SUBTOTAL    │                   │  $6,250.00         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  TOTAL MENSUAL (sin optimización)                 │  $16,525.50│   │
│  │  ─────────────────────────────────────────────────────────────  │   │
│  │  Con Savings Plans (30% ahorro)                   │  $11,567.85│   │
│  │  Con Spot Instances adicionales (40% ahorro)      │  $9,915.30 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Escenarios de Crecimiento

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PROYECCIÓN DE COSTOS POR ESCALA                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Escenario 1: Startup (100 agentes concurrentes)                        │
│  ├── EKS Nodes: 3x m6i.large ($300)                                   │
│  ├── RDS: db.t3.large ($150)                                          │
│  ├── Redis: cache.t3.micro ($50)                                      │
│  ├── S3: 100 GB ($5)                                                  │
│  └── TOTAL: ~$1,500/mes                                               │
│                                                                         │
│  Escenario 2: Growth (1,000 agentes concurrentes)                       │
│  ├── EKS Nodes: 6x m6i.xlarge ($900)                                  │
│  ├── RDS: db.r6g.xlarge ($400)                                        │
│  ├── Redis: 3x cache.r6g.large ($300)                                 │
│  ├── S3: 1 TB ($25)                                                   │
│  └── TOTAL: ~$5,000/mes                                               │
│                                                                         │
│  Escenario 3: Scale (10,000 agentes concurrentes)                       │
│  ├── EKS Nodes: 20x m6i.2xlarge ($4,800)                              │
│  ├── RDS: db.r6g.4xlarge ($1,600)                                     │
│  ├── Redis: 6x cache.r6g.xlarge ($1,200)                              │
│  ├── Kafka: 9x kafka.m5.xlarge ($2,700)                               │
│  ├── S3: 10 TB ($250)                                                 │
│  └── TOTAL: ~$20,000/mes                                              │
│                                                                         │
│  Escenario 4: Enterprise (50,000+ agentes concurrentes)                 │
│  ├── EKS: 100+ nodes + Auto-scaling ($15,000+)                        │
│  ├── RDS: db.r6g.16xlarge cluster ($8,000)                            │
│  ├── Redis: cache.r6g.4xlarge cluster ($3,000)                        │
│  ├── Kafka: 15x kafka.m5.2xlarge ($9,000)                             │
│  ├── OpenSearch: 9x r6g.2xlarge ($4,500)                              │
│  ├── S3: 50 TB ($1,250)                                               │
│  └── TOTAL: ~$50,000+/mes                                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 11.3 Optimizaciones de Costo

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    OPTIMIZACIONES RECOMENDADAS                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Corto Plazo (0-3 meses)                                                │
│  ├── Spot Instances: 60% de workloads no críticos                     │
│  │   └── Ahorro: ~$800/mes                                             │
│  ├── S3 Intelligent-Tiering: Automatización de lifecycle              │
│  │   └── Ahorro: ~$100/mes                                             │
│  ├── Lambda Right-sizing: Optimizar memory y timeout                  │
│  │   └── Ahorro: ~$50/mes                                              │
│  └── Reserved Instances: 1-year para baseline                         │
│      └── Ahorro: ~$2,000/mes                                           │
│                                                                         │
│  Mediano Plazo (3-6 meses)                                              │
│  ├── Compute Savings Plans: 70% de compute                            │
│  │   └── Ahorro: ~$1,500/mes                                           │
│  ├── Graviton Migration: m6i → m6g (20% más barato)                   │
│  │   └── Ahorro: ~$700/mes                                             │
│  ├── Aurora Serverless v2: Para cargas variables                      │
│  │   └── Ahorro: ~$400/mes                                             │
│  └── Container Right-sizing: Basado en Compute Optimizer              │
│      └── Ahorro: ~$500/mes                                             │
│                                                                         │
│  Largo Plazo (6-12 meses)                                               │
│  ├── 3-Year Reserved Instances: Para workloads estables               │
│  │   └── Ahorro adicional: ~$1,000/mes                                 │
│  ├── Multi-Region Optimization: DR más eficiente                      │
│  │   └── Ahorro: ~$500/mes                                             │
│  ├── Data Archival: Glacier para logs antiguos                        │
│  │   └── Ahorro: ~$200/mes                                             │
│  └── FinOps Automation: Auto-shutdown, rightsizing automático         │
│      └── Ahorro: ~$300/mes                                             │
│                                                                         │
│  TOTAL AHORRO POTENCIAL: ~$8,050/mes (~50% de reducción)              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 12. ANEXOS

### 12.1 Terraform Module Structure

```
terraform/
├── modules/
│   ├── vpc/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── eks/
│   │   ├── main.tf
│   │   ├── node_groups.tf
│   │   ├── addons.tf
│   │   └── variables.tf
│   ├── rds/
│   │   ├── main.tf
│   │   ├── replica.tf
│   │   └── variables.tf
│   └── monitoring/
│       ├── cloudwatch.tf
│       ├── datadog.tf
│       └── variables.tf
├── environments/
│   ├── production/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── terraform.tfvars
│   └── staging/
│       ├── main.tf
│       └── variables.tf
└── global/
    ├── iam/
    ├── route53/
    └── s3/
```

### 12.2 CI/CD Pipeline

```yaml
# .github/workflows/deploy-production.yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Tests
        run: make test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build Images
        run: make build
      - name: Push to ECR
        run: make push

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::ACCOUNT:role/GitHubActionsRole
          aws-region: sa-east-1
      - name: Deploy to EKS
        run: make deploy-production
      - name: Verify Deployment
        run: make verify-production
```

### 12.3 Contactos y Escalación

| Rol | Contacto | Escalación |
|-----|----------|------------|
| On-Call Engineer | PagerDuty Rotation | Platform Lead |
| Platform Lead | platform-lead@company.com | VP Engineering |
| AWS Support | Enterprise Support | TAM |
| Datadog Support | Enterprise Plan | CSM |

---

## 13. CONCLUSIONES

### Arquitectura Recomendada

1. **Cloud Provider:** AWS (sa-east-1 São Paulo) con DR en us-east-1
2. **Compute:** EKS con node groups diversificados (On-Demand, Spot, GPU)
3. **Database:** RDS PostgreSQL + ElastiCache Redis + MongoDB Atlas
4. **Storage:** S3 con lifecycle policies + EBS gp3 + EFS
5. **Networking:** VPC multi-AZ + ALB/NLB + CloudFront + Route53
6. **Observability:** Datadog + CloudWatch + Grafana + PagerDuty
7. **Security:** WAF + Shield Advanced + GuardDuty + KMS

### Próximos Pasos

1. Implementar VPC y networking base
2. Desplegar EKS cluster con node groups
3. Configurar RDS y ElastiCache
4. Implementar CI/CD pipeline
5. Configurar monitoring y alerting
6. Realizar disaster recovery drills
7. Optimizar costos con Reserved Instances

---

**Documento generado por Especialista Cloud DevOps**  
**Fecha:** 2024  
**Versión:** 1.0
