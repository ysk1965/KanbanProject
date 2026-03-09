# Design v14.0 — Organization Photo Gallery (조직 사진첩)

> **Version**: 14.0
> **Date**: 2026-03-04
> **Status**: Draft — Design
> **위치**: Organization 내 새 탭 (`/organizations/:orgId` → `?tab=photos`)

---

## 1. 개요

### 1.1 배경

조직(Organization) 단위로 행사, 회식, 워크샵, 현장 사진 등을 체계적으로 관리할 공간이 필요하다. ADMIN이 **탭(앨범)** 을 생성하고 사진을 분류하여 업로드하면, MEMBER가 들어와서 사진을 확인하고 다운로드받는 워크플로우를 구현한다.

### 1.2 핵심 컨셉

```
┌──────────────────────────────────────────────────────────────┐
│  Organization: BRIDGE Corp                                   │
│                                                              │
│  [대시보드] [인원] [휴가] [워크스페이스] [📷 사진] [설정]      │  ← 새 탭
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ [전체] [2026 신년회] [3월 워크샵] [팀빌딩] [+ 추가]   │    │  ← ADMIN만 탭 관리
│  │                                                      │    │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │    │
│  │  │  📷  │ │  📷  │ │  📷  │ │  📷  │ │  📷  │      │    │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘      │    │  ← 사진 그리드
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │    │
│  │  │  📷  │ │  📷  │ │  📷  │ │  📷  │ │  📷  │      │    │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘      │    │
│  │                                                      │    │
│  │  ──────── 무한 스크롤 (30장씩 로딩) ────────         │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

- **Organization 탭**: 기존 OrganizationDetailPage의 새 탭으로 추가
- **탭(앨범) 기반 분류**: ADMIN/OWNER가 탭을 만들어 사진을 카테고리별 관리
- **역할 기반 권한**: OWNER/ADMIN 업로드·관리, MEMBER 조회·다운로드
- **대량 사진 대응**: Cursor 페이지네이션 + 무한 스크롤 + 탭 분류

### 1.3 인증 & 접근

**별도 로그인 불필요** — 기존 조직 멤버십 체계 그대로 사용:

```
Organization 접근 → OrganizationMember 확인 → OrgRole (OWNER/ADMIN/MEMBER)
→ Photo 탭 접근 → 역할별 UI 분기
```

- 기존 `OrganizationService.getOrgMemberOrThrow()` → 멤버 확인
- 기존 `checkAdminOrAbove()` → 업로드·탭 관리·삭제
- MEMBER → 조회·다운로드만

---

## 2. 권한 모델

### 2.1 역할별 기능 매트릭스

| 기능 | OWNER | ADMIN | MEMBER |
|------|:-----:|:-----:|:------:|
| 사진 조회 | O | O | O |
| 사진 다운로드 (개별) | O | O | O |
| 사진 일괄 다운로드 (ZIP) | O | O | O |
| 라이트박스 뷰어 | O | O | O |
| 사진 업로드 | O | O | X |
| 사진 삭제 | O | O | X |
| 탭(앨범) 생성·수정·삭제 | O | O | X |
| 탭 순서 변경 | O | O | X |
| 대표 이미지 설정 | O | O | X |

### 2.2 권한 체크 (기존 패턴 재사용)

```java
// Backend — OrganizationService의 기존 메서드 그대로 사용
organizationService.checkAdminOrAbove(orgId, userId);  // 업로드·관리
organizationService.getOrgMemberOrThrow(orgId, userId); // 조회·다운로드 (멤버 여부만 확인)

// Frontend — useOrgData() 기존 결과 사용
const { isAdmin } = useOrgData();
// isAdmin → 업로드 버튼, 탭 관리 UI 표시
// !isAdmin → 다운로드 버튼만 표시
```

---

## 3. 정보 구조

### 3.1 핵심 엔티티

```
OrgPhotoTab (탭 — 사진 카테고리/앨범)
├── id              — String (UUID, PK)
├── organization_id — String (FK → Organization)
├── name            — VARCHAR(50) — "2026 신년회", "3월 워크샵"
├── description     — VARCHAR(200, nullable)
├── cover_photo_id  — String (FK → OrgPhoto, nullable — 대표 이미지)
├── photo_count     — Integer (비정규화 — 빠른 카운트)
├── sort_order      — Integer (탭 정렬)
├── created_by      — String (FK → User)
├── created_at      — TIMESTAMP (UTC)
└── updated_at      — TIMESTAMP (UTC)

OrgPhoto (사진)
├── id                — String (UUID, PK)
├── tab_id            — String (FK → OrgPhotoTab)
├── organization_id   — String (FK → Organization — 직접 조회용 비정규화)
├── s3_key            — VARCHAR(500)
├── thumbnail_key     — VARCHAR(500)
├── url               — VARCHAR(500) — CloudFront URL (캐시)
├── thumbnail_url     — VARCHAR(500)
├── original_filename — VARCHAR(255)
├── file_size         — Long (bytes)
├── content_type      — VARCHAR(50)
├── width             — Integer (nullable)
├── height            — Integer (nullable)
├── caption           — VARCHAR(300, nullable)
├── uploaded_by       — String (FK → User)
├── created_at        — TIMESTAMP (UTC)
└── updated_at        — TIMESTAMP (UTC)
```

### 3.2 S3 키 구조

```
photos/                                        ← 새 prefix
└── org/
    └── {orgId}/
        └── {tabId}/
            ├── {uuid}.{ext}                   ← 원본
            └── {uuid}_thumb.jpg               ← 썸네일 (400x400)
```

### 3.3 ERD

```
Organization (1) ──── (N) OrgPhotoTab (1) ──── (N) OrgPhoto
                              │                        │
                              └── created_by ──→ User
                                                       └── uploaded_by ──→ User
```

---

## 4. API 설계

### 4.1 탭(앨범) API

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/v1/organizations/{orgId}/photo-tabs` | MEMBER+ | 탭 목록 (사진 수 포함) |
| POST | `/api/v1/organizations/{orgId}/photo-tabs` | ADMIN+ | 탭 생성 |
| PUT | `/api/v1/organizations/{orgId}/photo-tabs/{tabId}` | ADMIN+ | 탭 수정 (이름, 설명, 대표사진) |
| DELETE | `/api/v1/organizations/{orgId}/photo-tabs/{tabId}` | ADMIN+ | 탭 삭제 (사진 포함) |
| PATCH | `/api/v1/organizations/{orgId}/photo-tabs/reorder` | ADMIN+ | 탭 순서 변경 |

### 4.2 사진 API

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/v1/organizations/{orgId}/photos` | MEMBER+ | 사진 목록 (탭 필터, 페이지네이션) |
| POST | `/api/v1/organizations/{orgId}/photo-tabs/{tabId}/photos` | ADMIN+ | 사진 업로드 (최대 20장) |
| DELETE | `/api/v1/organizations/{orgId}/photos/{photoId}` | ADMIN+ | 사진 삭제 |
| DELETE | `/api/v1/organizations/{orgId}/photos/batch` | ADMIN+ | 일괄 삭제 |
| PUT | `/api/v1/organizations/{orgId}/photos/{photoId}` | ADMIN+ | 사진 수정 (캡션, 탭 이동) |
| GET | `/api/v1/organizations/{orgId}/photos/{photoId}/download` | MEMBER+ | 원본 다운로드 URL |
| POST | `/api/v1/organizations/{orgId}/photos/download` | MEMBER+ | 일괄 다운로드 (ZIP) |

### 4.3 페이지네이션 (Cursor 기반)

```
GET /api/v1/organizations/{orgId}/photos?tab_id={tabId}&cursor={lastPhotoId}&size=30

// cursor 기반 — 대량 사진에서도 성능 일정
// size 기본값: 30 (모바일 20, 데스크톱 30~50)
// tab_id 생략 시 → 전체 사진 (organization_id로 조회)
```

### 4.4 요청·응답 예시

```json
// POST /api/v1/organizations/{orgId}/photo-tabs — 탭 생성
{
  "name": "2026 신년회",
  "description": "2026년 1월 신년회 사진 모음"
}

// GET /api/v1/organizations/{orgId}/photo-tabs — 탭 목록 응답
{
  "tabs": [
    {
      "id": "tab-uuid-1",
      "name": "2026 신년회",
      "description": "2026년 1월 신년회 사진 모음",
      "photo_count": 156,
      "cover_photo_url": "https://cdn.bridgespots.com/photos/org/org-1/tab-1/abc_thumb.jpg",
      "sort_order": 0,
      "created_by": { "id": "user-1", "name": "김관리" },
      "created_at": "2026-01-15T03:00:00Z"
    },
    {
      "id": "tab-uuid-2",
      "name": "3월 워크샵",
      "photo_count": 45,
      "cover_photo_url": null,
      "sort_order": 1,
      "created_by": { "id": "user-1", "name": "김관리" },
      "created_at": "2026-03-01T06:00:00Z"
    }
  ]
}

