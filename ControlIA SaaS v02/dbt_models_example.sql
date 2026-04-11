-- ============================================================================
-- DBT MODELS - ControlIA Analytics
-- ============================================================================

-- ============================================================================
-- STAGING MODELS
-- ============================================================================

-- models/staging/stg_conversations.sql
{{ config(
    materialized='view',
    schema='staging',
    tags=['staging', 'conversations']
) }}

WITH source AS (
    SELECT * FROM {{ source('postgres', 'conversations') }}
),

renamed AS (
    SELECT
        conversation_id,
        tenant_id,
        agent_id,
        user_id,
        external_user_id,
        channel,
        status,
        
        -- Metadata extraction
        metadata:source::STRING as source,
        metadata:referrer::STRING as referrer,
        metadata:utm_campaign::STRING as utm_campaign,
        
        -- Timestamps
        started_at,
        ended_at,
        last_message_at,
        created_at,
        updated_at,
        
        -- Calculated fields
        DATEDIFF('second', started_at, COALESCE(ended_at, CURRENT_TIMESTAMP())) as duration_seconds,
        CASE 
            WHEN ended_at IS NOT NULL THEN true 
            ELSE false 
        END as is_closed,
        
        -- Partition key for incremental loads
        DATE(created_at) as created_date
        
    FROM source
    WHERE deleted_at IS NULL
)

SELECT * FROM renamed

-- ============================================================================

-- models/staging/stg_messages.sql
{{ config(
    materialized='view',
    schema='staging',
    tags=['staging', 'messages']
) }}

WITH source AS (
    SELECT * FROM {{ source('postgres', 'messages') }}
),

renamed AS (
    SELECT
        message_id,
        tenant_id,
        conversation_id,
        agent_id,
        role,
        content,
        content_type,
        
        -- Metadata
        metadata:intent::STRING as detected_intent,
        metadata:entities::VARIANT as detected_entities,
        metadata:language::STRING as detected_language,
        
        -- Metrics
        tokens_used,
        latency_ms,
        intent,
        sentiment_score,
        
        -- Timestamps
        created_at,
        DATE(created_at) as created_date
        
    FROM source
)

SELECT * FROM renamed

-- ============================================================================

-- models/staging/stg_agents.sql
{{ config(
    materialized='view',
    schema='staging',
    tags=['staging', 'agents']
) }}

WITH source AS (
    SELECT * FROM {{ source('postgres', 'agents') }}
),

renamed AS (
    SELECT
        agent_id,
        tenant_id,
        name as agent_name,
        description,
        status,
        
        -- Configuration
        configuration:personality:tone::STRING as personality_tone,
        configuration:personality:language::STRING as language,
        configuration:ml_settings:model::STRING as llm_model,
        configuration:ml_settings:temperature::FLOAT as temperature,
        
        -- Analytics
        analytics:total_conversations::INTEGER as total_conversations,
        analytics:avg_response_time_ms::INTEGER as avg_response_time_ms,
        analytics:satisfaction_score::FLOAT as satisfaction_score,
        
        created_by,
        created_at,
        updated_at
        
    FROM source
    WHERE archived_at IS NULL
)

SELECT * FROM renamed

-- ============================================================================
-- INTERMEDIATE MODELS
-- ============================================================================

-- models/intermediate/int_conversation_metrics.sql
{{ config(
    materialized='ephemeral',
    tags=['intermediate', 'metrics']
) }}

WITH message_metrics AS (
    SELECT
        conversation_id,
        tenant_id,
        agent_id,
        
        COUNT(*) as total_messages,
        COUNT(CASE WHEN role = 'user' THEN 1 END) as user_messages,
        COUNT(CASE WHEN role = 'assistant' THEN 1 END) as assistant_messages,
        
        AVG(CASE WHEN role = 'assistant' THEN latency_ms END) as avg_response_time_ms,
        AVG(sentiment_score) as avg_sentiment_score,
        
        SUM(tokens_used) as total_tokens,
        MAX(created_at) as last_message_at
        
    FROM {{ ref('stg_messages') }}
    GROUP BY 1, 2, 3
),

