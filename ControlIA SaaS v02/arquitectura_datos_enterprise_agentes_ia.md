# ARQUITECTURA DE DATOS ENTERPRISE
## Plataforma de Agentes de IA Empresarial - ControlIA

**Versión:** 1.0  
**Fecha:** Enero 2025  
**Autor:** Especialista en Ingeniería de Datos Enterprise

---

## 📋 RESUMEN EJECUTIVO

Este documento define la arquitectura de datos enterprise para la plataforma de Agentes de IA más completa de Latinoamérica. La arquitectura está diseñada para soportar:

- **Escala:** Petabytes de datos, millones de agentes concurrentes
- **Performance:** Sub-segundo latencia para queries críticos
- **Disponibilidad:** 99.99% uptime con replicación multi-región
- **Compliance:** GDPR, LGPD, SOC2, ISO 27001
- **Costo-eficiencia:** Optimización continua de recursos

---

## 🏗️ DIAGRAMA DE ARQUITECTURA DE DATOS

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         CAPA DE INGESTA Y STREAMING                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │   Kafka/     │  │   AWS        │  │  Webhooks    │  │   CDC (Debezium)     │ │
│  │   Confluent  │  │   Kinesis    │  │  /API Gateway│  │   PostgreSQL→Kafka   │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘ │
└─────────┼─────────────────┼─────────────────┼─────────────────────┼─────────────┘
          │                 │                 │                     │
          └─────────────────┴─────────────────┴─────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         DATA LAKEHOUSE (Bronze/Silver/Gold)                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    DELTA LAKE / APACHE ICEBERG                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │   │
│  │  │   Bronze    │→ │   Silver    │→ │    Gold     │→ │  Feature Store  │ │   │
│  │  │  (Raw)      │  │ (Cleaned)   │  │ (Curated)   │  │  (ML Features)  │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                    │                                            │
│  Storage: AWS S3 / GCS / Azure Blob + Delta Lake / Apache Iceberg              │
│  Processing: Apache Spark / Databricks / Apache Flink                          │
└─────────────────────────────────────────────────────────────────────────────────┘
          │
          ├─────────────────────────────────────────────────────────────────────┐
          │                                                                     │
          ▼                                                                     ▼
┌─────────────────────────────────┐    ┌──────────────────────────────────────────────┐
│      DATA WAREHOUSE             │    │           REAL-TIME ANALYTICS                │
├─────────────────────────────────┤    ├──────────────────────────────────────────────┤
│  ┌─────────────────────────┐   │    │  ┌─────────────┐  ┌─────────────┐            │
│  │      SNOWFLAKE          │   │    │  │  ClickHouse │  │  Apache     │            │
│  │  ┌─────────────────┐   │   │    │  │  (OLAP)     │  │  Druid      │            │
│  │  │  Enterprise EDW │   │   │    │  └─────────────┘  └─────────────┘            │
│  │  │  + Snowpark ML  │   │   │    │                                              │
│  │  └─────────────────┘   │   │    │  Dashboards: Grafana + Custom React          │
│  └─────────────────────────┘   │    └──────────────────────────────────────────────┘
└─────────────────────────────────┘
          │
          ├─────────────────────────────────────────────────────────────────────┐
          │                                                                     │
          ▼                                                                     ▼
┌─────────────────────────────────┐    ┌──────────────────────────────────────────────┐
│    BASES DE DATOS TRANSACCIONALES│    │           BASES DE DATOS NOSQL               │
├─────────────────────────────────┤    ├──────────────────────────────────────────────┤
│  ┌─────────────────────────┐   │    │  ┌─────────────┐  ┌─────────────┐            │
│  │   POSTGRESQL AURORA     │   │    │  │  MongoDB    │  │   Redis     │            │
│  │   (Primary + 5 Replicas)│   │    │  │  Atlas      │  │  Cluster    │            │
│  │  ┌─────────────────┐   │   │    │  │ (Documents) │  │ (Cache/Sess)│            │
│  │  │  Multi-Tenant   │   │   │    │  └─────────────┘  └─────────────┘            │
│  │  │  Row-Level Sec  │   │   │    │                                              │
│  │  └─────────────────┘   │   │    │  ┌─────────────┐  ┌─────────────┐            │
│  │  PgBouncer Pool: 5000  │   │    │  │Elasticsearch│  │  Cassandra  │            │
│  └─────────────────────────┘   │    │  │  (Search)   │  │(Time-Series)│            │
└─────────────────────────────────┘    │  └─────────────┘  └─────────────┘            │
                                       └──────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         VECTOR DATABASES (RAG/Embeddings)                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │   Pinecone      │  │   pgvector      │  │   Weaviate / Milvus (Hybrid)   │  │
│  │  (Production)   │  │  (Metadata+Vec) │  │  (Self-Hosted Option)          │  │
│  │  1536-4096 dims │  │  768-1536 dims  │  │  768-4096 dims                 │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────────┘  │
│                                                                                  │
│  Indexing: HNSW (Hierarchical Navigable Small World)                            │
│  Distance: Cosine Similarity (default), Euclidean, Dot Product                  │
└─────────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         DATA PIPELINES & ORCHESTRATION                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────┐ │
│  │    APACHE AIRFLOW       │  │        DBT              │  │   PREFECT       │ │
│  │   (Primary Orchestrator)│  │  (Data Transformations) │  │  (ML Pipelines) │ │
│  │  ┌─────────────────┐   │  │  ┌─────────────────┐   │  │                 │ │
│  │  │  500+ DAGs      │   │  │  │  200+ Models    │   │  │                 │ │
│  │  │  Dynamic Tasks  │   │  │  │  Tests + Docs   │   │  │                 │ │
│  │  └─────────────────┘   │  │  └─────────────────┘   │  │                 │ │
│  └─────────────────────────┘  └─────────────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         DATA GOVERNANCE & QUALITY                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │   DATAHUB       │  │  GREAT          │  │   APACHE RANGER / OPAL          │  │
│  │  (Data Catalog) │  │  EXPECTATIONS   │  │   (Access Control)              │  │
│  │  ┌─────────┐   │  │  (Data Quality) │  │  ┌─────────────────────────┐   │  │
│  │  │ Lineage │   │  │  ┌─────────┐   │  │  │ Row-Level Security      │   │  │
│  │  │ Impact  │   │  │  │ Tests   │   │  │  │ Column Masking          │   │  │
│  │  │ Analysis│   │  │  │ Alerts  │   │  │  │ Audit Logging           │   │  │
│  │  └─────────┘   │  │  └─────────┘   │  │  └─────────────────────────┘   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         ANALYTICS & VISUALIZACIÓN                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │   APACHE        │  │   GRAFANA       │  │   CUSTOM EMBEDDED               │  │
│  │   SUPERSET      │  │   + Infinity    │  │   ANALYTICS (React + D3)        │  │
│  │  (Self-Service) │  │  (Real-time)    │  │  (Customer-Facing)              │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. DATA LAKEHOUSE ARCHITECTURE

