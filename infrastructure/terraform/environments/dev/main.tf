# Dev Environment - Low Cost Configuration
# Optimized for development with minimal costs (~$60/month)
#
# Cost Savings:
# - No NAT Gateway (EC2 in public subnet)
# - Standard RDS t4g.micro instead of Aurora Serverless
# - ElastiCache t4g.micro single node (Redis cache + WebSocket Pub/Sub)

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "kanban-terraform-state-259151461692"
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

# Provider for Route53 DNS records — optionally assumes a role in ANOTHER AWS
# account so the hosted zone can stay in the legacy account during/after an
# account migration (Pattern A). Empty dns_account_role_arn = this account.
provider "aws" {
  alias  = "dns"
  region = var.aws_region

  dynamic "assume_role" {
    for_each = var.dns_account_role_arn != "" ? [1] : []
    content {
      role_arn     = var.dns_account_role_arn
      session_name = "${var.project_name}-${var.environment}-route53"
    }
  }

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
  enable_nat_gateway = false # Cost saving: No NAT Gateway
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
  master_password   = local.secret.db_password

  instance_class          = "db.t4g.micro" # Free tier eligible
  allocated_storage       = 20
  backup_retention_period = 1 # Minimal backup for dev

  # Cross-account migration: CMK-encrypted restore + clean terraform import
  engine_version      = var.rds_engine_version
  kms_key_id          = var.rds_kms_key_id
  deletion_protection = var.rds_deletion_protection
  snapshot_identifier = var.rds_snapshot_identifier
}

# Infrastructure Scheduler - Off-peak shutdown (KST 01:00~09:00)
# Saves ~$10/month by stopping EC2 (EB) and RDS during night hours
module "infra_scheduler" {
  source = "../../modules/infra-scheduler"

  project_name        = var.project_name
  environment         = var.environment
  enabled             = true
  shutdown_cron       = "cron(0 16 ? * * *)" # KST 01:00 = UTC 16:00
  startup_cron        = "cron(0 0 ? * * *)"  # KST 09:00 = UTC 00:00
  eb_environment_name = module.elastic_beanstalk.environment_name
  eb_min_instances    = 1
  eb_max_instances    = 2
  rds_instance_id     = "${var.project_name}-${var.environment}-db"
  notification_email  = var.notification_email

  depends_on = [module.elastic_beanstalk, module.rds]
}

# ElastiCache Module - DISABLED (using Simple Cache instead, ~$11.50/mo savings)
# To re-enable: uncomment this block and set redis_host = module.elasticache.redis_endpoint in EB module
# module "elasticache" {
#   source = "../../modules/elasticache"
#
#   project_name       = var.project_name
#   environment        = var.environment
#   private_subnet_ids = module.vpc.private_subnet_ids
#   security_group_id  = module.security_groups.redis_security_group_id
#   node_type          = "cache.t4g.micro"
#   num_cache_clusters = 1
# }

# Elastic Beanstalk Module - Public Subnet (no NAT needed)
# ─── App secrets: SSM SecureString source-of-truth ───
# use_ssm_secrets=true → read from SSM (${var.ssm_secret_prefix}/<key>); false → legacy tfvars/TF_VAR.
# Pulls raw secrets out of tfvars/CI and separates dev/prod, with no app change.
# Reads whatever is seeded under the prefix (tolerant of partial seeding).
data "aws_ssm_parameters_by_path" "app_secrets" {
  count           = var.use_ssm_secrets ? 1 : 0
  path            = var.ssm_secret_prefix
  with_decryption = true
}

locals {
  # name (/kanban/<env>/<key>) → value, only for params that actually exist in SSM
  ssm_map = var.use_ssm_secrets ? zipmap(
    [for n in data.aws_ssm_parameters_by_path.app_secrets[0].names : basename(n)],
    data.aws_ssm_parameters_by_path.app_secrets[0].values
  ) : {}

  # SSM value if seeded, else fall back to the var (tfvars/CI). Per-key tolerant.
  secret = {
    db_password                = lookup(local.ssm_map, "db_password", var.db_password)
    jwt_secret                 = lookup(local.ssm_map, "jwt_secret", var.jwt_secret)
    claude_api_key             = lookup(local.ssm_map, "claude_api_key", var.claude_api_key)
    openai_api_key             = lookup(local.ssm_map, "openai_api_key", var.openai_api_key)
    openai_admin_key           = lookup(local.ssm_map, "openai_admin_key", var.openai_admin_key)
    mail_username              = lookup(local.ssm_map, "mail_username", var.mail_username)
    mail_password              = lookup(local.ssm_map, "mail_password", var.mail_password)
    polar_api_key              = lookup(local.ssm_map, "polar_api_key", var.polar_api_key)
    polar_webhook_secret       = lookup(local.ssm_map, "polar_webhook_secret", var.polar_webhook_secret)
    discord_client_secret      = lookup(local.ssm_map, "discord_client_secret", var.discord_client_secret)
    discord_bot_token          = lookup(local.ssm_map, "discord_bot_token", var.discord_bot_token)
    slack_client_secret        = lookup(local.ssm_map, "slack_client_secret", var.slack_client_secret)
    slack_signing_secret       = lookup(local.ssm_map, "slack_signing_secret", var.slack_signing_secret)
    slack_token_encryption_key = lookup(local.ssm_map, "slack_token_encryption_key", var.slack_token_encryption_key)
    google_client_secret       = lookup(local.ssm_map, "google_client_secret", var.google_client_secret)
    sentry_dsn                 = lookup(local.ssm_map, "sentry_dsn", var.sentry_dsn)
  }
}

