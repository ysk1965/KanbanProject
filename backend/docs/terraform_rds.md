# ============================================
# RDS Aurora PostgreSQL Module
# ============================================

variable "app_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "security_group_ids" {
  type = list(string)
}

variable "instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "database_name" {
  type = string
}

variable "master_username" {
  type = string
}

variable "backup_retention_period" {
  type    = number
  default = 7
}

variable "preferred_backup_window" {
  type    = string
  default = "03:00-04:00"
}

variable "multi_az" {
  type    = bool
  default = true
}

# ============================================
# Subnet Group
# ============================================

resource "aws_db_subnet_group" "main" {
  name       = "${var.app_name}-${var.environment}-db-subnet"
  subnet_ids = var.subnet_ids
  
  tags = {
    Name = "${var.app_name}-${var.environment}-db-subnet-group"
  }
}

# ============================================
# Random Password
# ============================================

resource "random_password" "master" {
  length  = 32
  special = false
}

# ============================================
# Aurora Cluster
# ============================================

resource "aws_rds_cluster" "main" {
  cluster_identifier = "${var.app_name}-${var.environment}"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned"
  engine_version     = "15.4"
  database_name      = var.database_name
  master_username    = var.master_username
  master_password    = random_password.master.result
  
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = var.security_group_ids
  
  backup_retention_period = var.backup_retention_period
  preferred_backup_window = var.preferred_backup_window
  
  skip_final_snapshot = var.environment != "prod"
  final_snapshot_identifier = var.environment == "prod" ? "${var.app_name}-${var.environment}-final-snapshot" : null
  
  storage_encrypted = true
  
  serverlessv2_scaling_configuration {
    min_capacity = 0.5
    max_capacity = 4.0
  }
  
  tags = {
    Name = "${var.app_name}-${var.environment}-aurora-cluster"
  }
}

# ============================================
# Aurora Instance
# ============================================

resource "aws_rds_cluster_instance" "main" {
  count = var.multi_az ? 2 : 1
  
  identifier         = "${var.app_name}-${var.environment}-${count.index}"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version
  
  publicly_accessible = false
  
  tags = {
    Name = "${var.app_name}-${var.environment}-aurora-instance-${count.index}"
  }
}

# ============================================
# Store Password in Secrets Manager
# ============================================

resource "aws_secretsmanager_secret" "db_password" {
  name = "${var.app_name}/${var.environment}/db-password"
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id = aws_secretsmanager_secret.db_password.id
  secret_string = jsonencode({
    username = var.master_username
    password = random_password.master.result
    host     = aws_rds_cluster.main.endpoint
    port     = 5432
    database = var.database_name
  })
}

# ============================================
# Outputs
# ============================================

output "cluster_id" {
  value = aws_rds_cluster.main.id
}

output "endpoint" {
  value = aws_rds_cluster.main.endpoint
}

output "reader_endpoint" {
  value = aws_rds_cluster.main.reader_endpoint
}

output "connection_string" {
  value     = "postgresql://${var.master_username}:${random_password.master.result}@${aws_rds_cluster.main.endpoint}:5432/${var.database_name}"
  sensitive = true
}

output "secret_arn" {
  value = aws_secretsmanager_secret.db_password.arn
}