### 1.1 Stack Tecnológico Recomendado

| Componente | Tecnología | Justificación |
|------------|------------|---------------|
| **Formato de Tabla** | **Delta Lake** | ACID transactions, time travel, schema evolution, mejor integración con Spark |
| **Storage** | AWS S3 (Primary) + GCS (DR) | Costo-efectivo, infinitamente escalable, 99.999999999% durability |
| **Processing Engine** | Databricks / Apache Spark | Procesamiento distribuido, auto-scaling, notebooks colaborativos |
| **Metastore** | AWS Glue / Unity Catalog | Catálogo centralizado, integración nativa con AWS |

### 1.2 Estrategia de Capas (Medallion Architecture)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GOLD LAYER                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  • Tablas agregadas para reporting                                  │   │
│  │  • Features para ML listas para producción                          │   │
│  │  • Data marts por dominio de negocio                                │   │
│  │  • Particionado por fecha + tenant_id                               │   │
│  │  • Retención: 7 años (compliance)                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ↑                                         │
│                              TRANSFORMACIÓN                                  │
│                                    ↑                                         │
│                             SILVER LAYER                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  • Datos limpios y normalizados                                     │   │
│  │  • Deduplicación aplicada                                           │   │
│  │  • Schema enforcement                                               │   │
│  │  • Particionado por fecha de ingesta                                │   │
│  │  • Retención: 2 años                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    ↑                                         │
│                              TRANSFORMACIÓN                                  │
│                                    ↑                                         │
│                             BRONZE LAYER                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  • Datos en bruto tal como llegan                                   │   │
│  │  • Formato: Parquet (optimizado) o JSON (raw)                       │   │
│  │  • Metadata de ingesta (timestamp, source, schema version)          │   │
│  │  • Particionado por fecha de ingesta + source                       │   │
│  │  • Retención: 90 días (después migra a cold storage)                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Estructura de Directorios S3

```
s3://controlia-data-lake/
├── bronze/
│   ├── source=telemetry/
│   │   ├── year=2025/month=01/day=15/
│   │   └── ...
│   ├── source=agent_logs/
│   ├── source=user_interactions/
│   ├── source=external_apis/
│   └── _delta_log/
├── silver/
│   ├── domain=agents/
│   ├── domain=users/
│   ├── domain=conversations/
│   ├── domain=analytics/
│   └── _delta_log/
├── gold/
│   ├── mart=executive_dashboard/
│   ├── mart=agent_performance/
│   ├── mart=user_analytics/
│   ├── mart=ml_features/
│   └── _delta_log/
├── archive/
│   └── (cold storage - Glacier)
└── tmp/
    └── (procesamiento temporal)
```

### 1.4 Configuración Delta Lake

```python
# Delta Lake Configuration
spark.conf.set("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
spark.conf.set("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")

# Optimizaciones de Performance
spark.conf.set("spark.databricks.delta.optimizeWrite.enabled", "true")
spark.conf.set("spark.databricks.delta.autoCompact.enabled", "true")
spark.conf.set("spark.databricks.delta.retentionDurationCheck.enabled", "false")

# Time Travel - 30 días de historial
spark.conf.set("spark.databricks.delta.properties.defaults.logRetentionDuration", "interval 30 days")
spark.conf.set("spark.databricks.delta.properties.defaults.deletedFileRetentionDuration", "interval 7 days")
```

---

## 2. DATA WAREHOUSE

### 2.1 Comparativa: Snowflake vs BigQuery vs Redshift

| Criterio | Snowflake | BigQuery | Redshift |
|----------|-----------|----------|----------|
| **Separación Storage/Compute** | ⭐⭐⭐ Excelente | ⭐⭐⭐ Excelente | ⭐⭐ Buena (RA3) |
| **Auto-scaling** | ⭐⭐⭐ Instantáneo | ⭐⭐⭐ Serverless | ⭐⭐ Manual/Auto |
| **Costo (TB/mes)** | ~$23-40 | ~$20-30 | ~$24-35 |
| **Performance Queries** | ⭐⭐⭐ Muy alta | ⭐⭐⭐ Muy alta | ⭐⭐ Alta |
| **ML Integration** | ⭐⭐⭐ Snowpark ML | ⭐⭐⭐ BigQuery ML | ⭐⭐ Redshift ML |
| **Multi-cloud** | ⭐⭐⭐ AWS/Azure/GCP | ⭐ GCP only | ⭐⭐ AWS only |
| **Latencia (query simple)** | ~100-500ms | ~500ms-2s | ~100-300ms |
| **Ecosistema Latinoamérica** | ⭐⭐⭐ Fuerte | ⭐⭐ Creciendo | ⭐⭐⭐ Fuerte |

### 2.2 Recomendación: **SNOWFLAKE**

**Justificación:**
1. **Snowpark ML** permite entrenar y deployar modelos directamente en el DW
2. **Streams & Tasks** para CDC nativo sin herramientas externas
3. **Data Sharing** para compartir datos con partners sin moverlos
4. **Time Travel & Zero-Copy Cloning** para desarrollo y testing
5. **Soporte en español** y presencia fuerte en LATAM

### 2.3 Arquitectura Snowflake

```
┌─────────────────────────────────────────────────────────────────┐
│                    SNOWFLAKE ACCOUNT                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  DATABASE: CONTROLIA_ANALYTICS                          │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  SCHEMA: RAW (Bronze mirror)                    │   │   │
│  │  │  • agent_events, user_sessions, api_calls       │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  SCHEMA: STAGING (Silver)                       │   │   │
│  │  │  • dim_agents, dim_users, fact_conversations    │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  SCHEMA: ANALYTICS (Gold)                       │   │   │
│  │  │  • agent_performance, user_retention, revenue   │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  SCHEMA: ML_FEATURES                            │   │   │
│  │  │  • feature_vectors, embeddings_metadata         │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  WAREHOUSES:                                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐│
│  │ ETL_WH      │ │ BI_WH       │ │ ML_WH       │ │ ADHOC_WH  ││
│  │ (XS→L)      │ │ (S→L)       │ │ (M→2XL)     │ │ (XS→M)    ││
│  │ Auto-suspend│ │ Auto-suspend│ │ Auto-suspend│ │ Auto-susp ││
│  │ 1 min       │ │ 5 min       │ │ 10 min      │ │ 2 min     ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Configuración de Warehouses

```sql
-- Warehouse para ETL (Airflow)
CREATE WAREHOUSE ETL_WH WITH
    WAREHOUSE_SIZE = 'XSMALL'
    AUTO_SUSPEND = 60
    AUTO_RESUME = TRUE
    MIN_CLUSTER_COUNT = 1
    MAX_CLUSTER_COUNT = 3
    SCALING_POLICY = 'STANDARD';

