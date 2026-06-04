output "bucket_name" {
  description = "S3 bucket holding Terraform state in the new account"
  value       = aws_s3_bucket.state.id
}

output "dynamodb_table" {
  description = "DynamoDB lock table name"
  value       = aws_dynamodb_table.lock.name
}

output "backend_config_dev" {
  description = "Backend config for the dev env in the NEW account (use with: terraform init -backend-config=<file> or paste into the backend block)"
  value       = <<-EOT
    bucket         = "${aws_s3_bucket.state.id}"
    key            = "dev/terraform.tfstate"
    region         = "${var.aws_region}"
    encrypt        = true
    dynamodb_table = "${aws_dynamodb_table.lock.name}"
  EOT
}
