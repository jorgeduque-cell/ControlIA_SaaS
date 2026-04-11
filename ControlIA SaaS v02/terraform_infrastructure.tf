# Terraform Configuration - ControlIA Data Infrastructure
# Fase 1: MVP Infrastructure

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.0"
    }
    snowflake = {
      source  = "Snowflake-Labs/snowflake"
      version = "~> 0.70"
    }
  }
  
  backend "s3" {
    bucket = "controlia-terraform-state"
    key    = "data-infrastructure/terraform.tfstate"
    region = "us-east-1"
    encrypt = true
  }
}

# Variables
variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "controlia"
}

# Provider Configuration
provider "aws" {
  region = "us-east-1"
  
  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project_name
      ManagedBy   = "terraform"
    }
  }
}

# VPC Configuration
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = {
    Name = "${var.project_name}-vpc"
  }
}

resource "aws_subnet" "private_1" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "us-east-1a"
  
  tags = {
    Name = "${var.project_name}-private-1a"
    Type = "private"
  }
}

resource "aws_subnet" "private_2" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "us-east-1b"
  
  tags = {
    Name = "${var.project_name}-private-1b"
    Type = "private"
  }
}

resource "aws_subnet" "private_3" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.3.0/24"
  availability_zone = "us-east-1c"
  
  tags = {
    Name = "${var.project_name}-private-1c"
    Type = "private"
  }
}

# S3 Data Lake Buckets
resource "aws_s3_bucket" "data_lake" {
  bucket = "${var.project_name}-data-lake-${var.environment}"
}

resource "aws_s3_bucket_versioning" "data_lake" {
  bucket = aws_s3_bucket.data_lake.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "data_lake" {
  bucket = aws_s3_bucket.data_lake.id
  
  rule {
    id     = "bronze-transition"
    status = "Enabled"
    
    filter {
      prefix = "bronze/"
    }
    
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    
    expiration {
      days = 365
    }
  }
  
  rule {
    id     = "tmp-cleanup"
    status = "Enabled"
    
    filter {
      prefix = "tmp/"
    }
    
    expiration {
      days = 7
    }
  }
}

resource "aws_s3_bucket" "data_lake_scripts" {
  bucket = "${var.project_name}-data-lake-scripts-${var.environment}"
}

# IAM Role for Databricks
resource "aws_iam_role" "databricks" {
  name = "${var.project_name}-databricks-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::414351767826:root"
        }
        Condition = {
          StringEquals = {
            "sts:ExternalId" = "databricks-account-id"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "databricks_s3" {
  name = "${var.project_name}-databricks-s3-policy"
  role = aws_iam_role.databricks.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:GetBucketLocation"
        ]
        Resource = [
          aws_s3_bucket.data_lake.arn,
          "${aws_s3_bucket.data_lake.arn}/*"
        ]
      }
    ]
  })
}

# Aurora PostgreSQL Cluster
resource "aws_rds_subnet_group" "aurora" {
  name       = "${var.project_name}-aurora-subnet-group"
  subnet_ids = [aws_subnet.private_1.id, aws_subnet.private_2.id, aws_subnet.private_3.id]
  
  tags = {
    Name = "${var.project_name}-aurora-subnet-group"
  }
}

resource "aws_security_group" "aurora" {
  name        = "${var.project_name}-aurora-sg"
  description = "Security group for Aurora PostgreSQL"
  vpc_id      = aws_vpc.main.id
  
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "${var.project_name}-aurora-sg"
  }
}

resource "aws_rds_cluster" "aurora" {
  cluster_identifier     = "${var.project_name}-aurora-cluster"
  engine                 = "aurora-postgresql"
  engine_version         = "15.4"
  database_name          = "controlia"
  master_username        = "admin"
  master_password        = random_password.aurora.result
  db_subnet_group_name   = aws_rds_subnet_group.aurora.name
  vpc_security_group_ids = [aws_security_group.aurora.id]
  
  backup_retention_period = 35
  preferred_backup_window = "03:00-04:00"
  
  enabled_cloudwatch_logs_exports = ["postgresql"]
  
  deletion_protection = true
  skip_final_snapshot = false
  final_snapshot_identifier = "${var.project_name}-aurora-final-snapshot"
  
  tags = {
    Name = "${var.project_name}-aurora-cluster"
  }
}

