terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    # scheduler.zip 패키징에 data "archive_file" 사용 → 명시적 선언 (미선언 시 unpinned 자동 설치)
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}