conversation_enriched AS (
    SELECT
        c.*,
        m.total_messages,
        m.user_messages,
        m.assistant_messages,
        m.avg_response_time_ms,
        m.avg_sentiment_score,
        m.total_tokens,
        
        -- Response quality metrics
        CASE 
            WHEN m.avg_response_time_ms < 500 THEN 'fast'
            WHEN m.avg_response_time_ms < 2000 THEN 'normal'
            ELSE 'slow'
        END as response_speed_category,
        
        -- Engagement metrics
        m.total_messages::FLOAT / NULLIF(c.duration_seconds / 60, 0) as messages_per_minute
        
    FROM {{ ref('stg_conversations') }} c
    LEFT JOIN message_metrics m ON c.conversation_id = m.conversation_id
)

SELECT * FROM conversation_enriched

-- ============================================================================
-- MARTS - CORE
-- ============================================================================

-- models/marts/core/fact_conversations.sql
{{ config(
    materialized='incremental',
    schema='analytics',
    unique_key='conversation_id',
    cluster_by=['created_date', 'tenant_id'],
    tags=['marts', 'core', 'conversations']
) }}

WITH conversations AS (
    SELECT * FROM {{ ref('int_conversation_metrics') }}
    
    {% if is_incremental() %}
    WHERE created_at > (SELECT MAX(created_at) FROM {{ this }})
    {% endif %}
),

agents AS (
    SELECT * FROM {{ ref('stg_agents') }}
),

final AS (
    SELECT
        c.conversation_id,
        c.tenant_id,
        c.agent_id,
        a.agent_name,
        c.user_id,
        c.external_user_id,
        c.channel,
        c.status,
        c.source,
        
        -- Time dimensions
        c.created_date,
        c.started_at,
        c.ended_at,
        c.duration_seconds,
        
        -- Message metrics
        c.total_messages,
        c.user_messages,
        c.assistant_messages,
        
        -- Quality metrics
        c.avg_response_time_ms,
        c.avg_sentiment_score,
        c.response_speed_category,
        c.messages_per_minute,
        
        -- Cost metrics
        c.total_tokens,
        (c.total_tokens * 0.00001) as estimated_cost_usd,  -- Approximate OpenAI pricing
        
        -- Flags
        c.is_closed,
        
        -- Metadata
        CURRENT_TIMESTAMP() as _loaded_at
        
    FROM conversations c
    LEFT JOIN agents a ON c.agent_id = a.agent_id
)

SELECT * FROM final

-- ============================================================================

-- models/marts/core/fact_agent_performance_daily.sql
{{ config(
    materialized='incremental',
    schema='analytics',
    unique_key=['date', 'tenant_id', 'agent_id'],
    cluster_by=['date', 'tenant_id'],
    tags=['marts', 'core', 'performance']
) }}

WITH daily_metrics AS (
    SELECT
        DATE(created_at) as date,
        tenant_id,
        agent_id,
        
        COUNT(DISTINCT conversation_id) as total_conversations,
        SUM(total_messages) as total_messages,
        SUM(user_messages) as user_messages,
        SUM(assistant_messages) as assistant_messages,
        
        AVG(avg_response_time_ms) as avg_response_time_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY avg_response_time_ms) as p50_response_time_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY avg_response_time_ms) as p95_response_time_ms,
        
        AVG(avg_sentiment_score) as avg_sentiment_score,
        AVG(messages_per_minute) as avg_messages_per_minute,
        
        SUM(total_tokens) as total_tokens,
        SUM(estimated_cost_usd) as total_cost_usd,
        
        COUNT(CASE WHEN is_closed THEN 1 END)::FLOAT / 
            NULLIF(COUNT(*), 0) as resolution_rate,
        
        COUNT(DISTINCT external_user_id) as unique_users
        
    FROM {{ ref('fact_conversations') }}
    
    {% if is_incremental() %}
    WHERE date > (SELECT MAX(date) FROM {{ this }})
    {% endif %}
    
    GROUP BY 1, 2, 3
)