-- Warehouse para BI y dashboards
CREATE WAREHOUSE BI_WH WITH
    WAREHOUSE_SIZE = 'SMALL'
    AUTO_SUSPEND = 300
    AUTO_RESUME = TRUE
    MIN_CLUSTER_COUNT = 1
    MAX_CLUSTER_COUNT = 5
    SCALING_POLICY = 'ECONOMY';

-- Warehouse para ML workloads
CREATE WAREHOUSE ML_WH WITH
    WAREHOUSE_SIZE = 'MEDIUM'
    AUTO_SUSPEND = 600
    AUTO_RESUME = TRUE;
```

---

## 3. BASES DE DATOS TRANSACCIONALES

### 3.1 PostgreSQL: Aurora vs RDS vs Cloud SQL

| Característica | Aurora PostgreSQL | RDS PostgreSQL | Cloud SQL |
|----------------|-------------------|----------------|-----------|
| **Max Storage** | 128 TB | 64 TB | 64 TB |
| **Read Replicas** | 15 (ms lag) | 5 | 10 |
| **Failover** | < 30 segundos | 60-120 segundos | 30-60 segundos |
| **Multi-AZ** | 6 copies (3 AZ) | 2 copies (2 AZ) | 2 copies (2 zones) |
| **Serverless** | ✅ Aurora Serverless v2 | ❌ | ✅ (PostgreSQL 14+) |
| **Performance** | 3x mejor que RDS | Standard | Standard |
| **Precio/hora (db.r6g.xlarge)** | ~$0.58 | ~$0.40 | ~$0.42 |

### 3.2 Recomendación: **AURORA POSTGRESQL**

**Arquitectura:**
```
┌─────────────────────────────────────────────────────────────────┐
│              AURORA POSTGRESQL CLUSTER                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────┐      │
│   │              PRIMARY INSTANCE                       │      │
│   │            (db.r6g.2xlarge)                         │      │
│   │  • 8 vCPU, 64 GB RAM                                │      │
│   │  • max_connections: 5000                            │      │
│   │  • shared_buffers: 16GB                             │      │
│   │  • work_mem: 256MB                                  │      │
│   └─────────────────────────────────────────────────────┘      │
│                           │                                     │
│           ┌───────────────┼───────────────┐                    │
│           │               │               │                    │
│           ▼               ▼               ▼                    │
│   ┌───────────┐   ┌───────────┐   ┌───────────┐               │
│   │ REPLICA 1 │   │ REPLICA 2 │   │ REPLICA 3 │               │
│   │ (Read)    │   │ (Read)    │   │ (Read)    │               │
│   │ Reporting │   │ Analytics │   │ Failover  │               │
│   └───────────┘   └───────────┘   └───────────┘               │
│                                                                 │
│   STORAGE: 6-way replication across 3 AZs                       │
│   Auto-scaling: 10 GB → 128 TB                                  │
│   Backups: Automated + snapshots manual                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Estrategia de Multi-tenancy

```sql
-- Esquema de multi-tenancy con Row-Level Security

-- Tabla de tenants
CREATE TABLE tenants (
    tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    plan VARCHAR(50) NOT NULL, -- 'free', 'pro', 'enterprise'
    created_at TIMESTAMP DEFAULT NOW(),
    settings JSONB DEFAULT '{}'
);

-- Habilitar RLS en todas las tablas tenant-scoped
CREATE TABLE agents (
    agent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
    name VARCHAR(255) NOT NULL,
    configuration JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Row-Level Security Policy
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON agents
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- Función para setear tenant en sesión
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_uuid UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_tenant', tenant_uuid::TEXT, FALSE);
END;
$$ LANGUAGE plpgsql;
```

### 3.4 Connection Pooling con PgBouncer

```ini
; pgbouncer.ini
[databases]
controlia_primary = host=aurora-primary.cluster-xxx.us-east-1.rds.amazonaws.com port=5432 dbname=controlia
controlia_replica = host=aurora-replica.cluster-ro-xxx.us-east-1.rds.amazonaws.com port=5432 dbname=controlia

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt

; Pool settings
pool_mode = transaction
max_client_conn = 10000
default_pool_size = 25
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 3

; Timeouts
server_idle_timeout = 600
server_lifetime = 3600
client_idle_timeout = 0
client_login_timeout = 60
```

### 3.5 Sharding Strategy (para escala masiva)

```
┌─────────────────────────────────────────────────────────────────┐
│                    SHARDING STRATEGY                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Método: HASH sharding por tenant_id                            │
│  Número de shards: 64 (inicial), escalable a 256                │
│  Shard key: tenant_id (UUID)                                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  shard_id = hash(tenant_id) % 64                        │   │
│  │                                                         │   │
│  │  Shard 0-15:   US-East-1  (Virginia)                    │   │
│  │  Shard 16-31:  US-West-2  (Oregon)                      │   │
│  │  Shard 32-47:  EU-West-1  (Ireland)                     │   │
│  │  Shard 48-63:  SA-East-1  (São Paulo) - LATAM           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Herramienta: Citus (PostgreSQL extension)                      │
│  Alternativa: YugabyteDB (si se necesita escala extrema)        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. BASES DE DATOS NOSQL

### 4.1 MongoDB Atlas (Documentos)

**Uso:** Configuraciones de agentes, plantillas, historial de conversaciones

```javascript
// Esquema de documento para Agent Configuration
{
  _id: ObjectId("..."),
  tenant_id: UUID("..."),
  agent_id: UUID("..."),
  name: "Agente de Ventas",
  configuration: {
    personality: {
      tone: "professional",
      language: "es-MX",
      formality: "high"
    },
    knowledge_base: {
      documents: [ObjectId("..."), ObjectId("...")],
      last_synced: ISODate("2025-01-15T10:30:00Z")
    },
    integrations: {
      telegram: { enabled: true, bot_token: "***" },
      whatsapp: { enabled: false },
      slack: { enabled: true, webhook: "***" }
    },
    ml_settings: {
      model: "gpt-4-turbo",
      temperature: 0.7,
      max_tokens: 2048,
      system_prompt: "..."
    }
  },
  analytics: {
    total_conversations: 15234,
    avg_response_time_ms: 850,
    satisfaction_score: 4.7
  },
  created_at: ISODate("2024-06-01T00:00:00Z"),
  updated_at: ISODate("2025-01-15T10:30:00Z"),
  version: 47
}
```

**Configuración de Cluster:**
```yaml
# MongoDB Atlas M60 Cluster
cluster_tier: M60
region: US_EAST_1
storage: 2TB (auto-scaling)

