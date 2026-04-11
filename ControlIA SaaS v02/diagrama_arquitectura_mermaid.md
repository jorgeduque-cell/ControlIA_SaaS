# Diagrama de Arquitectura de Datos - ControlIA
## Formato Mermaid para visualización

```mermaid
flowchart TB
    subgraph "Ingesta de Datos"
        TG[Telegram API]
        WA[WhatsApp API]
        WEB[Web App]
        API[API Gateway]
    end

    subgraph "Streaming Layer"
        KAFKA[Apache Kafka
        ---
        CDC: Debezium]
    end

    subgraph "Data Lakehouse"
        S3[(AWS S3
        ---
        Delta Lake)]
        BRONZE[(Bronze Layer
        ---
        Raw Data)]
        SILVER[(Silver Layer
        ---
        Cleaned Data)]
        GOLD[(Gold Layer
        ---
        Curated Data)]
        FEATURE[(Feature Store
        ---
        ML Features)]
    end

    subgraph "Processing"
        SPARK[Apache Spark
        ---
        Databricks]
        FLINK[Apache Flink
        ---
        Real-time]
        AIRFLOW[Apache Airflow
        ---
        Orchestration]
        DBT[dbt
        ---
        Transformations]
    end

    subgraph "Data Warehouse"
        SNOW[Snowflake
        ---
        Enterprise EDW]
    end

    subgraph "Transactional Databases"
        PG[(Aurora PostgreSQL
        ---
        Primary + 5 Replicas)]
        MONGO[(MongoDB Atlas
        ---
        Documents)]
        REDIS[(Redis Cluster
        ---
        Cache/Sessions)]
        ES[(Elasticsearch
        ---
        Search)]
    end

    subgraph "Vector Databases"
        PINECONE[(Pinecone
        ---
        Production RAG)]
        PGVECTOR[(pgvector
        ---
        Hybrid Search)]
    end

    subgraph "Real-time Analytics"
        CLICK[(ClickHouse
        ---
        OLAP)]
        GRAFANA[Grafana
        ---
        Dashboards]
    end

    subgraph "BI & Analytics"
        SUPERSET[Apache Superset
        ---
        Self-Service BI]
        METABASE[Metabase
        ---
        Ad-hoc Queries]
        EMBEDDED[Embedded Analytics
        ---
        Customer-Facing]
    end

    subgraph "Data Governance"
        DATAHUB[DataHub
        ---
        Data Catalog]
        GE[Great Expectations
        ---
        Data Quality]
        RANGER[Apache Ranger
        ---
        Access Control]
    end

    %% Connections
    TG --> API
    WA --> API
    WEB --> API
    
    API --> KAFKA
    API --> PG
    API --> MONGO
    API --> REDIS
    
    PG -. CDC .-> KAFKA
    
    KAFKA --> FLINK
    KAFKA --> S3
    
    S3 --> BRONZE
    BRONZE --> SPARK
    SPARK --> SILVER
    SILVER --> DBT
    DBT --> GOLD
    GOLD --> FEATURE
    GOLD --> SNOW
    
    AIRFLOW --> SPARK
    AIRFLOW --> DBT
    
    FLINK --> CLICK
    
    PG --> ES
    PG -. Hybrid .-> PGVECTOR
    
    PINECONE --> API
    PGVECTOR --> API
    
    CLICK --> GRAFANA
    SNOW --> SUPERSET
    SNOW --> METABASE
    SNOW --> EMBEDDED
    
    DATAHUB -. Lineage .-> S3
    DATAHUB -. Lineage .-> SNOW
    GE -. Quality .-> SILVER
    GE -. Quality .-> GOLD
    RANGER -. Security .-> PG
    RANGER -. Security .-> SNOW
```

---

## Diagrama de Flujo de Datos - Conversación

```mermaid
sequenceDiagram
    actor User as Usuario
    participant Telegram as Telegram API
    participant Gateway as API Gateway
    participant Agent as Agent Service
    participant LLM as LLM Provider
    participant PG as PostgreSQL
    participant Redis as Redis Cache
    participant Pinecone as Pinecone (RAG)
    participant Kafka as Kafka
    participant Delta as Delta Lake
    
    User->>Telegram: Mensaje
    Telegram->>Gateway: Webhook
    Gateway->>Agent: Procesar mensaje
    
    Agent->>Redis: Verificar sesión
    Redis-->>Agent: Datos de sesión
    
    Agent->>Pinecone: Buscar contexto relevante
    Pinecone-->>Agent: Documentos similares
    
    Agent->>LLM: Generar respuesta
    LLM-->>Agent: Respuesta generada
    
    Agent->>PG: Guardar conversación
    Agent->>Redis: Actualizar sesión
    
    Agent-->>Gateway: Respuesta
    Gateway-->>Telegram: Responder
    Telegram-->>User: Mensaje de agente
    
    Agent->>Kafka: Publicar evento
    Kafka->>Delta: Ingesta async
```

