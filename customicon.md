# AI Icon Generator - 서비스 기획서

> 레퍼런스 이미지 기반 아이콘 세트 자동 생성 서비스

---

## 1. 서비스 개요

### 1-1. 핵심 가치
- 레퍼런스 이미지 한 장으로 **통일된 스타일의 아이콘 세트**를 자동 생성
- 단순 생성이 아닌 **크롭 + 정규화 파이프라인**으로 일관된 시각적 품질 보장
- 스프라이트 시트 + 개별 아이콘 + 다중 포맷 Export 지원

### 1-2. 타겟 사용자
- UI/UX 디자이너 (빠른 프로토타이핑)
- 인디 개발자 (디자이너 없이 일관된 아이콘 세트 필요)
- 소규모 팀 (커스텀 아이콘 세트 제작 비용 절감)

---

## 2. UX 플로우 (사용자 입장)

```
[1] 레퍼런스 이미지 업로드
         ↓
[2] 아이콘 레이아웃 선택
    - 16개 (4×4) 또는 4개 (2×2)
         ↓
[3] 아이콘 리스트 입력
    - 예: home, search, user, settings, ...
         ↓
[4] 스타일 옵션 설정
    - 라인/솔리드
    - 스트로크 굵기
    - 라운드 정도
    - 패딩 비율 (예: 15%)
    - 배경 (투명/흰색)
    - 그리드 라인 유무
         ↓
[5] Generate 버튼
         ↓
[6] 결과 미리보기
    - 한 장 스프라이트 시트
    - 분할된 개별 아이콘 미리보기
         ↓
[7] Export & 다운로드
    - PNG (1x / 2x)
    - SVG (옵션)
    - ICO (옵션)
    - ZIP 다운로드
```

---

## 3. 시스템 아키텍처

### 3-1. 전체 구성도

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                    │
│  업로드(드래그&드롭) │ 옵션 UI │ 결과 갤러리 │ Export   │
└──────────────────────────┬──────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────┐
│                Backend (FastAPI / Python)                │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ 이미지 저장  │  │ 스타일 분석   │  │ 프롬프트 생성  │  │
│  │ (S3/R2)     │  │ (Vision API) │  │               │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ 이미지 생성  │  │ 후처리       │  │ 결과 서빙     │  │
│  │ 호출        │  │ (크롭/정규화) │  │ (서명 URL)    │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│              Worker / Queue (Redis + Celery)             │
│         생성 작업 비동기 처리 (느린 작업 분리)             │
└─────────────────────────────────────────────────────────┘
```

### 3-2. 기술 스택

| 레이어 | 기술 | 비고 |
|--------|------|------|
| **Frontend** | Next.js / React | 드래그&드롭, 옵션 UI, 갤러리 |
| **Backend** | FastAPI (Python) | 이미지 처리 생태계 활용 |
| **큐/워커** | Redis + Celery | 생성 작업 비동기 분리 |
| **스토리지** | S3 / Cloudflare R2 | 레퍼런스 및 결과 이미지 |
| **이미지 생성** | OpenAI GPT Image API | Images API - Edits 엔드포인트 |
| **이미지 처리** | Sharp (Node) / Pillow (Python) | 크롭, 정규화, 포맷 변환 |

---

## 4. 핵심 파이프라인

### 4-1. 스타일 분석 (Vision API)

레퍼런스 이미지를 Vision API로 분석하여 스타일 스펙 JSON 추출:

```json
{
  "style": "line",
  "stroke_weight": "medium",
  "corner_radius": "rounded",
  "fill": "none",
  "detail": "minimal",
  "padding_ratio": 0.15
}
```

> 이 단계가 이후 생성 품질 안정성의 핵심. 모델이 참고할 규칙을 명확히 뽑아낸다.

### 4-2. 템플릿 프롬프트 생성

2×2 / 4×4 그리드 모두 대응 가능한 프롬프트 구성:

```
- "N×N sprite sheet"
- "each icon centered in equal square cell"
- "uniform padding X%"
- "consistent stroke width & visual weight"
- "no text, watermark..."
- (옵션) "thin light gray grid lines"
```

### 4-3. 이미지 생성 (OpenAI Images API - Edits)

**방식**: `POST /images/edits` — 레퍼런스 이미지를 `images[]`로 전달

**전략**:
- 빈 캔버스(흰색 정사각 PNG)를 함께 전달
- "이 캔버스 위에 아이콘 시트를 그려라" 방식으로 유도

**해상도 전략**:

| 모드 | 생성 방식 | 타일 크기 | 품질 |
|------|-----------|-----------|------|
| **16개 (기본)** | 4×4 sheet 1장 (1024px) | 256×256px | 보통 |
| **16개 (고해상도)** | 2×2 sheet 4장 (1024px씩) | 512×512px | 좋음 |
| **4개** | 2×2 sheet 1장 (1024px) | 512×512px | 매우 좋음 |

**API 설정**:
- 투명 배경: `background="transparent"` + PNG/WEBP 포맷
- 응답 형식: `b64_json` → 서버에서 디코딩 후 파일 저장
- 모델: GPT Image 기반 (DALL-E 2/3은 2026-05-12 지원 종료 예정)

> 주의: GPT Image 모델 사용 시 Organization Verification 필요 여부 사전 체크 필수

### 4-4. 크롭 / 아이콘 정규화 파이프라인

이 단계가 **서비스의 핵심 차별점**. 단순 16등분이 아닌 정규화까지 수행.

#### 1차: 그리드 셀 단위 크롭

```
cellW = imageWidth / cols
cellH = imageHeight / rows