replica_set:
  - primary: us-east-1a
  - secondary: us-east-1b
  - secondary: us-east-1c

features:
  - auto_scaling: enabled
  - continuous_backup: enabled
  - point_in_time_recovery: 7_days
  - encryption_at_rest: AWS_KMS
  - network_access: VPC_peering

indexes:
  - { tenant_id: 1, agent_id: 1 }  # Compound index
  - { tenant_id: 1, created_at: -1 }  # Time-series queries
  - { "configuration.name": "text" }  # Text search
```

### 4.2 Redis Cluster (Caché y Sesiones)

**Uso:** Caché de respuestas, sesiones de usuario, rate limiting, colas de tareas

```
┌─────────────────────────────────────────────────────────────────┐
│                    REDIS CLUSTER (ElastiCache)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Modo: Cluster Mode Enabled (sharding automático)               │
│  Nodos: 6 shards × 2 replicas = 12 nodos                        │
│  Instancia: cache.r6g.xlarge (13 GB cada uno)                   │
│  Total: ~78 GB RAM                                              │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │
│  │ Shard 0  │  │ Shard 1  │  │ Shard 2  │  ...                  │
│  │ P + R    │  │ P + R    │  │ P + R    │                       │
│  └──────────┘  └──────────┘  └──────────┘                       │
│                                                                 │
│  Key Patterns:                                                  │
│  • session:{tenant_id}:{user_id} → TTL: 24h                    │
│  • cache:agent_response:{hash} → TTL: 1h                       │
│  • rate_limit:{tenant_id}:{endpoint} → TTL: 1m                 │
│  • queue:tasks:{priority} → No TTL                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Configuración Redis:**
```conf
# redis.conf
maxmemory 13gb
maxmemory-policy allkeys-lru

# Persistence (para sesiones críticas)
appendonly yes
appendfsync everysec

# Performance
tcp-keepalive 300
timeout 0
```

### 4.3 Elasticsearch (Búsqueda)

**Uso:** Búsqueda full-text en conversaciones, documentos, knowledge base

```json
// Mapping para conversaciones
{
  "mappings": {
    "properties": {
      "tenant_id": { "type": "keyword" },
      "conversation_id": { "type": "keyword" },
      "agent_id": { "type": "keyword" },
      "messages": {
        "type": "nested",
        "properties": {
          "role": { "type": "keyword" },
          "content": { 
            "type": "text",
            "analyzer": "spanish",
            "fields": {
              "keyword": { "type": "keyword", "ignore_above": 32766 }
            }
          },
          "timestamp": { "type": "date" },
          "intent": { "type": "keyword" },
          "sentiment": { "type": "float" }
        }
      },
      "metadata": {
        "properties": {
          "channel": { "type": "keyword" },
          "user_id": { "type": "keyword" },
          "session_duration_ms": { "type": "integer" },
          "resolution_status": { "type": "keyword" }
        }
      }
    }
  },
  "settings": {
    "number_of_shards": 5,
    "number_of_replicas": 1,
    "index.refresh_interval": "5s"
  }
}
```

---

## 5. VECTOR DATABASES

### 5.1 Comparativa de Opciones

| Característica | Pinecone | Weaviate | pgvector | Milvus | Chroma |
|----------------|----------|----------|----------|--------|--------|
| **Managed** | ✅ Full | ✅ Full | ❌ Self | ✅ Zilliz | ❌ Self |
| **Dimensión máxima** | 20,000 | 65,536 | 16,000 | 32,768 | 2,048 |
| **Index HNSW** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Metadata filtering** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Hybrid search** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Multi-tenancy** | ✅ Namespaces | ✅ | ✅ RLS | ✅ | ❌ |
| **Precio (1M vectores)** | ~$70/mes | ~$25/mes | $0 (self) | ~$30/mes | $0 |
| **Latency p99** | ~50ms | ~30ms | ~100ms | ~20ms | ~50ms |

### 5.2 Recomendación: **PINECONE + pgvector (híbrido)**

**Arquitectura Híbrida:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    VECTOR DATABASE ARCHITECTURE                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              PINECONE (Primary)                         │   │
│  │  • Embeddings de documentos (RAG)                       │   │
│  │  • Embeddings de conversaciones                         │   │
│  │  • Dimensiones: 1536 (OpenAI) / 1024 (Cohere)          │   │
│  │  • Index: HNSW (cosine)                                 │   │
│  │  • Namespaces por tenant                                │   │
│  │  • Pod Type: p2.x2 (2M vectors, 8GB RAM)               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              PGVECTOR (PostgreSQL)                      │   │
│  │  • Embeddings pequeños con metadatos ricos              │   │
│  │  • Dimensiones: 384 (all-MiniLM)                        │   │
│  │  • Index: ivfflat / hnsw                                │   │
│  │  • Joins con datos transaccionales                      │   │
│  │  • Row-Level Security nativo                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Configuración Pinecone

```python
import pinecone

# Initialize
pinecone.init(api_key="YOUR_API_KEY", environment="us-east-1")

# Create index
pinecone.create_index(
    name="controlia-knowledge-base",
    dimension=1536,  # OpenAI text-embedding-3-large
    metric="cosine",
    pod_type="p2.x2",  # 2M vectors, 8GB RAM
    replicas=2,
    metadata_config={
        "indexed": ["tenant_id", "document_type", "category", "language"]
    }
)

# Namespace strategy: one per tenant
index = pinecone.Index("controlia-knowledge-base")

# Upsert vectors with metadata
index.upsert(
    vectors=[
        {
            "id": "doc_001",
            "values": [0.1, 0.2, ...],  # 1536 dimensions
            "metadata": {
                "tenant_id": "tenant_123",
                "document_type": "faq",
                "category": "billing",
                "language": "es",
                "source": "https://...",
                "chunk_index": 0
            }
        }
    ],
    namespace="tenant_123"  # Isolation
)

# Query with metadata filter
results = index.query(
    namespace="tenant_123",
    vector=query_embedding,
    top_k=10,
    filter={
        "category": {"$eq": "billing"},
        "language": {"$eq": "es"}
    },
    include_metadata=True
)
```

