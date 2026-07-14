variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "bucket_name" {
  description = "Override the frontend S3 bucket name (global uniqueness). Empty = {project}-{env}-frontend."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for custom domain (optional)"
  type        = string
  default     = null
}

variable "domain_name" {
  description = "Custom domain name (optional)"
  type        = string
  default     = null
}

variable "domain_aliases" {
  description = "List of domain aliases for CloudFront (e.g., ['bridgespots.com', 'www.bridgespots.com'])"
  type        = list(string)
  default     = []
}

variable "price_class" {
  description = "CloudFront price class (PriceClass_100: NA+EU, PriceClass_200: +Asia, PriceClass_All: Global)"
  type        = string
  default     = "" # Empty means use environment-based default
}