SELECT 
    *,
    CURRENT_TIMESTAMP() as _loaded_at
FROM daily_metrics

-- ============================================================================

-- models/marts/core/dim_tenants.sql
{{ config(
    materialized='table',
    schema='analytics',
    tags=['marts', 'core', 'dimensions']
) }}

WITH tenants AS (
    SELECT * FROM {{ source('postgres', 'tenants') }}
),

usage_metrics AS (
    SELECT
        tenant_id,
        SUM(total_conversations) as total_conversations_lifetime,
        SUM(total_messages) as total_messages_lifetime,
        MAX(date) as last_activity_date
    FROM {{ ref('fact_agent_performance_daily') }}
    GROUP BY 1
),

final AS (
    SELECT
        t.tenant_id,
        t.name as tenant_name,
        t.slug,
        t.plan,
        t.status as tenant_status,
        
        -- Plan limits
        t.limits:max_agents::INTEGER as max_agents,
        t.limits:max_conversations_monthly::INTEGER as max_conversations_monthly,
        t.limits:max_storage_mb::INTEGER as max_storage_mb,
        
        -- Usage
        COALESCE(u.total_conversations_lifetime, 0) as total_conversations_lifetime,
        COALESCE(u.total_messages_lifetime, 0) as total_messages_lifetime,
        u.last_activity_date,
        
        -- Dates
        t.created_at as signup_date,
        DATE_DIFF('day', t.created_at, CURRENT_DATE()) as days_since_signup,
        
        -- Flags
        CASE 
            WHEN u.last_activity_date >= CURRENT_DATE() - 7 THEN true 
            ELSE false 
        END as is_active_last_7_days,
        
        CURRENT_TIMESTAMP() as _loaded_at
        
    FROM tenants t
    LEFT JOIN usage_metrics u ON t.tenant_id = u.tenant_id
    WHERE t.deleted_at IS NULL
)

SELECT * FROM final

-- ============================================================================

-- models/marts/core/dim_agents.sql
{{ config(
    materialized='table',
    schema='analytics',
    tags=['marts', 'core', 'dimensions']
) }}

WITH agents AS (
    SELECT * FROM {{ ref('stg_agents') }}
),

performance_metrics AS (
    SELECT
        agent_id,
        SUM(total_conversations) as total_conversations_lifetime,
        AVG(avg_response_time_ms) as avg_response_time_ms_lifetime,
        AVG(avg_sentiment_score) as avg_sentiment_score_lifetime
    FROM {{ ref('fact_agent_performance_daily') }}
    GROUP BY 1
),

final AS (
    SELECT
        a.agent_id,
        a.tenant_id,
        a.agent_name,
        a.description,
        a.status as agent_status,
        
        -- Configuration
        a.personality_tone,
        a.language,
        a.llm_model,
        a.temperature,
        
        -- Performance
        COALESCE(p.total_conversations_lifetime, 0) as total_conversations_lifetime,
        p.avg_response_time_ms_lifetime,
        p.avg_sentiment_score_lifetime,
        
        -- Dates
        a.created_at,
        a.updated_at,
        DATE_DIFF('day', a.created_at, CURRENT_DATE()) as days_since_created,
        
        CURRENT_TIMESTAMP() as _loaded_at
        
    FROM agents a
    LEFT JOIN performance_metrics p ON a.agent_id = p.agent_id
)

SELECT * FROM final

-- ============================================================================
-- MARTS - ML FEATURES
-- ============================================================================

-- models/marts/ml/features_conversations.sql
{{ config(
    materialized='table',
    schema='analytics',
    cluster_by=['tenant_id', 'created_at'],
    tags=['marts', 'ml', 'features']
) }}