resource "aws_rds_cluster_instance" "aurora_primary" {
  identifier           = "${var.project_name}-aurora-primary"
  cluster_identifier   = aws_rds_cluster.aurora.id
  instance_class       = "db.r6g.large"
  engine               = "aurora-postgresql"
  
  performance_insights_enabled = true
  monitoring_interval          = 60
  
  tags = {
    Name = "${var.project_name}-aurora-primary"
  }
}

resource "aws_rds_cluster_instance" "aurora_replica" {
  count              = 2
  identifier         = "${var.project_name}-aurora-replica-${count.index + 1}"
  cluster_identifier = aws_rds_cluster.aurora.id
  instance_class     = "db.r6g.large"
  engine             = "aurora-postgresql"
  
  performance_insights_enabled = true
  monitoring_interval          = 60
  
  tags = {
    Name = "${var.project_name}-aurora-replica-${count.index + 1}"
  }
}

resource "random_password" "aurora" {
  length  = 32
  special = false
}

# ElastiCache Redis Cluster
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project_name}-redis-subnet-group"
  subnet_ids = [aws_subnet.private_1.id, aws_subnet.private_2.id, aws_subnet.private_3.id]
}

resource "aws_security_group" "redis" {
  name        = "${var.project_name}-redis-sg"
  description = "Security group for Redis"
  vpc_id      = aws_vpc.main.id
  
  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }
  
  tags = {
    Name = "${var.project_name}-redis-sg"
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${var.project_name}-redis"
  description          = "Redis cluster for ControlIA"
  
  node_type            = "cache.r6g.large"
  num_cache_clusters   = 3
  automatic_failover_enabled = true
  multi_az_enabled     = true
  
  engine               = "redis"
  engine_version       = "7.0"
  port                 = 6379
  
  parameter_group_name = "default.redis7"
  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [aws_security_group.redis.id]
  
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  
  snapshot_retention_limit = 7
  snapshot_window          = "05:00-06:00"
  
  tags = {
    Name = "${var.project_name}-redis"
  }
}

# MSK (Kafka) - Fase 2
resource "aws_msk_cluster" "kafka" {
  cluster_name           = "${var.project_name}-kafka"
  kafka_version          = "3.5.1"
  number_of_broker_nodes = 3
  
  broker_node_group_info {
    instance_type   = "kafka.m5.large"
    client_subnets  = [aws_subnet.private_1.id, aws_subnet.private_2.id, aws_subnet.private_3.id]
    security_groups = [aws_security_group.kafka.id]
    
    storage_info {
      ebs_storage_info {
        volume_size = 1000
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
  
  open_monitoring {
    prometheus {
      jmx_exporter {
        enabled_in_broker = true
      }
      node_exporter {
        enabled_in_broker = true
      }
    }
  }
  
  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk.name
      }
      s3 {
        enabled = true
        bucket  = aws_s3_bucket.data_lake.id
        prefix  = "logs/msk/"
      }
    }
  }
  
  tags = {
    Name = "${var.project_name}-kafka"
  }
}

resource "aws_security_group" "kafka" {
  name        = "${var.project_name}-kafka-sg"
  description = "Security group for MSK"
  vpc_id      = aws_vpc.main.id
  
  ingress {
    from_port   = 9094
    to_port     = 9094
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }
  
  tags = {
    Name = "${var.project_name}-kafka-sg"
  }
}

resource "aws_kms_key" "msk" {
  description = "KMS key for MSK encryption"
  
  tags = {
    Name = "${var.project_name}-msk-key"
  }
}

resource "aws_cloudwatch_log_group" "msk" {
  name              = "/aws/msk/${var.project_name}-kafka"
  retention_in_days = 30
}

# Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name        = "${var.project_name}/database/password"
  description = "Password for Aurora PostgreSQL"
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.aurora.result
}

# Outputs
output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "data_lake_bucket" {
  description = "Data Lake S3 Bucket"
  value       = aws_s3_bucket.data_lake.id
}

output "aurora_endpoint" {
  description = "Aurora Cluster Endpoint"
  value       = aws_rds_cluster.aurora.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis Primary Endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive   = true
}

output "msk_bootstrap_brokers" {
  description = "MSK Bootstrap Brokers"
  value       = aws_msk_cluster.kafka.bootstrap_brokers_tls
  sensitive   = true
}
