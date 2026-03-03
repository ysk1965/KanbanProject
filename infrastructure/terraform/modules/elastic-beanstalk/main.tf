# Elastic Beanstalk Module for KanbanProject

# IAM Role for EC2 instances
resource "aws_iam_role" "eb_ec2" {
  name = "${var.project_name}-${var.environment}-eb-ec2-role"

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

  tags = {
    Name        = "${var.project_name}-${var.environment}-eb-ec2-role"
    Environment = var.environment
  }
}

# Attach managed policies to EC2 role
resource "aws_iam_role_policy_attachment" "eb_web_tier" {
  role       = aws_iam_role.eb_ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier"
}

resource "aws_iam_role_policy_attachment" "eb_worker_tier" {
  role       = aws_iam_role.eb_ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AWSElasticBeanstalkWorkerTier"
}

resource "aws_iam_role_policy_attachment" "eb_multicontainer_docker" {
  role       = aws_iam_role.eb_ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AWSElasticBeanstalkMulticontainerDocker"
}

resource "aws_iam_role_policy_attachment" "cloudwatch_logs" {
  role       = aws_iam_role.eb_ec2.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
}

# Instance Profile
resource "aws_iam_instance_profile" "eb_ec2" {
  name = "${var.project_name}-${var.environment}-eb-ec2-profile"
  role = aws_iam_role.eb_ec2.name
}

# IAM Service Role for Elastic Beanstalk
resource "aws_iam_role" "eb_service" {
  name = "${var.project_name}-${var.environment}-eb-service-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "elasticbeanstalk.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-eb-service-role"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy_attachment" "eb_enhanced_health" {
  role       = aws_iam_role.eb_service.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkEnhancedHealth"
}

resource "aws_iam_role_policy_attachment" "eb_managed_updates" {
  role       = aws_iam_role.eb_service.name
  policy_arn = "arn:aws:iam::aws:policy/AWSElasticBeanstalkManagedUpdatesCustomerRolePolicy"
}

# Elastic Beanstalk Application
resource "aws_elastic_beanstalk_application" "main" {
  name        = "${var.project_name}-${var.environment}"
  description = "Kanban Backend Application - ${var.environment}"

  appversion_lifecycle {
    service_role          = aws_iam_role.eb_service.arn
    max_count             = 10
    delete_source_from_s3 = true
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}"
    Environment = var.environment
  }
}

