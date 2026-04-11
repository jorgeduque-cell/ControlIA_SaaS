# MongoDB Atlas Configuration - ControlIA
# Terraform configuration for MongoDB Atlas cluster

terraform {
  required_providers {
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.12"
    }
  }
}

# Variables
variable "mongodbatlas_public_key" {
  description = "MongoDB Atlas Public API Key"
  type        = string
  sensitive   = true
}

variable "mongodbatlas_private_key" {
  description = "MongoDB Atlas Private API Key"
  type        = string
  sensitive   = true
}

variable "atlas_project_id" {
  description = "MongoDB Atlas Project ID"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

# Provider
provider "mongodbatlas" {
  public_key  = var.mongodbatlas_public_key
  private_key = var.mongodbatlas_private_key
}

# Cluster Configuration - M60 for production
resource "mongodbatlas_cluster" "main" {
  project_id   = var.atlas_project_id
  name         = "controlia-${var.environment}"
  cluster_type = "REPLICASET"
  
  # MongoDB Version
  mongo_db_major_version = "7.0"
  
  # Cloud Provider and Region
  provider_name = "AWS"
  provider_region_name = "US_EAST_1"
  
  # Instance Size - M60 for production (32 GB RAM, 16 vCPU)
  provider_instance_size_name = "M60"
  
  # Storage
  provider_disk_type_name = "STANDARD"
  disk_size_gb = 500
  
  # Auto-scaling
  auto_scaling_disk_gb_enabled = true
  auto_scaling_compute_enabled = true
  auto_scaling_compute_scale_down_enabled = true
  provider_min_instance_size_name = "M50"
  provider_max_instance_size_name = "M80"
  
  # Backup
  cloud_backup = true
  pit_enabled  = true
  
  # Encryption
  encryption_at_rest_provider = "AWS"
  
  # Labels
  labels {
    key   = "Environment"
    value = var.environment
  }
  
  labels {
    key   = "Project"
    value = "ControlIA"
  }
  
  labels {
    key   = "ManagedBy"
    value = "Terraform"
  }
}

# Database Users
resource "mongodbatlas_database_user" "app_user" {
  username           = "controlia_app"
  password           = random_password.mongodb_app.result
  project_id         = var.atlas_project_id
  auth_database_name = "admin"
  
  roles {
    role_name     = "readWrite"
    database_name = "controlia"
  }
  
  roles {
    role_name     = "readWrite"
    database_name = "controlia_analytics"
  }
  
  labels {
    key   = "Purpose"
    value = "Application"
  }
}

resource "mongodbatlas_database_user" "readonly_user" {
  username           = "controlia_readonly"
  password           = random_password.mongodb_readonly.result
  project_id         = var.atlas_project_id
  auth_database_name = "admin"
  
  roles {
    role_name     = "read"
    database_name = "controlia"
  }
  
  labels {
    key   = "Purpose"
    value = "Analytics"
  }
}

resource "mongodbatlas_database_user" "admin_user" {
  username           = "controlia_admin"
  password           = random_password.mongodb_admin.result
  project_id         = var.atlas_project_id
  auth_database_name = "admin"
  
  roles {
    role_name     = "dbAdmin"
    database_name = "controlia"
  }
  
  roles {
    role_name     = "dbAdmin"
    database_name = "controlia_analytics"
  }
  
  labels {
    key   = "Purpose"
    value = "Administration"
  }
}

# Random Passwords
resource "random_password" "mongodb_app" {
  length  = 32
  special = true
}

resource "random_password" "mongodb_readonly" {
  length  = 32
  special = true
}

resource "random_password" "mongodb_admin" {
  length  = 32
  special = true
}

# IP Access List - VPC Peering recommended for production
resource "mongodbatlas_project_ip_access_list" "vpc_cidr" {
  project_id = var.atlas_project_id
  cidr_block = "10.0.0.0/16"  # Your VPC CIDR
  comment    = "VPC CIDR Block"
}

# Maintenance Window
resource "mongodbatlas_maintenance_window" "main" {
  project_id  = var.atlas_project_id
  day_of_week = 3  # Tuesday
  hour_of_day = 4  # 4 AM UTC
}

# Alert Configuration
resource "mongodbatlas_alert_configuration" "high_cpu" {
  project_id = var.atlas_project_id
  event_type = "OUTSIDE_METRIC_THRESHOLD"
  enabled    = true
  
  metric_threshold_config {
    metric_name = "NORMALIZED_SYSTEM_CPU_USER"
    operator    = "GREATER_THAN"
    threshold   = 80.0
    units       = "RAW"
    mode        = "AVERAGE"
  }
  
  notification {
    type_name     = "EMAIL"
    email_enabled = true
    email_address = "alerts@controlia.com"
  }
}

resource "mongodbatlas_alert_configuration" "high_memory" {
  project_id = var.atlas_project_id
  event_type = "OUTSIDE_METRIC_THRESHOLD"
  enabled    = true
  
  metric_threshold_config {
    metric_name = "NORMALIZED_SYSTEM_MEM_RESIDENT"
    operator    = "GREATER_THAN"
    threshold   = 85.0
    units       = "RAW"
    mode        = "AVERAGE"
  }
  
  notification {
    type_name     = "EMAIL"
    email_enabled = true
    email_address = "alerts@controlia.com"
  }
}

resource "mongodbatlas_alert_configuration" "slow_queries" {
  project_id = var.atlas_project_id
  event_type = "OUTSIDE_METRIC_THRESHOLD"
  enabled    = true
  
  metric_threshold_config {
    metric_name = "QUERY_EXECUTION_TIME"
    operator    = "GREATER_THAN"
    threshold   = 1000.0  # 1 second
    units       = "MILLISECONDS"
    mode        = "AVERAGE"
  }
  
  notification {
    type_name     = "EMAIL"
    email_enabled = true
    email_address = "alerts@controlia.com"
  }
}

# Backup Policy
resource "mongodbatlas_cloud_backup_schedule" "main" {
  project_id   = var.atlas_project_id
  cluster_name = mongodbatlas_cluster.main.name
  
  reference_hour_of_day    = 3
  reference_minute_of_hour = 0
  restore_window_days      = 7
  
  # Daily snapshots
  policy_item_daily {
    frequency_interval = 1
    retention_unit     = "DAYS"
    retention_value    = 7
  }
  
  # Weekly snapshots
  policy_item_weekly {
    frequency_interval = 1  # Sunday
    retention_unit     = "WEEKS"
    retention_value    = 4
  }
  
  # Monthly snapshots
  policy_item_monthly {
    frequency_interval = 1  # First day of month
    retention_unit     = "MONTHS"
    retention_value    = 12
  }
}

# Network Peering (Optional - for private connectivity)
resource "mongodbatlas_network_peering" "aws" {
  accepter_region_name   = "us-east-1"
  project_id             = var.atlas_project_id
  container_id           = mongodbatlas_cluster.main.container_id
  provider_name          = "AWS"
  route_table_cidr_block = "10.0.0.0/16"
  vpc_id                 = "vpc-xxxxxxxx"  # Your VPC ID
  aws_account_id         = "123456789012"   # Your AWS Account ID
}

# Outputs
output "cluster_connection_string" {
  description = "MongoDB Atlas Cluster Connection String"
  value       = mongodbatlas_cluster.main.connection_strings[0].standard_srv
  sensitive   = true
}

output "cluster_id" {
  description = "MongoDB Atlas Cluster ID"
  value       = mongodbatlas_cluster.main.cluster_id
}

output "app_user_password" {
  description = "Application User Password"
  value       = mongodbatlas_database_user.app_user.password
  sensitive   = true
}