// GET /api/v1/organizations/{orgId}/photos?tab_id=tab-uuid-1&size=30 — 사진 목록
{
  "photos": [
    {
      "id": "photo-uuid-1",
      "tab_id": "tab-uuid-1",
      "tab_name": "2026 신년회",
      "thumbnail_url": "https://cdn.bridgespots.com/photos/org/org-1/tab-1/abc_thumb.jpg",
      "original_url": "https://cdn.bridgespots.com/photos/org/org-1/tab-1/abc.jpg",
      "original_filename": "IMG_2026.jpg",
      "file_size": 2048576,
      "width": 4032,
      "height": 3024,
      "caption": "팀 빌딩 액티비티",
      "uploaded_by": { "id": "user-1", "name": "김관리" },
      "created_at": "2026-01-15T09:15:00Z"
    }
  ],
  "next_cursor": "photo-uuid-30",
  "has_next": true,
  "total_count": 156
}

// POST /api/v1/organizations/{orgId}/photos/download — 일괄 다운로드
{
  "photo_ids": ["photo-uuid-1", "photo-uuid-2", "photo-uuid-5"]
}
// → Response: application/zip (StreamingResponseBody)
```

---

## 5. 디자인 가이드 — Organization 페이지 일관성

> 기존 Organization 페이지(대시보드, 인원, 워크스페이스 등)의 디자인 토큰을 **100% 준수**하여
> 사진 탭이 이질감 없이 자연스럽게 녹아드는 것을 목표로 한다.

### 5.1 전체 레이아웃 (기존 패턴 그대로)

```
┌─ OrganizationDetailPage ─────────────────────────────────────────┐
│  [Header: 조직명 + 역할 뱃지 + 탭 네비게이션]                      │
│  ─── sticky top-0 z-30 bg-bridge-dark/80 backdrop-blur-xl ───   │
│                                                                   │
│  ┌─ Content Area ──────────────────────────────────────────────┐ │
│  │  max-w-6xl mx-auto px-4 py-4 md:px-6 md:py-6              │ │
│  │                                                              │ │
│  │  ← 기존 탭: 대시보드, 인원, 휴가, 워크스페이스, 설정 →       │ │
│  │  ← 새 탭: 📷 사진 →                                        │ │
│  │                                                              │ │
│  │  [OrgPhotoGalleryTab 컴포넌트가 여기에 렌더링]               │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

- 컨텐츠 영역은 기존 `max-w-6xl mx-auto px-4 py-4 md:px-6 md:py-6` 그대로
- 사진 탭도 동일 컨테이너 안에서 렌더링 → 여백·너비 통일

### 5.2 메인 탭 바 — 기존 Pill 스타일 유지

```tsx
// 기존 Organization 탭 바 그대로 — Camera 아이콘 + "사진" 라벨 추가
<nav className="flex items-center gap-1 bg-bridge-surface p-1 rounded-xl
  border border-bridge-border overflow-x-auto shrink-0">
  ...
  {/* 사진 탭 — workspace와 settings 사이 */}
  <button className={cn(
    "flex items-center gap-1.5 px-3 md:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap",
    isActive
      ? "bg-gradient-to-r from-bridge-secondary to-bridge-accent text-white shadow-lg shadow-bridge-secondary/20"
      : "text-slate-400 hover:text-foreground hover:bg-bridge-surface-hover"
  )}>
    <Camera size={14} />
    {t('organization.tabs.photos')}
  </button>
  ...
</nav>
```

**핵심**: 기존 탭과 동일한 gradient 활성 스타일 (`from-bridge-secondary to-bridge-accent`), 동일 사이즈 (`text-xs`, `size={14}`)

### 5.3 앨범(탭) 바 — Sub-Tab 스타일 차용

기존 sub-tab 바 (`people` → members/chart, `workspace` → boards/insights/okr)와 동일한 톤으로 앨범 필터를 배치한다.

```tsx
// 앨범 바 — 기존 sub-tab 영역에 배치
<div className="flex items-center gap-2 py-3 overflow-x-auto custom-scrollbar">
  {/* "전체" 가상 탭 */}
  <button className={cn(
    "flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
    activeAlbumId === null
      ? "bg-foreground/10 text-foreground"       // ← 기존 sub-tab 활성 스타일
      : "text-slate-400 hover:text-foreground"    // ← 기존 sub-tab 비활성 스타일
  )}>
    {t('photoGallery.allPhotos')}
    <span className="ml-1.5 text-[10px] opacity-60">{totalCount}</span>
  </button>

  {/* 앨범 목록 */}
  {albums.map(album => (
    <button key={album.id} className={cn(
      "flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
      activeAlbumId === album.id
        ? "bg-foreground/10 text-foreground"
        : "text-slate-400 hover:text-foreground"
    )}>
      {album.name}
      <span className="ml-1.5 text-[10px] opacity-60">{album.photo_count}</span>
    </button>
  ))}

  {/* 앨범 추가 — ADMIN만 */}
  {isAdmin && (
    <button className="p-1.5 rounded-lg text-slate-500 hover:text-foreground
      hover:bg-foreground/5 transition-colors shrink-0">
      <Plus size={14} />
    </button>
  )}
</div>
```

**핵심**: 기존 `bg-foreground/5` 안의 `p-0.5` sub-tab 패턴을 따르되, 앨범 수가 유동적이므로 `overflow-x-auto` 가로 스크롤 허용

### 5.4 툴바 — 기존 Section Header 패턴

```tsx
// 툴바 — OrgDashboardTab의 섹션 헤더와 동일 레이아웃
<div className="flex items-center justify-between pb-3">
  <div className="flex items-center gap-2">
    <h3 className="text-[13px] md:text-sm font-bold text-foreground">
      {activeAlbum?.name || t('photoGallery.allPhotos')}
    </h3>
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full
      bg-bridge-accent/15 text-bridge-accent">
      {photoCount}장
    </span>
  </div>
  <div className="flex items-center gap-1.5">
    {/* 선택 모드 토글 */}
    <button className="p-2 rounded-lg text-slate-400 hover:text-foreground
      hover:bg-foreground/5 transition-colors">
      <CheckSquare size={16} />
    </button>
    {/* 업로드 — ADMIN만 */}
    {isAdmin && (
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
        font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 transition-all">
        <Upload size={14} />
        {t('photoGallery.upload')}
      </button>
    )}
  </div>
</div>
```

**핵심**: 왼쪽(제목+뱃지), 오른쪽(액션 버튼) 구도는 기존 Organization 섹션 헤더와 동일

### 5.5 사진 그리드 — Card 패턴 준수

```tsx
// 사진 카드 — bridge-obsidian 배경 + foreground/[0.08] 테두리
<div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5">
  {photos.map((photo, i) => (
    <motion.div
      key={photo.id}
      className="relative aspect-square rounded-xl overflow-hidden cursor-pointer
        bg-bridge-obsidian border border-foreground/[0.08]
        hover:border-foreground/[0.12] transition-all group"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.02 }}    // 사진이 많으므로 0.02로 빠르게
    >
      <img
        src={photo.thumbnail_url}
        alt={photo.caption || photo.original_filename}
        className="w-full h-full object-cover"
        loading="lazy"
      />

      {/* 호버 오버레이 — 부드럽게 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent
        opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
        <span className="text-[10px] text-white/90 truncate flex-1">
          {photo.original_filename}
        </span>
        <button onClick={(e) => { e.stopPropagation(); downloadSingle(photo); }}
          className="p-1 rounded-md hover:bg-white/20 transition-colors shrink-0">
          <Download size={14} className="text-white" />
        </button>
      </div>

      {/* 선택 모드 체크박스 */}
      {selectMode && (
        <div className="absolute top-2 left-2">
          <div className={cn(
            "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors",
            selected.has(photo.id)
              ? "bg-bridge-accent border-bridge-accent"
              : "border-white/60 bg-black/20"
          )}>
            {selected.has(photo.id) && <Check size={12} className="text-white" />}
          </div>
        </div>
      )}
    </motion.div>
  ))}
</div>
```

**디자인 포인트**:
- `rounded-xl` (기존 카드: `rounded-2xl`, 사진은 작으므로 `rounded-xl`로 조정)
- `border border-foreground/[0.08]` → `hover:border-foreground/[0.12]` (기존 카드 호버 패턴)
- `bg-bridge-obsidian` (카드 배경색 통일)
- 오버레이: `from-black/50` 그라디언트로 하단만 어둡게 (텍스트 가독성)
- 진입 애니메이션: `y: 8`, delay `0.02` (사진이 많으므로 빠른 stagger)

### 5.6 Empty State — 기존 패턴 100% 동일

