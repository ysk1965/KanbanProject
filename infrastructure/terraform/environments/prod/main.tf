# Production Environment - Phase 1 (Cost-Effective)
# Optimized for early-stage production (~$75-95/month)
#
# Phase 1 Cost Savings vs Full Prod:
# - Standard RDS t4g.micro instead of Aurora Serverless v2 (saves ~$130-230/month)
# - No NAT Gateway, EC2 in public subnet (saves ~$36/month)
# - ElastiCache t4g.micro single node (saves ~$28-38/month)
# - EB min 1 instance (saves ~$25-65/month)
#
# Production Safeguards Retained:
# - RDS deletion protection enabled
# - RDS 3-day backup retention + final snapshot
# - CloudWatch logging enabled
# - Enhanced health reporting
#
# Phase 2 Upgrade Path (when needed):
# - Enable Multi-AZ RDS (set multi_az = true)
# - Add NAT Gateway (set enable_nat_gateway = true, move EC2 to private subnets)
# - Scale ElastiCache (increase num_cache_clusters to 2)
# - Scale EB (increase min_instances to 2)

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment after creating S3 bucket
  # backend "s3" {
  #   bucket         = "kanban-terraform-state"
  #   key            = "prod/terraform.tfstate"
  #   region         = "ap-northeast-2"
  #   encrypt        = true
  #   dynamodb_table = "kanban-terraform-lock"
  # }
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

# VPC Module - No NAT Gateway for Phase 1 cost savings
module "vpc" {
  source = "../../modules/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  enable_nat_gateway = false  # Phase 1: No NAT Gateway (~$36/month saving)
}

# Security Groups Module
module "security_groups" {
  source = "../../modules/security-groups"

  project_name = var.project_name
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id
}

# RDS Simple Module - Phase 1: Standard PostgreSQL (cost-effective)
# Phase 2+: Switch to ../../modules/rds (Aurora Serverless v2) when scaling needed
module "rds" {
  source = "../../modules/rds-simple"

  project_name      = var.project_name
  environment       = var.environment
  subnet_ids        = module.vpc.private_subnet_ids
  security_group_id = module.security_groups.rds_security_group_id
  master_password   = var.db_password

  instance_class          = "db.t4g.micro"  # Phase 1: Cost-effective
  allocated_storage       = 20
  backup_retention_period = 3               # Prod: 3-day backup (vs dev 1-day)
}

# ElastiCache Module - Phase 1: Single node (cache + WebSocket Pub/Sub)
module "elasticache" {
  source = "../../modules/elasticache"

  project_name       = var.project_name
  environment        = var.environment
  private_subnet_ids = module.vpc.private_subnet_ids
  security_group_id  = module.security_groups.redis_security_group_id
  node_type          = "cache.t4g.micro"  # Phase 1: Single micro node
  num_cache_clusters = 1                  # Phase 1: No Multi-AZ
}

# Elastic Beanstalk Module - Phase 1: Public Subnet, min 1 instance
module "elastic_beanstalk" {
  source = "../../modules/elastic-beanstalk"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  public_subnet_ids     = module.vpc.public_subnet_ids
  private_subnet_ids    = module.vpc.public_subnet_ids  # Phase 1: Use public subnets (no NAT)
  alb_security_group_id = module.security_groups.alb_security_group_id
  ec2_security_group_id = module.security_groups.eb_ec2_security_group_id

  instance_type       = "t3.small"
  min_instances       = 1    # Phase 1: Single instance
  max_instances       = 2    # Phase 1: Scale up to 2 if needed
  associate_public_ip = "true"  # Phase 1: Public subnet, no NAT

  spring_profile = "prod"
  database_url   = module.rds.jdbc_url
  db_username    = "kanban_admin"
  db_password    = var.db_password
  redis_host     = module.elasticache.redis_endpoint
  redis_port     = "6379"
  jwt_secret     = var.jwt_secret
  claude_api_key   = var.claude_api_key
  openai_api_key   = var.openai_api_key
  openai_admin_key = var.openai_admin_key
  mail_username    = var.mail_username
  mail_password   = var.mail_password
  google_client_id = var.google_client_id
  frontend_url   = var.domain_name != "" ? "https://${var.domain_name}" : module.s3_cloudfront.cloudfront_url

  ssl_certificate_arn = var.domain_name != "" ? module.acm_certificate_alb[0].validated_certificate_arn : ""

  cloudfront_domain = aws_cloudfront_distribution.attachments.domain_name

