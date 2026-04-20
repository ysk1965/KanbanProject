# Infrastructure Scheduler Module
# Automatically shuts down EC2 (EB) and RDS during off-peak hours to reduce costs.
# KST 23:00~08:00 (UTC 14:00~23:00) — ~37.5% cost reduction on compute/DB.

locals {
  function_name = "${var.project_name}-${var.environment}-infra-scheduler"
  rule_prefix   = "${var.project_name}-${var.environment}"
}

# ─── IAM Role for Lambda ───

resource "aws_iam_role" "lambda" {
  count = var.enabled ? 1 : 0
  name  = "${local.function_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${local.function_name}-role"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy" "lambda" {
  count = var.enabled ? 1 : 0
  name  = "${local.function_name}-policy"
  role  = aws_iam_role.lambda[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ElasticBeanstalk"
        Effect = "Allow"
        Action = [
          "elasticbeanstalk:DescribeEnvironmentResources",
          "elasticbeanstalk:DescribeEnvironments"
        ]
        Resource = "*"
      },
      {
        Sid    = "AutoScaling"
        Effect = "Allow"
        Action = [
          "autoscaling:UpdateAutoScalingGroup",
          "autoscaling:DescribeAutoScalingGroups"
        ]
        Resource = "*"
      },
      {
        Sid    = "RDS"
        Effect = "Allow"
        Action = [
          "rds:StopDBInstance",
          "rds:StartDBInstance",
          "rds:DescribeDBInstances"
        ]
        Resource = "arn:aws:rds:*:*:db:${var.rds_instance_id}"
      },
      {
        Sid    = "SNS"
        Effect = "Allow"
        Action = "sns:Publish"
        Resource = var.enabled ? aws_sns_topic.notifications[0].arn : "*"
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# ─── Lambda Function ───

data "archive_file" "lambda" {
  count       = var.enabled ? 1 : 0
  type        = "zip"
  source_file = "${path.module}/lambda/scheduler.py"
  output_path = "${path.module}/lambda/scheduler.zip"
}

resource "aws_lambda_function" "scheduler" {
  count = var.enabled ? 1 : 0

  filename         = data.archive_file.lambda[0].output_path
  source_code_hash = data.archive_file.lambda[0].output_base64sha256
  function_name    = local.function_name
  role             = aws_iam_role.lambda[0].arn
  handler          = "scheduler.handler"
  runtime          = "python3.12"
  timeout          = 60
  memory_size      = 128

  environment {
    variables = {
      SNS_TOPIC_ARN = aws_sns_topic.notifications[0].arn
    }
  }

  tags = {
    Name        = local.function_name
    Environment = var.environment
  }
}

# ─── CloudWatch Log Group ───

resource "aws_cloudwatch_log_group" "lambda" {
  count             = var.enabled ? 1 : 0
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = 30

  tags = {
    Name        = "${local.function_name}-logs"
    Environment = var.environment
  }
}

# ─── SNS Topic for Notifications ───

resource "aws_sns_topic" "notifications" {
  count = var.enabled ? 1 : 0
  name  = "${local.function_name}-notifications"

  tags = {
    Name        = "${local.function_name}-notifications"
    Environment = var.environment
  }
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.enabled && var.notification_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.notifications[0].arn
  protocol  = "email"
  endpoint  = var.notification_email
}

# ─── EventBridge Scheduled Rules ───

# Shutdown Rule: KST 23:00 = UTC 14:00
resource "aws_cloudwatch_event_rule" "shutdown" {
  count               = var.enabled ? 1 : 0
  name                = "${local.rule_prefix}-shutdown"
  description         = "Shutdown ${var.environment} infrastructure at off-peak hours"
  schedule_expression = var.shutdown_cron

  tags = {
    Name        = "${local.rule_prefix}-shutdown"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_event_target" "shutdown" {
  count = var.enabled ? 1 : 0
  rule  = aws_cloudwatch_event_rule.shutdown[0].name
  arn   = aws_lambda_function.scheduler[0].arn

  input = jsonencode({
    action      = "shutdown"
    environment = var.environment
    resources = {
      eb_environment_name = var.eb_environment_name
      rds_instance_id     = var.rds_instance_id
    }
  })
}

resource "aws_lambda_permission" "shutdown" {
  count         = var.enabled ? 1 : 0
  statement_id  = "AllowEventBridgeShutdown"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scheduler[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.shutdown[0].arn
}

# Startup Rule: KST 08:00 = UTC 23:00 (or KST 07:30 = UTC 22:30 for prod)
resource "aws_cloudwatch_event_rule" "startup" {
  count               = var.enabled ? 1 : 0
  name                = "${local.rule_prefix}-startup"
  description         = "Startup ${var.environment} infrastructure before business hours"
  schedule_expression = var.startup_cron

  tags = {
    Name        = "${local.rule_prefix}-startup"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_event_target" "startup" {
  count = var.enabled ? 1 : 0
  rule  = aws_cloudwatch_event_rule.startup[0].name
  arn   = aws_lambda_function.scheduler[0].arn

  input = jsonencode({
    action      = "startup"
    environment = var.environment
    resources = {
      eb_environment_name = var.eb_environment_name
      rds_instance_id     = var.rds_instance_id
      eb_asg_min          = var.eb_min_instances
      eb_asg_max          = var.eb_max_instances
    }
  })
}

resource "aws_lambda_permission" "startup" {
  count         = var.enabled ? 1 : 0
  statement_id  = "AllowEventBridgeStartup"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scheduler[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.startup[0].arn
}