```tsx
// 기존 OrgBoardsTab, OrgMembersTab의 EmptyState 패턴 그대로
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  className="flex flex-col items-center justify-center py-16 text-center"
>
  <div className="w-16 h-16 rounded-2xl bg-bridge-accent/10 flex items-center justify-center mb-4">
    <Camera size={32} className="text-bridge-accent/60" />
  </div>
  <h3 className="text-base font-bold text-foreground mb-1">
    {t('photoGallery.emptyTitle')}
  </h3>
  <p className="text-sm text-muted-foreground mb-5 max-w-xs">
    {isAdmin
      ? t('photoGallery.emptyAdminDescription')
      : t('photoGallery.emptyDescription')}
  </p>
  {isAdmin && (
    <button className="flex items-center gap-2 px-4 py-2.5 bg-bridge-accent text-white
      rounded-xl font-bold text-sm hover:bg-bridge-accent/90
      hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all">
      <Upload size={16} />
      {t('photoGallery.upload')}
    </button>
  )}
</motion.div>
```

**핵심**: 아이콘 컨테이너 `w-16 h-16 rounded-2xl bg-bridge-accent/10`, 아이콘 `size={32} text-bridge-accent/60`, 버튼 `rounded-xl font-bold` — 기존 EmptyState와 **픽셀 단위로 동일**

### 5.7 모달 — MotionModal 기존 규격

```tsx
// 업로드 모달 & 앨범 생성 모달 — 기존 MotionModal 규격 준수
<MotionModal open={open} onClose={onClose}>
  {/* 1) Top Accent Line — 기존 규격 */}
  <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

  {/* 2) Header — px-5 pt-4 pb-3 + border-b */}
  <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
    <div className="w-8 h-8 rounded-lg bg-bridge-accent/20 flex items-center justify-center">
      <Upload size={16} className="text-bridge-accent" />
    </div>
    <div>
      <h3 className="text-base font-bold text-foreground">{t('photoGallery.uploadTitle')}</h3>
      <p className="text-[10px] text-slate-500">{t('photoGallery.uploadHint')}</p>
    </div>
  </div>

  {/* 3) Body — px-5 pb-5 pt-4 space-y-4 */}
  <div className="px-5 pb-5 pt-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
    {/* 앨범 선택 드롭다운 */}
    <div>
      <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
        {t('photoGallery.album')}
      </label>
      <select className="w-full bg-foreground/[0.03] border border-foreground/[0.08] rounded-xl
        py-2.5 px-3 text-sm text-foreground focus:outline-none focus:ring-2
        focus:ring-bridge-accent/50 transition-all">
        {albums.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </div>

    {/* 드롭존 */}
    <div className={cn(
      "border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer",
      isDragging
        ? "border-bridge-accent/50 bg-bridge-accent/5"
        : "border-foreground/10 hover:border-foreground/20"
    )}>
      <ImagePlus size={32} className="mx-auto mb-3 text-slate-500" />
      <p className="text-sm text-slate-400">{t('photoGallery.uploadDropzone')}</p>
      <p className="text-[10px] text-slate-600 mt-1">{t('photoGallery.uploadFormats')}</p>
    </div>

    {/* 미리보기 그리드 */}
    {previews.length > 0 && (
      <div className="grid grid-cols-4 gap-2">
        {previews.map((p, i) => (
          <div key={i} className="relative aspect-square rounded-lg overflow-hidden
            border border-foreground/[0.08]">
            <img src={p.previewUrl} className="w-full h-full object-cover" />
            <button onClick={() => removePreview(i)}
              className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60
                hover:bg-black/80 transition-colors">
              <X size={12} className="text-white" />
            </button>
          </div>
        ))}
      </div>
    )}

    {/* 업로드 프로그레스 */}
    {uploading && (
      <div className="space-y-2">
        <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-bridge-accent to-bridge-secondary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-500 text-center">
          {t('photoGallery.uploadProgress', { current: uploadedCount, total: totalCount })}
        </p>
      </div>
    )}
  </div>

  {/* 4) Footer — px-5 py-3 + border-t */}
  <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
    <span className="text-[10px] text-slate-600">Esc {t('common.close')}</span>
    <button
      onClick={handleUpload}
      disabled={previews.length === 0 || uploading}
      className="px-4 py-1.5 rounded-lg text-xs font-bold text-white
        bg-bridge-accent disabled:opacity-50 hover:bg-bridge-accent/90 transition-all"
    >
      {uploading
        ? t('photoGallery.uploading')
        : t('photoGallery.uploadCount', { count: previews.length })}
    </button>
  </div>
</MotionModal>
```

### 5.8 라이트박스 — Organization 톤 유지

라이트박스는 전체화면이지만 버튼·타이포그래피 스타일은 Organization과 통일한다.

```tsx
<AnimatePresence>
  {lightboxPhoto && (
    <motion.div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      {/* 상단 바 — glass 효과 */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/40 backdrop-blur-sm">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/90 truncate">
            {lightboxPhoto.caption || lightboxPhoto.original_filename}
          </p>
          <p className="text-[10px] text-white/40">
            {lightboxPhoto.original_filename} · {formatFileSize(lightboxPhoto.file_size)}
          </p>
        </div>
        <div className="flex items-center gap-1 ml-4">
          {/* 다운로드 — 기존 icon button 패턴 */}
          <button className="p-2 rounded-lg text-white/60 hover:text-white
            hover:bg-white/10 transition-colors">
            <Download size={18} />
          </button>
          {/* 삭제 — ADMIN만 */}
          {isAdmin && (
            <button className="p-2 rounded-lg text-white/60 hover:text-red-400
              hover:bg-white/10 transition-colors">
              <Trash2 size={18} />
            </button>
          )}
          {/* 닫기 */}
          <button className="p-2 rounded-lg text-white/60 hover:text-white
            hover:bg-white/10 transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 이미지 영역 */}
      <div className="flex-1 flex items-center justify-center px-12 py-4">
        <motion.img
          key={lightboxPhoto.id}
          src={lightboxPhoto.original_url}
          alt={lightboxPhoto.caption}
          className="max-w-full max-h-full object-contain rounded-lg"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
        />
      </div>

      {/* 좌우 네비게이션 — 부드러운 원형 버튼 */}
      <button className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5
        rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60
        text-white/60 hover:text-white transition-all" onClick={goPrev}>
        <ChevronLeft size={20} />
      </button>
      <button className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5
        rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60
        text-white/60 hover:text-white transition-all" onClick={goNext}>
        <ChevronRight size={20} />
      </button>

      {/* 하단 인덱스 */}
      <div className="text-center py-3">
        <span className="text-[11px] text-white/40 font-medium">
          {currentIndex + 1} / {photos.length}
        </span>
      </div>
    </motion.div>
  )}
</AnimatePresence>
```

### 5.9 선택 모드 — 하단 액션 바

```tsx
// 선택 모드 활성 시 하단에 플로팅 액션 바
<AnimatePresence>
  {selectMode && selected.size > 0 && (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40
        flex items-center gap-3 px-4 py-2.5 rounded-2xl
        bg-bridge-obsidian border border-foreground/[0.08] shadow-2xl"
    >
      <span className="text-xs font-bold text-foreground">
        {t('photoGallery.selectedCount', { count: selected.size })}
      </span>
      <div className="w-px h-5 bg-foreground/10" />
      {/* 다운로드 — 모든 역할 */}
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
        font-bold bg-bridge-accent text-white hover:bg-bridge-accent/90 transition-all">
        <Download size={14} />
        {t('photoGallery.download')}
      </button>
      {/* 삭제 — ADMIN만 */}
      {isAdmin && (
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
          font-bold bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-all">
          <Trash2 size={14} />
          {t('photoGallery.delete')}
        </button>
      )}
      {/* 선택 해제 */}
      <button className="p-1.5 rounded-lg text-slate-400 hover:text-foreground
        hover:bg-foreground/5 transition-colors">
        <X size={16} />
      </button>
    </motion.div>
  )}
</AnimatePresence>
```

### 5.10 디자인 토큰 요약 — Organization 준수 체크리스트