module "elastic_beanstalk" {
  source = "../../modules/elastic-beanstalk"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.vpc.vpc_id
  public_subnet_ids     = module.vpc.public_subnet_ids
  private_subnet_ids    = module.vpc.public_subnet_ids # Use public subnets for EC2 (no NAT)
  alb_security_group_id = module.security_groups.alb_security_group_id
  ec2_security_group_id = module.security_groups.eb_ec2_security_group_id

  instance_type       = "t3.small"
  min_instances       = 1
  max_instances       = 2
  associate_public_ip = "true" # Public subnet, no NAT

  spring_profile        = "dev"
  database_url          = module.rds.jdbc_url
  db_username           = "kanban_admin"
  db_password           = local.secret.db_password
  redis_host            = ""
  redis_port            = ""
  jwt_secret            = local.secret.jwt_secret
  claude_api_key        = local.secret.claude_api_key
  openai_api_key        = local.secret.openai_api_key
  openai_admin_key      = local.secret.openai_admin_key
  mail_username         = local.secret.mail_username
  mail_password         = local.secret.mail_password
  google_client_id      = var.google_client_id
  google_client_secret  = local.secret.google_client_secret
  frontend_url          = var.domain_name != "" ? "https://${var.domain_name}" : module.s3_cloudfront.cloudfront_url
  testprod_frontend_url = var.testprod_frontend_url

  # App config / observability
  ai_provider        = var.ai_provider
  sentry_dsn         = local.secret.sentry_dsn
  sentry_environment = var.environment

  ssl_certificate_arn = var.domain_name != "" ? module.acm_certificate_alb[0].validated_certificate_arn : ""

  cloudfront_domain = aws_cloudfront_distribution.attachments.domain_name
  s3_bucket         = var.attachments_bucket_name

  # Polar.sh Payment
  polar_api_key               = local.secret.polar_api_key
  polar_webhook_secret        = local.secret.polar_webhook_secret
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
  discord_client_secret = local.secret.discord_client_secret
  discord_bot_token     = local.secret.discord_bot_token
  discord_redirect_uri  = var.discord_redirect_uri

  # Slack App Integration
  slack_client_id            = var.slack_client_id
  slack_client_secret        = local.secret.slack_client_secret
  slack_signing_secret       = local.secret.slack_signing_secret
  slack_token_encryption_key = local.secret.slack_token_encryption_key
  slack_redirect_uri         = var.slack_redirect_uri
  slack_user_redirect_uri    = var.slack_user_redirect_uri

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

  project_name = var.project_name
  environment  = var.environment
  domain_name  = var.domain_name
  # Single CloudFront serves BOTH bridgespots.com and milkyway.pe.kr (Host-based
  # spa_router). One distribution = one viewer cert, so the cert must SAN-cover
  # both domains. Validation records are routed per-zone in cert_validation below.
  subject_alternative_names = concat(
    ["*.${var.domain_name}"],
    var.secondary_domain_name != "" ? [var.secondary_domain_name, "*.${var.secondary_domain_name}"] : []
  )
}

# ─── Route 53 Hosted Zone ───
# Pattern A — the hosted zone may live in a DIFFERENT (legacy) AWS account:
#   dns_account_role_arn == ""  → create & manage the zone in THIS account
#   dns_account_role_arn != ""  → zone stays in the other account; we only look
#                                 it up and write records via the aws.dns provider
module "route53" {
  count  = var.domain_name != "" && var.dns_account_role_arn == "" ? 1 : 0
  source = "../../modules/route53"

  project_name = var.project_name
  environment  = var.environment
  domain_name  = var.domain_name
}

# Cross-account: look up the existing hosted zone in the legacy account
data "aws_route53_zone" "primary" {
  count    = var.domain_name != "" && var.dns_account_role_arn != "" ? 1 : 0
  provider = aws.dns
  name     = var.domain_name
}

locals {
  # Resolves to the in-account zone OR the cross-account zone, whichever applies
  primary_zone_id = var.dns_account_role_arn != "" ? one(data.aws_route53_zone.primary[*].zone_id) : one(module.route53[*].zone_id)
}

