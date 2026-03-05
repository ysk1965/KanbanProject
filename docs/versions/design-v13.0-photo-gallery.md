# Design v13.0 — Photo Board (사진 보드)

> **Version**: 13.0
> **Date**: 2026-03-04
> **Status**: Draft — Ideation
> **위치**: 칸반 보드 내 새 탭 (`/boards/:boardId` → Photo 탭)

---

## 1. 개요

### 1.1 배경

BRIDGE 보드에서 프로젝트/팀 활동 사진을 체계적으로 관리할 공간이 없다. 사진이 대량으로 쌓이는 환경(행사, 촬영, 현장 등)에서 **ADMIN이 탭별로 분류해 업로드하고, MEMBER/VIEWER가 원하는 사진을 찾아 다운로드**하는 워크플로우가 필요하다.

### 1.2 핵심 컨셉

```
┌─────────────────────────────────────────────────────┐
│  Board: 2026 워크샵                                   │
│                                                     │
│  [칸반] [일정] [통계] [📷 사진]  ← 새 탭              │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │ [전체] [1일차] [2일차] [단체사진] [+ 탭 추가]  │   │  ← ADMIN만 탭 생성/관리
│  │                                              │   │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐  │   │
│  │  │ 📷  │ │ 📷  │ │ 📷  │ │ 📷  │ │ 📷  │  │   │  ← 사진 그리드
│  │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘  │   │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐  │   │
│  │  │ 📷  │ │ 📷  │ │ 📷  │ │ 📷  │ │ 📷  │  │   │
│  │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘  │   │
│  │                                              │   │
│  │         [1] [2] [3] ... [12]  ← 페이지네이션  │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

- **보드 내 탭**: 기존 칸반 보드의 새 탭으로 추가 (별도 라우트 아님)
- **탭 기반 분류**: ADMIN/OWNER가 탭을 만들어 사진을 카테고리별 관리
- **역할 기반 권한**: ADMIN+ 업로드/관리, MEMBER/VIEWER 조회/다운로드
- **대량 사진 대응**: cursor 페이지네이션 + 무한 스크롤 + 탭 분류

### 1.3 인증 & 접근

**별도 로그인 불필요** — 기존 보드 멤버십 체계 그대로 사용:

```
Board 접근 → BoardMember 확인 → BoardRole (OWNER/ADMIN/MEMBER/VIEWER)
→ Photo 탭 접근 → 역할별 UI 분기
```

- 기존 `checkViewerOrAbove()` → 사진 조회/다운로드
- 기존 `checkAdminOrAbove()` → 사진 업로드/탭 관리/삭제

---

## 2. 권한 모델

### 2.1 역할별 기능 매트릭스

| 기능 | OWNER | ADMIN | MEMBER | VIEWER |
|------|:-----:|:-----:|:------:|:------:|
| 사진 조회 | O | O | O | O |
| 사진 다운로드 (개별) | O | O | O | O |
| 사진 일괄 다운로드 (ZIP) | O | O | O | O |
| 라이트박스 뷰어 | O | O | O | O |
| 사진 업로드 | O | O | X | X |
| 사진 삭제 | O | O | X | X |
| 탭 생성/수정/삭제 | O | O | X | X |
| 탭 순서 변경 | O | O | X | X |

### 2.2 권한 체크 (기존 패턴 재사용)

```java
// Backend — BoardService의 기존 메서드 그대로 사용
boardService.checkViewerOrAbove(boardId, userId);  // 조회/다운로드
boardService.checkAdminOrAbove(boardId, userId);   // 업로드/관리

// Frontend — useBoardPermissions 기존 결과 사용
const { isAdminOrOwner } = useBoardPermissions(...);
// isAdminOrOwner → 업로드 버튼, 탭 관리 UI 표시
// !isAdminOrOwner → 다운로드 버튼만 표시
```

---

## 3. 정보 구조

### 3.1 핵심 엔티티

```
PhotoTab (탭 — 사진 카테고리)
├── id              — String (UUID, PK)
├── board_id        — String (FK → Board)
├── name            — VARCHAR(50) — "1일차", "단체사진", "현장"
├── description     — VARCHAR(200, nullable)
├── cover_photo_id  — String (FK → Photo, nullable — 대표 이미지)
├── photo_count     — Integer (비정규화 — 빠른 카운트)
├── sort_order      — Integer (탭 정렬)
├── created_by      — String (FK → User)
├── created_at      — TIMESTAMP (UTC)
└── updated_at      — TIMESTAMP (UTC)

