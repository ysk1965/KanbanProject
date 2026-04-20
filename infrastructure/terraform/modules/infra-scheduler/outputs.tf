output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = var.enabled ? aws_lambda_function.scheduler[0].arn : ""
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = var.enabled ? aws_lambda_function.scheduler[0].function_name : ""
}

output "sns_topic_arn" {
  description = "SNS topic ARN for notifications"
  value       = var.enabled ? aws_sns_topic.notifications[0].arn : ""
}

output "shutdown_rule_arn" {
  description = "EventBridge shutdown rule ARN"
  value       = var.enabled ? aws_cloudwatch_event_rule.shutdown[0].arn : ""
}

output "startup_rule_arn" {
  description = "EventBridge startup rule ARN"
  value       = var.enabled ? aws_cloudwatch_event_rule.startup[0].arn : ""
}
