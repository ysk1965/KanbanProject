output "redis_endpoint" {
  description = "Redis primary endpoint address"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_port" {
  description = "Redis port"
  value       = 6379
}

output "redis_reader_endpoint" {
  description = "Redis reader endpoint address (for read replicas)"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
}

output "redis_connection_url" {
  description = "Redis connection URL"
  value       = "${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
}

output "replication_group_id" {
  description = "ElastiCache replication group ID"
  value       = aws_elasticache_replication_group.main.id
}
