# 공유 링크 미리보기 (OG 카드) — Lambda@Edge

공개 공유 링크를 Slack·카카오톡 등에 붙였을 때 **리소스별 리치 카드**가 뜨도록,
크롤러(봇) 요청에만 per-resource `og:*` 메타를 주입한다. 사람 요청은 그대로 SPA로 흐른다.

## 구조

```
봇(Slackbot/KakaoTalk/…) ─▶ CloudFront ─▶ [Lambda@Edge: viewer-request]
                                              │  UA=봇 & 공유경로?
                                              ├─ 예 → 백엔드 GET /api/v1/public/og-preview/{type}/{token}
                                              │        → og:* 태그 담긴 얇은 HTML 반환
                                              └─ 아니오 → 요청 통과 → S3 index.html(SPA)
사람 브라우저 ───────────▶ CloudFront ─▶ S3 index.html (평소와 동일)
```

- **백엔드는 이미 완성**: `OgPreviewController` (`/api/v1/public/og-preview/{type}/{token}`, permitAll).
  기존 공개 서비스(노트/사진/초대)를 재사용해 `{title, description, image_url, canonical_url}` 반환.
- 지원 종류(type): `note`, `album`, `gallery`, `upload`, `gallery-upload`, `invite`, `org-invite`.
- 대응 경로: `/shared/note/*`, `/shared/album/*`, `/shared/gallery/*`, `/shared/upload/*`,
  `/shared/gallery-upload/*`, `/invite/*`, `/org-invite/*`.

## 배포 전 필수 수정

`index.js` 상단 상수를 환경에 맞게 바꾼다 (**Lambda@Edge는 환경변수 미지원**이라 하드코딩):

```js
const API_BASE = "https://api.milkyway.pe.kr"; // 실제 백엔드 오리진 (dev/prod 각각)
const DEFAULT_IMAGE = "https://milkyway.pe.kr/og-image-milkyway.png";
```

> ⚠️ Lambda@Edge 제약: 환경변수 불가, us-east-1에만 생성 가능, 함수 크기 제한(≤1MB, viewer-request).
> 이 함수는 의존성 없이 Node 내장 `https`만 쓰므로 제한을 만족한다.

## Terraform 배포 (us-east-1 필수)

`infrastructure/terraform/` 모듈에 아래를 추가하고 CloudFront 배포에 연결한다.
(⚠️ 계정 마이그레이션 진행 중이므로 대상 계정/프로필 확인 후 apply)

```hcl
# providers.tf — Lambda@Edge는 반드시 us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# og_preview.tf
data "archive_file" "og_preview" {
  type        = "zip"
  source_file = "${path.module}/../../lambda-edge/og-preview/index.js"
  output_path = "${path.module}/build/og-preview.zip"
}

resource "aws_iam_role" "og_preview_edge" {
  name = "milkyway-og-preview-edge"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = ["lambda.amazonaws.com", "edgelambda.amazonaws.com"] }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "og_preview_logs" {
  role       = aws_iam_role.og_preview_edge.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "og_preview" {
  provider         = aws.us_east_1
  function_name    = "milkyway-og-preview"
  role             = aws_iam_role.og_preview_edge.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.og_preview.output_path
  source_code_hash = data.archive_file.og_preview.output_base64sha256
  publish          = true # Lambda@Edge는 버전 필요
  timeout          = 5     # viewer-request 상한
  memory_size      = 128
}
```

그리고 프론트 CloudFront distribution의 **default_cache_behavior**(또는 공유 경로 전용 behavior)에 연결:

```hcl
  default_cache_behavior {
    # ...기존 설정...
    lambda_function_association {
      event_type   = "viewer-request"
      lambda_arn   = aws_lambda_function.og_preview.qualified_arn # 버전 포함 ARN
      include_body = false
    }
  }
```

> 캐시 주의: 봇 UA에 따라 응답이 갈리므로, 정확도를 높이려면 `User-Agent`를 캐시 키에 포함하거나
> 별도 cache policy를 두는 것을 권장(과도한 분기 캐싱은 히트율↓ 이므로 공유 경로 behavior에만 적용).

## 배포 후 검증

```bash
# 봇 UA로 요청 → og:* 태그가 담긴 HTML이 나와야 함
curl -s -A "Slackbot-LinkExpanding 1.0" https://milkyway.pe.kr/shared/note/<slug>-<token> | grep 'og:'

# 사람 UA → 평소 SPA(index.html)
curl -s -A "Mozilla/5.0" https://milkyway.pe.kr/shared/note/<token> | grep '<div id="root"'
```

카카오톡/슬랙에 실제 링크를 붙여 카드가 뜨는지 확인. (Slack은
`https://api.slack.com/robots` 캐시가 있어 재요청까지 시간이 걸릴 수 있음 — 링크 뒤 `?v=2` 등으로 우회.)

## 로컬에서 함수 로직만 검증

`API_BASE`를 로컬 백엔드로 바꾸고 백엔드를 띄운 뒤:

```bash
node -e 'const {handler}=require("./index.js");
handler({Records:[{cf:{request:{uri:"/shared/note/x",headers:{"user-agent":[{value:"Slackbot"}]}}}}]})
  .then(r=>console.log(r.body||r.uri));'
```
