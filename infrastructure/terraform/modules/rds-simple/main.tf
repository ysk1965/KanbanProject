# RDS Simple Module for KanbanProject
# Standard PostgreSQL RDS (cost-effective alternative to Aurora)

# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name        = "${var.project_name}-${var.environment}-db-subnet"
  description = "Database subnet group for ${var.project_name}"
  subnet_ids  = var.subnet_ids

  tags = {
    Name        = "${var.project_name}-${var.environment}-db-subnet"
    Environment = var.environment
  }
}

# RDS Instance
resource "aws_db_instance" "main" {
  identifier          = "${var.project_name}-${var.environment}-db"
  snapshot_identifier = var.snapshot_identifier != "" ? var.snapshot_identifier : null
  engine              = "postgres"
  engine_version      = var.engine_version
  instance_class      = var.instance_class

  auto_minor_version_upgrade = var.auto_minor_version_upgrade

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_key_id != "" ? var.kms_key_id : null

  db_name  = var.database_name
  username = var.master_username
  password = var.master_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.security_group_id]
  publicly_accessible    = var.publicly_accessible

  backup_retention_period = var.backup_retention_period
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:00-sun:05:00"

  # ⚠️ 삭제 보호/최종 스냅샷은 환경 "이름"이 아니라 명시적 플래그로 제어한다.
  # (라이브 트래픽을 서빙하는 환경이 반드시 "prod"로 명명되지는 않는다 — 실제 운영은 dev 환경)
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.project_name}-${var.environment}-final"
  deletion_protection       = var.deletion_protection != null ? var.deletion_protection : true

  performance_insights_enabled = false # Cost saving

  tags = {
    Name        = "${var.project_name}-${var.environment}-db"
    Environment = var.environment
  }
}