Photo (사진)
├── id              — String (UUID, PK)
├── tab_id          — String (FK → PhotoTab)
├── board_id        — String (FK → Board — 탭 없이 직접 조회용 비정규화)
├── s3_key          — VARCHAR(500)
├── thumbnail_key   — VARCHAR(500)
├── original_filename — VARCHAR(255)
├── file_size       — Long (bytes)
├── content_type    — VARCHAR(50)
├── width           — Integer (nullable)
├── height          — Integer (nullable)
├── caption         — VARCHAR(300, nullable)
├── uploaded_by     — String (FK → User)
├── created_at      — TIMESTAMP (UTC)
└── updated_at      — TIMESTAMP (UTC)
```

### 3.2 S3 키 구조

```
photos/                                    ← 새 prefix
└── {boardId}/
    └── {tabId}/
        ├── {uuid}.{ext}                   ← 원본
        └── {uuid}_thumb.jpg               ← 썸네일 (400x400)
```

### 3.3 ERD

```
Board (1) ──── (N) PhotoTab (1) ──── (N) Photo
                      │                     │
                      └── created_by ──→ User
                                            └── uploaded_by ──→ User
```

---

## 4. API 설계

### 4.1 탭 API (ADMIN+ 전용)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/v1/boards/{boardId}/photo-tabs` | VIEWER+ | 탭 목록 (사진 수 포함) |
| POST | `/api/v1/boards/{boardId}/photo-tabs` | ADMIN+ | 탭 생성 |
| PUT | `/api/v1/boards/{boardId}/photo-tabs/{tabId}` | ADMIN+ | 탭 수정 (이름, 설명) |
| DELETE | `/api/v1/boards/{boardId}/photo-tabs/{tabId}` | ADMIN+ | 탭 삭제 (사진 포함) |
| PATCH | `/api/v1/boards/{boardId}/photo-tabs/reorder` | ADMIN+ | 탭 순서 변경 |

### 4.2 사진 API

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/v1/boards/{boardId}/photos` | VIEWER+ | 사진 목록 (탭 필터, 페이지네이션) |
| POST | `/api/v1/boards/{boardId}/photo-tabs/{tabId}/photos` | ADMIN+ | 사진 업로드 (최대 20장) |
| DELETE | `/api/v1/boards/{boardId}/photos/{photoId}` | ADMIN+ | 사진 삭제 |
| DELETE | `/api/v1/boards/{boardId}/photos/batch` | ADMIN+ | 일괄 삭제 |
| PUT | `/api/v1/boards/{boardId}/photos/{photoId}` | ADMIN+ | 사진 수정 (캡션, 탭 이동) |
| POST | `/api/v1/boards/{boardId}/photos/{photoId}/move` | ADMIN+ | 다른 탭으로 이동 |
| GET | `/api/v1/boards/{boardId}/photos/{photoId}/download` | VIEWER+ | 원본 다운로드 URL |
| POST | `/api/v1/boards/{boardId}/photos/batch/download` | VIEWER+ | 일괄 다운로드 (ZIP) |

### 4.3 페이지네이션

```
GET /api/v1/boards/{boardId}/photos?tab_id={tabId}&cursor={lastPhotoId}&size=30

// cursor 기반 — 대량 사진에서도 성능 일정
// size 기본값: 30 (모바일 20, 데스크톱 30~50)
```

### 4.4 요청/응답 예시

```json
// POST /api/v1/boards/{boardId}/photo-tabs — 탭 생성
{
  "name": "1일차",
  "description": "워크샵 첫째 날 사진"
}

