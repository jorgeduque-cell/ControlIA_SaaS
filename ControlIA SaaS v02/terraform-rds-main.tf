# =============================================================================
# TERRAFORM: RDS CONFIGURATION
# Sistema de Agente Empresarial - AWS São Paulo
# =============================================================================

# =============================================================================
# DB SUBNET GROUP
# =============================================================================
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-rds"
  subnet_ids = var.private_data_subnet_ids
  
  tags = {
    Name = "${var.project_name}-${var.environment}-rds-subnet-group"
  }
}

# =============================================================================
# DB PARAMETER GROUP
# =============================================================================
resource "aws_db_parameter_group" "main" {
  name   = "${var.project_name}-${var.environment}-postgres15"
  family = "postgres15"
  
  parameter {
    name  = "max_connections"
    value = "500"
  }
  
  parameter {
    name  = "shared_buffers"
    value = "8388608"  # 8GB (25% of 32GB RAM)
  }
  
  parameter {
    name  = "effective_cache_size"
    value = "25165824"  # 24GB (75% of 32GB RAM)
  }
  
  parameter {
    name  = "work_mem"
    value = "16384"  # 16MB
  }
  
  parameter {
    name  = "maintenance_work_mem"
    value = "2097152"  # 2GB
  }
  
  parameter {
    name  = "random_page_cost"
    value = "1.1"  # Optimized for SSD
  }
  
  parameter {
    name  = "effective_io_concurrency"
    value = "200"
  }
  
  parameter {
    name  = "wal_buffers"
    value = "16384"  # 16MB
  }
  
  parameter {
    name  = "default_statistics_target"
    value = "100"
  }
  
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"  # Log queries > 1s
  }
  
  parameter {
    name  = "log_connections"
    value = "1"
  }
  
  parameter {
    name  = "log_disconnections"
    value = "1"
  }
  
  parameter {
    name  = "log_lock_waits"
    value = "1"
  }
  
  parameter {
    name  = "log_temp_files"
    value = "0"
  }
  
  tags = {
    Name = "${var.project_name}-${var.environment}-postgres-params"
  }
}

# =============================================================================
# RDS PRIMARY INSTANCE
# =============================================================================
resource "aws_db_instance" "primary" {
  identifier = "${var.project_name}-${var.environment}-postgres"
  
  engine         = "postgres"
  engine_version = var.rds_engine_version
  instance_class = var.rds_instance_class
  
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.rds.arn
  
  db_name  = var.rds_database_name
  username = var.rds_master_username
  password = random_password.rds_master.result
  
  multi_az               = var.rds_multi_az
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.rds_security_group_id]
  parameter_group_name   = aws_db_parameter_group.main.name
  
  backup_retention_period = var.rds_backup_retention_period
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"
  
  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.rds.arn
  performance_insights_retention_period = 7
  
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn
  
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "${var.project_name}-${var.environment}-postgres-final"
  
  auto_minor_version_upgrade = true
  
  tags = {
    Name = "${var.project_name}-${var.environment}-postgres-primary"
  }
}

# =============================================================================
# RDS READ REPLICAS
# =============================================================================
resource "aws_db_instance" "replica" {
  count = 2
  
  identifier = "${var.project_name}-${var.environment}-postgres-replica-${count.index + 1}"
  
  replicate_source_db = aws_db_instance.primary.arn
  
  instance_class = "db.r6g.xlarge"
  
  storage_encrypted = true
  kms_key_id        = aws_kms_key.rds.arn
  
  vpc_security_group_ids = [var.rds_security_group_id]
  
  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.rds.arn
  performance_insights_retention_period = 7
  
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn
  
  enabled_cloudwatch_logs_exports = ["postgresql"]
  
  auto_minor_version_upgrade = true
  
  tags = {
    Name = "${var.project_name}-${var.environment}-postgres-replica-${count.index + 1}"
  }
}

# =============================================================================
# RDS PROXY
# =============================================================================
resource "aws_db_proxy" "main" {
  name                   = "${var.project_name}-${var.environment}-proxy"
  engine_family          = "POSTGRESQL"
  idle_client_timeout    = 1800
  require_tls            = true
  role_arn               = aws_iam_role.rds_proxy.arn
  vpc_security_group_ids = [var.rds_security_group_id]
  vpc_subnet_ids         = var.private_data_subnet_ids
  
  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "DISABLED"
    secret_arn  = aws_secretsmanager_secret.rds.arn
  }
  
  tags = {
    Name = "${var.project_name}-${var.environment}-rds-proxy"
  }
}