### 5.4 Configuración pgvector

```sql
-- Instalar extensión
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabla de embeddings
CREATE TABLE document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
    document_id UUID NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(384),  -- all-MiniLM-L6-v2
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(document_id, chunk_index)
);

-- Índice HNSW para búsqueda vectorial
CREATE INDEX ON document_embeddings 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Índice para filtrado por tenant
CREATE INDEX idx_embeddings_tenant ON document_embeddings(tenant_id);

-- Función de búsqueda con RLS
CREATE OR REPLACE FUNCTION search_documents(
    p_tenant_id UUID,
    p_query_embedding vector(384),
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    similarity FLOAT
) AS $$
BEGIN
    PERFORM set_config('app.current_tenant', p_tenant_id::TEXT, FALSE);
    
    RETURN QUERY
    SELECT 
        de.id,
        de.content,
        1 - (de.embedding <=> p_query_embedding) AS similarity
    FROM document_embeddings de
    WHERE de.tenant_id = p_tenant_id
    ORDER BY de.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
```

---

## 6. DATA PIPELINES

### 6.1 ETL vs ELT Decision Matrix

| Escenario | Patrón | Herramienta | Justificación |
|-----------|--------|-------------|---------------|
| Ingesta de eventos de agentes | **ELT** | Kafka → S3 → Spark | Volumen masivo, transformaciones complejas |
| Preparación de datos ML | **ETL** | Airflow + Python | Feature engineering complejo |
| Reporting diario | **ELT** | Fivetran → Snowflake + dbt | Simplicidad, SQL nativo |
| CDC de PostgreSQL | **ELT** | Debezium → Kafka → S3 | Captura de cambios en tiempo real |
| Limpieza de datos | **ETL** | Airflow + Great Expectations | Validaciones antes de carga |

### 6.2 Arquitectura de Pipelines

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA PIPELINE ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              REAL-TIME STREAMING                        │   │
│  │                                                         │   │
│  │  PostgreSQL → Debezium → Kafka → Flink → Delta Lake    │   │
│  │       ↓                      ↓                          │   │
│  │  (CDC)              ClickHouse (real-time OLAP)        │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              BATCH PROCESSING                           │   │
│  │                                                         │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │   │
│  │  │   Airflow   │───→│   Spark     │───→│  Delta Lake │ │   │
│  │  │  (Schedule) │    │ (Transform) │    │   (Silver)   │ │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘ │   │
│  │         │                                      │         │   │
│  │         └──────────────────────────────────────┘         │   │
│  │                        │                                  │   │
│  │                        ▼                                  │   │
│  │                 ┌─────────────┐                          │   │
│  │                 │     DBT     │                          │   │
│  │                 │  (Models)   │                          │   │
│  │                 └─────────────┘                          │   │
│  │                        │                                  │   │
│  │                        ▼                                  │   │
│  │                 ┌─────────────┐                          │   │
│  │                 │  Snowflake  │                          │   │
│  │                 │    (Gold)   │                          │   │
│  │                 └─────────────┘                          │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              ML PIPELINES (Prefect)                     │   │
│  │                                                         │   │
│  │  Feature Store → Training → Validation → Deployment    │   │
│  │       ↓                                              │   │
│  │  MLflow Registry                                    │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Apache Airflow Configuration

```python
# dags/agent_analytics_dag.py
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.amazon.aws.operators.s3 import S3FileTransformOperator
from airflow.providers.snowflake.operators.snowflake import SnowflakeOperator
from datetime import datetime, timedelta

default_args = {
    'owner': 'data-engineering',
    'depends_on_past': False,
    'email_on_failure': True,
    'email': ['data-alerts@controlia.com'],
    'retries': 3,
    'retry_delay': timedelta(minutes=5),
}

with DAG(
    'agent_analytics_pipeline',
    default_args=default_args,
    description='Daily analytics pipeline for agent metrics',
    schedule_interval='0 2 * * *',  # 2 AM daily
    start_date=datetime(2025, 1, 1),
    catchup=False,
    tags=['analytics', 'agents'],
    max_active_runs=1,
) as dag:
    
    # Extract from Delta Lake Bronze
    extract_task = PythonOperator(
        task_id='extract_agent_events',
        python_callable=extract_from_delta,
        op_kwargs={'table': 'bronze.agent_events', 'date': '{{ ds }}'}
    )
    
    # Transform with Spark
    transform_task = PythonOperator(
        task_id='transform_metrics',
        python_callable=spark_transform,
        op_kwargs={'input_path': '/tmp/extracted', 'output_path': '/tmp/transformed'}
    )
    
    # Load to Snowflake
    load_task = SnowflakeOperator(
        task_id='load_to_snowflake',
        sql="""
            COPY INTO analytics.daily_agent_metrics
            FROM @s3_stage/transformed/{{ ds }}
            FILE_FORMAT = (TYPE = PARQUET)
            ON_ERROR = 'CONTINUE';
        """,
        snowflake_conn_id='snowflake_default'
    )
    
    # dbt models
    dbt_task = BashOperator(
        task_id='run_dbt_models',
        bash_command='dbt run --models +agent_performance --target prod'
    )
    
    # Data quality check
    quality_check = PythonOperator(
        task_id='validate_data',
        python_callable=run_great_expectations,
        op_kwargs={'checkpoint': 'agent_metrics_checkpoint'}
    )
    
    # Dependencies
    extract_task >> transform_task >> load_task >> dbt_task >> quality_check
```

### 6.4 DBT Project Structure

```yaml
# dbt_project.yml
name: 'controlia_analytics'
version: '1.0.0'
config-version: 2

profile: 'controlia_snowflake'

model-paths: ["models"]
analysis-paths: ["analyses"]
test-paths: ["tests"]
seed-paths: ["seeds"]
macro-paths: ["macros"]
snapshot-paths: ["snapshots"]

target-path: "target"
clean-targets:
  - "target"
  - "dbt_packages"

models:
  controlia_analytics:
    staging:
      +materialized: view
      +schema: staging
    marts:
      +materialized: table
      +schema: analytics
      +snowflake_warehouse: BI_WH
      core:
        +tags: ['core', 'daily']
      ml:
        +tags: ['ml', 'features']
```

