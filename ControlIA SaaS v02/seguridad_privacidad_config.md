# Seguridad y Privacidad de Datos - ControlIA
## Configuración de Seguridad Enterprise

---

## 1. ENCRIPTACIÓN

### 1.1 Encripción en Tránsito (Transit Encryption)

```yaml
# Configuración de TLS/SSL para todos los servicios

# PostgreSQL (Aurora)
ssl_mode: require
ssl_min_protocol_version: TLSv1.2
certificate_authority: rds-ca-2019

# Redis (ElastiCache)
transit_encryption_enabled: true
auth_token: ${REDIS_AUTH_TOKEN}

# Kafka (MSK)
encryption_in_transit:
  client_broker: TLS
  in_cluster: true
certificate_authority_arn: ${MSK_CA_ARN}

# MongoDB Atlas
ssl: true
authSource: admin
retryWrites: true

# APIs
minimum_tls_version: 1.2
cipher_suites:
  - TLS_AES_256_GCM_SHA384
  - TLS_CHACHA20_POLY1305_SHA256
  - TLS_AES_128_GCM_SHA256
```

### 1.2 Encripción en Reposo (At-Rest Encryption)

```yaml
# AWS KMS Keys
kms_keys:
  rds_encryption:
    description: "KMS key for RDS encryption"
    key_usage: ENCRYPT_DECRYPT
    key_spec: SYMMETRIC_DEFAULT
    multi_region: true
    
  s3_encryption:
    description: "KMS key for S3 encryption"
    key_usage: ENCRYPT_DECRYPT
    
  msk_encryption:
    description: "KMS key for MSK encryption"
    key_usage: ENCRYPT_DECRYPT

# S3 Bucket Encryption
s3_encryption:
  rule:
    apply_server_side_encryption_by_default:
      sse_algorithm: aws:kms
      kms_master_key_id: ${S3_KMS_KEY_ID}
    bucket_key_enabled: true

# MongoDB Atlas Encryption
mongodb_encryption:
  encryption_at_rest_provider: AWS
  aws_kms:
    customer_master_key_id: ${MONGODB_KMS_KEY_ID}
    region: us-east-1
```

### 1.3 Encripción a Nivel de Columna

```python
# Python service for column-level encryption
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64
import os
import hashlib

class ColumnEncryptionService:
    """
    Service for column-level encryption of sensitive data
    """
    
    def __init__(self, master_key: str = None):
        """
        Initialize encryption service with master key
        
        Args:
            master_key: Base64-encoded master key from AWS Secrets Manager
        """
        if master_key is None:
            master_key = os.getenv('COLUMN_ENCRYPTION_KEY')
        
        self.cipher = Fernet(master_key.encode())
    
    def encrypt(self, plaintext: str) -> str:
        """
        Encrypt plaintext string
        
        Args:
            plaintext: String to encrypt
            
        Returns:
            Base64-encoded encrypted string
        """
        if plaintext is None:
            return None
        return self.cipher.encrypt(plaintext.encode()).decode()
    
    def decrypt(self, ciphertext: str) -> str:
        """
        Decrypt ciphertext string
        
        Args:
            ciphertext: Base64-encoded encrypted string
            
        Returns:
            Decrypted plaintext string
        """
        if ciphertext is None:
            return None
        return self.cipher.decrypt(ciphertext.encode()).decode()
    
    def hash_deterministic(self, value: str, salt: str = None) -> str:
        """
        Create deterministic hash for searching
        
        Args:
            value: Value to hash
            salt: Optional salt (uses default if not provided)
            
        Returns:
            SHA-256 hash of the value
        """
        if salt is None:
            salt = os.getenv('HASH_SALT', 'controlia-default-salt')
        
        return hashlib.sha256(f"{value}{salt}".encode()).hexdigest()

# Usage example
encryption = ColumnEncryptionService()

# Encrypt sensitive data before storing
encrypted_token = encryption.encrypt(bot_api_token)
encrypted_webhook_secret = encryption.encrypt(webhook_secret)

# Store in database
db.execute("""
    INSERT INTO app.webhooks (url, secret_encrypted, secret_hash)
    VALUES (%s, %s, %s)
""", [url, encrypted_token, encryption.hash_deterministic(webhook_secret)])

# Decrypt when needed
cursor.execute("SELECT secret_encrypted FROM app.webhooks WHERE webhook_id = %s", [webhook_id])
encrypted = cursor.fetchone()[0]
secret = encryption.decrypt(encrypted)
```

