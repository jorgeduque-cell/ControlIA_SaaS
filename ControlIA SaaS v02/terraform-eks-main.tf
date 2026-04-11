# =============================================================================
# TERRAFORM: EKS CONFIGURATION
# Sistema de Agente Empresarial - AWS São Paulo
# =============================================================================

# =============================================================================
# EKS CLUSTER
# =============================================================================
resource "aws_eks_cluster" "main" {
  name     = "${var.project_name}-${var.environment}"
  version  = var.eks_cluster_version
  role_arn = aws_iam_role.eks_cluster.arn
  
  vpc_config {
    subnet_ids              = var.private_app_subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = ["0.0.0.0/0"]
    security_group_ids      = [aws_security_group.eks_cluster.id]
  }
  
  encryption_config {
    provider {
      key_arn = aws_kms_key.eks.arn
    }
    resources = ["secrets"]
  }
  
  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  
  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy,
    aws_iam_role_policy_attachment.eks_vpc_resource_controller,
    aws_cloudwatch_log_group.eks_cluster,
  ]
  
  tags = {
    Name = "${var.project_name}-${var.environment}"
  }
}

# =============================================================================
# EKS CLUSTER IAM ROLE
# =============================================================================
resource "aws_iam_role" "eks_cluster" {
  name = "${var.project_name}-${var.environment}-eks-cluster-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.eks_cluster.name
}

resource "aws_iam_role_policy_attachment" "eks_vpc_resource_controller" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSVPCResourceController"
  role       = aws_iam_role.eks_cluster.name
}

# =============================================================================
# EKS NODE GROUPS
# =============================================================================
resource "aws_eks_node_group" "main" {
  for_each = var.eks_node_groups
  
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = each.key
  node_role_arn   = aws_iam_role.eks_node.arn
  subnet_ids      = var.private_app_subnet_ids
  
  instance_types = each.value.instance_types
  capacity_type  = each.value.capacity_type
  
  scaling_config {
    min_size     = each.value.min_size
    max_size     = each.value.max_size
    desired_size = each.value.desired_size
  }
  
  launch_template {
    name    = aws_launch_template.eks_node[each.key].name
    version = aws_launch_template.eks_node[each.key].latest_version
  }
  
  labels = each.value.labels
  
  dynamic "taint" {
    for_each = each.value.taints
    content {
      key    = taint.value.key
      value  = taint.value.value
      effect = taint.value.effect
    }
  }
  
  depends_on = [
    aws_iam_role_policy_attachment.eks_worker_node_policy,
    aws_iam_role_policy_attachment.eks_cni_policy,
    aws_iam_role_policy_attachment.eks_container_registry_policy,
  ]
  
  tags = {
    Name = "${var.project_name}-${var.environment}-${each.key}"
  }
  
  lifecycle {
    ignore_changes = [scaling_config[0].desired_size]
  }
}

# =============================================================================
# LAUNCH TEMPLATE
# =============================================================================
resource "aws_launch_template" "eks_node" {
  for_each = var.eks_node_groups
  
  name_prefix   = "${var.project_name}-${var.environment}-${each.key}-"
  image_id      = data.aws_ami.eks_worker.id
  instance_type = each.value.instance_types[0]
  
  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = each.value.volume_size
      volume_type           = each.value.volume_type
      iops                  = each.value.volume_type == "gp3" ? 3000 : null
      throughput            = each.value.volume_type == "gp3" ? 125 : null
      encrypted             = true
      kms_key_id            = aws_kms_key.ebs.arn
      delete_on_termination = true
    }
  }
  
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }
  
  monitoring {
    enabled = true
  }
  
  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "${var.project_name}-${var.environment}-${each.key}"
    }
  }
  
  user_data = base64encode(templatefile("${path.module}/templates/userdata.sh", {
    cluster_name        = aws_eks_cluster.main.name
    cluster_endpoint    = aws_eks_cluster.main.endpoint
    cluster_ca_cert     = aws_eks_cluster.main.certificate_authority[0].data
    node_role_arn       = aws_iam_role.eks_node.arn
  }))
}

