-- PostgreSQL Initialization Script for ControlIA
-- Enterprise Data Architecture

-- =====================================================
-- EXTENSIONS
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- =====================================================
-- SCHEMAS
-- =====================================================

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS audit;

-- =====================================================
-- TENANTS TABLE (Multi-tenancy foundation)
-- =====================================================

CREATE TABLE app.tenants (
    tenant_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'free' 
        CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
    status VARCHAR(50) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'cancelled')),
    settings JSONB DEFAULT '{}',
    limits JSONB DEFAULT '{
        "max_agents": 1,
        "max_conversations_monthly": 1000,
        "max_storage_mb": 100,
        "max_team_members": 1
    }',
    billing_email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_tenants_slug ON app.tenants(slug);
CREATE INDEX idx_tenants_plan ON app.tenants(plan);
CREATE INDEX idx_tenants_status ON app.tenants(status);

-- =====================================================
-- USERS TABLE
-- =====================================================

CREATE TABLE app.users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES app.tenants(tenant_id),
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) NOT NULL DEFAULT 'member'
        CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    status VARCHAR(50) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'pending', 'suspended')),
    last_login_at TIMESTAMP WITH TIME ZONE,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant ON app.users(tenant_id);
CREATE INDEX idx_users_email ON app.users(email);
CREATE INDEX idx_users_role ON app.users(role);

-- =====================================================
-- AGENTS TABLE
-- =====================================================

CREATE TABLE app.agents (
    agent_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES app.tenants(tenant_id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    avatar_url TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'paused', 'archived')),
    configuration JSONB NOT NULL DEFAULT '{
        "personality": {
            "tone": "professional",
            "language": "es",
            "formality": "medium"
        },
        "ml_settings": {
            "model": "gpt-4-turbo",
            "temperature": 0.7,
            "max_tokens": 2048
        },
        "integrations": {},
        "knowledge_base": {
            "documents": [],
            "last_synced": null
        }
    }',
    analytics JSONB DEFAULT '{
        "total_conversations": 0,
        "total_messages": 0,
        "avg_response_time_ms": 0,
        "satisfaction_score": 0
    }',
    created_by UUID REFERENCES app.users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    archived_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_agents_tenant ON app.agents(tenant_id);
CREATE INDEX idx_agents_status ON app.agents(status);
CREATE INDEX idx_agents_created_by ON app.agents(created_by);

-- =====================================================
-- CONVERSATIONS TABLE
-- =====================================================

CREATE TABLE app.conversations (
    conversation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES app.tenants(tenant_id),
    agent_id UUID NOT NULL REFERENCES app.agents(agent_id),
    user_id UUID REFERENCES app.users(user_id),
    external_user_id VARCHAR(255),  -- Telegram user ID, etc.
    channel VARCHAR(50) NOT NULL 
        CHECK (channel IN ('telegram', 'whatsapp', 'web', 'api', 'slack')),
    status VARCHAR(50) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'closed', 'escalated', 'spam')),
    metadata JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    last_message_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create partitions for current and next month
CREATE TABLE app.conversations_2025_01 PARTITION OF app.conversations
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE app.conversations_2025_02 PARTITION OF app.conversations
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE INDEX idx_conversations_tenant ON app.conversations(tenant_id);
CREATE INDEX idx_conversations_agent ON app.conversations(agent_id);
CREATE INDEX idx_conversations_user ON app.conversations(user_id);
CREATE INDEX idx_conversations_channel ON app.conversations(channel);
CREATE INDEX idx_conversations_status ON app.conversations(status);
CREATE INDEX idx_conversations_created_at ON app.conversations(created_at);

-- =====================================================
-- MESSAGES TABLE
-- =====================================================