| 항목 | 사진 갤러리 적용값 | 기존 Org 패턴 | 일치 |
|------|-------------------|---------------|:----:|
| 페이지 배경 | `bg-bridge-dark` | `bg-bridge-dark` | ✅ |
| 카드 배경 | `bg-bridge-obsidian` | `bg-bridge-obsidian` | ✅ |
| 카드 테두리 | `border-foreground/[0.08]` | `border-foreground/[0.08]` | ✅ |
| 카드 호버 | `hover:border-foreground/[0.12]` | `hover:border-foreground/[0.12]` | ✅ |
| 카드 라운드 | `rounded-xl` (사진), `rounded-2xl` (모달) | `rounded-xl`~`rounded-2xl` | ✅ |
| 메인 탭 활성 | `from-bridge-secondary to-bridge-accent` | 동일 gradient | ✅ |
| 서브 탭 활성 | `bg-foreground/10 text-foreground` | `bg-foreground/10 text-foreground` | ✅ |
| 서브 탭 비활성 | `text-slate-400 hover:text-foreground` | 동일 | ✅ |
| Primary 버튼 | `bg-bridge-accent text-white rounded-xl font-bold` | 동일 | ✅ |
| Icon 버튼 | `p-2 rounded-lg text-slate-400 hover:text-foreground hover:bg-foreground/5` | 동일 | ✅ |
| 뱃지 | `text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent` | `/15` 통일 | ✅ |
| 타이틀 | `text-[13px] md:text-sm font-bold text-foreground` | 동일 | ✅ |
| 라벨 | `text-[11px] font-bold uppercase tracking-widest text-slate-400` | 동일 | ✅ |
| 힌트 | `text-[10px] text-slate-500` / `text-slate-600` | 동일 | ✅ |
| 인풋 | `bg-foreground/[0.03] border-foreground/[0.08] rounded-xl focus:ring-bridge-accent/50` | 동일 | ✅ |
| Empty State 아이콘 | `w-16 h-16 rounded-2xl bg-bridge-accent/10` + `size={32} text-bridge-accent/60` | 동일 | ✅ |
| 진입 애니메이션 | `opacity: 0, y: 8` → `delay: i * 0.02` | `y: 8`, delay `0.04` (사진은 빠르게) | ✅ |
| 스크롤바 | `custom-scrollbar` | `custom-scrollbar` | ✅ |
| 회색톤 | `slate-` only | `slate-` only (zinc 금지) | ✅ |
| 모달 | MotionModal 규격 (accent line + px-5 + border-b/t) | 동일 | ✅ |
| 프로그레스 바 | `bg-gradient-to-r from-bridge-accent to-bridge-secondary` | Bridge 색상 사용 | ✅ |

### 5.11 금지 사항

| 금지 항목 | 사용해야 할 것 |
|-----------|---------------|
| `zinc-*` | `slate-*` |
| `border-black/5 dark:border-white/5` | `border-foreground/[0.08]` |
| `text-slate-900 dark:text-white` | `text-foreground` |
| `kanban-scrollbar` | `custom-scrollbar` |
| 커스텀 spinner | `<Loader2 className="animate-spin text-bridge-accent" />` |
| 하드코딩 색상 | Bridge 변수 (`bridge-dark`, `bridge-obsidian`, `bridge-accent`) |
| 카드 배경 `bg-white dark:bg-gray-800` | `bg-bridge-obsidian` |
| `rounded-md` (카드) | `rounded-xl` (사진), `rounded-2xl` (큰 카드/모달) |

---

## 6. Frontend 컴포넌트 설계

### 6.1 진입점 — Organization 탭

```tsx
// OrganizationDetailPage.tsx — TAB_GROUPS에 추가
{
  key: "photos",
  labelKey: "organization.tabs.photos",
  icon: Camera,           // Lucide: Camera
  defaultTab: "photos",
}

// 위치: workspace(4번째)와 settings(5번째) 사이에 삽입
// adminOnly: false — 모든 멤버 접근 가능 (ADMIN만 업로드 UI 표시)
```

### 6.2 컴포넌트 트리

```
OrgPhotoGalleryTab                        — 사진 탭 최상위 (조직 탭 컴포넌트)
├── PhotoAlbumBar                         — 앨범(탭) 리스트 (가로 스크롤, 카드형)
│   ├── AlbumCard                         — 커버 이미지 + 앨범명 + 사진 수
│   │   └── AlbumContextMenu              — ADMIN: 수정·삭제 (⋯ 메뉴)
│   └── AddAlbumButton (+ 아이콘)          — ADMIN만 표시
├── PhotoToolbar                          — 액션 바
│   ├── AlbumTitle                        — 현재 앨범명 + 사진 수
│   ├── UploadButton                      — ADMIN만 표시
│   ├── SelectModeToggle                  — 선택 모드 on/off
│   ├── DownloadSelectedButton            — 선택 시 표시 (모든 역할)
│   └── DeleteSelectedButton              — 선택 시 표시 (ADMIN만)
├── PhotoGrid                             — 사진 그리드 (무한 스크롤)
│   └── PhotoCard                         — 썸네일 카드
│       ├── Checkbox (선택 모드)
│       ├── Thumbnail (aspect-square)
│       └── HoverOverlay (파일명, 다운로드 아이콘)
├── PhotoLightbox                         — 전체화면 뷰어 (모든 역할)
│   ├── 좌/우 네비게이션
│   ├── 다운로드 버튼
│   ├── 삭제 버튼 (ADMIN만)
│   ├── 캡션 표시·편집 (ADMIN만 편집)
│   └── 사진 인덱스 표시
├── PhotoUploadModal (MotionModal)        — 드래그&드롭 업로드 (ADMIN만)
│   ├── DropZone
│   ├── PreviewGrid + 캡션 입력
│   ├── 대상 탭 선택
│   └── UploadProgress (개별 + 전체)
├── AlbumCreateModal (MotionModal)        — 앨범 생성·수정 (ADMIN만)
└── EmptyState                            — 사진 없을 때 안내
```

### 6.3 핵심 UI 명세

#### 앨범(탭) 바 — 카드형 가로 스크롤

```tsx
<div className="flex items-center gap-3 px-4 py-3 overflow-x-auto custom-scrollbar">
  {/* "전체" 가상 탭 */}
  <button
    onClick={() => setActiveAlbumId(null)}
    className={cn(
      "flex-shrink-0 px-4 py-2 rounded-xl text-[13px] font-medium transition-colors",
      activeAlbumId === null
        ? "bg-bridge-accent text-white"
        : "bg-foreground/5 text-slate-400 hover:text-foreground hover:bg-foreground/10"
    )}
  >
    {t('photoGallery.allPhotos')}
    <span className="ml-1.5 text-[10px] opacity-70">{totalCount}</span>
  </button>

  {/* 앨범 탭 */}
  {albums.map(album => (
    <button
      key={album.id}
      onClick={() => setActiveAlbumId(album.id)}
      className={cn(
        "flex-shrink-0 px-4 py-2 rounded-xl text-[13px] font-medium transition-colors",
        activeAlbumId === album.id
          ? "bg-bridge-accent text-white"
          : "bg-foreground/5 text-slate-400 hover:text-foreground hover:bg-foreground/10"
      )}
    >
      {album.name}
      <span className="ml-1.5 text-[10px] opacity-70">{album.photo_count}</span>
    </button>
  ))}

  {/* 앨범 추가 — ADMIN만 */}
  {isAdmin && (
    <button
      onClick={() => setShowCreateAlbum(true)}
      className="p-2 rounded-xl text-slate-500 hover:text-foreground
        hover:bg-foreground/5 transition-colors shrink-0"
    >
      <Plus className="w-4 h-4" />
    </button>
  )}
</div>
```

#### 사진 그리드 — 무한 스크롤

```tsx
<div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 p-4">
  {photos.map((photo, i) => (
    <motion.div
      key={photo.id}
      className="relative aspect-square rounded-lg overflow-hidden cursor-pointer
        bg-foreground/5 group"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.02 }}
      onClick={() => selectMode ? toggleSelect(photo.id) : openLightbox(photo)}
    >
      <img
        src={photo.thumbnail_url}
        alt={photo.caption || photo.original_filename}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      {/* 호버 오버레이 */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30
        transition-colors flex items-end justify-between p-2 opacity-0
        group-hover:opacity-100">
        <span className="text-[10px] text-white truncate max-w-[70%]">
          {photo.original_filename}
        </span>
        <button onClick={(e) => { e.stopPropagation(); downloadSingle(photo); }}>
          <Download className="w-4 h-4 text-white" />
        </button>
      </div>
      {/* 선택 모드 체크박스 */}
      {selectMode && (
        <div className="absolute top-2 left-2">
          <div className={cn(
            "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors",
            selected.has(photo.id)
              ? "bg-bridge-accent border-bridge-accent"
              : "border-white/60 bg-black/20"
          )}>
            {selected.has(photo.id) && <Check className="w-3 h-3 text-white" />}
          </div>
        </div>
      )}
    </motion.div>
  ))}
</div>

{/* 무한 스크롤 트리거 */}
<div ref={observerRef} className="h-10 flex items-center justify-center">
  {isFetchingNext && <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />}
</div>
```

#### 라이트박스 (전체화면 뷰어)

