# ─── 공유 링크 OG 미리보기 Lambda@Edge ────────────────────────────────────────
#
# 봇(Slack/카카오톡 등)이 공개 공유 경로(/n/*, /shared/*, /invite/*, /org-invite/*)로
# 오면 백엔드 OG 엔드포인트를 호출해 per-resource og:* 태그가 담긴 HTML을 반환한다.
# 사람 요청은 도메인별 index.html로 rewrite해 SPA를 띄운다(함수 내부 spaFallback).
#
# ⚠️ Lambda@Edge 제약: us-east-1 전용, env var 미지원(코드 상수로 환경 구분),
#   viewer-request 타임아웃 ≤5s, 함수 ≤1MB(이 함수는 의존성 없이 내장 https만 사용).
# ⚠️ default behavior엔 이미 spa_router CloudFront Function이 viewer-request에 붙어 있어
#   같은 이벤트에 Lambda를 겹칠 수 없다 → 공유 경로 전용 ordered behavior에만 연결한다.

# index.js → zip (Lambda@Edge 배포 아티팩트)
data "archive_file" "og_preview" {
  type        = "zip"
  source_file = "${path.module}/../../../lambda-edge/og-preview/index.js"
  output_path = "${path.module}/build/og-preview.zip"
}

# 실행 역할 — lambda + edgelambda 두 서비스가 assume 가능해야 한다.
resource "aws_iam_role" "og_preview_edge" {
  provider = aws.us_east_1
  name     = "${var.project_name}-${var.environment}-og-preview-edge"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = ["lambda.amazonaws.com", "edgelambda.amazonaws.com"]
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "og_preview_logs" {
  provider   = aws.us_east_1
  role       = aws_iam_role.og_preview_edge.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "og_preview" {
  provider         = aws.us_east_1
  function_name    = "${var.project_name}-${var.environment}-og-preview"
  role             = aws_iam_role.og_preview_edge.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.og_preview.output_path
  source_code_hash = data.archive_file.og_preview.output_base64sha256
  publish          = true # Lambda@Edge는 버전(qualified_arn)이 필요
  timeout          = 5    # viewer-request 상한
  memory_size      = 128

  tags = {
    Name        = "${var.project_name}-${var.environment}-og-preview"
    Environment = var.environment
  }
}