// GET /api/v1/boards/{boardId}/photo-tabs — 탭 목록 응답
{
  "tabs": [
    { "id": "tab-uuid-1", "name": "전체", "photo_count": 156, "is_default": true },
    { "id": "tab-uuid-2", "name": "1일차", "photo_count": 45, "sort_order": 1 },
    { "id": "tab-uuid-3", "name": "2일차", "photo_count": 62, "sort_order": 2 },
    { "id": "tab-uuid-4", "name": "단체사진", "photo_count": 12, "sort_order": 3 }
  ]
}

// GET /api/v1/boards/{boardId}/photos?tab_id=tab-uuid-2&size=30 — 사진 목록
{
  "photos": [
    {
      "id": "photo-uuid-1",
      "tab_id": "tab-uuid-2",
      "thumbnail_url": "https://cdn.bridgespots.com/photos/board-1/tab-2/abc123_thumb.jpg",
      "original_url": "https://cdn.bridgespots.com/photos/board-1/tab-2/abc123.jpg",
      "original_filename": "IMG_2026.jpg",
      "file_size": 2048576,
      "width": 4032,
      "height": 3024,
      "caption": "팀 빌딩 액티비티",
      "uploaded_by": { "id": "user-1", "name": "홍길동" },
      "created_at": "2026-03-04T09:15:00Z"
    }
  ],
  "next_cursor": "photo-uuid-30",
  "has_next": true,
  "total_count": 45
}
```

---

## 5. Frontend 설계

### 5.1 진입점 — 보드 탭

```tsx
// KanbanBoardPage.tsx 내 탭 영역에 추가
// 기존: [칸반] [일정] [마일스톤] [통계] [노트]
// 추가: [📷 사진]

{/* 사진 탭 — Premium 기능 (canAccessSchedule 등과 동일 패턴) */}
<TabButton active={activeTab === 'photos'} onClick={() => setActiveTab('photos')}>
  <Camera className="w-4 h-4" />
  사진
</TabButton>
```

### 5.2 컴포넌트 트리

```
PhotoBoardView                           — 사진 탭 최상위
├── PhotoTabBar                          — 탭 리스트 (가로 스크롤)
│   ├── TabPill ("전체", "1일차", ...)    — 활성 탭 하이라이트
│   └── AddTabButton (+ 아이콘)           — ADMIN만 표시
├── PhotoToolbar                         — 업로드/선택/다운로드 액션 바
│   ├── UploadButton                     — ADMIN만 표시
│   ├── SelectModeToggle                 — 선택 모드 on/off
│   ├── DownloadSelectedButton           — 선택 시 표시 (모든 역할)
│   ├── DeleteSelectedButton             — 선택 시 표시 (ADMIN만)
│   └── PhotoCountBadge                  — "45장"
├── PhotoGrid                            — 사진 그리드 (무한 스크롤)
│   └── PhotoCard                        — 썸네일 카드
│       ├── Checkbox (선택 모드)
│       ├── Thumbnail (aspect-square)
│       └── HoverOverlay (파일명, 다운로드 아이콘)
├── PhotoLightbox                        — 전체화면 뷰어 (모든 역할)
│   ├── 좌/우 네비게이션
│   ├── 다운로드 버튼
│   ├── 삭제 버튼 (ADMIN만)
│   └── 캡션 표시/편집 (ADMIN만 편집)
├── PhotoUploadModal (MotionModal)       — 드래그&드롭 업로드 (ADMIN만)
│   ├── DropZone
│   ├── PreviewGrid + 캡션 입력
│   └── UploadProgress
├── TabCreateModal (MotionModal)         — 탭 생성/수정 (ADMIN만)
└── EmptyState                           — 사진 없을 때 안내
```

### 5.3 핵심 UI

```tsx
// ── 탭 바 ──
<div className="flex items-center gap-1 px-4 py-2 border-b border-foreground/[0.08]
  overflow-x-auto custom-scrollbar">
  {tabs.map(tab => (
    <button
      key={tab.id}
      onClick={() => setActiveTabId(tab.id)}
      className={cn(
        "px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors",
        activeTabId === tab.id
          ? "bg-bridge-accent text-white"
          : "text-slate-400 hover:text-foreground hover:bg-foreground/5"
      )}
    >
      {tab.name}
      <span className="ml-1.5 text-[10px] opacity-70">{tab.photo_count}</span>
    </button>
  ))}
  {isAdminOrOwner && (
    <button className="p-1.5 rounded-lg text-slate-500 hover:text-foreground
      hover:bg-foreground/5 transition-colors shrink-0">
      <Plus className="w-4 h-4" />
    </button>
  )}