```tsx
<AnimatePresence>
  {lightboxPhoto && (
    <motion.div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* 상단 바 */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white/80 truncate">{lightboxPhoto.caption}</p>
          <p className="text-[10px] text-white/40">{lightboxPhoto.original_filename}</p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button onClick={() => downloadSingle(lightboxPhoto)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <Download className="w-5 h-5 text-white/70 hover:text-white" />
          </button>
          {isAdmin && (
            <button onClick={() => deletePhoto(lightboxPhoto.id)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors">
              <Trash2 className="w-5 h-5 text-white/70 hover:text-red-400" />
            </button>
          )}
          <button onClick={closeLightbox}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5 text-white/70 hover:text-white" />
          </button>
        </div>
      </div>

      {/* 이미지 */}
      <div className="flex-1 flex items-center justify-center px-12">
        <img
          src={lightboxPhoto.original_url}
          alt={lightboxPhoto.caption}
          className="max-w-full max-h-full object-contain"
        />
      </div>

      {/* 좌/우 화살표 */}
      <button className="absolute left-4 top-1/2 -translate-y-1/2 p-2
        rounded-full bg-black/30 hover:bg-black/60 transition-colors"
        onClick={goPrev}>
        <ChevronLeft className="w-6 h-6 text-white/70" />
      </button>
      <button className="absolute right-4 top-1/2 -translate-y-1/2 p-2
        rounded-full bg-black/30 hover:bg-black/60 transition-colors"
        onClick={goNext}>
        <ChevronRight className="w-6 h-6 text-white/70" />
      </button>

      {/* 하단: 인덱스 */}
      <div className="text-center py-3 text-[11px] text-white/50">
        {currentIndex + 1} / {photos.length}
      </div>
    </motion.div>
  )}
</AnimatePresence>
```

### 6.4 업로드 UX (ADMIN 전용)

```
1. "업로드" 버튼 클릭 → MotionModal 오픈
2. 드래그 & 드롭 영역 또는 파일 선택 (최대 20장, 각 10MB 제한)
   - 허용: image/jpeg, image/png, image/webp, image/gif
3. 미리보기 그리드 표시
   - 각 사진 아래 캡션 입력 (선택)
   - 업로드 대상 앨범 선택 (현재 선택된 앨범 기본)
4. "업로드" 버튼 → 프로그레스 바 (전체 진행률)
5. 완료 시 그리드에 자동 추가 + 토스트 "N장 업로드 완료"
```

#### 업로드 모달 UI

```tsx
<MotionModal open={showUpload} onClose={() => setShowUpload(false)}>
  {/* Top Accent Line */}
  <div className="h-[2px] bg-gradient-to-r from-bridge-accent/60 via-bridge-secondary/40 to-transparent" />

  {/* Header */}
  <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-foreground/[0.08]">
    <div className="w-8 h-8 rounded-lg bg-bridge-accent/15 flex items-center justify-center">
      <Upload className="w-4 h-4 text-bridge-accent" />
    </div>
    <div>
      <h3 className="text-sm font-bold text-foreground">사진 업로드</h3>
      <p className="text-[10px] text-slate-500">최대 20장, 각 10MB</p>
    </div>
  </div>

  {/* Body */}
  <div className="px-5 pb-5 pt-4 space-y-4">
    {/* 앨범 선택 */}
    <select className="w-full bg-foreground/[0.03] border border-foreground/10 rounded-xl
      py-2.5 px-3 text-sm text-foreground">
      {albums.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>

    {/* 드롭존 */}
    <div className="border-2 border-dashed border-foreground/10 rounded-2xl p-8
      text-center hover:border-bridge-accent/30 transition-colors cursor-pointer"
      onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
      <ImagePlus className="w-10 h-10 mx-auto mb-3 text-slate-500" />
      <p className="text-sm text-slate-400">드래그 & 드롭 또는 클릭하여 선택</p>
      <p className="text-[10px] text-slate-600 mt-1">JPG, PNG, WebP, GIF</p>
    </div>

    {/* 미리보기 그리드 */}
    {previews.length > 0 && (
      <div className="grid grid-cols-4 gap-2 max-h-[300px] overflow-y-auto custom-scrollbar">
        {previews.map((p, i) => (
          <div key={i} className="relative aspect-square rounded-lg overflow-hidden">
            <img src={p.previewUrl} className="w-full h-full object-cover" />
            <button onClick={() => removePreview(i)}
              className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60">
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}
      </div>
    )}

    {/* 업로드 프로그레스 */}
    {uploading && (
      <div className="space-y-2">
        <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden">
          <div className="h-full bg-bridge-accent rounded-full transition-all"
            style={{ width: `${progress}%` }} />
        </div>
        <p className="text-[10px] text-slate-500 text-center">
          {uploadedCount}/{totalCount} 업로드 중...
        </p>
      </div>
    )}
  </div>

  {/* Footer */}
  <div className="flex items-center justify-between px-5 py-3 border-t border-foreground/[0.08]">
    <span className="text-[10px] text-slate-600">Esc 닫기</span>
    <button
      onClick={handleUpload}
      disabled={previews.length === 0 || uploading}
      className="px-4 py-1.5 rounded-lg text-xs font-bold text-white
        bg-bridge-accent disabled:opacity-50"
    >
      {uploading ? '업로드 중...' : `${previews.length}장 업로드`}
    </button>
  </div>
</MotionModal>
```

### 6.5 다운로드 UX (모든 역할)

```
개별:  사진 호버 → 다운로드 아이콘 클릭 → 브라우저 다운로드
       라이트박스 → 다운로드 버튼 → 브라우저 다운로드

일괄:  선택 모드 ON → 사진 체크 → "선택 다운로드" 버튼
       → 서버에서 ZIP 생성 → 브라우저 다운로드
       → 선택 해제 + 토스트 "N장 다운로드 완료"
```

- ZIP 일괄 다운로드 제한: 최대 **100장** 또는 **500MB** (초과 시 에러 + 안내)
- 다운로드 파일명: `{앨범명}_{날짜}.zip` (예: `2026_신년회_20260315.zip`)

### 6.6 반응형 그리드

| 화면 | columns | gap | 비고 |
|------|---------|-----|------|
| Mobile (< 640px) | 3 | 4px | 컴팩트 |
| Tablet (640~1024px) | 4~5 | 6px | |
| Desktop (> 1024px) | 5~6 | 6px | 사이드바 고려 |

### 6.7 무한 스크롤 구현

```tsx
// IntersectionObserver 기반 무한 스크롤
const [photos, setPhotos] = useState<OrgPhoto[]>([]);
const [cursor, setCursor] = useState<string | null>(null);
const [hasNext, setHasNext] = useState(true);
const [loading, setLoading] = useState(false);
const observerRef = useRef<HTMLDivElement>(null);

const fetchPhotos = useCallback(async (nextCursor?: string) => {
  setLoading(true);
  const params = new URLSearchParams({ size: '30' });
  if (activeAlbumId) params.set('tab_id', activeAlbumId);
  if (nextCursor) params.set('cursor', nextCursor);

  const res = await api.get(`/organizations/${orgId}/photos?${params}`);
  setPhotos(prev => nextCursor ? [...prev, ...res.photos] : res.photos);
  setCursor(res.next_cursor);
  setHasNext(res.has_next);
  setLoading(false);
}, [orgId, activeAlbumId]);

useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && hasNext && !loading) {
      fetchPhotos(cursor);
    }
  }, { rootMargin: '200px' });

  if (observerRef.current) observer.observe(observerRef.current);
  return () => observer.disconnect();
}, [hasNext, loading, cursor]);

// 앨범 변경 시 리셋
useEffect(() => {
  setCursor(null);
  setPhotos([]);
  fetchPhotos();
}, [activeAlbumId]);
```

### 6.8 키보드 단축키

| 키 | 동작 | 컨텍스트 |
|----|------|---------|
| `Esc` | 라이트박스·모달 닫기 | 라이트박스/모달 열린 상태 |
| `←` / `→` | 이전/다음 사진 | 라이트박스 |
| `D` | 현재 사진 다운로드 | 라이트박스 |

---

## 7. Backend 설계

### 7.1 패키지 구조

```
com.kanban.domain.photo/
├── controller/
│   └── OrgPhotoController.java           — REST 엔드포인트
├── dto/
│   ├── OrgPhotoRequest.java              — TabCreate, TabUpdate, BatchDelete, BatchDownload
│   └── OrgPhotoResponse.java             — TabInfo, PhotoList, PhotoDetail
├── entity/
│   ├── OrgPhoto.java                     — @Entity
│   └── OrgPhotoTab.java                  — @Entity
├── repository/
│   ├── OrgPhotoRepository.java           — JpaRepository + cursor 페이징
│   └── OrgPhotoTabRepository.java        — JpaRepository
└── service/
    └── OrgPhotoService.java              — FileUploadService 주입
```

### 7.2 Controller