---

## 2. ROW-LEVEL SECURITY (RLS)

### 2.1 PostgreSQL RLS Configuration

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.api_keys ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policy
CREATE POLICY tenant_isolation_users ON app.users
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_agents ON app.agents
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_conversations ON app.conversations
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_messages ON app.messages
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_documents ON app.documents
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- Function to set tenant context
CREATE OR REPLACE FUNCTION app.set_tenant_context(p_tenant_id UUID)
RETURNS VOID
SECURITY DEFINER
AS $$
BEGIN
    -- Validate tenant exists and is active
    IF NOT EXISTS (
        SELECT 1 FROM app.tenants 
        WHERE tenant_id = p_tenant_id 
        AND status = 'active'
        AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Invalid or inactive tenant: %', p_tenant_id;
    END IF;
    
    -- Set the tenant context
    PERFORM set_config('app.current_tenant', p_tenant_id::TEXT, FALSE);
    
    -- Log context change for audit
    INSERT INTO audit.context_changes (
        tenant_id, changed_at, changed_by
    ) VALUES (
        p_tenant_id, NOW(), current_user
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get current tenant
CREATE OR REPLACE FUNCTION app.get_current_tenant()
RETURNS UUID
AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_tenant', TRUE), '')::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Bypass RLS for admin users
CREATE ROLE controlia_admin BYPASSRLS;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA app TO controlia_admin;
```

### 2.2 Snowflake RLS Configuration

```sql
-- Row Access Policy in Snowflake
CREATE OR REPLACE ROW ACCESS POLICY tenant_access_policy
  AS (tenant_id VARCHAR) RETURNS BOOLEAN ->
  CASE
    WHEN CURRENT_ROLE() = 'ADMIN' THEN TRUE
    WHEN tenant_id = CURRENT_USER() THEN TRUE
    ELSE FALSE
  END;

-- Apply policy to tables
ALTER TABLE analytics.daily_metrics ADD ROW ACCESS POLICY tenant_access_policy ON (tenant_id);
ALTER TABLE analytics.conversations ADD ROW ACCESS POLICY tenant_access_policy ON (tenant_id);

-- Dynamic Data Masking
CREATE OR REPLACE MASKING POLICY email_mask AS (val STRING) RETURNS STRING ->
  CASE
    WHEN CURRENT_ROLE() IN ('ADMIN', 'DATA_ENGINEER') THEN val
    WHEN CURRENT_ROLE() = 'SUPPORT_AGENT' THEN REGEXP_REPLACE(val, '.+@', '***@')
    ELSE '***@***.com'
  END;

CREATE OR REPLACE MASKING POLICY phone_mask AS (val STRING) RETURNS STRING ->
  CASE
    WHEN CURRENT_ROLE() IN ('ADMIN', 'SUPPORT_LEAD') THEN val
    ELSE CONCAT('***-***-', RIGHT(val, 4))
  END;

CREATE OR REPLACE MASKING POLICY credit_card_mask AS (val STRING) RETURNS STRING ->
  CASE
    WHEN CURRENT_ROLE() = 'ADMIN' THEN val
    ELSE CONCAT('****-****-****-', RIGHT(val, 4))
  END;

-- Apply masking policies
ALTER TABLE app.users MODIFY COLUMN email SET MASKING POLICY email_mask;
ALTER TABLE app.users MODIFY COLUMN phone SET MASKING POLICY phone_mask;
ALTER TABLE app.billing MODIFY COLUMN card_number SET MASKING POLICY credit_card_mask;
```

---

## 3. AUDIT LOGGING

### 3.1 PostgreSQL Audit Configuration

```sql
-- Comprehensive audit log table
CREATE TABLE audit.log (
    log_id BIGSERIAL PRIMARY KEY,
    
    -- Timestamp and context
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    transaction_id BIGINT,
    
    -- User information
    user_id UUID,
    user_email VARCHAR(255),
    tenant_id UUID,
    role VARCHAR(50),
    
    -- Action details
    action VARCHAR(50) NOT NULL,  -- CREATE, READ, UPDATE, DELETE, LOGIN, EXPORT
    table_schema VARCHAR(100),
    table_name VARCHAR(100),
    record_id UUID,
    
    -- Data changes
    old_values JSONB,
    new_values JSONB,
    changed_columns TEXT[],
    
    -- Request context
    ip_address INET,
    user_agent TEXT,
    request_id UUID,
    request_path TEXT,
    request_method VARCHAR(10),
    
    -- Result
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    
    -- Compliance
    data_classification VARCHAR(50),  -- public, internal, confidential, restricted
    pii_fields TEXT[],
    
    -- Retention
    retention_until DATE
);

-- Indexes for efficient querying
CREATE INDEX idx_audit_timestamp ON audit.log(timestamp DESC);
CREATE INDEX idx_audit_tenant ON audit.log(tenant_id, timestamp DESC);
CREATE INDEX idx_audit_user ON audit.log(user_id, timestamp DESC);
CREATE INDEX idx_audit_action ON audit.log(action, timestamp DESC);
CREATE INDEX idx_audit_table ON audit.log(table_schema, table_name, timestamp DESC);
CREATE INDEX idx_audit_request ON audit.log(request_id);
CREATE INDEX idx_audit_ip ON audit.log(ip_address);

-- Partition by month for performance
CREATE TABLE audit.log_2025_01 PARTITION OF audit.log
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit.audit_trigger()
RETURNS TRIGGER
SECURITY DEFINER
AS $$
DECLARE
    v_old_values JSONB;
    v_new_values JSONB;
    v_changed_columns TEXT[];
    v_pii_fields TEXT[];
BEGIN
    -- Determine action type
    IF TG_OP = 'DELETE' THEN
        v_old_values = to_jsonb(OLD);
        v_new_values = NULL;
        v_changed_columns = NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        v_old_values = to_jsonb(OLD);
        v_new_values = to_jsonb(NEW);
        
        -- Calculate changed columns
        SELECT ARRAY_AGG(key)
        INTO v_changed_columns
        FROM jsonb_each(v_old_values) old_data
        JOIN jsonb_each(v_new_values) new_data ON old_data.key = new_data.key
        WHERE old_data.value IS DISTINCT FROM new_data.value;
        
    ELSIF TG_OP = 'INSERT' THEN
        v_old_values = NULL;
        v_new_values = to_jsonb(NEW);
        v_changed_columns = NULL;
    END IF;
    
    -- Identify PII fields
    v_pii_fields = ARRAY(
        SELECT key
        FROM jsonb_each_text(v_new_values)
        WHERE key IN ('email', 'phone', 'address', 'ssn', 'credit_card')
    );
    
    -- Insert audit record
    INSERT INTO audit.log (
        transaction_id,
        user_id,
        user_email,
        tenant_id,
        role,
        action,
        table_schema,
        table_name,
        record_id,
        old_values,
        new_values,
        changed_columns,
        ip_address,
        user_agent,
        request_id,
        pii_fields,
        retention_until
    ) VALUES (
        txid_current(),
        current_setting('app.current_user', TRUE)::UUID,
        current_setting('app.user_email', TRUE),
        current_setting('app.current_tenant', TRUE)::UUID,
        current_setting('app.user_role', TRUE),
        TG_OP,
        TG_TABLE_SCHEMA,
        TG_TABLE_NAME,
        COALESCE(NEW.user_id, OLD.user_id),
        v_old_values,
        v_new_values,
        v_changed_columns,
        inet_client_addr(),
        current_setting('app.user_agent', TRUE),
        current_setting('app.request_id', TRUE)::UUID,
        v_pii_fields,
        CURRENT_DATE + INTERVAL '7 years'
    );
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers
CREATE TRIGGER audit_users
    AFTER INSERT OR UPDATE OR DELETE ON app.users
    FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger();

CREATE TRIGGER audit_agents
    AFTER INSERT OR UPDATE OR DELETE ON app.agents
    FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger();

CREATE TRIGGER audit_conversations
    AFTER INSERT OR UPDATE OR DELETE ON app.conversations
    FOR EACH ROW EXECUTE FUNCTION audit.audit_trigger();

-- Login audit
CREATE OR REPLACE FUNCTION audit.log_login(
    p_user_id UUID,
    p_email VARCHAR,
    p_tenant_id UUID,
    p_ip_address INET,
    p_user_agent TEXT,
    p_success BOOLEAN,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
AS $$
BEGIN
    INSERT INTO audit.log (
        user_id, user_email, tenant_id, action,
        ip_address, user_agent, success, error_message
    ) VALUES (
        p_user_id, p_email, p_tenant_id, 'LOGIN',
        p_ip_address, p_user_agent, p_success, p_error_message
    );
END;
$$ LANGUAGE plpgsql;
```

### 3.2 Audit Log Retention

```sql
-- Automated cleanup of old audit logs
CREATE OR REPLACE FUNCTION audit.cleanup_old_logs()
RETURNS INTEGER
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Archive to S3 before deletion (using aws_s3 extension)
    -- Then delete old records
    DELETE FROM audit.log
    WHERE retention_until < CURRENT_DATE
      AND timestamp < CURRENT_DATE - INTERVAL '1 year';
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup job
SELECT cron.schedule('audit-cleanup', '0 3 * * 0', 'SELECT audit.cleanup_old_logs()');
```

---

## 4. ACCESS CONTROL

### 4.1 Role-Based Access Control (RBAC)

```yaml
# Role definitions
roles:
  # System roles
  controlia_admin:
    description: "Full system access"
    permissions:
      - "*:*"
    bypass_rls: true
    
  controlia_app:
    description: "Application service account"
    permissions:
      - "app:read"
      - "app:write"
      - "analytics:read"
    bypass_rls: false
    
  controlia_readonly:
    description: "Read-only analytics access"
    permissions:
      - "app:read"
      - "analytics:read"
    bypass_rls: false

  # Tenant roles
  tenant_owner:
    description: "Full access to tenant resources"
    permissions:
      - "tenant:*"
      - "agents:*"
      - "conversations:*"
      - "billing:*"
      - "users:*"
      - "analytics:*"
      
  tenant_admin:
    description: "Admin access to tenant resources"
    permissions:
      - "agents:*"
      - "conversations:*"
      - "users:read"
      - "users:write"
      - "analytics:*"
      
  tenant_member:
    description: "Standard member access"
    permissions:
      - "agents:read"
      - "conversations:*"
      - "users:read"
      - "analytics:read"
      
  tenant_viewer:
    description: "Read-only access"
    permissions:
      - "agents:read"
      - "conversations:read"
      - "analytics:read"
```

### 4.2 API Key Management

```python
# API key service with scoped permissions
import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List

class APIKeyService:
    """
    Service for managing API keys with scoped permissions
    """
    
    def __init__(self, db, encryption_service):
        self.db = db
        self.encryption = encryption_service
    
    def generate_api_key(
        self,
        tenant_id: str,
        user_id: str,
        name: str,
        scopes: List[str],
        expires_days: Optional[int] = 365
    ) -> dict:
        """
        Generate a new API key
        
        Returns:
            Dictionary with key_id, api_key (full key, shown once), and metadata
        """
        # Generate secure random key
        key_bytes = secrets.token_bytes(32)
        api_key = f"ctl_{key_bytes.hex()}"
        
        # Hash for storage
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        key_prefix = api_key[:12]
        
        # Calculate expiration
        expires_at = None
        if expires_days:
            expires_at = datetime.utcnow() + timedelta(days=expires_days)
        
        # Store in database
        cursor = self.db.cursor()
        cursor.execute("""
            INSERT INTO app.api_keys (
                tenant_id, user_id, name, key_hash, key_prefix,
                scopes, expires_at, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
            RETURNING key_id
        """, [tenant_id, user_id, name, key_hash, key_prefix, scopes, expires_at])
        
        key_id = cursor.fetchone()[0]
        self.db.commit()
        
        return {
            'key_id': key_id,
            'api_key': api_key,  # Only shown once!
            'name': name,
            'scopes': scopes,
            'expires_at': expires_at,
            'prefix': key_prefix
        }
    
    def validate_api_key(self, api_key: str) -> Optional[dict]:
        """
        Validate an API key and return its metadata
        """
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        
        cursor = self.db.cursor()
        cursor.execute("""
            SELECT key_id, tenant_id, user_id, name, scopes, 
                   expires_at, revoked_at, last_used_at
            FROM app.api_keys
            WHERE key_hash = %s
        """, [key_hash])
        
        result = cursor.fetchone()
        if not result:
            return None
        
        key_id, tenant_id, user_id, name, scopes, expires_at, revoked_at, last_used_at = result
        
        # Check if expired
        if expires_at and expires_at < datetime.utcnow():
            return None
        
        # Check if revoked
        if revoked_at:
            return None
        
        # Update last used
        cursor.execute("""
            UPDATE app.api_keys 
            SET last_used_at = NOW() 
            WHERE key_id = %s
        """, [key_id])
        self.db.commit()
        
        return {
            'key_id': key_id,
            'tenant_id': tenant_id,
            'user_id': user_id,
            'name': name,
            'scopes': scopes
        }
    
    def revoke_api_key(self, key_id: str, tenant_id: str) -> bool:
        """
        Revoke an API key
        """
        cursor = self.db.cursor()
        cursor.execute("""
            UPDATE app.api_keys 
            SET revoked_at = NOW() 
            WHERE key_id = %s AND tenant_id = %s
            RETURNING key_id
        """, [key_id, tenant_id])
        
        result = cursor.fetchone()
        self.db.commit()
        
        return result is not None
    
    def check_scope(self, api_key_metadata: dict, required_scope: str) -> bool:
        """
        Check if API key has required scope
        """
        scopes = api_key_metadata.get('scopes', [])
        
        # Check exact match
        if required_scope in scopes:
            return True
        
        # Check wildcard permissions
        resource, action = required_scope.split(':')
        wildcard_scope = f"{resource}:*"
        
        if wildcard_scope in scopes or "*:*" in scopes:
            return True
        
        return False
```

---

## 5. DATA MASKING

### 5.1 Dynamic Data Masking

```sql
-- PostgreSQL dynamic masking with views

-- Create masking functions
CREATE OR REPLACE FUNCTION mask_email(email TEXT)
RETURNS TEXT AS $$
BEGIN
    IF email IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN REGEXP_REPLACE(email, '^(.).*@', '\1***@');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION mask_phone(phone TEXT)
RETURNS TEXT AS $$
BEGIN
    IF phone IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN CONCAT('***-***-', RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 4));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION mask_credit_card(card TEXT)
RETURNS TEXT AS $$
BEGIN
    IF card IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN CONCAT('****-****-****-', RIGHT(REGEXP_REPLACE(card, '[^0-9]', '', 'g'), 4));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Masked view for users
CREATE OR REPLACE VIEW app.users_masked AS
SELECT
    user_id,
    tenant_id,
    CASE 
        WHEN current_user = 'controlia_admin' THEN email
        ELSE mask_email(email)
    END as email,
    CASE 
        WHEN current_user = 'controlia_admin' THEN phone
        ELSE mask_phone(phone)
    END as phone,
    first_name,
    last_name,
    role,
    status,
    last_login_at,
    created_at
FROM app.users;

-- Grant access to masked view
GRANT SELECT ON app.users_masked TO controlia_readonly;
```

---

## 6. COMPLIANCE

### 6.1 GDPR Compliance

```python
# GDPR compliance service
from datetime import datetime
from typing import List, Dict

class GDPRComplianceService:
    """
    Service for handling GDPR compliance requirements
    """
    
    def __init__(self, db, s3_client):
        self.db = db
        self.s3 = s3_client
    
    def export_user_data(self, user_id: str, tenant_id: str) -> Dict:
        """
        Export all user data (GDPR Right to Data Portability)
        
        Returns:
            Dictionary with all user data in machine-readable format
        """
        data = {
            'export_date': datetime.utcnow().isoformat(),
            'user_id': user_id,
            'tenant_id': tenant_id,
            'profile': self._get_user_profile(user_id),
            'conversations': self._get_user_conversations(user_id, tenant_id),
            'agents': self._get_user_agents(user_id, tenant_id),
            'activity_log': self._get_user_activity(user_id, tenant_id),
            'billing_history': self._get_billing_history(user_id, tenant_id)
        }
        
        return data
    
    def delete_user_data(self, user_id: str, tenant_id: str) -> bool:
        """
        Delete all user data (GDPR Right to be Forgotten)
        """
        cursor = self.db.cursor()
        
        # Anonymize user record
        cursor.execute("""
            UPDATE app.users
            SET 
                email = CONCAT('deleted_', user_id, '@controlia.com'),
                password_hash = NULL,
                first_name = 'Deleted',
                last_name = 'User',
                preferences = '{}',
                deleted_at = NOW()
            WHERE user_id = %s AND tenant_id = %s
        """, [user_id, tenant_id])
        
        # Delete API keys
        cursor.execute("""
            DELETE FROM app.api_keys
            WHERE user_id = %s AND tenant_id = %s
        """, [user_id, tenant_id])
        
        # Delete webhooks owned by user
        cursor.execute("""
            DELETE FROM app.webhooks
            WHERE tenant_id = %s AND created_by = %s
        """, [tenant_id, user_id])
        
        # Anonymize conversation external_user_id
        cursor.execute("""
            UPDATE app.conversations
            SET external_user_id = CONCAT('anonymized_', conversation_id)
            WHERE user_id = %s AND tenant_id = %s
        """, [user_id, tenant_id])
        
        self.db.commit()
        
        # Log deletion for audit
        self._log_gdpr_action('DELETE', user_id, tenant_id)
        
        return True
    
    def restrict_processing(self, user_id: str, tenant_id: str) -> bool:
        """
        Restrict processing of user data (GDPR Right to Restrict Processing)
        """
        cursor = self.db.cursor()
        
        cursor.execute("""
            UPDATE app.users
            SET status = 'restricted',
                preferences = preferences || '{"processing_restricted": true}'
            WHERE user_id = %s AND tenant_id = %s
        """, [user_id, tenant_id])
        
        self.db.commit()
        
        self._log_gdpr_action('RESTRICT', user_id, tenant_id)
        
        return True
    
    def _log_gdpr_action(self, action: str, user_id: str, tenant_id: str):
        """Log GDPR action for compliance audit"""
        cursor = self.db.cursor()
        cursor.execute("""
            INSERT INTO audit.gdpr_log (action, user_id, tenant_id, performed_at)
            VALUES (%s, %s, %s, NOW())
        """, [action, user_id, tenant_id])
        self.db.commit()
```

### 6.2 Data Retention Policies

```sql
-- Data retention configuration
CREATE TABLE config.data_retention (
    table_name VARCHAR(100) PRIMARY KEY,
    retention_days INTEGER NOT NULL,
    archive_location VARCHAR(255),
    anonymize_after_days INTEGER,
    delete_after_days INTEGER,
    last_purged_at TIMESTAMP
);

-- Insert retention policies
INSERT INTO config.data_retention VALUES
    ('app.messages', 2555, 's3://controlia-archive/messages', NULL, 2555, NULL),  -- 7 years
    ('app.conversations', 2555, 's3://controlia-archive/conversations', NULL, 2555, NULL),
    ('audit.log', 2555, 's3://controlia-archive/audit', NULL, 2555, NULL),
    ('app.users', NULL, NULL, 365, NULL, NULL),  -- Anonymize after 1 year
    ('app.api_keys', 90, NULL, NULL, 90, NULL),  -- Delete after 90 days
    ('app.webhook_logs', 30, NULL, NULL, 30, NULL);  -- Delete after 30 days

-- Automated retention job
CREATE OR REPLACE FUNCTION config.apply_retention_policies()
RETURNS TABLE(table_name TEXT, records_affected INTEGER)
AS $$
DECLARE
    v_policy RECORD;
    v_count INTEGER;
BEGIN
    FOR v_policy IN SELECT * FROM config.data_retention LOOP
        -- Archive old data
        IF v_policy.retention_days IS NOT NULL THEN
            -- Archive logic here (copy to S3, etc.)
            v_count := 0;  -- Placeholder
        END IF;
        
        -- Anonymize old data
        IF v_policy.anonymize_after_days IS NOT NULL THEN
            EXECUTE format('
                UPDATE %I 
                SET email = CONCAT(''anonymized_'', user_id, ''@deleted.com'')
                WHERE created_at < NOW() - INTERVAL ''%s days''
                  AND email NOT LIKE ''anonymized_%%''
            ', v_policy.table_name, v_policy.anonymize_after_days);
            
            GET DIAGNOSTICS v_count = ROW_COUNT;
        END IF;
        
        -- Delete old data
        IF v_policy.delete_after_days IS NOT NULL THEN
            EXECUTE format('
                DELETE FROM %I 
                WHERE created_at < NOW() - INTERVAL ''%s days''
            ', v_policy.table_name, v_policy.delete_after_days);
            
            GET DIAGNOSTICS v_count = ROW_COUNT;
        END IF;
        
        -- Update last purged timestamp
        UPDATE config.data_retention
        SET last_purged_at = NOW()
        WHERE table_name = v_policy.table_name;
        
        RETURN QUERY SELECT v_policy.table_name, v_count;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
```

---

## 7. SECURITY MONITORING

### 7.1 Security Alerts

```yaml
# Security monitoring rules
security_alerts:
  # Failed login attempts
  failed_logins:
    condition: "count(action = 'LOGIN' AND success = false) > 5"
    window: "5 minutes"
    severity: "high"
    action: "block_ip"
    
  # Unusual data access
  unusual_access:
    condition: "records_accessed > avg_daily_access * 10"
    window: "1 hour"
    severity: "medium"
    action: "notify_security_team"
    
  # Privilege escalation
  privilege_escalation:
    condition: "role_changed FROM 'viewer' TO 'admin'"
    severity: "critical"
    action: "notify_security_team AND require_approval"
    
  # Data export
  large_export:
    condition: "records_exported > 10000"
    severity: "medium"
    action: "notify_data_owner"
    
  # After-hours access
  after_hours:
    condition: "access_time BETWEEN '22:00' AND '06:00'"
    severity: "low"
    action: "log_only"
```

### 7.2 Intrusion Detection

```python
# Security event detection
from datetime import datetime, timedelta
from collections import defaultdict

class SecurityMonitor:
    """
    Monitor for security events and anomalies
    """
    
    def __init__(self, db, alert_service):
        self.db = db
        self.alerts = alert_service
        self.failed_logins = defaultdict(list)
    
    def detect_brute_force(self, ip_address: str, user_id: str = None):
        """
        Detect brute force login attempts
        """
        cursor = self.db.cursor()
        
        # Count failed logins in last 5 minutes
        cursor.execute("""
            SELECT COUNT(*) 
            FROM audit.log 
            WHERE action = 'LOGIN' 
              AND success = false
              AND ip_address = %s::inet
              AND timestamp > NOW() - INTERVAL '5 minutes'
        """, [ip_address])
        
        failed_count = cursor.fetchone()[0]
        
        if failed_count >= 5:
            self.alerts.send_security_alert(
                severity='high',
                title='Potential Brute Force Attack',
                message=f'{failed_count} failed login attempts from {ip_address}',
                metadata={'ip_address': ip_address, 'failed_count': failed_count}
            )
            
            # Optionally block IP
            self._block_ip(ip_address, duration_minutes=30)
    
    def detect_data_exfiltration(self, tenant_id: str):
        """
        Detect potential data exfiltration
        """
        cursor = self.db.cursor()
        
        # Check for unusual export volume
        cursor.execute("""
            SELECT 
                user_id,
                COUNT(*) as export_count,
                SUM((new_values->>'records_exported')::int) as total_records
            FROM audit.log
            WHERE action = 'EXPORT'
              AND tenant_id = %s
              AND timestamp > NOW() - INTERVAL '1 hour'
            GROUP BY user_id
            HAVING SUM((new_values->>'records_exported')::int) > 10000
        """, [tenant_id])
        
        results = cursor.fetchall()
        
        for user_id, export_count, total_records in results:
            self.alerts.send_security_alert(
                severity='medium',
                title='Large Data Export Detected',
                message=f'User {user_id} exported {total_records} records in {export_count} operations',
                metadata={
                    'user_id': user_id,
                    'tenant_id': tenant_id,
                    'export_count': export_count,
                    'total_records': total_records
                }
            )
    
    def _block_ip(self, ip_address: str, duration_minutes: int):
        """Block IP address temporarily"""
        # Implementation depends on your infrastructure
        # Could use AWS WAF, nginx rules, etc.
        pass
```

---

## 8. INCIDENT RESPONSE

### 8.1 Data Breach Response Plan

```yaml
# Data breach response procedures
data_breach_response:
  detection:
    - Monitor security alerts
    - Review audit logs
    - User reports
    
  containment:
    - Isolate affected systems
    - Revoke compromised credentials
    - Enable additional logging
    
  assessment:
    - Determine scope of breach
    - Identify affected data
    - Assess impact
    
  notification:
    internal:
      - Security team: immediate
      - Legal team: within 1 hour
      - Executive team: within 4 hours
      
    external:
      affected_users: within 72 hours
      regulatory_authorities: within 72 hours (GDPR)
      
  remediation:
    - Patch vulnerabilities
    - Reset passwords
    - Review access controls
    - Update security policies
    
  post_incident:
    - Document lessons learned
    - Update incident response plan
    - Conduct security training
```

---

*Documento de Seguridad y Privacidad - ControlIA v1.0*