---

## Arquitectura de Capas (Medallion)

```mermaid
flowchart TB
    subgraph "Data Sources"
        TELEGRAM[Telegram]
        WHATSAPP[WhatsApp]
        WEB[Web]
        API[External APIs]
    end

    subgraph "Bronze Layer (Raw)"
        B1[raw_events]
        B2[raw_conversations]
        B3[raw_api_calls]
        B4[raw_telemetry]
    end

    subgraph "Silver Layer (Cleaned)"
        S1[clean_events]
        S2[clean_conversations]
        S3[clean_users]
        S4[clean_agents]
    end

    subgraph "Gold Layer (Curated)"
        G1[fact_conversations]
        G2[fact_agent_performance]
        G3[dim_users]
        G4[dim_agents]
        G5[dim_time]
    end

    subgraph "Consumption"
        DASH[Dashboards]
        ML[ML Models]
        REPORTS[Reports]
        API_OUT[API]
    end

    TELEGRAM --> B1
    WHATSAPP --> B1
    WEB --> B2
    API --> B3
    
    B1 --> S1
    B2 --> S2
    B3 --> S1
    B4 --> S1
    
    S1 --> S3
    S2 --> S3
    S2 --> S4
    
    S1 --> G1
    S2 --> G1
    S3 --> G3
    S4 --> G4
    S1 --> G2
    S2 --> G2
    
    G1 --> DASH
    G2 --> DASH
    G1 --> ML
    G2 --> ML
    G3 --> REPORTS
    G4 --> REPORTS
    G1 --> API_OUT
```

---

## Arquitectura Multi-Tenant

```mermaid
flowchart TB
    subgraph "Application Layer"
        APP[API Gateway
        ---
        Tenant Context]
    end

    subgraph "Data Layer"
        subgraph "PostgreSQL (Aurora)"
            PG[(Tenants Table)]
            PG_POLICY[Row-Level Security
            ---
            tenant_id filter]
        end
        
        subgraph "MongoDB Atlas"
            MONGO[(Collections per Domain)]
            MONGO_INDEX[Compound Index
            ---
            tenant_id + _id]
        end
        
        subgraph "Pinecone"
            PC[(Namespaces)]
            PC_NS1[namespace: tenant_001]
            PC_NS2[namespace: tenant_002]
            PC_NS3[namespace: tenant_003]
        end
    end

    subgraph "Security"
        AUTH[JWT Token
        ---
        tenant_id claim]
        RLS[RLS Policies
        ---
        Data Isolation]
    end

    APP --> AUTH
    AUTH --> APP
    APP --> PG_POLICY
    PG_POLICY --> PG
    APP --> MONGO_INDEX
    MONGO_INDEX --> MONGO
    APP --> PC
    PC --> PC_NS1
    PC --> PC_NS2
    PC --> PC_NS3
    
    style PG_POLICY fill:#f9f,stroke:#333
    style RLS fill:#f9f,stroke:#333
```

---

## Pipeline de Datos

```mermaid
flowchart LR
    subgraph "Extract"
        CDC[Debezium CDC]
        API[API Events]
        BATCH[Batch Jobs]
    end

    subgraph "Load"
        KAFKA[Kafka Topics]
        S3[S3 Raw]
    end

    subgraph "Transform"
        SPARK[Spark Jobs]
        DBT[dbt Models]
    end

    subgraph "Serve"
        DELTA[Delta Lake]
        SNOW[Snowflake]
        FEATURE[Feature Store]
    end

    subgraph "Monitor"
        GE[Great Expectations]
        DATAHUB[DataHub]
    end

    CDC --> KAFKA
    API --> KAFKA
    BATCH --> S3
    
    KAFKA --> SPARK
    S3 --> SPARK
    
    SPARK --> DELTA
    DELTA --> DBT
    DBT --> SNOW
    SPARK --> FEATURE
    
    DELTA --> GE
    SNOW --> DATAHUB
    GE -. Alerts .-> DATAHUB
```

---

## Escalabilidad por Fases

```mermaid
timeline
    title Roadmap de Escalabilidad
    
    section Fase 1 : MVP
        0-100 tenants : PostgreSQL RDS
                      : S3 + Athena
                      : Redis Single
                      : MongoDB M10
                      : $2K/mes
    
    section Fase 2 : Growth
        100-1K tenants : Aurora PostgreSQL
                       : Delta Lake + Databricks
                       : Redis Cluster
                       : MongoDB M30
                       : Snowflake XS
                       : $8K/mes
    
    section Fase 3 : Scale
        1K-10K tenants : Aurora Sharded
                       : Kafka + Flink
                       : Redis 12 shards
                       : MongoDB M60
                       : ClickHouse
                       : $35K/mes
    
    section Fase 4 : Enterprise
        10K+ tenants : Multi-region
                     : Multi-cloud
                     : Auto-scaling
                     : $150K+/mes
```
