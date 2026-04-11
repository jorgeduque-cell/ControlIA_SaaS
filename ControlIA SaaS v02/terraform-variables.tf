# =============================================================================
# TERRAFORM VARIABLES
# Sistema de Agente Empresarial - AWS São Paulo
# =============================================================================

# =============================================================================
# GENERAL
# =============================================================================
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "sa-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
  
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "agentes-enterprise"
}

# =============================================================================
# VPC
# =============================================================================
variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

# =============================================================================
# EKS
# =============================================================================
variable "eks_cluster_version" {
  description = "EKS Kubernetes version"
  type        = string
  default     = "1.29"
}

variable "eks_node_groups" {
  description = "EKS node groups configuration"
  type = map(object({
    instance_types       = list(string)
    min_size             = number
    max_size             = number
    desired_size         = number
    capacity_type        = string
    volume_size          = number
    volume_type          = string
    labels               = map(string)
    taints               = list(object({
      key    = string
      value  = string
      effect = string
    }))
  }))
  
  default = {
    general-workloads = {
      instance_types = ["m6i.2xlarge"]
      min_size       = 3
      max_size       = 12
      desired_size   = 6
      capacity_type  = "ON_DEMAND"
      volume_size    = 100
      volume_type    = "gp3"
      labels = {
        workload  = "general"
        critical  = "true"
      }
      taints = []
    }
    
    ai-workloads = {
      instance_types = ["g5.2xlarge"]
      min_size       = 0
      max_size       = 6
      desired_size   = 2
      capacity_type  = "ON_DEMAND"
      volume_size    = 200
      volume_type    = "gp3"
      labels = {
        workload = "ai"
        gpu      = "true"
      }
      taints = [
        {
          key    = "nvidia.com/gpu"
          value  = "true"
          effect = "NoSchedule"
        }
      ]
    }
    
    spot-workloads = {
      instance_types = ["m6i.xlarge", "m5.xlarge", "c6i.xlarge"]
      min_size       = 0
      max_size       = 50
      desired_size   = 10
      capacity_type  = "SPOT"
      volume_size    = 50
      volume_type    = "gp3"
      labels = {
        workload      = "spot"
        interruptible = "true"
      }
      taints = [
        {
          key    = "spot"
          value  = "true"
          effect = "NoSchedule"
        }
      ]
    }
  }
}

# =============================================================================
# RDS
# =============================================================================
variable "rds_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.r6g.2xlarge"
}

variable "rds_engine_version" {
  description = "RDS PostgreSQL engine version"
  type        = string
  default     = "15.4"
}

variable "rds_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 500
}

variable "rds_max_allocated_storage" {
  description = "RDS max allocated storage in GB"
  type        = number
  default     = 2000
}

variable "rds_database_name" {
  description = "RDS database name"
  type        = string
  default     = "agentes_enterprise"
}

variable "rds_master_username" {
  description = "RDS master username"
  type        = string
  default     = "postgres_admin"
}

variable "rds_multi_az" {
  description = "Enable RDS Multi-AZ"
  type        = bool
  default     = true
}

variable "rds_backup_retention_period" {
  description = "RDS backup retention period in days"
  type        = number
  default     = 35
}

# =============================================================================
# ELASTICACHE
# =============================================================================
variable "elasticache_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.r6g.xlarge"
}

variable "elasticache_engine_version" {
  description = "ElastiCache Redis engine version"
  type        = string
  default     = "7.1"
}

variable "elasticache_num_cache_nodes" {
  description = "Number of ElastiCache nodes"
  type        = number
  default     = 3
}

# =============================================================================
# S3
# =============================================================================
variable "s3_buckets" {
  description = "S3 buckets configuration"
  type = map(object({
    versioning_enabled = bool
    encryption_enabled = bool
    public_access_blocked = bool
    lifecycle_rules = list(object({
      id          = string
      enabled     = bool
      transition = list(object({
        days          = number
        storage_class = string
      }))
      expiration = object({
        days = number
      })
    }))
  }))
  
  default = {
    assets = {
      versioning_enabled    = true
      encryption_enabled    = true
      public_access_blocked = true
      lifecycle_rules = [
        {
          id      = "transition-to-ia"
          enabled = true
          transition = [
            {
              days          = 90
              storage_class = "STANDARD_IA"
            },
            {
              days          = 365
              storage_class = "GLACIER"
            }
          ]
          expiration = {
            days = 2555  # 7 years
          }
        }
      ]
    }
    
    data = {
      versioning_enabled    = true
      encryption_enabled    = true
      public_access_blocked = true
      lifecycle_rules = [
        {
          id      = "transition-to-ia"
          enabled = true
          transition = [
            {
              days          = 30
              storage_class = "STANDARD_IA"
            }
          ]
          expiration = {
            days = 2555
          }
        }
      ]
    }
    
    logs = {
      versioning_enabled    = false
      encryption_enabled    = true
      public_access_blocked = true
      lifecycle_rules = [
        {
          id      = "logs-lifecycle"
          enabled = true
          transition = [
            {
              days          = 30
              storage_class = "STANDARD_IA"
            },
            {
              days          = 90
              storage_class = "GLACIER"
            }
          ]
          expiration = {
            days = 2555
          }
        }
      ]
    }
  }
}

# =============================================================================
# MSK (KAFKA)
# =============================================================================
variable "msk_instance_type" {
  description = "MSK broker instance type"
  type        = string
  default     = "kafka.m5.large"
}

variable "msk_number_of_broker_nodes" {
  description = "Number of MSK broker nodes"
  type        = number
  default     = 6
}

variable "msk_volume_size" {
  description = "MSK EBS volume size in GB"
  type        = number
  default     = 1000
}

# =============================================================================
# OPENSEARCH
# =============================================================================
variable "opensearch_instance_type" {
  description = "OpenSearch instance type"
  type        = string
  default     = "r6g.large.search"
}

variable "opensearch_instance_count" {
  description = "Number of OpenSearch instances"
  type        = number
  default     = 3
}

variable "opensearch_volume_size" {
  description = "OpenSearch EBS volume size in GB"
  type        = number
  default     = 500
}

# =============================================================================
# CLOUDFRONT
# =============================================================================
variable "cloudfront_enabled" {
  description = "Enable CloudFront"
  type        = bool
  default     = true
}

variable "cloudfront_price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_All"
}

# =============================================================================
# WAF
# =============================================================================
variable "waf_enabled" {
  description = "Enable WAF"
  type        = bool
  default     = true
}

# =============================================================================
# TAGS
# =============================================================================
variable "common_tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default = {
    Project     = "agentes-enterprise"
    ManagedBy   = "terraform"
    CostCenter  = "engineering"
    Compliance  = "soc2,iso27001"
  }
}