```sql
-- models/marts/core/agent_performance.sql
{{ config(
    materialized='incremental',
    unique_key=['agent_id', 'date'],
    cluster_by=['date', 'tenant_id']
) }}

WITH conversation_metrics AS (
    SELECT
        tenant_id,
        agent_id,
        DATE(created_at) as date,
        COUNT(*) as total_conversations,
        AVG(response_time_ms) as avg_response_time_ms,
        AVG(satisfaction_score) as avg_satisfaction_score,
        SUM(CASE WHEN resolved = true THEN 1 ELSE 0 END) as resolved_count,
        SUM(total_tokens) as total_tokens_used
    FROM {{ ref('stg_conversations') }}
    WHERE created_at >= DATEADD(day, -90, CURRENT_DATE)
    {% if is_incremental() %}
        AND DATE(created_at) > (SELECT MAX(date) FROM {{ this }})
    {% endif %}
    GROUP BY 1, 2, 3
)

SELECT * FROM conversation_metrics
```

---

## 7. DATA GOVERNANCE

### 7.1 Data Catalog: DataHub

```yaml
# datahub-ingestion.yml
source:
  type: snowflake
  config:
    account_id: controlia.us-east-1
    username: ${SNOWFLAKE_USER}
    password: ${SNOWFLAKE_PASSWORD}
    warehouse: ETL_WH
    role: DATAHUB_ROLE
    include_tables: true
    include_views: true
    profiling:
      enabled: true
      profile_table_level_only: false

sink:
  type: datahub-rest
  config:
    server: http://datahub-gms:8080
    token: ${DATAHUB_TOKEN}
```

### 7.2 Data Quality: Great Expectations

```python
# expectations/agent_metrics_expectations.py
import great_expectations as gx
from great_expectations.core.expectation_suite import ExpectationSuite

# Create expectation suite
suite = ExpectationSuite(name="agent_metrics_suite")

# Add expectations
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToNotBeNull(
        column="agent_id"
    )
)

suite.add_expectation(
    gx.expectations.ExpectColumnValuesToBeBetween(
        column="satisfaction_score",
        min_value=1.0,
        max_value=5.0
    )
)

suite.add_expectation(
    gx.expectations.ExpectColumnValuesToBeBetween(
        column="response_time_ms",
        min_value=0,
        max_value=60000  # Max 60 seconds
    )
)

suite.add_expectation(
    gx.expectations.ExpectTableRowCountToBeBetween(
        min_value=1000,  # At least 1000 records
        max_value=10000000
    )
)

# Save suite
context = gx.get_context()
context.save_expectation_suite(suite)
```

### 7.3 Data Lineage

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA LINEAGE EXAMPLE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Source Systems                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
│  │ Telegram │  │ WhatsApp │  │ Web App  │                      │
│  │   API    │  │   API    │  │   API    │                      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                      │
│       │             │             │                             │
│       └─────────────┴─────────────┘                             │
│                     │                                           │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────────────┐       │
│  │              KAFKA (Raw Events)                     │       │
│  └─────────────────────────────────────────────────────┘       │
│                     │                                           │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────────────┐       │
│  │           DELTA LAKE (Bronze)                       │       │
│  │    raw_events.parquet                               │       │
│  └─────────────────────────────────────────────────────┘       │
│                     │                                           │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────────────┐       │
│  │      SPARK (Transformations)                        │       │
│  │  • Deduplication                                    │       │
│  │  • Schema validation                                │       │
│  │  • Enrichment                                       │       │
│  └─────────────────────────────────────────────────────┘       │
│                     │                                           │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────────────┐       │
│  │           DELTA LAKE (Silver)                       │       │
│  │    clean_events.parquet                             │       │
│  └─────────────────────────────────────────────────────┘       │
│                     │                                           │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────────────┐       │
│  │           DBT (Aggregations)                        │       │
│  │  • Daily metrics                                    │       │
│  │  • Agent performance                                │       │
│  │  • User analytics                                   │       │
│  └─────────────────────────────────────────────────────┘       │
│                     │                                           │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────────────┐       │
│  │         SNOWFLAKE (Gold)                            │       │
│  │    agent_performance, user_analytics                │       │
│  └─────────────────────────────────────────────────────┘       │
│                     │                                           │
│                     ▼                                           │
│  ┌─────────────────────────────────────────────────────┐       │
│  │              CONSUMERS                              │       │
│  │  • Superset Dashboards                              │       │
│  │  • ML Feature Store                                 │       │
│  │  • Embedded Analytics                               │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.4 Data Retention Policies

```sql
-- Políticas de retención por tipo de dato

-- Bronze (Raw): 90 días → Glacier
ALTER TABLE delta.`s3://controlia-data-lake/bronze/events`
SET TBLPROPERTIES (
  'delta.logRetentionDuration' = 'interval 30 days',
  'delta.deletedFileRetentionDuration' = 'interval 7 days'
);

-- Silver (Cleaned): 2 años → Archive
-- Automatizado con Airflow DAG

-- Gold (Aggregated): 7 años (compliance)
-- Mantener indefinidamente en Snowflake

-- PII Data: Anonimización después de 1 año
CREATE OR REPLACE PROCEDURE anonymize_old_pii()
RETURNS STRING
LANGUAGE SQL
AS $$
BEGIN
    UPDATE user_profiles
    SET 
        email = CONCAT('anonymized_', user_id, '@deleted.com'),
        phone = NULL,
        name = 'Anonymous User',
        pii_hash = SHA2(CONCAT(user_id, 'salt'), 256)
    WHERE created_at < DATEADD(year, -1, CURRENT_DATE)
      AND anonymized = FALSE;
    
    RETURN 'PII anonymization completed';
END;
$$;
```

---

## 8. ANALYTICS Y BI

### 8.1 Stack de Analytics

| Herramienta | Uso | Costo Estimado |
|-------------|-----|----------------|
| **Apache Superset** | Self-service BI, exploración | $0 (self-hosted) |
| **Grafana** | Real-time dashboards, infra | $0 (self-hosted) |
| **Embedded Analytics** | Customer-facing dashboards | Desarrollo propio |
| **Metabase** | Ad-hoc queries, simple dashboards | $0 (self-hosted) |

### 8.2 Dashboards Clave

```
┌─────────────────────────────────────────────────────────────────┐
│                    ANALYTICS DASHBOARDS                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. EXECUTIVE DASHBOARD (Superset)                              │
│     • MRR/ARR por tenant                                        │
│     • Growth metrics (MoM, YoY)                                 │
│     • Churn rate                                                │
│     • Agent adoption rate                                       │
│     • Top performing tenants                                    │
│                                                                 │
│  2. AGENT PERFORMANCE (Grafana + ClickHouse)                    │
│     • Real-time conversation volume                             │
│     • Response time percentiles (p50, p95, p99)                │
│     • Intent classification accuracy                            │
│     • Escalation rate                                           │
│     • CSAT/NPS scores                                           │
│                                                                 │
│  3. OPERATIONS DASHBOARD (Grafana)                              │
│     • System health (DB, cache, queues)                         │
│     • Error rates by service                                    │
│     • API latency heatmaps                                      │
│     • Infrastructure costs                                      │
│                                                                 │
│  4. EMBEDDED ANALYTICS (React + D3)                             │
│     • Per-tenant usage metrics                                  │
│     • Agent conversation history                                │
│     • Custom reports builder                                    │
│     • Export to CSV/PDF                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 Configuración Superset