  # Polar.sh Payment
  polar_api_key               = var.polar_api_key
  polar_webhook_secret        = var.polar_webhook_secret
  polar_org_id                = var.polar_org_id
  polar_product_board_monthly = var.polar_product_board_monthly
  polar_product_board_yearly  = var.polar_product_board_yearly
  polar_product_org_monthly   = var.polar_product_org_monthly
  polar_product_org_yearly    = var.polar_product_org_yearly
  polar_product_credit_100    = var.polar_product_credit_100
  polar_product_credit_500    = var.polar_product_credit_500
  polar_product_credit_1000   = var.polar_product_credit_1000

  # Discord Integration
  discord_client_id     = var.discord_client_id
  discord_client_secret = var.discord_client_secret
  discord_bot_token     = var.discord_bot_token
  discord_redirect_uri  = var.discord_redirect_uri

  # Slack App Integration
  slack_client_id            = var.slack_client_id
  slack_client_secret        = var.slack_client_secret
  slack_signing_secret       = var.slack_signing_secret
  slack_token_encryption_key = var.slack_token_encryption_key
  slack_redirect_uri         = var.slack_redirect_uri
  slack_user_redirect_uri    = var.slack_user_redirect_uri

  depends_on = [module.rds, module.elasticache, module.acm_certificate_alb]
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

# ─── S3 Attachments CloudFront ───

data "aws_s3_bucket" "attachments" {
  bucket = "bridge-kanban-attachments"
}

# NOTE: S3 Lifecycle & Intelligent-Tiering은 dev 환경에서 관리 (동일 버킷 공유)

resource "aws_cloudfront_origin_access_control" "attachments" {
  name                              = "${var.project_name}-${var.environment}-attachments-oac"
  description                       = "OAC for attachments S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_response_headers_policy" "attachments_cors" {
  name = "${var.project_name}-${var.environment}-attachments-cors"

  cors_config {
    access_control_allow_credentials = false

    access_control_allow_headers {
      items = ["*"]
    }

    access_control_allow_methods {
      items = ["GET", "HEAD"]
    }

    access_control_allow_origins {
      items = [
        "https://bridgespots.com",
        "https://www.bridgespots.com",
        "https://milkyway.pe.kr",
        "https://www.milkyway.pe.kr",
        "http://localhost:5173",
        "http://localhost:5174",
      ]
    }

    access_control_max_age_sec = 86400

    origin_override = true
  }
}

resource "aws_cloudfront_distribution" "attachments" {
  enabled         = true
  is_ipv6_enabled = true
  price_class     = "PriceClass_100"
  comment         = "${var.project_name} ${var.environment} attachments CDN"

  origin {
    domain_name              = data.aws_s3_bucket.attachments.bucket_regional_domain_name
    origin_id                = "S3-attachments"
    origin_access_control_id = aws_cloudfront_origin_access_control.attachments.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-attachments"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"]
      cookies {
        forward = "none"
      }
    }

    response_headers_policy_id = aws_cloudfront_response_headers_policy.attachments_cors.id

    min_ttl     = 0
    default_ttl = 86400    # 1 day
    max_ttl     = 31536000 # 1 year
  }

  # 댓글 첨부파일 - 30일 캐시 (UUID 기반 immutable 파일)
  ordered_cache_behavior {
    path_pattern           = "comments/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-attachments"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"]
      cookies {
        forward = "none"
      }
    }

    response_headers_policy_id = aws_cloudfront_response_headers_policy.attachments_cors.id

    min_ttl     = 86400     # 1 day minimum
    default_ttl = 2592000   # 30 days
    max_ttl     = 31536000  # 1 year
  }

  # 커스텀 아이콘 - 30일 캐시 (immutable)
  ordered_cache_behavior {
    path_pattern           = "customicon/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-attachments"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"]
      cookies {
        forward = "none"
      }
    }

    response_headers_policy_id = aws_cloudfront_response_headers_policy.attachments_cors.id

    min_ttl     = 86400     # 1 day minimum
    default_ttl = 2592000   # 30 days
    max_ttl     = 31536000  # 1 year
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-attachments-cdn"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_policy" "attachments" {
  bucket = data.aws_s3_bucket.attachments.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontAccess"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${data.aws_s3_bucket.attachments.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.attachments.arn
          }
        }
      }
    ]
  })
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

# S3 + CloudFront Module
module "s3_cloudfront" {
  source = "../../modules/s3-cloudfront"

  project_name        = var.project_name
  environment         = var.environment
  price_class         = "PriceClass_100"  # Phase 1: North America + Europe only
  acm_certificate_arn = var.domain_name != "" ? module.acm_certificate[0].validated_certificate_arn : ""
  domain_aliases      = var.domain_name != "" ? [var.domain_name, "www.${var.domain_name}"] : []

  depends_on = [module.acm_certificate]
}
