output "application_name" {
  description = "Elastic Beanstalk application name"
  value       = aws_elastic_beanstalk_application.main.name
}

output "environment_name" {
  description = "Elastic Beanstalk environment name"
  value       = aws_elastic_beanstalk_environment.main.name
}

output "environment_id" {
  description = "Elastic Beanstalk environment ID"
  value       = aws_elastic_beanstalk_environment.main.id
}

output "endpoint_url" {
  description = "Elastic Beanstalk environment endpoint URL"
  value       = aws_elastic_beanstalk_environment.main.endpoint_url
}

output "cname" {
  description = "Elastic Beanstalk environment CNAME"
  value       = aws_elastic_beanstalk_environment.main.cname
}

output "load_balancers" {
  description = "Load balancer ARNs"
  value       = aws_elastic_beanstalk_environment.main.load_balancers
}

output "alb_dns_name" {
  description = "Application Load Balancer DNS name (for Route 53 alias)"
  value       = data.aws_lb.eb_alb.dns_name
}

output "alb_zone_id" {
  description = "Application Load Balancer hosted zone ID (for Route 53 alias)"
  value       = data.aws_lb.eb_alb.zone_id
}