```python
# superset_config.py
import os

# Database connections
SQLALCHEMY_DATABASE_URI = os.getenv('SUPERSET_DATABASE_URI')

# Cache configuration
CACHE_CONFIG = {
    'CACHE_TYPE': 'RedisCache',
    'CACHE_DEFAULT_TIMEOUT': 300,
    'CACHE_KEY_PREFIX': 'superset_',
    'CACHE_REDIS_URL': os.getenv('REDIS_URL')
}

# Feature flags
FEATURE_FLAGS = {
    'ENABLE_TEMPLATE_PROCESSING': True,
    'DASHBOARD_NATIVE_FILTERS': True,
    'DASHBOARD_CROSS_FILTERS': True,
    'ALERT_REPORTS': True,
    'EMBEDDED_SUPERSET': True,
}

# Row-level security
ROW_LEVEL_SECURITY = True
```

---

## 9. SEGURIDAD Y PRIVACIDAD

### 9.1 Data Masking

```sql
-- Dynamic Data Masking en Snowflake

-- Masking policies
CREATE OR REPLACE MASKING POLICY email_mask AS (val STRING) RETURNS STRING ->
  CASE
    WHEN CURRENT_ROLE() IN ('ADMIN', 'DATA_ENGINEER') THEN val
    ELSE REGEXP_REPLACE(val, '.+@', '***@')
  END;

CREATE OR REPLACE MASKING POLICY phone_mask AS (val STRING) RETURNS STRING ->
  CASE
    WHEN CURRENT_ROLE() IN ('ADMIN', 'SUPPORT_LEAD') THEN val
    ELSE CONCAT('***-***-', RIGHT(val, 4))
  END;

-- Aplicar masking
ALTER TABLE users MODIFY COLUMN email SET MASKING POLICY email_mask;
ALTER TABLE users MODIFY COLUMN phone SET MASKING POLICY phone_mask;
```

### 9.2 Row-Level Security

```sql
-- RLS en PostgreSQL
CREATE POLICY tenant_isolation ON conversations
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- RLS en Snowflake
CREATE OR REPLACE ROW ACCESS POLICY tenant_policy
  AS (tenant_id VARCHAR) RETURNS BOOLEAN ->
  tenant_id = CURRENT_USER()
  OR IS_ROLE_IN_SESSION('ADMIN');
```

### 9.3 Column-Level Encryption

```python
# Encryption service
from cryptography.fernet import Fernet
import os

class EncryptionService:
    def __init__(self):
        self.key = os.getenv('ENCRYPTION_KEY')
        self.cipher = Fernet(self.key)
    
    def encrypt(self, plaintext: str) -> str:
        return self.cipher.encrypt(plaintext.encode()).decode()
    
    def decrypt(self, ciphertext: str) -> str:
        return self.cipher.decrypt(ciphertext.encode()).decode()

# Uso en aplicación
encryption = EncryptionService()

# Antes de guardar
encrypted_token = encryption.encrypt(bot_token)
db.execute("INSERT INTO agent_configs (telegram_token) VALUES (%s)", encrypted_token)

# Al leer
cursor.execute("SELECT telegram_token FROM agent_configs WHERE agent_id = %s", agent_id)
encrypted = cursor.fetchone()[0]
bot_token = encryption.decrypt(encrypted)
```

### 9.4 Audit Logging

```sql
-- Tabla de auditoría
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT NOW(),
    user_id UUID,
    tenant_id UUID,
    action VARCHAR(50),  -- CREATE, READ, UPDATE, DELETE
    table_name VARCHAR(100),
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT
);

-- Índices para consultas eficientes
CREATE INDEX idx_audit_tenant ON audit_log(tenant_id, timestamp DESC);
CREATE INDEX idx_audit_user ON audit_log(user_id, timestamp DESC);
CREATE INDEX idx_audit_action ON audit_log(action, timestamp DESC);

-- Trigger para auditoría automática
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_log (user_id, tenant_id, action, table_name, record_id, old_values)
        VALUES (current_setting('app.current_user')::UUID, 
                current_setting('app.current_tenant')::UUID,
                'DELETE', TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_log (user_id, tenant_id, action, table_name, record_id, old_values, new_values)
        VALUES (current_setting('app.current_user')::UUID,
                current_setting('app.current_tenant')::UUID,
                'UPDATE', TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_log (user_id, tenant_id, action, table_name, record_id, new_values)
        VALUES (current_setting('app.current_user')::UUID,
                current_setting('app.current_tenant')::UUID,
                'CREATE', TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
```

---

## 10. PLAN DE ESCALABILIDAD

### 10.1 Fases de Crecimiento

