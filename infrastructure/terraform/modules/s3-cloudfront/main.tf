# S3 + CloudFront Module for KanbanProject Frontend

# S3 Bucket for Frontend
resource "aws_s3_bucket" "frontend" {
  bucket = "${var.project_name}-${var.environment}-frontend"

  tags = {
    Name        = "${var.project_name}-${var.environment}-frontend"
    Environment = var.environment
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 bucket policy for CloudFront
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontAccess"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}

# Origin Access Control
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project_name}-${var.environment}-oac"
  description                       = "OAC for ${var.project_name} frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Security Response Headers Policy
resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name    = "${var.project_name}-${var.environment}-security-headers"
  comment = "Security headers for ${var.project_name} ${var.environment}"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
  }
}

# CloudFront Function: SPA Router + Multi-Domain Branding
# Host 헤더 기반으로 milkyway.pe.kr → index.html, bridgespots.com → index-bridgespots.html 분기
resource "aws_cloudfront_function" "spa_router" {
  name    = "${var.project_name}-${var.environment}-spa-router"
  runtime = "cloudfront-js-2.0"
  comment = "SPA routing with multi-domain branding for ${var.environment}"
  publish = true
  code    = <<-EOF
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      var host = request.headers.host ? request.headers.host.value : '';

      // 파일 확장자가 있는 요청은 그대로 통과 (JS, CSS, 이미지 등)
      if (uri.match(/\.\w+$/)) {
        return request;
      }

      // SPA fallback: 파일 확장자 없는 경로 → 도메인별 index.html
      if (host.indexOf('bridgespots.com') !== -1) {
        request.uri = '/index-bridgespots.html';
      } else {
        request.uri = '/index.html';
      }

      return request;
    }
  EOF
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = var.price_class != "" ? var.price_class : (var.environment == "prod" ? "PriceClass_All" : "PriceClass_100")
  comment             = "${var.project_name} ${var.environment} frontend"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "S3-${aws_s3_bucket.frontend.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "S3-${aws_s3_bucket.frontend.id}"
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id

    # SPA Router: Host 헤더 기반 도메인별 index.html 분기 + SPA fallback
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_router.arn
    }

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 0     # no cache (HTML, SW, manifest 등)
    max_ttl     = 86400 # 1 day max (S3 헤더가 있어도 1일 이내)
  }

  # Cache behavior for static assets (long cache)
  ordered_cache_behavior {
    path_pattern           = "/assets/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.frontend.id}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 31536000 # 1 year
    default_ttl = 31536000
    max_ttl     = 31536000
  }

  # 공유 링크 OG 미리보기 경로 — og-preview Lambda@Edge(viewer-request) 연결.
  # 이 경로들엔 spa_router(CF Function)가 붙지 않으므로(같은 이벤트 중복 불가),
  # Lambda가 봇엔 og:* HTML을, 사람엔 index.html rewrite(SPA fallback)를 반환한다.
  # 4개 프리픽스는 서로 배타적이라 순서는 무관하다.
  dynamic "ordered_cache_behavior" {
    for_each = toset(["/n/*", "/shared/*", "/invite/*", "/org-invite/*"])
    content {
      path_pattern               = ordered_cache_behavior.value
      allowed_methods            = ["GET", "HEAD", "OPTIONS"]
      cached_methods             = ["GET", "HEAD"]
      target_origin_id           = "S3-${aws_s3_bucket.frontend.id}"
      viewer_protocol_policy     = "redirect-to-https"
      compress                   = true
      response_headers_policy_id = aws_cloudfront_response_headers_policy.security_headers.id

      lambda_function_association {
        event_type   = "viewer-request"
        lambda_arn   = aws_lambda_function.og_preview.qualified_arn
        include_body = false
      }

      forwarded_values {
        query_string = false
        cookies {
          forward = "none"
        }
      }

      min_ttl     = 0
      default_ttl = 0 # HTML/봇 응답은 캐시하지 않음
      max_ttl     = 86400
    }
  }

  # SPA routing은 CloudFront Function(spa_router)이 처리
  # custom_error_response 제거: 도메인별 index.html 분기를 위해 CF Function 사용

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Custom domain support
  aliases = var.domain_aliases

  viewer_certificate {
    cloudfront_default_certificate = var.acm_certificate_arn == "" ? true : false
    acm_certificate_arn            = var.acm_certificate_arn != "" ? var.acm_certificate_arn : null
    ssl_support_method             = var.acm_certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version       = var.acm_certificate_arn != "" ? "TLSv1.2_2021" : "TLSv1"
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-frontend-cdn"
    Environment = var.environment
  }
}