# S3 + CloudFront Module
module "s3_cloudfront" {
  source = "../../modules/s3-cloudfront"

  bucket_name = var.frontend_bucket_name

  project_name        = var.project_name
  environment         = var.environment
  acm_certificate_arn = var.domain_name != "" ? module.acm_certificate[0].validated_certificate_arn : ""
  domain_aliases = var.domain_name != "" ? concat(
    [var.domain_name, "www.${var.domain_name}"],
    var.secondary_domain_name != "" ? [var.secondary_domain_name, "www.${var.secondary_domain_name}"] : []
  ) : []

  depends_on = [module.acm_certificate]
}

# ACM Certificate Validation Records (ALB - ap-northeast-2)
resource "aws_route53_record" "cert_validation_alb" {
  provider = aws.dns

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
  zone_id         = local.primary_zone_id
}

# ACM Certificate Validation Records (CloudFront - us-east-1)
resource "aws_route53_record" "cert_validation" {
  provider = aws.dns

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
  # SAN cert covers both domains → route each validation record to its own zone
  # (milkyway records to the secondary zone, everything else to the primary zone).
  zone_id = (var.secondary_domain_name != "" && strcontains(each.key, var.secondary_domain_name)) ? data.aws_route53_zone.secondary[0].zone_id : local.primary_zone_id
}

# Frontend Domain Records
resource "aws_route53_record" "frontend_root" {
  provider = aws.dns
  count    = var.domain_name != "" ? 1 : 0

  zone_id         = local.primary_zone_id
  name            = var.domain_name
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = module.s3_cloudfront.cloudfront_domain_name
    zone_id                = module.s3_cloudfront.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [module.s3_cloudfront]
}

resource "aws_route53_record" "frontend_www" {
  provider = aws.dns
  count    = var.domain_name != "" ? 1 : 0

  zone_id         = local.primary_zone_id
  name            = "www.${var.domain_name}"
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = module.s3_cloudfront.cloudfront_domain_name
    zone_id                = module.s3_cloudfront.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [module.s3_cloudfront]
}

# ─── Secondary Domain Frontend Records (milkyway.pe.kr → SAME CloudFront) ───
# milkyway is served by the same distribution/bucket as bridgespots; the
# spa_router function returns /index.html for non-bridgespots Hosts.
# allow_overwrite=true repoints the existing milkyway A records (currently the
# legacy-account CloudFront) onto the new-account distribution on apply.
# ⚠️ Before apply: remove milkyway aliases from the legacy CF E22U5C46YWKCL7
# (CloudFront CNAMEs are globally unique) or the alias add will fail.
resource "aws_route53_record" "frontend_secondary_root" {
  provider = aws.dns
  count    = var.secondary_domain_name != "" ? 1 : 0

  zone_id         = data.aws_route53_zone.secondary[0].zone_id
  name            = var.secondary_domain_name
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = module.s3_cloudfront.cloudfront_domain_name
    zone_id                = module.s3_cloudfront.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [module.s3_cloudfront]
}

resource "aws_route53_record" "frontend_secondary_www" {
  provider = aws.dns
  count    = var.secondary_domain_name != "" ? 1 : 0

  zone_id         = data.aws_route53_zone.secondary[0].zone_id
  name            = "www.${var.secondary_domain_name}"
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = module.s3_cloudfront.cloudfront_domain_name
    zone_id                = module.s3_cloudfront.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [module.s3_cloudfront]
}

# ─── S3 Attachments CloudFront ───

data "aws_s3_bucket" "attachments" {
  bucket = var.attachments_bucket_name
}

# ─── S3 Lifecycle Rules (shared bucket - managed in dev only) ───

# 1. Temp 파일 자동 삭제 (1일)
resource "aws_s3_bucket_lifecycle_configuration" "attachments" {
  bucket = data.aws_s3_bucket.attachments.id

  rule {
    id     = "cleanup-temp-files"
    status = "Enabled"

    filter {
      prefix = "temp/"
    }

    expiration {
      days = 1
    }
  }

  # 2. 댓글 첨부파일 → Intelligent-Tiering 전환
  rule {
    id     = "comments-intelligent-tiering"
    status = "Enabled"

    filter {
      prefix = "comments/"
    }

    transition {
      days          = 0
      storage_class = "INTELLIGENT_TIERING"
    }
  }

  # 3. 커스텀 아이콘 레퍼런스 → Intelligent-Tiering 전환 (일회성 파일)
  rule {
    id     = "customicon-ref-intelligent-tiering"
    status = "Enabled"

    filter {
      prefix = "customicon/ref/"
    }

    transition {
      days          = 0
      storage_class = "INTELLIGENT_TIERING"
    }
  }
}