# =============================================================================
# EKS NODE IAM ROLE
# =============================================================================
resource "aws_iam_role" "eks_node" {
  name = "${var.project_name}-${var.environment}-eks-node-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "eks_worker_node_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.eks_node.name
}

resource "aws_iam_role_policy_attachment" "eks_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.eks_node.name
}

resource "aws_iam_role_policy_attachment" "eks_container_registry_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.eks_node.name
}

resource "aws_iam_role_policy_attachment" "eks_ssm_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  role       = aws_iam_role.eks_node.name
}

resource "aws_iam_role_policy_attachment" "eks_cloudwatch_policy" {
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
  role       = aws_iam_role.eks_node.name
}

# =============================================================================
# EKS ADDONS
# =============================================================================
resource "aws_eks_addon" "vpc_cni" {
  cluster_name = aws_eks_cluster.main.name
  addon_name   = "vpc-cni"
  
  depends_on = [aws_eks_node_group.main]
}

resource "aws_eks_addon" "coredns" {
  cluster_name = aws_eks_cluster.main.name
  addon_name   = "coredns"
  
  depends_on = [aws_eks_node_group.main]
}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name = aws_eks_cluster.main.name
  addon_name   = "kube-proxy"
  
  depends_on = [aws_eks_node_group.main]
}

resource "aws_eks_addon" "ebs_csi_driver" {
  cluster_name = aws_eks_cluster.main.name
  addon_name   = "aws-ebs-csi-driver"
  
  depends_on = [aws_eks_node_group.main]
}

resource "aws_eks_addon" "efs_csi_driver" {
  cluster_name = aws_eks_cluster.main.name
  addon_name   = "aws-efs-csi-driver"
  
  depends_on = [aws_eks_node_group.main]
}

# =============================================================================
# EKS SECURITY GROUP
# =============================================================================
resource "aws_security_group" "eks_cluster" {
  name_prefix = "${var.project_name}-${var.environment}-eks-cluster-"
  vpc_id      = var.vpc_id
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "${var.project_name}-${var.environment}-eks-cluster-sg"
  }
}

# =============================================================================
# CLOUDWATCH LOG GROUP
# =============================================================================
resource "aws_cloudwatch_log_group" "eks_cluster" {
  name              = "/aws/eks/${var.project_name}-${var.environment}/cluster"
  retention_in_days = 30
  
  tags = {
    Name = "${var.project_name}-${var.environment}-eks-logs"
  }
}

# =============================================================================
# KMS KEYS
# =============================================================================
resource "aws_kms_key" "eks" {
  description             = "EKS Secret Encryption Key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  
  tags = {
    Name = "${var.project_name}-${var.environment}-eks-kms"
  }
}

resource "aws_kms_key" "ebs" {
  description             = "EBS Encryption Key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  
  tags = {
    Name = "${var.project_name}-${var.environment}-ebs-kms"
  }
}

# =============================================================================
# DATA SOURCES
# =============================================================================
data "aws_ami" "eks_worker" {
  most_recent = true
  owners      = ["amazon"]
  
  filter {
    name   = "name"
    values = ["amazon-eks-node-${var.eks_cluster_version}-v*"]
  }
  
  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

# =============================================================================
# VARIABLES (passed from root module)
# =============================================================================
variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_app_subnet_ids" {
  description = "Private app subnet IDs"
  type        = list(string)
}

# =============================================================================
# OUTPUTS
# =============================================================================
output "cluster_name" {
  description = "EKS cluster name"
  value       = aws_eks_cluster.main.name
}

output "cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = aws_eks_cluster.main.endpoint
}

output "cluster_certificate_authority_data" {
  description = "EKS cluster CA certificate"
  value       = aws_eks_cluster.main.certificate_authority[0].data
}

output "cluster_oidc_issuer_url" {
  description = "EKS cluster OIDC issuer URL"
  value       = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

output "node_group_names" {
  description = "EKS node group names"
  value       = [for ng in aws_eks_node_group.main : ng.node_group_name]
}