```java
@RestController
@RequestMapping("/api/v1/organizations/{orgId}")
@RequiredArgsConstructor
public class OrgPhotoController {

    private final OrgPhotoService photoService;

    // ── 탭(앨범) ──

    @GetMapping("/photo-tabs")
    public ResponseEntity<List<OrgPhotoResponse.TabInfo>> getTabs(
            @PathVariable String orgId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(photoService.getTabs(orgId, principal.getId()));
    }

    @PostMapping("/photo-tabs")
    public ResponseEntity<OrgPhotoResponse.TabInfo> createTab(
            @PathVariable String orgId,
            @Valid @RequestBody OrgPhotoRequest.TabCreate request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(photoService.createTab(orgId, request, principal.getId()));
    }

    @PutMapping("/photo-tabs/{tabId}")
    public ResponseEntity<OrgPhotoResponse.TabInfo> updateTab(
            @PathVariable String orgId, @PathVariable String tabId,
            @Valid @RequestBody OrgPhotoRequest.TabUpdate request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(photoService.updateTab(orgId, tabId, request, principal.getId()));
    }

    @DeleteMapping("/photo-tabs/{tabId}")
    public ResponseEntity<Void> deleteTab(
            @PathVariable String orgId, @PathVariable String tabId,
            @AuthenticationPrincipal UserPrincipal principal) {
        photoService.deleteTab(orgId, tabId, principal.getId());
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/photo-tabs/reorder")
    public ResponseEntity<Void> reorderTabs(
            @PathVariable String orgId,
            @Valid @RequestBody OrgPhotoRequest.TabReorder request,
            @AuthenticationPrincipal UserPrincipal principal) {
        photoService.reorderTabs(orgId, request, principal.getId());
        return ResponseEntity.noContent().build();
    }

    // ── 사진 ──

    @GetMapping("/photos")
    public ResponseEntity<OrgPhotoResponse.PhotoPage> getPhotos(
            @PathVariable String orgId,
            @RequestParam(required = false) String tab_id,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "30") int size,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
            photoService.getPhotos(orgId, tab_id, cursor, size, principal.getId()));
    }

    @PostMapping("/photo-tabs/{tabId}/photos")
    public ResponseEntity<List<OrgPhotoResponse.PhotoDetail>> uploadPhotos(
            @PathVariable String orgId, @PathVariable String tabId,
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam(value = "captions", required = false) List<String> captions,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(photoService.uploadPhotos(orgId, tabId, files, captions, principal.getId()));
    }

    @DeleteMapping("/photos/{photoId}")
    public ResponseEntity<Void> deletePhoto(
            @PathVariable String orgId, @PathVariable String photoId,
            @AuthenticationPrincipal UserPrincipal principal) {
        photoService.deletePhoto(orgId, photoId, principal.getId());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/photos/batch")
    public ResponseEntity<Void> deletePhotos(
            @PathVariable String orgId,
            @Valid @RequestBody OrgPhotoRequest.BatchDelete request,
            @AuthenticationPrincipal UserPrincipal principal) {
        photoService.deletePhotos(orgId, request, principal.getId());
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/photos/{photoId}")
    public ResponseEntity<OrgPhotoResponse.PhotoDetail> updatePhoto(
            @PathVariable String orgId, @PathVariable String photoId,
            @Valid @RequestBody OrgPhotoRequest.PhotoUpdate request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(
            photoService.updatePhoto(orgId, photoId, request, principal.getId()));
    }

    @GetMapping("/photos/{photoId}/download")
    public ResponseEntity<Map<String, String>> getDownloadUrl(
            @PathVariable String orgId, @PathVariable String photoId,
            @AuthenticationPrincipal UserPrincipal principal) {
        String url = photoService.getDownloadUrl(orgId, photoId, principal.getId());
        return ResponseEntity.ok(Map.of("download_url", url));
    }

    @PostMapping("/photos/download")
    public ResponseEntity<StreamingResponseBody> downloadBatch(
            @PathVariable String orgId,
            @Valid @RequestBody OrgPhotoRequest.BatchDownload request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType("application/zip"))
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"photos.zip\"")
            .body(photoService.downloadBatch(orgId, request, principal.getId()));
    }
}
```

### 7.3 Service 핵심 로직

```java
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrgPhotoService {

    private final OrgPhotoRepository photoRepository;
    private final OrgPhotoTabRepository tabRepository;
    private final OrganizationService orgService;       // 권한 체크 재사용
    private final FileUploadService fileUploadService;  // S3 재사용
    private final MediaUtils mediaUtils;                // 썸네일 생성

    private static final int MAX_UPLOAD_COUNT = 20;
    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    private static final int MAX_BATCH_DOWNLOAD = 100;

    // ── 탭 관리 ──

    public List<OrgPhotoResponse.TabInfo> getTabs(String orgId, String userId) {
        orgService.getOrgMemberOrThrow(orgId, userId); // 멤버 확인
        return tabRepository.findByOrganizationIdOrderBySortOrder(orgId)
            .stream().map(tab -> OrgPhotoResponse.TabInfo.from(tab, fileUploadService))
            .toList();
    }

    @Transactional
    public OrgPhotoResponse.TabInfo createTab(String orgId, OrgPhotoRequest.TabCreate req, String userId) {
        orgService.checkAdminOrAbove(orgId, userId);
        int maxOrder = tabRepository.findMaxSortOrderByOrganizationId(orgId).orElse(-1);

        OrgPhotoTab tab = OrgPhotoTab.builder()
            .id(UUID.randomUUID().toString())
            .organizationId(orgId)
            .name(req.getName())
            .description(req.getDescription())
            .sortOrder(maxOrder + 1)
            .createdBy(userId)
            .build();
        tabRepository.save(tab);
        return OrgPhotoResponse.TabInfo.from(tab, fileUploadService);
    }

    // ── 사진 업로드 ──

    @Transactional
    public List<OrgPhotoResponse.PhotoDetail> uploadPhotos(
            String orgId, String tabId, List<MultipartFile> files,
            List<String> captions, String userId) {

        orgService.checkAdminOrAbove(orgId, userId);
        OrgPhotoTab tab = tabRepository.findById(tabId)
            .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_TAB_NOT_FOUND));

        if (!tab.getOrganizationId().equals(orgId)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }
        if (files.size() > MAX_UPLOAD_COUNT) {
            throw new BusinessException(ErrorCode.PHOTO_UPLOAD_LIMIT_EXCEEDED);
        }

        List<OrgPhotoResponse.PhotoDetail> results = new ArrayList<>();
        for (int i = 0; i < files.size(); i++) {
            MultipartFile file = files.get(i);
            fileUploadService.validateFile(file);
            if (file.getSize() > MAX_FILE_SIZE) {
                throw new BusinessException(ErrorCode.FILE_TOO_LARGE);
            }

            String uuid = UUID.randomUUID().toString();
            String ext = getExtension(file.getOriginalFilename());
            String key = String.format("photos/org/%s/%s/%s.%s", orgId, tabId, uuid, ext);
            String thumbKey = String.format("photos/org/%s/%s/%s_thumb.jpg", orgId, tabId, uuid);

            // 원본 업로드
            fileUploadService.uploadDirect(file, key);

            // 썸네일 생성 + 업로드
            byte[] thumbnail = mediaUtils.generateThumbnail(file.getInputStream(),
                file.getContentType(), 400, 400);
            if (thumbnail != null) {
                fileUploadService.uploadDirect(thumbnail, thumbKey, "image/jpeg");
            }

            // 이미지 크기 추출
            int[] dimensions = mediaUtils.getImageDimensions(file.getInputStream());

            OrgPhoto photo = OrgPhoto.builder()
                .id(UUID.randomUUID().toString())
                .tab(tab)
                .organizationId(orgId)
                .s3Key(key)
                .thumbnailKey(thumbKey)
                .url(fileUploadService.resolveUrl(key))
                .thumbnailUrl(fileUploadService.resolveUrl(thumbKey))
                .originalFilename(file.getOriginalFilename())
                .fileSize(file.getSize())
                .contentType(file.getContentType())
                .width(dimensions != null ? dimensions[0] : null)
                .height(dimensions != null ? dimensions[1] : null)
                .caption(captions != null && i < captions.size() ? captions.get(i) : null)
                .uploadedBy(userId)
                .build();
            photoRepository.save(photo);
            results.add(OrgPhotoResponse.PhotoDetail.from(photo));
        }

        // photo_count 비정규화 업데이트
        tab.updatePhotoCount(photoRepository.countByTabId(tabId));
        return results;
    }

    // ── 사진 조회 (cursor 페이지네이션) ──

    public OrgPhotoResponse.PhotoPage getPhotos(
            String orgId, String tabId, String cursor, int size, String userId) {
        orgService.getOrgMemberOrThrow(orgId, userId);

        Pageable pageable = PageRequest.of(0, size + 1);
        List<OrgPhoto> photos;

        if (tabId != null) {
            photos = (cursor == null)
                ? photoRepository.findByOrgIdAndTabId(orgId, tabId, pageable)
                : photoRepository.findByOrgIdAndTabIdAfterCursor(orgId, tabId, cursor, pageable);
        } else {
            photos = (cursor == null)
                ? photoRepository.findByOrgId(orgId, pageable)
                : photoRepository.findByOrgIdAfterCursor(orgId, cursor, pageable);
        }

        boolean hasNext = photos.size() > size;
        if (hasNext) photos = photos.subList(0, size);

        long totalCount = (tabId != null)
            ? photoRepository.countByOrganizationIdAndTabId(orgId, tabId)
            : photoRepository.countByOrganizationId(orgId);

        return OrgPhotoResponse.PhotoPage.of(photos, hasNext, totalCount);
    }

    // ── ZIP 일괄 다운로드 ──

    public StreamingResponseBody downloadBatch(
            String orgId, OrgPhotoRequest.BatchDownload request, String userId) {
        orgService.getOrgMemberOrThrow(orgId, userId);

        List<String> photoIds = request.getPhotoIds();
        if (photoIds.size() > MAX_BATCH_DOWNLOAD) {
            throw new BusinessException(ErrorCode.PHOTO_BATCH_DOWNLOAD_LIMIT);
        }

        List<OrgPhoto> photos = photoRepository.findAllById(photoIds);
        // orgId 소속 검증
        photos.forEach(p -> {
            if (!p.getOrganizationId().equals(orgId)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
            }
        });

        return outputStream -> {
            try (ZipOutputStream zos = new ZipOutputStream(outputStream)) {
                Set<String> usedNames = new HashSet<>();
                for (OrgPhoto photo : photos) {
                    String fileName = resolveUniqueFilename(photo.getOriginalFilename(), usedNames);
                    zos.putNextEntry(new ZipEntry(fileName));
                    // S3에서 GET → ZipEntry로 스트리밍
                    try (InputStream is = fileUploadService.getAsStream(photo.getS3Key())) {
                        is.transferTo(zos);
                    }
                    zos.closeEntry();
                }
            }
        };
    }

    // ── 사진 삭제 ──

    @Transactional
    public void deletePhoto(String orgId, String photoId, String userId) {
        orgService.checkAdminOrAbove(orgId, userId);
        OrgPhoto photo = photoRepository.findById(photoId)
            .orElseThrow(() -> new BusinessException(ErrorCode.PHOTO_NOT_FOUND));
        if (!photo.getOrganizationId().equals(orgId)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE);
        }

        // S3 삭제 (원본 + 썸네일)
        fileUploadService.delete(photo.getS3Key());
        if (photo.getThumbnailKey() != null) {
            fileUploadService.delete(photo.getThumbnailKey());
        }

        String tabId = photo.getTab().getId();
        photoRepository.delete(photo);

        // photo_count 업데이트
        OrgPhotoTab tab = tabRepository.findById(tabId).orElse(null);
        if (tab != null) {
            tab.updatePhotoCount(photoRepository.countByTabId(tabId));
        }
    }
}
```

