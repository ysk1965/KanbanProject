variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, prod)"
  type        = string
}

variable "domain_name" {
  description = "Primary domain name (e.g., bridgespots.com)"
  type        = string
}

variable "subject_alternative_names" {
  description = "Subject alternative names (e.g., ['*.bridgespots.com', 'www.bridgespots.com'])"
  type        = list(string)
  default     = []
}