resource "aws_db_proxy_default_target_group" "main" {
  db_proxy_name = aws_db_proxy.main.name
  
  connection_pool_config {
    connection_borrow_timeout    = 120
    init_query                   = ""
    max_connections_percent      = 100
    max_idle_connections_percent = 50
    session_pinning_filters      = ["EXCLUDE_VARIABLE_SETS"]
  }
}

resource "aws_db_proxy_target" "main" {
  db_proxy_name         = aws_db_proxy.main.name
  target_group_name     = aws_db_proxy_default_target_group.main.name
  db_instance_identifier = aws_db_instance.primary.identifier
}

# =============================================================================
# SECRETS MANAGER
# =============================================================================
resource "aws_secretsmanager_secret" "rds" {
  name                    = "${var.project_name}/${var.environment}/rds/master"
  description             = "RDS master credentials"
  kms_key_id              = aws_kms_key.rds.arn
  recovery_window_in_days = 30
  
  tags = {
    Name = "${var.project_name}-${var.environment}-rds-secret"
  }
}

resource "aws_secretsmanager_secret_version" "rds" {
  secret_id = aws_secretsmanager_secret.rds.id
  secret_string = jsonencode({
    username = var.rds_master_username
    password = random_password.rds_master.result
    host     = aws_db_instance.primary.address
    port     = 5432
    dbname   = var.rds_database_name
    jdbc_url = "jdbc:postgresql://${aws_db_instance.primary.address}:5432/${var.rds_database_name}"
  })
}

# =============================================================================
# RANDOM PASSWORD
# =============================================================================
resource "random_password" "rds_master" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# =============================================================================
# IAM ROLE FOR RDS MONITORING
# =============================================================================
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.project_name}-${var.environment}-rds-monitoring-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
  role       = aws_iam_role.rds_monitoring.name
}

# =============================================================================
# IAM ROLE FOR RDS PROXY
# =============================================================================
resource "aws_iam_role" "rds_proxy" {
  name = "${var.project_name}-${var.environment}-rds-proxy-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "rds.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "rds_proxy" {
  name = "${var.project_name}-${var.environment}-rds-proxy-policy"
  role = aws_iam_role.rds_proxy.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = aws_secretsmanager_secret.rds.arn
      }
    ]
  })
}

# =============================================================================
# KMS KEY
# =============================================================================
resource "aws_kms_key" "rds" {
  description             = "RDS Encryption Key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  
  tags = {
    Name = "${var.project_name}-${var.environment}-rds-kms"
  }
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${var.project_name}-${var.environment}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# =============================================================================
# CLOUDWATCH ALARMS
# =============================================================================
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "RDS CPU utilization is high"
  alarm_actions       = [var.sns_topic_arn]
  
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.primary.identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-high-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "400"
  alarm_description   = "RDS connection count is high"
  alarm_actions       = [var.sns_topic_arn]
  
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.primary.identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-low-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "53687091200"  # 50 GB
  alarm_description   = "RDS free storage is low"
  alarm_actions       = [var.sns_topic_arn]
  
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.primary.identifier
  }
}

# =============================================================================
# VARIABLES (passed from root module)
# =============================================================================
variable "private_data_subnet_ids" {
  description = "Private data subnet IDs"
  type        = list(string)
}

variable "rds_security_group_id" {
  description = "RDS security group ID"
  type        = string
}

variable "sns_topic_arn" {
  description = "SNS topic ARN for alarms"
  type        = string
  default     = ""
}

# =============================================================================
# OUTPUTS
# =============================================================================
output "rds_endpoint" {
  description = "RDS primary endpoint"
  value       = aws_db_instance.primary.address
}

output "rds_port" {
  description = "RDS port"
  value       = aws_db_instance.primary.port
}

output "rds_proxy_endpoint" {
  description = "RDS Proxy endpoint"
  value       = aws_db_proxy.main.endpoint
}

output "rds_secret_arn" {
  description = "RDS Secrets Manager ARN"
  value       = aws_secretsmanager_secret.rds.arn
}