# Elastic Beanstalk Environment
resource "aws_elastic_beanstalk_environment" "main" {
  name                = "${var.project_name}-${var.environment}-env"
  application         = aws_elastic_beanstalk_application.main.name
  solution_stack_name = var.solution_stack_name

  # VPC Configuration
  setting {
    namespace = "aws:ec2:vpc"
    name      = "VPCId"
    value     = var.vpc_id
  }

  setting {
    namespace = "aws:ec2:vpc"
    name      = "Subnets"
    value     = join(",", var.private_subnet_ids)
  }

  setting {
    namespace = "aws:ec2:vpc"
    name      = "ELBSubnets"
    value     = join(",", var.public_subnet_ids)
  }

  setting {
    namespace = "aws:ec2:vpc"
    name      = "AssociatePublicIpAddress"
    value     = var.associate_public_ip
  }

  # Instance Configuration
  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "IamInstanceProfile"
    value     = aws_iam_instance_profile.eb_ec2.name
  }

  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "InstanceType"
    value     = var.instance_type
  }

  setting {
    namespace = "aws:autoscaling:launchconfiguration"
    name      = "SecurityGroups"
    value     = var.ec2_security_group_id
  }

  # Auto Scaling
  setting {
    namespace = "aws:autoscaling:asg"
    name      = "MinSize"
    value     = var.min_instances
  }

  setting {
    namespace = "aws:autoscaling:asg"
    name      = "MaxSize"
    value     = var.max_instances
  }

  # Load Balancer
  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "EnvironmentType"
    value     = "LoadBalanced"
  }

  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "LoadBalancerType"
    value     = "application"
  }

  setting {
    namespace = "aws:elasticbeanstalk:environment"
    name      = "ServiceRole"
    value     = aws_iam_role.eb_service.name
  }

  setting {
    namespace = "aws:elbv2:loadbalancer"
    name      = "SecurityGroups"
    value     = var.alb_security_group_id
  }

  # HTTPS Listener (conditional)
  dynamic "setting" {
    for_each = var.ssl_certificate_arn != "" ? [1] : []
    content {
      namespace = "aws:elbv2:listener:443"
      name      = "ListenerEnabled"
      value     = "true"
    }
  }

  dynamic "setting" {
    for_each = var.ssl_certificate_arn != "" ? [1] : []
    content {
      namespace = "aws:elbv2:listener:443"
      name      = "Protocol"
      value     = "HTTPS"
    }
  }

  dynamic "setting" {
    for_each = var.ssl_certificate_arn != "" ? [1] : []
    content {
      namespace = "aws:elbv2:listener:443"
      name      = "SSLCertificateArns"
      value     = var.ssl_certificate_arn
    }
  }

  dynamic "setting" {
    for_each = var.ssl_certificate_arn != "" ? [1] : []
    content {
      namespace = "aws:elbv2:listener:443"
      name      = "SSLPolicy"
      value     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
    }
  }

  # ALB Sticky Session (for WebSocket connection affinity)
  setting {
    namespace = "aws:elasticbeanstalk:environment:process:default"
    name      = "StickinessEnabled"
    value     = "true"
  }

  setting {
    namespace = "aws:elasticbeanstalk:environment:process:default"
    name      = "StickinessType"
    value     = "lb_cookie"
  }

  setting {
    namespace = "aws:elasticbeanstalk:environment:process:default"
    name      = "StickinessLBCookieDuration"
    value     = "3600"
  }

  # Health Check
  setting {
    namespace = "aws:elasticbeanstalk:environment:process:default"
    name      = "HealthCheckPath"
    value     = "/actuator/health"
  }

  setting {
    namespace = "aws:elasticbeanstalk:environment:process:default"
    name      = "MatcherHTTPCode"
    value     = "200"
  }

  setting {
    namespace = "aws:elasticbeanstalk:healthreporting:system"
    name      = "SystemType"
    value     = "enhanced"
  }

  # Deployment
  setting {
    namespace = "aws:elasticbeanstalk:command"
    name      = "DeploymentPolicy"
    value     = var.environment == "prod" ? "Rolling" : "AllAtOnce"
  }

  # CloudWatch Logs
  setting {
    namespace = "aws:elasticbeanstalk:cloudwatch:logs"
    name      = "StreamLogs"
    value     = "true"
  }

  setting {
    namespace = "aws:elasticbeanstalk:cloudwatch:logs"
    name      = "RetentionInDays"
    value     = "30"
  }

  # Environment Variables
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "SPRING_PROFILES_ACTIVE"
    value     = var.spring_profile
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "SERVER_PORT"
    value     = "5000"
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "DATABASE_URL"
    value     = var.database_url
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "DB_USERNAME"
    value     = var.db_username
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "DB_PASSWORD"
    value     = var.db_password
  }

  # Cache Type - simple if no Redis, redis otherwise
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "CACHE_TYPE"
    value     = var.redis_host != "" ? "redis" : "simple"
  }

  # Redis settings (only if Redis is configured)
  dynamic "setting" {
    for_each = var.redis_host != "" ? [1] : []
    content {
      namespace = "aws:elasticbeanstalk:application:environment"
      name      = "REDIS_HOST"
      value     = var.redis_host
    }
  }

  dynamic "setting" {
    for_each = var.redis_host != "" ? [1] : []
    content {
      namespace = "aws:elasticbeanstalk:application:environment"
      name      = "REDIS_PORT"
      value     = var.redis_port
    }
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "JWT_SECRET"
    value     = var.jwt_secret
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "FRONTEND_URL"
    value     = var.frontend_url
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "CLAUDE_API_KEY"
    value     = var.claude_api_key
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "OPENAI_API_KEY"
    value     = var.openai_api_key
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "OPENAI_ADMIN_KEY"
    value     = var.openai_admin_key
  }

  # Email (Gmail SMTP)
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "MAIL_USERNAME"
    value     = var.mail_username
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "MAIL_PASSWORD"
    value     = var.mail_password
  }

  # Google OAuth2
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "GOOGLE_CLIENT_ID"
    value     = var.google_client_id
  }

  # S3 Attachments CloudFront
  dynamic "setting" {
    for_each = var.cloudfront_domain != "" ? [1] : []
    content {
      namespace = "aws:elasticbeanstalk:application:environment"
      name      = "CLOUDFRONT_DOMAIN"
      value     = var.cloudfront_domain
    }
  }

  # Polar.sh Payment
  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "POLAR_API_KEY"
    value     = var.polar_api_key
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "POLAR_WEBHOOK_SECRET"
    value     = var.polar_webhook_secret
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "POLAR_ORG_ID"
    value     = var.polar_org_id
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "POLAR_PRODUCT_BOARD_MONTHLY"
    value     = var.polar_product_board_monthly
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "POLAR_PRODUCT_BOARD_YEARLY"
    value     = var.polar_product_board_yearly
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "POLAR_PRODUCT_ORG_MONTHLY"
    value     = var.polar_product_org_monthly
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "POLAR_PRODUCT_ORG_YEARLY"
    value     = var.polar_product_org_yearly
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "POLAR_PRODUCT_CREDIT_100"
    value     = var.polar_product_credit_100
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "POLAR_PRODUCT_CREDIT_500"
    value     = var.polar_product_credit_500
  }

  setting {
    namespace = "aws:elasticbeanstalk:application:environment"
    name      = "POLAR_PRODUCT_CREDIT_1000"
    value     = var.polar_product_credit_1000
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-env"
    Environment = var.environment
  }
}

# Look up the actual ALB created by Elastic Beanstalk
data "aws_lb" "eb_alb" {
  arn = one(aws_elastic_beanstalk_environment.main.load_balancers)
}