### 7.4 Repository — Cursor 페이지네이션

```java
public interface OrgPhotoRepository extends JpaRepository<OrgPhoto, String> {

    // 전체 사진 (첫 페이지)
    @Query("SELECT p FROM OrgPhoto p WHERE p.organizationId = :orgId " +
           "ORDER BY p.createdAt DESC")
    List<OrgPhoto> findByOrgId(@Param("orgId") String orgId, Pageable pageable);

    // 전체 사진 (cursor 이후)
    @Query("SELECT p FROM OrgPhoto p WHERE p.organizationId = :orgId " +
           "AND p.createdAt < (SELECT p2.createdAt FROM OrgPhoto p2 WHERE p2.id = :cursor) " +
           "ORDER BY p.createdAt DESC")
    List<OrgPhoto> findByOrgIdAfterCursor(
        @Param("orgId") String orgId,
        @Param("cursor") String cursor,
        Pageable pageable);

    // 탭별 사진 (첫 페이지)
    @Query("SELECT p FROM OrgPhoto p WHERE p.organizationId = :orgId " +
           "AND p.tab.id = :tabId ORDER BY p.createdAt DESC")
    List<OrgPhoto> findByOrgIdAndTabId(
        @Param("orgId") String orgId,
        @Param("tabId") String tabId,
        Pageable pageable);

    // 탭별 사진 (cursor 이후)
    @Query("SELECT p FROM OrgPhoto p WHERE p.organizationId = :orgId " +
           "AND p.tab.id = :tabId " +
           "AND p.createdAt < (SELECT p2.createdAt FROM OrgPhoto p2 WHERE p2.id = :cursor) " +
           "ORDER BY p.createdAt DESC")
    List<OrgPhoto> findByOrgIdAndTabIdAfterCursor(
        @Param("orgId") String orgId,
        @Param("tabId") String tabId,
        @Param("cursor") String cursor,
        Pageable pageable);

    long countByTabId(String tabId);
    long countByOrganizationId(String orgId);
    long countByOrganizationIdAndTabId(String orgId, String tabId);

    // 탭 삭제 시 연관 사진 S3 키 조회
    @Query("SELECT p.s3Key FROM OrgPhoto p WHERE p.tab.id = :tabId")
    List<String> findS3KeysByTabId(@Param("tabId") String tabId);

    @Query("SELECT p.thumbnailKey FROM OrgPhoto p WHERE p.tab.id = :tabId AND p.thumbnailKey IS NOT NULL")
    List<String> findThumbnailKeysByTabId(@Param("tabId") String tabId);
}

public interface OrgPhotoTabRepository extends JpaRepository<OrgPhotoTab, String> {

    List<OrgPhotoTab> findByOrganizationIdOrderBySortOrder(String organizationId);

    @Query("SELECT MAX(t.sortOrder) FROM OrgPhotoTab t WHERE t.organizationId = :orgId")
    Optional<Integer> findMaxSortOrderByOrganizationId(@Param("orgId") String orgId);

    long countByOrganizationId(String organizationId);
}
```

---

## 8. DTO 설계

### 8.1 Request

```java
public class OrgPhotoRequest {

    @Getter @AllArgsConstructor @NoArgsConstructor
    public static class TabCreate {
        @NotBlank @Size(max = 50)
        private String name;
        @Size(max = 200)
        private String description;
    }

    @Getter @AllArgsConstructor @NoArgsConstructor
    public static class TabUpdate {
        @Size(max = 50)
        private String name;
        @Size(max = 200)
        private String description;
        private String coverPhotoId;
    }

    @Getter @AllArgsConstructor @NoArgsConstructor
    public static class TabReorder {
        @NotNull
        private List<String> tabIds;  // 정렬된 탭 ID 목록
    }

    @Getter @AllArgsConstructor @NoArgsConstructor
    public static class PhotoUpdate {
        @Size(max = 300)
        private String caption;
        private String tabId;  // 다른 탭으로 이동 시
    }

    @Getter @AllArgsConstructor @NoArgsConstructor
    public static class BatchDelete {
        @NotNull @Size(min = 1, max = 100)
        private List<String> photoIds;
    }

    @Getter @AllArgsConstructor @NoArgsConstructor
    public static class BatchDownload {
        @NotNull @Size(min = 1, max = 100)
        private List<String> photoIds;
    }
}
```

### 8.2 Response

```java
public class OrgPhotoResponse {

    @Getter @Builder @AllArgsConstructor
    public static class TabInfo {
        private String id;
        private String name;
        private String description;
        private int photoCount;
        private String coverPhotoUrl;
        private int sortOrder;
        private UserInfo createdBy;
        private LocalDateTime createdAt;

        public static TabInfo from(OrgPhotoTab tab, FileUploadService fus) { ... }
    }

    @Getter @Builder @AllArgsConstructor
    public static class PhotoDetail {
        private String id;
        private String tabId;
        private String tabName;
        private String thumbnailUrl;
        private String originalUrl;
        private String originalFilename;
        private long fileSize;
        private Integer width;
        private Integer height;
        private String caption;
        private String contentType;
        private UserInfo uploadedBy;
        private LocalDateTime createdAt;

        public static PhotoDetail from(OrgPhoto photo) { ... }
    }

    @Getter @Builder @AllArgsConstructor
    public static class PhotoPage {
        private List<PhotoDetail> photos;
        private String nextCursor;
        private boolean hasNext;
        private long totalCount;

        public static PhotoPage of(List<OrgPhoto> photos, boolean hasNext, long totalCount) { ... }
    }

    @Getter @Builder @AllArgsConstructor
    public static class UserInfo {
        private String id;
        private String name;
    }
}
```

---

## 9. DB 마이그레이션

