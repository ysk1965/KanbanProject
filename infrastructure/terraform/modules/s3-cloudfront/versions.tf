# 이 모듈은 CloudFront용 리소스를 기본 리전에 만들되,
# Lambda@Edge(og-preview)만은 반드시 us-east-1에 생성해야 한다.
# → 호출 측(environments/*/main.tf)에서 aws.us_east_1 provider를 전달한다.
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.0"
      configuration_aliases = [aws.us_east_1]
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}