</div>

// ── 사진 그리드 (무한 스크롤) ──
<div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 p-4">
  {photos.map((photo, i) => (
    <motion.div
      key={photo.id}
      className="relative aspect-square rounded-lg overflow-hidden cursor-pointer
        bg-foreground/5 group"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.02 }}
      onClick={() => openLightbox(photo)}
    >
      <img
        src={photo.thumbnail_url}
        alt={photo.caption}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      {/* 호버 오버레이 — 다운로드 */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30
        transition-colors flex items-end justify-between p-2 opacity-0
        group-hover:opacity-100">
        <span className="text-[10px] text-white truncate">{photo.original_filename}</span>
        <button onClick={(e) => { e.stopPropagation(); download(photo); }}>
          <Download className="w-4 h-4 text-white" />
        </button>
      </div>
      {/* 선택 모드 체크박스 */}
      {selectMode && (
        <div className="absolute top-2 left-2">
          <Checkbox checked={selected.has(photo.id)} />
        </div>
      )}
    </motion.div>
  ))}
</div>

// ── 무한 스크롤 트리거 ──
<div ref={observerRef} className="h-10 flex items-center justify-center">
  {isFetchingNext && <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />}
</div>

// ── 라이트박스 ──
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
        <span className="text-sm text-white/70">{lightboxPhoto.caption}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => download(lightboxPhoto)}>
            <Download className="w-5 h-5 text-white/70 hover:text-white" />
          </button>
          {isAdminOrOwner && (
            <button onClick={() => deletePhoto(lightboxPhoto.id)}>
              <Trash2 className="w-5 h-5 text-white/70 hover:text-red-400" />
            </button>
          )}
          <button onClick={closeLightbox}>
            <X className="w-5 h-5 text-white/70 hover:text-white" />
          </button>
        </div>
      </div>
      {/* 이미지 */}
      <div className="flex-1 flex items-center justify-center px-12">
        <img src={lightboxPhoto.original_url}
          className="max-w-full max-h-full object-contain" />
      </div>
      {/* 좌/우 화살표 */}
      <button className="absolute left-4 top-1/2" onClick={prev}>
        <ChevronLeft className="w-8 h-8 text-white/50 hover:text-white" />
      </button>
      <button className="absolute right-4 top-1/2" onClick={next}>
        <ChevronRight className="w-8 h-8 text-white/50 hover:text-white" />
      </button>
      {/* 하단: 인덱스 */}
      <div className="text-center py-3 text-[11px] text-white/50">
        {currentIndex + 1} / {photos.length}
      </div>
    </motion.div>
  )}
</AnimatePresence>
```

### 5.4 업로드 UX (ADMIN 전용)

```
1. "업로드" 버튼 클릭 → MotionModal 오픈
2. 드래그 & 드롭 영역 또는 파일 선택 (최대 20장 동시, 각 10MB 제한)
3. 미리보기 그리드 표시
   - 각 사진 아래 캡션 입력 (선택)
   - 업로드 대상 탭 선택 드롭다운
4. "업로드" 버튼 → 프로그레스 바 (개별 + 전체)
5. 완료 시 그리드에 자동 추가 + 토스트 알림
```

### 5.5 다운로드 UX (모든 역할)

```
개별:  사진 호버 → 다운로드 아이콘 클릭 → 브라우저 다운로드
       라이트박스 → 다운로드 버튼 → 브라우저 다운로드

일괄:  선택 모드 ON → 사진 체크 → "선택 다운로드" 버튼
       → 서버에서 ZIP 생성 → 브라우저 다운로드
       → 선택 해제 + 토스트 "N장 다운로드 완료"