각 셀 추출 (그리드 선 있으면 inset=1~2px 안쪽으로)
```

#### 2차: 정규화 (시각적 크기 통일)

```
각 타일마다:
  1. 투명/흰색 배경 기준 "콘텐츠 바운딩 박스" 계산
  2. 콘텐츠를 목표 비율(타일 면적의 ~70%)로 리사이즈
  3. 타일 중앙 정렬
  4. 최종 캔버스 크기 고정 (256×256 또는 512×512)
```

> 정규화를 거치면 "아이콘이 모두 같은 시각적 크기"로 통일되어 실무 품질 달성

#### 크롭 구현 (Sharp / Node.js)

```typescript
async function cropSpriteSheet(
  inputPngPath: string,
  outDir: string,
  cols: number,
  rows: number,
  inset = 0
) {
  const meta = await sharp(inputPngPath).metadata();
  if (!meta.width || !meta.height) throw new Error("Invalid image");

  if (meta.width % cols !== 0 || meta.height % rows !== 0) {
    throw new Error(
      `Image ${meta.width}x${meta.height} not divisible by ${cols}x${rows}`
    );
  }

  const cellW = meta.width / cols;
  const cellH = meta.height / rows;

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const left = c * cellW + inset;
      const top = r * cellH + inset;
      const width = cellW - inset * 2;
      const height = cellH - inset * 2;

      const outPath = path.join(
        outDir,
        `icon_${idx.toString().padStart(2, "0")}.png`
      );
      await sharp(inputPngPath)
        .extract({ left, top, width, height })
        .png()
        .toFile(outPath);

      idx++;
    }
  }
}
```

**정규화 추가 흐름**:
```
extract() → trim() (여백 제거) → resize() → extend() (패딩으로 캔버스 맞춤)
```

---

## 5. 품질 보장 장치 (5가지)

| # | 장치 | 설명 |
|---|------|------|
| 1 | **Preview 단계** | 먼저 2×2 (4개)로 스타일 검증 → OK 시 16개 생성 |
| 2 | **자동 검수** | 각 타일의 콘텐츠 픽셀 비율 검사. 너무 작으면(빈 아이콘) / 너무 크면(잘림) → 실패 처리 후 재생성 |
| 3 | **정규화** | 크롭 후 re-center / scale로 시각적 크기 통일 |
| 4 | **재현성** | 스타일 스펙(JSON)을 프로젝트에 저장 → 동일 스타일 재생성 가능 |
| 5 | **그리드 가이드** | 프롬프트에 그리드 지시를 강하게 포함하여 셀 경계 정확도 향상 |

---

## 6. API 엔드포인트 설계

### 6-1. 주요 API

```
POST   /api/upload          # 레퍼런스 이미지 업로드
POST   /api/analyze-style   # 스타일 분석 (Vision API)
POST   /api/generate        # 아이콘 생성 요청 (비동기)
GET    /api/jobs/:id        # 생성 작업 상태 조회
GET    /api/jobs/:id/result # 결과 조회 (스프라이트 시트 + 개별 아이콘)
POST   /api/export          # 포맷 변환 및 ZIP 패키징
GET    /api/export/:id      # ZIP 다운로드 (서명 URL)
```

### 6-2. 생성 요청 페이로드

```json
{
  "reference_image_id": "uuid",
  "icon_names": ["home", "search", "user", "settings", "..."],
  "layout": "4x4",
  "style_options": {
    "type": "line",
    "stroke_weight": "medium",
    "corner_radius": "rounded",
    "padding_ratio": 0.15,
    "background": "transparent",
    "show_grid_lines": false
  },
  "high_resolution": false
}
```

### 6-3. 생성 결과 응답

```json
{
  "job_id": "uuid",
  "status": "completed",
  "result": {
    "sprite_sheet_url": "https://...",
    "icons": [
      {
        "name": "home",
        "index": 0,
        "url": "https://...",
        "size": "256x256"
      }
    ],
    "style_spec": { "...saved style JSON..." }
  }
}
```

---

## 7. Export 사양

| 포맷 | 해상도 | 용도 |
|------|--------|------|
| **PNG 1x** | 256×256 / 512×512 | 일반 사용 |
| **PNG 2x** | 512×512 / 1024×1024 | 고해상도 디스플레이 |
| **SVG** (옵션) | 벡터 | 스케일러블 사용 |
| **ICO** (옵션) | 멀티 사이즈 | 파비콘 등 |
| **ZIP** | 전체 묶음 | 일괄 다운로드 |

---

## 8. 고려 사항

### 8-1. 기술적 고려
- OpenAI Organization Verification 사전 확인
- DALL-E 2/3 → GPT Image 마이그레이션 (2026-05-12 종료)
- 생성 작업 타임아웃 및 재시도 정책
- 동시 요청 제한 (Rate Limiting)
- 이미지 저장소 비용 최적화 (TTL 기반 자동 삭제)

### 8-2. UX 고려
- 생성 중 프로그레스 표시 (예상 소요 시간)
- Preview → Full 생성 2단계 플로우로 비용/시간 절약
- 스타일 스펙 저장/불러오기 기능 (프로젝트 단위)
- 생성 실패 시 자동 재시도 + 사용자 알림

### 8-3. 비용 구조
- OpenAI Images API 호출 비용 (생성당)
- Vision API 호출 비용 (스타일 분석당)
- 스토리지 비용 (S3/R2)
- 서버/워커 운영 비용

---

## 9. MVP 개발 우선순위

### Phase 1: 코어 파이프라인
- [ ] 레퍼런스 이미지 업로드 + 스타일 분석
- [ ] 프롬프트 생성 + 이미지 생성 호출
- [ ] 기본 크롭 (그리드 분할)
- [ ] 결과 미리보기

### Phase 2: 품질 강화
- [ ] 정규화 파이프라인 (바운딩 박스 + 리사이즈 + 센터링)
- [ ] 자동 검수 (빈 아이콘 / 잘림 감지)
- [ ] Preview 단계 (2×2 스타일 검증)

### Phase 3: Export & 사용성
- [ ] 다중 포맷 Export (PNG 1x/2x, SVG, ICO)
- [ ] ZIP 패키징 및 다운로드
- [ ] 스타일 스펙 저장/불러오기

### Phase 4: 운영 최적화
- [ ] 비동기 큐 (Redis + Celery)
- [ ] Rate Limiting / 비용 관리
- [ ] 사용자 인증 / 프로젝트 관리

---

*Generated: 2026-02-23*