# Intelligent-Tiering: 90일 후 Archive Access (비용 절감, 복원 3-5시간)
resource "aws_s3_bucket_intelligent_tiering_configuration" "attachments" {
  bucket = data.aws_s3_bucket.attachments.id
  name   = "attachments-tiering"

  tiering {
    access_tier = "ARCHIVE_ACCESS"
    days        = 90
  }
}

# ─── S3 Bucket CORS (presigned PUT 직접 업로드용 — shared bucket, dev 관리) ───
# 브라우저가 presigned URL로 버킷에 직접 PUT 하므로 CloudFront response-headers-policy(다운로드 GET용)가 아닌
# 버킷 레벨 CORS가 필요하다. 미설정 시 cross-origin PUT preflight가 No 'Access-Control-Allow-Origin'으로 차단된다.
resource "aws_s3_bucket_cors_configuration" "attachments" {
  bucket = data.aws_s3_bucket.attachments.id

  cors_rule {
    allowed_origins = [
      "https://bridgespots.com",
      "https://www.bridgespots.com",
      "https://milkyway.pe.kr",
      "https://www.milkyway.pe.kr",
      "http://localhost:5173",
      "http://localhost:5174",
    ]
    allowed_methods = ["PUT", "POST", "GET", "HEAD"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 86400
  }
}

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

    min_ttl     = 86400    # 1 day minimum
    default_ttl = 2592000  # 30 days
    max_ttl     = 31536000 # 1 year
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

    min_ttl     = 86400    # 1 day minimum
    default_ttl = 2592000  # 30 days
    max_ttl     = 31536000 # 1 year
  }

  # 조직 사진첩 - 30일 캐시 (UUID 기반 immutable 파일)
  ordered_cache_behavior {
    path_pattern           = "photos/*"
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

    min_ttl     = 86400    # 1 day minimum
    default_ttl = 2592000  # 30 days
    max_ttl     = 31536000 # 1 year
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
        Sid    = "AllowCloudFrontAccess"
        Effect = "Allow"
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
  provider = aws.dns
  count    = var.domain_name != "" ? 1 : 0

  zone_id         = local.primary_zone_id
  name            = "api.${var.domain_name}"
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = module.elastic_beanstalk.alb_dns_name
    zone_id                = module.elastic_beanstalk.alb_zone_id
    evaluate_target_health = true
  }

  depends_on = [module.elastic_beanstalk]
}

# ─── Secondary Domain (milkyway.pe.kr) ───
# Shares the same backend ALB with additional ACM certificate

# Look up existing Route53 hosted zone for secondary domain
data "aws_route53_zone" "secondary" {
  count    = var.secondary_domain_name != "" ? 1 : 0
  provider = aws.dns
  name     = var.secondary_domain_name
}

# ACM Certificate for secondary domain (ap-northeast-2 for ALB)
module "acm_certificate_secondary_alb" {
  count  = var.secondary_domain_name != "" ? 1 : 0
  source = "../../modules/acm-certificate"

  project_name              = var.project_name
  environment               = "${var.environment}-secondary-alb"
  domain_name               = var.secondary_domain_name
  subject_alternative_names = ["*.${var.secondary_domain_name}"]
}

# ACM Certificate Validation Records for secondary domain
resource "aws_route53_record" "cert_validation_secondary_alb" {
  provider = aws.dns

  for_each = var.secondary_domain_name != "" ? {
    for dvo in module.acm_certificate_secondary_alb[0].domain_validation_options : dvo.domain_name => {
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
  zone_id         = data.aws_route53_zone.secondary[0].zone_id
}

# Attach secondary domain certificate to ALB HTTPS listener
data "aws_lb_listener" "https" {
  count             = var.secondary_domain_name != "" ? 1 : 0
  load_balancer_arn = one(module.elastic_beanstalk.load_balancers)
  port              = 443

  depends_on = [module.elastic_beanstalk]
}

resource "aws_lb_listener_certificate" "secondary" {
  count           = var.secondary_domain_name != "" ? 1 : 0
  listener_arn    = data.aws_lb_listener.https[0].arn
  certificate_arn = module.acm_certificate_secondary_alb[0].validated_certificate_arn

  depends_on = [module.elastic_beanstalk, module.acm_certificate_secondary_alb]
}

# Backend API Domain Record for secondary domain
resource "aws_route53_record" "backend_api_secondary" {
  provider = aws.dns
  count    = var.secondary_domain_name != "" ? 1 : 0

  zone_id         = data.aws_route53_zone.secondary[0].zone_id
  name            = "api.${var.secondary_domain_name}"
  type            = "A"
  allow_overwrite = true

  alias {
    name                   = module.elastic_beanstalk.alb_dns_name
    zone_id                = module.elastic_beanstalk.alb_zone_id
    evaluate_target_health = true
  }

  depends_on = [module.elastic_beanstalk]
}

