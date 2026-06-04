output "role_arn" {
  description = "Set this as dns_account_role_arn in the NEW account's terraform.tfvars"
  value       = aws_iam_role.route53_cross_account.arn
}

output "zone_ids" {
  description = "Map of zone name → hosted zone ID (all stay in this legacy account)"
  value       = { for name, z in data.aws_route53_zone.zones : name => z.zone_id }
}

output "zone_name_servers" {
  description = "Map of zone name → name servers — these stay delegated at the registrar (do NOT change)"
  value       = { for name, z in data.aws_route53_zone.zones : name => z.name_servers }
}
