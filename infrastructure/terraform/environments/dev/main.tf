# Dev Environment - Low Cost Configuration
# Optimized for development with minimal costs (~$45-50/month)
#
# Cost Savings:
# - No NAT Gateway (EC2 in public subnet)
# - Standard RDS t4g.micro instead of Aurora Serverless
# - No ElastiCache (using Spring Simple Cache)

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "kanban-terraform-state"
    key            = "dev/terraform.tfstate"
    region         = "ap-northeast-2"
    encrypt        = true
    dynamodb_table = "kanban-terraform-lock"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Provider for ACM certificate (CloudFront requires us-east-1)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# VPC Module - No NAT Gateway for cost savings
module "vpc" {
  source = "../../modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  enable_nat_gateway = false  # Cost saving: No NAT Gateway
}

# Security Groups Module
module "security_groups" {
  source = "../../modules/security-groups"

  project_name = var.project_name
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id
}

# RDS Simple Module - Cost effective PostgreSQL
module "rds" {
  source = "../../modules/rds-simple"

  project_name      = var.project_name
  environment       = var.environment
  subnet_ids        = module.vpc.private_subnet_ids
  security_group_id = module.security_groups.rds_security_group_id
  master_password   = var.db_password

  instance_class          = "db.t4g.micro"  # Free tier eligible
  allocated_storage       = 20
  backup_retention_period = 1               # Minimal backup for dev
}

# Elastic Beanstalk Module - Public Subnet (no NAT needed)
module "elastic_beanstalk" {
  source = "../../modules/elastic-beanstalk"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  public_subnet_ids     = module.vpc.public_subnet_ids
  private_subnet_ids    = module.vpc.public_subnet_ids  # Use public subnets for EC2 (no NAT)
  alb_security_group_id = module.security_groups.alb_security_group_id
  ec2_security_group_id = module.security_groups.eb_ec2_security_group_id

  instance_type       = "t3.small"
  min_instances       = 1
  max_instances       = 2
  associate_public_ip = "true"  # Public subnet, no NAT

  spring_profile = "dev"
  database_url   = module.rds.jdbc_url
  db_username    = "kanban_admin"
  db_password    = var.db_password
  redis_host     = ""      # No Redis - using Simple Cache
  redis_port     = ""
  jwt_secret     = var.jwt_secret
  frontend_url   = var.domain_name != "" ? "https://${var.domain_name}" : module.s3_cloudfront.cloudfront_url

  ssl_certificate_arn = var.domain_name != "" ? module.acm_certificate_alb[0].validated_certificate_arn : ""

  depends_on = [module.rds, module.acm_certificate_alb]
}

# ACM Certificate (ap-northeast-2 for ALB)
module "acm_certificate_alb" {
  count  = var.domain_name != "" ? 1 : 0
  source = "../../modules/acm-certificate"

  project_name              = var.project_name
  environment               = "${var.environment}-alb"
  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
}

# ACM Certificate Module (us-east-1 for CloudFront)
module "acm_certificate" {
  count  = var.domain_name != "" ? 1 : 0
  source = "../../modules/acm-certificate"

  providers = {
    aws = aws.us_east_1
  }

  project_name              = var.project_name
  environment               = var.environment
  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
}

# Route 53 Hosted Zone
module "route53" {
  count  = var.domain_name != "" ? 1 : 0
  source = "../../modules/route53"

  project_name = var.project_name
  environment  = var.environment
  domain_name  = var.domain_name
}

# S3 + CloudFront Module
module "s3_cloudfront" {
  source = "../../modules/s3-cloudfront"

  project_name        = var.project_name
  environment         = var.environment
  acm_certificate_arn = var.domain_name != "" ? module.acm_certificate[0].validated_certificate_arn : ""
  domain_aliases      = var.domain_name != "" ? [var.domain_name, "www.${var.domain_name}"] : []

  depends_on = [module.acm_certificate]
}

# ACM Certificate Validation Records (ALB - ap-northeast-2)
resource "aws_route53_record" "cert_validation_alb" {
  for_each = var.domain_name != "" ? {
    for dvo in module.acm_certificate_alb[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = module.route53[0].zone_id
}

# ACM Certificate Validation Records (CloudFront - us-east-1)
resource "aws_route53_record" "cert_validation" {
  for_each = var.domain_name != "" ? {
    for dvo in module.acm_certificate[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = module.route53[0].zone_id
}

# Frontend Domain Records
resource "aws_route53_record" "frontend_root" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = module.route53[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = module.s3_cloudfront.cloudfront_domain_name
    zone_id                = module.s3_cloudfront.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [module.s3_cloudfront]
}

resource "aws_route53_record" "frontend_www" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = module.route53[0].zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.s3_cloudfront.cloudfront_domain_name
    zone_id                = module.s3_cloudfront.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [module.s3_cloudfront]
}

# Backend API Domain Record
resource "aws_route53_record" "backend_api" {
  count = var.domain_name != "" ? 1 : 0

  zone_id = module.route53[0].zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.elastic_beanstalk.alb_dns_name
    zone_id                = module.elastic_beanstalk.alb_zone_id
    evaluate_target_health = true
  }

  depends_on = [module.elastic_beanstalk]
}