```
┌─────────────────────────────────────────────────────────────────┐
│                    ESCALABILITY ROADMAP                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FASE 1: MVP (0-100 tenants)                                    │
│  ├─ PostgreSQL RDS (single instance)                           │
│  ├─ S3 + Athena (ad-hoc queries)                               │
│  ├─ Redis (single node)                                        │
│  ├─ MongoDB Atlas M10                                          │
│  └─ Costo estimado: $2,000/mes                                 │
│                                                                 │
│  FASE 2: Growth (100-1,000 tenants)                             │
│  ├─ Aurora PostgreSQL (1 primary + 2 replicas)                 │
│  ├─ Delta Lake + Databricks (jobs diarios)                     │
│  ├─ Redis Cluster (3 shards)                                   │
│  ├─ MongoDB Atlas M30                                          │
│  ├─ Snowflake (XS warehouse)                                   │
│  └─ Costo estimado: $8,000/mes                                 │
│                                                                 │
│  FASE 3: Scale (1,000-10,000 tenants)                           │
│  ├─ Aurora PostgreSQL (sharded con Citus)                      │
│  ├─ Delta Lake + Databricks (streaming)                        │
│  ├─ Kafka + Flink (real-time)                                  │
│  ├─ Redis Cluster (12 shards)                                  │
│  ├─ MongoDB Atlas M60                                          │
│  ├─ Snowflake (auto-scaling warehouses)                        │
│  ├─ ClickHouse (real-time OLAP)                                │
│  └─ Costo estimado: $35,000/mes                                │
│                                                                 │
│  FASE 4: Enterprise (10,000+ tenants)                           │
│  ├─ Multi-region PostgreSQL (Aurora Global)                    │
│  ├─ Delta Lake + Databricks (multi-cluster)                    │
│  ├─ Kafka (dedicated cluster) + Flink                          │
│  ├─ Redis Cluster (auto-scaling)                               │
│  ├─ MongoDB Atlas M200+                                        │
│  ├─ Snowflake Enterprise (multi-cluster)                       │
│  ├─ ClickHouse Cluster                                         │
│  ├─ Multi-cloud strategy (AWS + GCP)                           │
│  └─ Costo estimado: $150,000+/mes                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 KPIs de Escalabilidad

| Métrica | Target Fase 1 | Target Fase 2 | Target Fase 3 | Target Fase 4 |
|---------|---------------|---------------|---------------|---------------|
| **Tenants activos** | 100 | 1,000 | 10,000 | 100,000 |
| **Conversaciones/día** | 10K | 100K | 1M | 10M |
| **Eventos/segundo** | 100 | 1,000 | 10,000 | 100,000 |
| **Storage** | 1 TB | 10 TB | 100 TB | 1 PB |
| **Query latency p95** | < 2s | < 1s | < 500ms | < 200ms |
| **Uptime SLA** | 99.9% | 99.95% | 99.99% | 99.999% |

---

## 11. CONSIDERACIONES DE COSTOS

### 11.1 Estimación de Costos Mensuales (Fase 3)

| Componente | Servicio | Configuración | Costo Mensual |
|------------|----------|---------------|---------------|
| **Data Lake** | S3 | 100 TB | $2,300 |
| **Data Lake** | Databricks | 4 jobs + SQL | $4,000 |
| **Data Warehouse** | Snowflake | M warehouse | $3,500 |
| **Transactional DB** | Aurora PostgreSQL | db.r6g.2xlarge × 3 | $3,700 |
| **NoSQL Documents** | MongoDB Atlas | M60 cluster | $2,500 |
| **Cache** | ElastiCache Redis | r6g.xlarge × 6 | $2,800 |
| **Search** | Elasticsearch | 3 nodes m5.large | $1,200 |
| **Vector DB** | Pinecone | p2.x2 × 2 | $1,400 |
| **Streaming** | Kafka (MSK) | 3 brokers r5.large | $1,500 |
| **Pipelines** | Airflow (MWAA) | mw1.medium | $600 |
| **BI** | Superset + Grafana | Self-hosted (EC2) | $800 |
| **Monitoring** | Datadog | Infra + APM | $2,000 |
| **Data Transfer** | AWS | 50 TB/mes | $4,500 |
| **Reserva (10%)** | - | - | $3,000 |
| **TOTAL** | | | **$33,800/mes** |

### 11.2 Estrategias de Optimización de Costos

1. **Reserved Instances:** 40% ahorro en instancias de 1 año
2. **S3 Intelligent Tiering:** Ahorro automático en datos fríos
3. **Snowflake Auto-suspend:** Reducir warehouses cuando no se usan
4. **Data Lifecycle Policies:** Mover datos antiguos a Glacier
5. **Query Optimization:** Materialized views, partition pruning
6. **Right-sizing:** Monitoreo continuo de utilización

---

## 12. CONCLUSIONES Y RECOMENDACIONES

### 12.1 Stack Tecnológico Final Recomendado

| Capa | Tecnología | Justificación |
|------|------------|---------------|
| **Data Lake** | Delta Lake + S3 + Databricks | ACID, time travel, ML integration |
| **Data Warehouse** | Snowflake | Snowpark ML, time travel, data sharing |
| **Transactional DB** | Aurora PostgreSQL | Alta disponibilidad, RLS, performance |
| **NoSQL Documents** | MongoDB Atlas | Flexibilidad de esquema, auto-scaling |
| **Cache** | Redis Cluster | Sub-milisecond latency, pub/sub |
| **Search** | Elasticsearch | Full-text search, aggregations |
| **Vector DB** | Pinecone + pgvector | Híbrido: performance + control |
| **Streaming** | Kafka + Flink | Real-time processing, exactly-once |
| **Pipelines** | Airflow + dbt | Orquestación robusta, transformaciones SQL |
| **BI** | Superset + Grafana | Open-source, flexible, real-time |
| **Governance** | DataHub + Great Expectations | Catalog + quality |

### 12.2 Próximos Pasos

1. **Week 1-2:** Setup inicial de infraestructura (S3, PostgreSQL, Redis)
2. **Week 3-4:** Implementar Data Lake básico (Bronze layer)
3. **Week 5-6:** Configurar pipelines Airflow + dbt
4. **Week 7-8:** Setup Snowflake + integración
5. **Week 9-10:** Implementar Vector DB (Pinecone)
6. **Week 11-12:** Dashboards y analytics
7. **Week 13-14:** Data governance y seguridad
8. **Week 15+:** Optimización y escalamiento

---

## ANEXOS

### A. Diagramas Adicionales

#### A.1 Flujo de Datos de Conversación
```
Usuario → Telegram → API Gateway → Agent Service → LLM Provider
                                              ↓
                                         PostgreSQL (metadata)
                                              ↓
                                         Kafka (events)
                                              ↓
                                    ┌─────────┴─────────┐
                                    ↓                   ↓
                              Delta Lake          Elasticsearch
                              (analytics)         (search)
                                    ↓                   ↓
                              Snowflake           Pinecone
                              (reporting)         (RAG context)
```

#### A.2 Arquitectura Multi-Region
```
┌─────────────────────────┐         ┌─────────────────────────┐
│      US-EAST-1          │         │      SA-EAST-1          │
│    (Primary Region)     │◄───────►│    (LATAM Region)       │
├─────────────────────────┤  Repl   ├─────────────────────────┤
│  Aurora (Primary)       │         │  Aurora (Replica)       │
│  S3 (Primary)           │         │  S3 (Replica)           │
│  Kafka (Primary)        │         │  Kafka (Read Replica)   │
│  Databricks             │         │  Databricks             │
│  Snowflake (Primary)    │         │  Snowflake (Reader)     │
└─────────────────────────┘         └─────────────────────────┘
```

### B. Scripts de Deployment

Ver carpeta `/deployment/` para Terraform configs y Kubernetes manifests.

---

*Documento generado para ControlIA - Sistema de Agentes Empresariales*  
*Última actualización: Enero 2025*