CREATE TABLE app.messages (
    message_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES app.tenants(tenant_id),
    conversation_id UUID NOT NULL REFERENCES app.conversations(conversation_id),
    agent_id UUID REFERENCES app.agents(agent_id),
    role VARCHAR(50) NOT NULL 
        CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL,
    content_type VARCHAR(50) DEFAULT 'text'
        CHECK (content_type IN ('text', 'image', 'audio', 'video', 'file', 'location')),
    metadata JSONB DEFAULT '{}',
    tokens_used INTEGER,
    latency_ms INTEGER,
    intent VARCHAR(100),
    sentiment_score DECIMAL(3,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create partitions
CREATE TABLE app.messages_2025_01 PARTITION OF app.messages
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE app.messages_2025_02 PARTITION OF app.messages
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE INDEX idx_messages_tenant ON app.messages(tenant_id);
CREATE INDEX idx_messages_conversation ON app.messages(conversation_id);
CREATE INDEX idx_messages_agent ON app.messages(agent_id);
CREATE INDEX idx_messages_role ON app.messages(role);
CREATE INDEX idx_messages_created_at ON app.messages(created_at);

-- =====================================================
-- KNOWLEDGE BASE DOCUMENTS
-- =====================================================

CREATE TABLE app.documents (
    document_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES app.tenants(tenant_id),
    agent_id UUID REFERENCES app.agents(agent_id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    source_url TEXT,
    file_type VARCHAR(50),
    file_size_bytes BIGINT,
    content_hash VARCHAR(64),
    status VARCHAR(50) NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'indexed', 'failed', 'archived')),
    metadata JSONB DEFAULT '{}',
    chunk_count INTEGER DEFAULT 0,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_documents_tenant ON app.documents(tenant_id);
CREATE INDEX idx_documents_agent ON app.documents(agent_id);
CREATE INDEX idx_documents_status ON app.documents(status);

-- =====================================================
-- DOCUMENT EMBEDDINGS (Vector Search)
-- =====================================================

CREATE TABLE app.document_embeddings (
    embedding_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES app.tenants(tenant_id),
    document_id UUID NOT NULL REFERENCES app.documents(document_id),
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),  -- OpenAI text-embedding-3-large
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(document_id, chunk_index)
);

-- Vector index using HNSW
CREATE INDEX idx_embeddings_vector ON app.document_embeddings 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_embeddings_tenant ON app.document_embeddings(tenant_id);
CREATE INDEX idx_embeddings_document ON app.document_embeddings(document_id);

-- =====================================================
-- API KEYS TABLE
-- =====================================================

CREATE TABLE app.api_keys (
    key_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES app.tenants(tenant_id),
    user_id UUID REFERENCES app.users(user_id),
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    scopes JSONB DEFAULT '["read"]',
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_api_keys_tenant ON app.api_keys(tenant_id);
CREATE INDEX idx_api_keys_user ON app.api_keys(user_id);
CREATE INDEX idx_api_keys_prefix ON app.api_keys(key_prefix);

-- =====================================================
-- WEBHOOKS TABLE
-- =====================================================

CREATE TABLE app.webhooks (
    webhook_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES app.tenants(tenant_id),
    agent_id UUID REFERENCES app.agents(agent_id),
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    secret VARCHAR(255),
    events JSONB NOT NULL,  -- ['conversation.created', 'message.received']
    status VARCHAR(50) DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'disabled')),
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    last_error_at TIMESTAMP WITH TIME ZONE,
    last_error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_webhooks_tenant ON app.webhooks(tenant_id);
CREATE INDEX idx_webhooks_agent ON app.webhooks(agent_id);
CREATE INDEX idx_webhooks_status ON app.webhooks(status);

-- =====================================================
-- ANALYTICS TABLES
-- =====================================================

CREATE TABLE analytics.daily_metrics (
    metric_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES app.tenants(tenant_id),
    agent_id UUID REFERENCES app.agents(agent_id),
    date DATE NOT NULL,
    total_conversations INTEGER DEFAULT 0,
    total_messages INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    avg_response_time_ms INTEGER DEFAULT 0,
    p95_response_time_ms INTEGER DEFAULT 0,
    satisfaction_score DECIMAL(3,2),
    resolution_rate DECIMAL(5,2),
    escalation_rate DECIMAL(5,2),
    tokens_used BIGINT DEFAULT 0,
    estimated_cost_usd DECIMAL(10,4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, agent_id, date)
);

CREATE INDEX idx_daily_metrics_tenant ON analytics.daily_metrics(tenant_id);
CREATE INDEX idx_daily_metrics_agent ON analytics.daily_metrics(agent_id);
CREATE INDEX idx_daily_metrics_date ON analytics.daily_metrics(date);

-- =====================================================
-- AUDIT LOG TABLE
-- =====================================================

CREATE TABLE audit.log (
    log_id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tenant_id UUID REFERENCES app.tenants(tenant_id),
    user_id UUID REFERENCES app.users(user_id),
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    request_id UUID
);

CREATE INDEX idx_audit_tenant ON audit.log(tenant_id, timestamp DESC);
CREATE INDEX idx_audit_user ON audit.log(user_id, timestamp DESC);
CREATE INDEX idx_audit_action ON audit.log(action, timestamp DESC);
CREATE INDEX idx_audit_table ON audit.log(table_name, timestamp DESC);
CREATE INDEX idx_audit_timestamp ON audit.log(timestamp DESC);

-- =====================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.daily_metrics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY tenant_isolation_users ON app.users
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_agents ON app.agents
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_conversations ON app.conversations
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_messages ON app.messages
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_documents ON app.documents
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_embeddings ON app.document_embeddings
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_api_keys ON app.api_keys
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_webhooks ON app.webhooks
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_metrics ON analytics.daily_metrics
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to set tenant context
CREATE OR REPLACE FUNCTION app.set_tenant_context(p_tenant_id UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_tenant', p_tenant_id::TEXT, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current tenant
CREATE OR REPLACE FUNCTION app.get_current_tenant()
RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.current_tenant')::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION app.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for audit logging
CREATE OR REPLACE FUNCTION audit.audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit.log (
            tenant_id, user_id, action, table_name, record_id, old_values,
            ip_address, user_agent
        ) VALUES (
            current_setting('app.current_tenant')::UUID,
            current_setting('app.current_user')::UUID,
            'DELETE', TG_TABLE_NAME, OLD.user_id, to_jsonb(OLD),
            inet_client_addr(), current_setting('app.user_agent', TRUE)
        );
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit.log (
            tenant_id, user_id, action, table_name, record_id, old_values, new_values,
            ip_address, user_agent
        ) VALUES (
            current_setting('app.current_tenant')::UUID,
            current_setting('app.current_user')::UUID,
            'UPDATE', TG_TABLE_NAME, NEW.user_id, to_jsonb(OLD), to_jsonb(NEW),
            inet_client_addr(), current_setting('app.user_agent', TRUE)
        );
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO audit.log (
            tenant_id, user_id, action, table_name, record_id, new_values,
            ip_address, user_agent
        ) VALUES (
            current_setting('app.current_tenant')::UUID,
            current_setting('app.current_user')::UUID,
            'CREATE', TG_TABLE_NAME, NEW.user_id, to_jsonb(NEW),
            inet_client_addr(), current_setting('app.user_agent', TRUE)
        );
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to search document embeddings
CREATE OR REPLACE FUNCTION app.search_documents(
    p_tenant_id UUID,
    p_query_embedding vector(1536),
    p_limit INTEGER DEFAULT 10,
    p_min_similarity FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    document_id UUID,
    chunk_index INTEGER,
    content TEXT,
    similarity FLOAT,
    metadata JSONB
) AS $$
BEGIN
    PERFORM app.set_tenant_context(p_tenant_id);
    
    RETURN QUERY
    SELECT 
        de.document_id,
        de.chunk_index,
        de.content,
        1 - (de.embedding <=> p_query_embedding) AS similarity,
        de.metadata
    FROM app.document_embeddings de
    WHERE de.tenant_id = p_tenant_id
      AND 1 - (de.embedding <=> p_query_embedding) >= p_min_similarity
    ORDER BY de.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update updated_at triggers
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON app.tenants
    FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON app.users
    FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON app.agents
    FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON app.documents
    FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at
    BEFORE UPDATE ON app.webhooks
    FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();

-- Audit triggers
CREATE TRIGGER audit_users
    AFTER INSERT OR UPDATE OR DELETE ON app.users
    FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger();

-- =====================================================
-- VIEWS
-- =====================================================

-- View for agent performance summary
CREATE OR REPLACE VIEW analytics.agent_performance_summary AS
SELECT 
    a.agent_id,
    a.tenant_id,
    a.name AS agent_name,
    a.status,
    COALESCE(dm.total_conversations, 0) AS total_conversations,
    COALESCE(dm.total_messages, 0) AS total_messages,
    COALESCE(dm.avg_response_time_ms, 0) AS avg_response_time_ms,
    dm.satisfaction_score,
    dm.resolution_rate,
    a.created_at
FROM app.agents a
LEFT JOIN (
    SELECT 
        agent_id,
        SUM(total_conversations) AS total_conversations,
        SUM(total_messages) AS total_messages,
        AVG(avg_response_time_ms) AS avg_response_time_ms,
        AVG(satisfaction_score) AS satisfaction_score,
        AVG(resolution_rate) AS resolution_rate
    FROM analytics.daily_metrics
    WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY agent_id
) dm ON a.agent_id = dm.agent_id
WHERE a.deleted_at IS NULL;

-- View for tenant usage statistics
CREATE OR REPLACE VIEW analytics.tenant_usage_stats AS
SELECT 
    t.tenant_id,
    t.name AS tenant_name,
    t.plan,
    COUNT(DISTINCT a.agent_id) AS agent_count,
    COUNT(DISTINCT u.user_id) AS user_count,
    COALESCE(dm.total_conversations_30d, 0) AS conversations_30d,
    COALESCE(dm.total_messages_30d, 0) AS messages_30d,
    t.created_at
FROM app.tenants t
LEFT JOIN app.agents a ON t.tenant_id = a.tenant_id AND a.archived_at IS NULL
LEFT JOIN app.users u ON t.tenant_id = u.tenant_id AND u.deleted_at IS NULL
LEFT JOIN (
    SELECT 
        tenant_id,
        SUM(total_conversations) AS total_conversations_30d,
        SUM(total_messages) AS total_messages_30d
    FROM analytics.daily_metrics
    WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY tenant_id
) dm ON t.tenant_id = dm.tenant_id
WHERE t.deleted_at IS NULL
GROUP BY t.tenant_id, t.name, t.plan, t.created_at, dm.total_conversations_30d, dm.total_messages_30d;

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Insert default tenant for testing
INSERT INTO app.tenants (tenant_id, name, slug, plan, billing_email)
VALUES (
    '00000000-0000-0000-0000-000000000001'::UUID,
    'ControlIA System',
    'controlia-system',
    'enterprise',
    'admin@controlia.com'
)
ON CONFLICT (tenant_id) DO NOTHING;

-- Insert system user
INSERT INTO app.users (user_id, tenant_id, email, first_name, last_name, role, email_verified_at)
VALUES (
    '00000000-0000-0000-0000-000000000002'::UUID,
    '00000000-0000-0000-0000-000000000001'::UUID,
    'system@controlia.com',
    'System',
    'Administrator',
    'owner',
    NOW()
)
ON CONFLICT (user_id) DO NOTHING;

-- =====================================================
-- PERMISSIONS
-- =====================================================

-- Create application role
CREATE ROLE controlia_app WITH LOGIN PASSWORD 'change_me_in_production';

-- Grant permissions
GRANT USAGE ON SCHEMA app TO controlia_app;
GRANT USAGE ON SCHEMA analytics TO controlia_app;
GRANT USAGE ON SCHEMA audit TO controlia_app;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA app TO controlia_app;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO controlia_app;
GRANT INSERT ON ALL TABLES IN SCHEMA audit TO controlia_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO controlia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit TO controlia_app;

-- Create readonly role for analytics
CREATE ROLE controlia_readonly WITH LOGIN PASSWORD 'change_me_in_production';
GRANT USAGE ON SCHEMA app TO controlia_readonly;
GRANT USAGE ON SCHEMA analytics TO controlia_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO controlia_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO controlia_readonly;

-- =====================================================
-- COMPLETION
-- =====================================================

SELECT 'Database initialization completed successfully!' AS status;