```

### 5.6 반응형 그리드

| 화면 | columns | gap | 비고 |
|------|---------|-----|------|
| Mobile (< 640px) | 3 | 4px | 컴팩트 |
| Tablet (640~1024px) | 4~5 | 6px | |
| Desktop (> 1024px) | 5~6 | 6px | 사이드바 고려 |

### 5.7 무한 스크롤 + 페이지네이션

```tsx
// IntersectionObserver 기반 무한 스크롤
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
  queryKey: ['board-photos', boardId, activeTabId],
  queryFn: ({ pageParam }) =>
    api.get(`/boards/${boardId}/photos`, {
      params: { tab_id: activeTabId, cursor: pageParam, size: 30 }
    }),
  getNextPageParam: (lastPage) =>
    lastPage.has_next ? lastPage.next_cursor : undefined,
});

// 스크롤 감지
useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && hasNextPage) fetchNextPage();
  });
  if (observerRef.current) observer.observe(observerRef.current);
  return () => observer.disconnect();
}, [hasNextPage]);
```

---

## 6. Backend 설계

### 6.1 패키지 구조

```
com.kanban.domain.photo/
├── controller/
│   └── PhotoController.java           — REST 엔드포인트
├── dto/
│   ├── PhotoRequest.java              — TabCreate, PhotoUpload, BatchDelete, Move
│   └── PhotoResponse.java             — TabList, PhotoList, PhotoDetail
├── entity/
│   ├── Photo.java                     — @Entity
│   └── PhotoTab.java                  — @Entity
├── repository/
│   ├── PhotoRepository.java           — JpaRepository + cursor 페이징
│   └── PhotoTabRepository.java        — JpaRepository
└── service/
    └── PhotoService.java              — FileUploadService 주입
```

### 6.2 핵심 서비스

```java
@Service
@RequiredArgsConstructor
public class PhotoService {

    private final PhotoRepository photoRepository;
    private final PhotoTabRepository tabRepository;
    private final BoardService boardService;           // 권한 체크 재사용
    private final FileUploadService fileUploadService; // S3 재사용

    // ── 탭 관리 (ADMIN+) ──

    public List<PhotoResponse.Tab> getTabs(String boardId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        return tabRepository.findByBoardIdOrderBySortOrder(boardId)
            .stream().map(PhotoResponse.Tab::from).toList();
    }

    public PhotoResponse.Tab createTab(String boardId, PhotoRequest.TabCreate req, String userId) {
        boardService.checkAdminOrAbove(boardId, userId);
        // 생성 + sort_order 자동 부여
    }

    // ── 사진 업로드 (ADMIN+) ──

    @Transactional
    public List<PhotoResponse.Detail> upload(
        String boardId, String tabId, List<MultipartFile> files,
        List<String> captions, String userId
    ) {
        boardService.checkAdminOrAbove(boardId, userId);
        PhotoTab tab = tabRepository.findById(tabId).orElseThrow();

        List<PhotoResponse.Detail> results = new ArrayList<>();
        for (int i = 0; i < files.size(); i++) {
            MultipartFile file = files.get(i);
            fileUploadService.validateFile(file);

            String key = "photos/" + boardId + "/" + tabId + "/" + UUID.randomUUID() + getExt(file);
            fileUploadService.uploadDirect(file, key);
            // 썸네일 자동 생성 (기존 moveToPermanent 로직 활용)

            Photo photo = Photo.builder()
                .id(UUID.randomUUID().toString())
                .tab(tab).boardId(boardId)
                .s3Key(key).thumbnailKey(key.replace(".", "_thumb."))
                .originalFilename(file.getOriginalFilename())
                .fileSize(file.getSize())
                .contentType(file.getContentType())
                .caption(i < captions.size() ? captions.get(i) : null)
                .uploadedBy(userId)
                .build();
            photoRepository.save(photo);
            results.add(PhotoResponse.Detail.from(photo, fileUploadService));
        }
        // photo_count 비정규화 업데이트
        tab.updatePhotoCount(photoRepository.countByTabId(tabId));
        return results;
    }

    // ── 사진 조회 (VIEWER+) ──