WITH conversation_features AS (
    SELECT
        conversation_id,
        tenant_id,
        agent_id,
        
        -- Temporal features
        created_at,
        HOUR(created_at) as hour_of_day,
        DAYOFWEEK(created_at) as day_of_week,
        
        -- Engagement features
        total_messages,
        duration_seconds,
        messages_per_minute,
        
        -- Quality features
        avg_response_time_ms,
        p95_response_time_ms,
        avg_sentiment_score,
        
        -- Cost features
        total_tokens,
        estimated_cost_usd,
        
        -- Categorical features
        channel,
        response_speed_category,
        
        -- Target variables (for training)
        is_closed as was_resolved,
        CASE 
            WHEN avg_sentiment_score >= 0.7 THEN 'positive'
            WHEN avg_sentiment_score >= 0.4 THEN 'neutral'
            ELSE 'negative'
        END as sentiment_category
        
    FROM {{ ref('fact_conversations') }}
    WHERE created_at >= CURRENT_DATE() - INTERVAL '90 days'
)

SELECT * FROM conversation_features

-- ============================================================================
-- REPORTING
-- ============================================================================

-- models/reporting/rpt_executive_dashboard.sql
{{ config(
    materialized='incremental',
    schema='reporting',
    unique_key=['report_date', 'tenant_id'],
    incremental_strategy='merge',
    tags=['reporting', 'executive', 'dashboard']
) }}

WITH daily_summary AS (
    SELECT
        date as report_date,
        tenant_id,
        
        SUM(total_conversations) as conversations,
        SUM(total_messages) as messages,
        SUM(unique_users) as active_users,
        
        AVG(avg_response_time_ms) as avg_response_time_ms,
        AVG(resolution_rate) as resolution_rate,
        
        SUM(total_cost_usd) as total_cost_usd
        
    FROM {{ ref('fact_agent_performance_daily') }}
    
    {% if is_incremental() %}
    WHERE date > (SELECT MAX(report_date) FROM {{ this }})
    {% endif %}
    
    GROUP BY 1, 2
),

with_growth AS (
    SELECT
        *,
        LAG(conversations, 1) OVER (PARTITION BY tenant_id ORDER BY report_date) as conversations_prev_day,
        LAG(conversations, 7) OVER (PARTITION BY tenant_id ORDER BY report_date) as conversations_prev_week,
        
        -- Growth rates
        (conversations - LAG(conversations, 1) OVER (PARTITION BY tenant_id ORDER BY report_date))::FLOAT / 
            NULLIF(LAG(conversations, 1) OVER (PARTITION BY tenant_id ORDER BY report_date), 0) * 100 
            as conversations_growth_pct_day,
            
        (conversations - LAG(conversations, 7) OVER (PARTITION BY tenant_id ORDER BY report_date))::FLOAT / 
            NULLIF(LAG(conversations, 7) OVER (PARTITION BY tenant_id ORDER BY report_date), 0) * 100 
            as conversations_growth_pct_week
            
    FROM daily_summary
)

SELECT * FROM with_growth

-- ============================================================================
-- SNAPSHOTS
-- ============================================================================

-- snapshots/snapshot_agents.sql
{% snapshot snapshot_agents %}

{{
    config(
      target_schema='snapshots',
      unique_key='agent_id',
      strategy='timestamp',
      updated_at='updated_at',
      invalidate_hard_deletes=True
    )
}}

SELECT * FROM {{ source('postgres', 'agents') }}

{% endsnapshot %}

-- ============================================================================
-- TESTS
-- ============================================================================

-- tests/assert_conversations_have_messages.sql
SELECT
    conversation_id
FROM {{ ref('fact_conversations') }}
WHERE total_messages = 0

-- tests/assert_positive_metrics.sql
SELECT
    date,
    tenant_id,
    agent_id
FROM {{ ref('fact_agent_performance_daily') }}
WHERE total_conversations < 0 
   OR total_messages < 0 
   OR avg_response_time_ms < 0

-- tests/assert_valid_resolution_rate.sql
SELECT
    date,
    tenant_id,
    agent_id,
    resolution_rate
FROM {{ ref('fact_agent_performance_daily') }}
WHERE resolution_rate < 0 OR resolution_rate > 1