```sql
-- V90__create_org_photo_gallery.sql

CREATE TABLE org_photo_tabs (
    id                VARCHAR(36) PRIMARY KEY,
    organization_id   VARCHAR(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name              VARCHAR(50) NOT NULL,
    description       VARCHAR(200),
    cover_photo_id    VARCHAR(36),
    photo_count       INTEGER NOT NULL DEFAULT 0,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    created_by        VARCHAR(36) NOT NULL REFERENCES users(id),
    created_at        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE org_photos (
    id                VARCHAR(36) PRIMARY KEY,
    tab_id            VARCHAR(36) NOT NULL REFERENCES org_photo_tabs(id) ON DELETE CASCADE,
    organization_id   VARCHAR(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    s3_key            VARCHAR(500) NOT NULL,
    thumbnail_key     VARCHAR(500),
    url               VARCHAR(500),
    thumbnail_url     VARCHAR(500),
    original_filename VARCHAR(255) NOT NULL,
    file_size         BIGINT NOT NULL,
    content_type      VARCHAR(50) NOT NULL,
    width             INTEGER,
    height            INTEGER,
    caption           VARCHAR(300),
    uploaded_by       VARCHAR(36) NOT NULL REFERENCES users(id),
    created_at        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at        TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

-- 인덱스
CREATE INDEX idx_org_photo_tabs_org_id ON org_photo_tabs(organization_id);
CREATE INDEX idx_org_photos_tab_id ON org_photos(tab_id);
CREATE INDEX idx_org_photos_org_id ON org_photos(organization_id);
CREATE INDEX idx_org_photos_created_at ON org_photos(created_at DESC);
CREATE INDEX idx_org_photos_org_tab_created ON org_photos(organization_id, tab_id, created_at DESC);

-- cover_photo FK (org_photos 생성 후)
ALTER TABLE org_photo_tabs
    ADD CONSTRAINT fk_org_photo_tabs_cover
    FOREIGN KEY (cover_photo_id) REFERENCES org_photos(id) ON DELETE SET NULL;
```

---

## 10. ErrorCode 추가

```java
// ErrorCode.java에 추가
PHOTO_TAB_NOT_FOUND(HttpStatus.NOT_FOUND, "P001", "Photo tab not found"),
PHOTO_NOT_FOUND(HttpStatus.NOT_FOUND, "P002", "Photo not found"),
PHOTO_UPLOAD_LIMIT_EXCEEDED(HttpStatus.BAD_REQUEST, "P003", "Photo upload limit exceeded (max 20)"),
PHOTO_BATCH_DOWNLOAD_LIMIT(HttpStatus.BAD_REQUEST, "P004", "Batch download limit exceeded (max 100)"),
```

---

## 11. 인프라 (변경 최소)

기존 S3 + CloudFront **100% 재사용**.

| 항목 | 설정 |
|------|------|
| S3 버킷 | `bridge-kanban-attachments` (기존 공유) |
| S3 prefix | `photos/org/` (신규) |
| CloudFront | 기존 Attachments Distribution |
| 파일 크기 제한 | 10MB/장 (사진 특성상 기존 5MB에서 상향) |

### Terraform 추가 (선택)

```hcl
# S3 Lifecycle — photos/ prefix → Intelligent-Tiering
rule {
  id     = "photos-intelligent-tiering"
  status = "Enabled"
  filter { prefix = "photos/" }
  transition {
    days          = 0
    storage_class = "INTELLIGENT_TIERING"
  }
}

# CloudFront Cache Behavior — photos/ prefix
ordered_cache_behavior {
  path_pattern     = "photos/*"
  allowed_methods  = ["GET", "HEAD"]
  cached_methods   = ["GET", "HEAD"]
  default_ttl      = 2592000  # 30일 (UUID 기반 불변 파일)
  max_ttl          = 31536000 # 1년
}
```

---

## 12. i18n 키

```json
// photoGallery 네임스페이스
{
  "photoGallery": {
    "title": "사진",
    "allPhotos": "전체",
    "albumCount": "{{count}}개 앨범",
    "photoCount": "{{count}}장",
    "upload": "업로드",
    "uploadTitle": "사진 업로드",
    "uploadHint": "최대 20장, 각 10MB",
    "uploadDropzone": "드래그 & 드롭 또는 클릭하여 선택",
    "uploadFormats": "JPG, PNG, WebP, GIF",
    "uploadProgress": "{{current}}/{{total}} 업로드 중...",
    "uploadComplete": "{{count}}장 업로드 완료",
    "selectMode": "선택",
    "selectAll": "전체 선택",
    "deselectAll": "선택 해제",
    "selectedCount": "{{count}}장 선택",
    "downloadSelected": "선택 다운로드",
    "deleteSelected": "선택 삭제",
    "download": "다운로드",
    "downloadComplete": "{{count}}장 다운로드 완료",
    "delete": "삭제",
    "deleteConfirm": "{{count}}장의 사진을 삭제하시겠습니까?",
    "deleteSuccess": "{{count}}장 삭제 완료",
    "caption": "캡션",
    "captionPlaceholder": "사진 설명 입력...",
    "createAlbum": "앨범 만들기",
    "editAlbum": "앨범 수정",
    "deleteAlbum": "앨범 삭제",
    "deleteAlbumConfirm": "'{{name}}' 앨범과 포함된 사진 {{count}}장을 모두 삭제하시겠습니까?",
    "albumName": "앨범 이름",
    "albumNamePlaceholder": "앨범 이름 입력...",
    "albumDescription": "설명",
    "albumDescriptionPlaceholder": "앨범 설명 입력 (선택)...",
    "setCover": "대표 이미지 설정",
    "moveToAlbum": "앨범으로 이동",
    "emptyTitle": "아직 사진이 없습니다",
    "emptyDescription": "관리자가 사진을 업로드하면 여기에 표시됩니다",
    "emptyAdminDescription": "사진을 업로드하여 팀과 공유하세요",
    "batchDownloadLimit": "일괄 다운로드는 최대 100장까지 가능합니다",
    "noAlbums": "아직 앨범이 없습니다"
  }
}
```

> 10개 언어 번역 필요 (ko, en, ja, zh, zh-TW, vi, th, es, pt-BR, hi)

---

## 13. 비용 분석

| 항목 | 단가 | 1,000장 (5GB) | 10,000장 (50GB) |
|------|------|---------------|-----------------|
| S3 저장 | $0.025/GB → $0.0125 (90일 후) | $0.13 → $0.06 | $1.25 → $0.63 |
| S3 PUT | $0.005/1,000 | $0.005 | $0.05 |
| S3 GET | $0.0004/1,000 | ~$0 | ~$0 |
| CloudFront 전송 | $0.12/GB | $0.60 | $6.00 |
| **합계** | | **~$0.73/월** | **~$6.70/월** |

> 만 장 올려도 월 $7 미만. Intelligent-Tiering으로 90일 후 자동 절감.

---

## 14. 대량 사진 대응 전략

### 14.1 탭(앨범) 분류
- ADMIN이 앨범을 생성하여 사진 분류
- "전체" 가상 탭 → 조직 전체 사진 (tab_id 없이 org_id로 조회)
- 앨범별 사진 수 badge → 어떤 앨범에 몇 장인지 한눈에 파악

### 14.2 Cursor 페이지네이션
- Offset 아닌 cursor 방식 → 10만 장이어도 성능 일정
- `created_at DESC` + 복합 인덱스 `(organization_id, tab_id, created_at DESC)`
- 한 번에 30장씩 로딩 (무한 스크롤)

### 14.3 Lazy Loading
- `loading="lazy"` → 뷰포트 밖 이미지는 로딩 안 함
- 썸네일(400x400) 우선 → 라이트박스에서만 원본 로딩
- 무한 스크롤 트리거: 하단 200px 전에 다음 페이지 요청

### 14.4 ZIP 다운로드 제한
- 일괄 다운로드 최대 100장 또는 500MB
- `StreamingResponseBody` → 서버 메모리 사용 최소화
- 중복 파일명 자동 넘버링: `IMG_001.jpg`, `IMG_001 (2).jpg`

---

## 15. 개발 공수

| 구분 | 작업 | 파일 수 |
|------|------|---------|
| **Backend** | Entity 2 + Repo 2 + Service 1 + Controller 1 + DTO 2 + ErrorCode | ~9 |
| **Frontend** | Components ~8 (OrgPhotoGalleryTab, AlbumBar, Grid, Lightbox, UploadModal, AlbumModal, EmptyState, Toolbar) | ~8 |
| **Infra** | Terraform lifecycle rule 1개 (선택) | ~1 |
| **Migration** | V90 SQL 1개 | 1 |
| **기존 파일 수정** | OrganizationDetailPage (탭 추가), types (타입 추가), ErrorCode, i18n×10 | ~13 |
| **합계** | | **~32 파일** |

---

## 16. 향후 확장 (Phase 2)

- 사진 코멘트·리액션
- 드래그&드롭 정렬 (사진 순서 변경)
- 앨범 공유 링크 (외부 게스트 다운로드)
- AI 자동 태깅·검색 (얼굴 인식 제외)
- 슬라이드쇼 모드 (프레젠테이션)
- Board 레벨 사진첩 확장
- WebSocket 실시간 업로드 알림
- 비디오 지원 (MP4, WebM)