    public PhotoResponse.PhotoPage getPhotos(
        String boardId, String tabId, String cursor, int size, String userId
    ) {
        boardService.checkViewerOrAbove(boardId, userId);
        // cursor 기반 페이지네이션
        List<Photo> photos = (cursor == null)
            ? photoRepository.findTopByBoardIdAndTabIdOrderByCreatedAtDesc(boardId, tabId, size + 1)
            : photoRepository.findByBoardIdAndTabIdAndIdLessThanOrderByCreatedAtDesc(
                boardId, tabId, cursor, size + 1);

        boolean hasNext = photos.size() > size;
        if (hasNext) photos = photos.subList(0, size);

        return PhotoResponse.PhotoPage.of(photos, hasNext, fileUploadService);
    }

    // ── 다운로드 (VIEWER+) ──

    public String getDownloadUrl(String boardId, String photoId, String userId) {
        boardService.checkViewerOrAbove(boardId, userId);
        Photo photo = photoRepository.findById(photoId).orElseThrow();
        return fileUploadService.resolveUrl(photo.getS3Key());
    }

    public StreamingResponseBody downloadBatch(
        String boardId, List<String> photoIds, String userId
    ) {
        boardService.checkViewerOrAbove(boardId, userId);
        List<Photo> photos = photoRepository.findAllById(photoIds);
        return outputStream -> {
            try (ZipOutputStream zos = new ZipOutputStream(outputStream)) {
                for (Photo photo : photos) {
                    // S3에서 GET → ZIP entry 추가
                    zos.putNextEntry(new ZipEntry(photo.getOriginalFilename()));
                    // S3Client.getObject() → transferTo(zos)
                    zos.closeEntry();
                }
            }
        };
    }
}
```

### 6.3 Repository — Cursor 페이지네이션

```java
public interface PhotoRepository extends JpaRepository<Photo, String> {

    // 첫 페이지 (cursor 없음)
    @Query("SELECT p FROM Photo p WHERE p.boardId = :boardId AND p.tab.id = :tabId " +
           "ORDER BY p.createdAt DESC")
    List<Photo> findTopByBoardIdAndTabId(
        @Param("boardId") String boardId,
        @Param("tabId") String tabId,
        Pageable pageable
    );

    // 다음 페이지 (cursor 이후)
    @Query("SELECT p FROM Photo p WHERE p.boardId = :boardId AND p.tab.id = :tabId " +
           "AND p.createdAt < (SELECT p2.createdAt FROM Photo p2 WHERE p2.id = :cursor) " +
           "ORDER BY p.createdAt DESC")
    List<Photo> findAfterCursor(
        @Param("boardId") String boardId,
        @Param("tabId") String tabId,
        @Param("cursor") String cursor,
        Pageable pageable
    );

    // 탭별 사진 수
    long countByTabId(String tabId);

    // 보드 전체 사진 수
    long countByBoardId(String boardId);

    // 일괄 삭제
    @Modifying
    @Query("DELETE FROM Photo p WHERE p.id IN :ids AND p.boardId = :boardId")
    int deleteByIdsAndBoardId(@Param("ids") List<String> ids, @Param("boardId") String boardId);
}
```

---

## 7. DB 마이그레이션

```sql
-- V87__create_photo_board_tables.sql

CREATE TABLE photo_tabs (
    id              VARCHAR(36) PRIMARY KEY,
    board_id        VARCHAR(36) NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name            VARCHAR(50) NOT NULL,
    description     VARCHAR(200),
    cover_photo_id  VARCHAR(36),
    photo_count     INTEGER NOT NULL DEFAULT 0,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_by      VARCHAR(36) NOT NULL REFERENCES users(id),
    created_at      TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at      TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE photos (
    id                VARCHAR(36) PRIMARY KEY,
    tab_id            VARCHAR(36) NOT NULL REFERENCES photo_tabs(id) ON DELETE CASCADE,
    board_id          VARCHAR(36) NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    s3_key            VARCHAR(500) NOT NULL,
    thumbnail_key     VARCHAR(500),
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
CREATE INDEX idx_photo_tabs_board_id ON photo_tabs(board_id);
CREATE INDEX idx_photos_tab_id ON photos(tab_id);
CREATE INDEX idx_photos_board_id ON photos(board_id);
CREATE INDEX idx_photos_created_at ON photos(created_at DESC);
CREATE INDEX idx_photos_board_tab_created ON photos(board_id, tab_id, created_at DESC);

-- cover FK (photos 생성 후)
ALTER TABLE photo_tabs
    ADD CONSTRAINT fk_photo_tabs_cover
    FOREIGN KEY (cover_photo_id) REFERENCES photos(id) ON DELETE SET NULL;
```

---

## 8. 인프라 (변경 없음)

기존 S3 + CloudFront 100% 재사용.

| 항목 | 설정 |
|------|------|
| S3 버킷 | `bridge-kanban-attachments` (기존 공유) |
| S3 prefix | `photos/` (신규) |
| CloudFront | 기존 Attachments Distribution |
| Lifecycle | Intelligent-Tiering (Terraform에 rule 1개 추가) |
| 파일 크기 제한 | 10MB/장 (기존 5MB → 사진 특성상 상향) |

### Terraform 추가

```hcl
# S3 Lifecycle — photos/ prefix
rule {
  id     = "photos-intelligent-tiering"
  status = "Enabled"
  filter { prefix = "photos/" }
  transition {
    days          = 0
    storage_class = "INTELLIGENT_TIERING"
  }
}
```

---

## 9. 비용 분석

| 항목 | 단가 | 1,000장 (5GB) | 10,000장 (50GB) |
|------|------|---------------|-----------------|
| S3 저장 | $0.025/GB → $0.0125 (90일 후) | $0.13 → $0.06 | $1.25 → $0.63 |
| S3 PUT | $0.005/1,000 | $0.005 | $0.05 |
| S3 GET | $0.0004/1,000 | ~$0 | ~$0 |
| CloudFront 전송 | $0.12/GB | $0.60 | $6.00 |
| **합계** | | **~$0.73/월** | **~$6.70/월** |

> 만 장 올려도 월 $7 미만. Intelligent-Tiering으로 90일 후 자동 절감.

---

## 10. 대량 사진 대응 전략

### 10.1 탭 분류

- ADMIN이 탭(카테고리)을 생성하여 사진 분류
- "전체" 가상 탭 → 보드 전체 사진 (tab_id 없이 board_id로 조회)
- 탭당 사진 수 badge → 어떤 탭에 몇 장인지 한눈에 파악

### 10.2 Cursor 페이지네이션

- Offset 아닌 cursor 방식 → 10만 장이어도 성능 일정
- `created_at DESC` + 복합 인덱스 `(board_id, tab_id, created_at DESC)`
- 한 번에 30장씩 로딩 (무한 스크롤)

### 10.3 Lazy Loading

- `loading="lazy"` → 뷰포트 밖 이미지는 로딩 안 함
- 썸네일(400x400) 우선 → 라이트박스에서만 원본 로딩
- 무한 스크롤 트리거: 하단 200px 전에 다음 페이지 요청

### 10.4 ZIP 다운로드 제한

- 일괄 다운로드 최대 100장 또는 500MB (초과 시 에러 + 안내)
- `StreamingResponseBody` → 서버 메모리 사용 최소화

---

## 11. 개발 공수

| 구분 | 작업 | 파일 수 |
|------|------|---------|
| **Backend** | Entity 2 + Repo 2 + Service 1 + Controller 1 + DTO 2 | ~8 |
| **Frontend** | Components ~10 (PhotoBoardView, TabBar, Grid, Lightbox, UploadModal 등) | ~10 |
| **Infra** | Terraform lifecycle rule 1개 | ~1 |
| **Migration** | V87 SQL 1개 | 1 |
| **기존 파일 수정** | KanbanBoardPage (탭 추가), types (타입 추가) | ~2 |
| **합계** | | **~22 파일** |

---

## 12. 향후 확장 (Phase 2)

- 사진 코멘트/리액션
- 드래그&드롭 정렬 (사진 순서 변경)
- 앨범 공유 링크 (외부 게스트 다운로드)
- AI 자동 태깅/검색
- 슬라이드쇼 모드 (프레젠테이션)
- 조직(Organization) 레벨 사진 공유
- WebSocket 실시간 업로드 알림
