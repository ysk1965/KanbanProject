# Notes 화이트보드(Board) 기능 기획서

| 항목 | 내용 |
|------|------|
| 버전 | v1.0.0 |
| 작성일 | 2026-03-12 |
| 상태 | Draft |
| 관련 도메인 | `domain/note/` |
| 라이브러리 | Excalidraw (MIT License) |
| 협업 | Yjs 실시간 협업 (기존 인프라 재사용) |

---

## 1. 개요

### 1.1 What

Notes 섹션에 기존 **DOCUMENT**(문서), **FOLDER**(폴더) 타입 외에 **BOARD**(화이트보드) 타입을 추가한다. BOARD 타입은 Excalidraw 기반의 무한 캔버스 화이트보드로, 브레인스토밍, 아키텍처 다이어그램, 와이어프레임, 플로우차트, 마인드맵 등 시각적 협업을 지원한다.

### 1.2 Why

- 텍스트 기반 문서만으로는 다이어그램, 플로우차트, 마인드맵 등 시각적 사고를 담기 어렵다
- FigJam, Excalidraw, Miro 같은 화이트보드 도구가 팀 협업의 핵심 도구로 자리잡았으나, 별도 SaaS를 사용해야 하는 불편이 있다
- BRIDGE Notes 내에 화이트보드를 통합하면 문서와 화이트보드가 동일한 트리 구조 안에서 관리되며, 기존 공유/협업/태그/버전 인프라를 그대로 활용할 수 있다

### 1.3 핵심 원칙

- **기존 인프라 최대 활용**: Yjs 실시간 협업, 트리 구조, 공유, 태그, 버전 히스토리 재사용
- **최소 백엔드 변경**: NoteType enum에 BOARD 추가, DB CHECK 제약조건 마이그레이션
- **MIT 라이선스**: `@excalidraw/excalidraw` 무료 오픈소스 라이브러리 사용

---

## 2. 기술 스택

### 2.1 신규 의존성

| 패키지 | 버전 | 용도 | 라이선스 |
|--------|------|------|----------|
| `@excalidraw/excalidraw` | ^0.18.x | 화이트보드 캔버스 React 컴포넌트 | MIT |

### 2.2 기존 활용 의존성

| 패키지 | 현재 버전 | 용도 |
|--------|----------|------|
| `yjs` | 13.6.29 | 실시간 협업 CRDT |
| `y-protocols` | 1.0.7 | Yjs awareness/sync 프로토콜 |

### 2.3 Excalidraw Scene 데이터 구조

Excalidraw는 scene 데이터를 JSON으로 관리한다. 기존 `content` TEXT 컬럼에 저장.

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "bridge-notes",
  "elements": [
    {
      "id": "abc123",
      "type": "rectangle",
      "x": 100, "y": 200,
      "width": 300, "height": 150,
      "strokeColor": "#6366F1",
      "backgroundColor": "#6366F120",
      "fillStyle": "solid",
      "strokeWidth": 2,
      "roughness": 1
    }
  ],
  "appState": {
    "viewBackgroundColor": "transparent"
  },
  "files": {}
}
```

### 2.4 Yjs 연동 방식

```
[Client A: Excalidraw] <-> [Y.Doc (Y.Map 'excalidraw-elements')] <-> [CollabProvider (ws-collab/{noteId})]
                                                                          |
                                                                    [NoteCollabHandler (Server)]
                                                                          |
[Client B: Excalidraw] <-> [Y.Doc (Y.Map 'excalidraw-elements')] <-> [CollabProvider (ws-collab/{noteId})]
```

- `Y.Map`을 사용하여 Excalidraw elements를 동기화
- 각 element는 `element.id`를 key로 하는 `Y.Map` 항목
- `appState`는 로컬 상태 -> Yjs awareness를 통해 커서/포인터 위치만 공유
- 기존 `CollabProvider`, `NoteCollabHandler`를 그대로 재사용

---

## 3. 정보 구조 (IA)

### 3.1 트리 구조 내 위치

BOARD는 DOCUMENT와 동일한 계층에 위치. 폴더 안에 넣을 수 있으며, 루트 레벨에도 생성 가능.

```
Notes (사이드바)
 |- [FOLDER] 프로젝트 기획
 |   |- [DOCUMENT] 요구사항 정의서
 |   |- [BOARD] 아키텍처 다이어그램          <- 신규
 |   +- [DOCUMENT] 회의록
 |- [BOARD] 브레인스토밍                     <- 신규
 +- [DOCUMENT] 온보딩 가이드
```

### 3.2 사이드바 버튼 영역

기존 "새 문서" | "새 폴더" 버튼 영역에 "새 보드" 버튼 추가.

```
[ 새 문서 ] [ 새 폴더 ] [ 새 보드 ]
```

### 3.3 아이콘 체계

| 타입 | Lucide 아이콘 | 색상 |
|------|--------------|------|
| FOLDER (닫힘) | `Folder` | `text-bridge-accent` |
| FOLDER (열림) | `FolderOpen` | `text-bridge-accent` |
| DOCUMENT | `FileText` | `text-slate-400` |
| **BOARD** | **`PenTool`** | **`text-bridge-secondary`** (틸) |

BOARD는 `text-bridge-secondary` 색상으로 문서(슬레이트)와 시각적으로 차별화.

---

## 4. 데이터 모델

### 4.1 NoteType enum 변경

**파일**: `backend/src/main/java/com/kanban/domain/note/NoteType.java`

```java
public enum NoteType {
    FOLDER,
    DOCUMENT,
    BOARD       // 추가
}
```

### 4.2 Note 엔티티 변경

**파일**: `backend/src/main/java/com/kanban/domain/note/Note.java`

```java
public boolean isBoard() {
    return this.type == NoteType.BOARD;
}
```

### 4.3 content 컬럼 활용 (기존 TEXT 컬럼 재사용)

| 타입 | content 저장 포맷 |
|------|------------------|
| FOLDER | `null` |
| DOCUMENT | BlockNote HTML/마크다운 문자열 |
| **BOARD** | **Excalidraw scene JSON 문자열** |

별도 컬럼이나 테이블 추가 없이 기존 `content TEXT` 컬럼을 그대로 사용.

### 4.4 NoteCollabState 재사용

`note_collab_states` 테이블은 `note_id`를 PK로 사용하며, `yjs_state`에 Yjs binary state를 저장. BOARD 타입의 noteId도 동일하게 처리.

### 4.5 DB CHECK 제약조건

기존 (`V25__create_notes_tables.sql`):

```sql
CONSTRAINT chk_notes_type CHECK (type IN ('FOLDER', 'DOCUMENT'))
```

-> 'BOARD' 추가 마이그레이션 필요 (9장 참조)

---

## 5. API 변경사항

### 5.1 기존 API 재사용 (변경 최소화)

| API | 엔드포인트 | 변경사항 |
|-----|----------|---------|
| 트리 조회 | `GET /notes` | 없음 (TreeItem에 type 필드 포함) |
| 상세 조회 | `GET /notes/{noteId}` | 없음 (content에 JSON 반환) |
| **생성** | `POST /notes` | **type에 "BOARD" 허용** |
| 수정 | `PUT /notes/{noteId}` | 없음 (content에 JSON 저장) |
| 삭제 | `DELETE /notes/{noteId}` | 없음 |
| 이동 | `PUT /notes/{noteId}/move` | 없음 |
| **공유** | `POST/DELETE /notes/{noteId}/share` | **BOARD 공유 허용** |
| **공개 조회** | `GET /public/notes/{shareToken}` | **type 필드 추가** |
| **리스트** | `GET /notes/list` | **BOARD도 포함** |

### 5.2 NoteService 변경 상세

**파일**: `backend/src/main/java/com/kanban/domain/note/service/NoteService.java`

#### createNote - content 할당

```java
// Before
.content(type == NoteType.DOCUMENT ? request.getContent() : null)

// After
.content(type == NoteType.DOCUMENT || type == NoteType.BOARD ? request.getContent() : null)
```

#### enableShare - BOARD 공유 허용

```java
// Before
if (!note.isDocument()) {
    throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "폴더는 공유할 수 없습니다");
}

// After
if (note.isFolder()) {
    throw new BusinessException(ErrorCode.INVALID_INPUT_VALUE, "폴더는 공유할 수 없습니다");
}
```

#### getNoteList - BOARD 포함

`findAllDocumentsByBoardId()` 쿼리를 BOARD도 포함하도록 수정하거나 별도 메서드 추가.

### 5.3 NoteResponse.SharedNote 변경

**파일**: `backend/src/main/java/com/kanban/domain/note/dto/NoteResponse.java`

```java
public static class SharedNote {
    private String title;
    private String type;      // 추가: "DOCUMENT" 또는 "BOARD"
    private String content;
    // ... 나머지 동일
}
```

---

## 6. 프론트엔드 구조

### 6.1 신규 컴포넌트

| 컴포넌트 | 경로 | 설명 |
|---------|------|------|
| `ExcalidrawEditor` | `components/notes/ExcalidrawEditor.tsx` | Excalidraw 화이트보드 에디터 (메인) |

### 6.2 수정 컴포넌트

| 컴포넌트 | 수정 내용 |
|---------|---------|
| `NotesView.tsx` | "새 보드" 버튼, BOARD 시 ExcalidrawEditor 렌더링, collaboration 조건 수정 |
| `NoteTreeSidebar.tsx` | BOARD 아이콘 표시, "보드 추가" 컨텍스트 메뉴, DragOverlay |
| `NoteShareButton.tsx` | BOARD 타입에서도 공유 버튼 표시 |
| `SharedNotePage.tsx` | BOARD 공유 시 Excalidraw 읽기 전용 뷰 |

### 6.3 ExcalidrawEditor 컴포넌트 설계

```tsx
interface ExcalidrawEditorProps {
  boardId: string;
  note: NoteDetail;
  tags: NoteTagInfo[];
  canEdit: boolean;
  onSave: (noteId: string, data: { title?: string; content?: string; tagIds?: string[] }, createVersion?: boolean) => void;
  onTagsChange: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onNoteUpdate?: (note: NoteDetail) => void;
  collaboration: CollaborationState | null;
  currentUserName: string;
  currentUserColor: string;
}
```

핵심 구현:

1. **초기화**: `note.content` -> `JSON.parse` -> `initialData`로 Excalidraw에 전달
2. **Yjs 동기화**: `collaboration.doc.getMap('excalidraw-elements')`로 elements 동기화
3. **저장 (Cmd+S)**: scene을 `JSON.stringify`하여 `onSave` 호출
4. **자동 저장**: Yjs state는 CollabProvider 기존 auto-save (30초)로 자동 저장
5. **헤더**: 제목 편집, 태그, 버전 히스토리, 공유 버튼, CollabPresence 재사용

### 6.4 NotesView 변경 상세

#### Collaboration 활성화 조건 수정

```typescript
// Before
enabled: !!selectedNoteId && selectedNote?.type === 'DOCUMENT',

// After
enabled: !!selectedNoteId && (selectedNote?.type === 'DOCUMENT' || selectedNote?.type === 'BOARD'),
```

#### "새 보드" 생성 핸들러

```typescript
const handleCreateBoard = useCallback(async (parentId?: string | null) => {
  if (!canEdit) return;
  const title = t('notes.newBoard', '새 보드');
  const created = await noteService.create(boardId, {
    title,
    type: 'BOARD',
    parentId: parentId || null,
  });
  await loadTree();
  handleSelectNote(created.id);
}, [boardId, canEdit, loadTree, handleSelectNote, t]);
```

#### 에디터 영역 분기

```tsx
{selectedNote?.type === 'BOARD' ? (
  <ExcalidrawEditor
    boardId={boardId}
    note={selectedNote}
    collaboration={collaboration}
    ...
  />
) : (
  <NoteEditor ... />
)}
```

### 6.5 NoteTreeSidebar 변경 상세

#### Props 확장

```typescript
interface NoteTreeSidebarProps {
  // ... 기존 props
  onCreateBoard: (parentId?: string | null) => void;  // 추가
}
```

#### 아이콘 분기

```tsx
{isFolder ? (
  expanded ? <FolderOpen ... /> : <Folder ... />
) : item.type === 'BOARD' ? (
  <PenTool size={18} className="flex-shrink-0 text-bridge-secondary" />
) : (
  <FileText size={18} className="flex-shrink-0 text-slate-400" />
)}
```

#### 컨텍스트 메뉴

폴더 hover 메뉴에 "보드 추가" 항목 추가.

### 6.6 타입 변경

**파일**: `frontend/src/app/utils/api.ts`

```typescript
export interface NoteTreeItem {
  type: "FOLDER" | "DOCUMENT" | "BOARD";  // "BOARD" 추가
  // ...
}

export interface NoteDetail {
  type: "FOLDER" | "DOCUMENT" | "BOARD";  // "BOARD" 추가
  // ...
}
```

### 6.7 i18n 키 추가 (10개 언어)

```json
{
  "notes": {
    "newBoard": "새 보드",
    "addBoard": "보드 추가"
  }
}
```

---

## 7. 실시간 협업

### 7.1 DOCUMENT vs BOARD 비교

| 구분 | DOCUMENT | BOARD |
|------|----------|-------|
| Yjs Data Structure | `Y.XmlFragment('document-store')` | `Y.Map('excalidraw-elements')` |
| WebSocket Endpoint | `/ws-collab/{noteId}` | `/ws-collab/{noteId}` (동일) |
| Server Handler | `NoteCollabHandler` | `NoteCollabHandler` (동일) |
| Client Provider | `CollabProvider` | `CollabProvider` (동일) |
| Awareness | 커서 위치, 사용자 이름/색상 | 포인터 위치, 사용자 이름/색상 |
| State Persistence | `note_collab_states.yjs_state` | 동일 |

### 7.2 Excalidraw Yjs 동기화 구현 (핵심)

```typescript
function useExcalidrawYjsSync(doc: Y.Doc, excalidrawAPI: ExcalidrawImperativeAPI | null) {
  const elementsMap = useMemo(() => doc.getMap('excalidraw-elements'), [doc]);

  // Yjs -> Excalidraw: observe 변경사항
  useEffect(() => {
    const observer = () => {
      if (!excalidrawAPI) return;
      const elements: ExcalidrawElement[] = [];
      elementsMap.forEach((value) => {
        elements.push(value as ExcalidrawElement);
      });
      excalidrawAPI.updateScene({ elements });
    };
    elementsMap.observe(observer);
    return () => elementsMap.unobserve(observer);
  }, [elementsMap, excalidrawAPI]);

  // Excalidraw -> Yjs: onChange 핸들러
  const handleChange = useCallback((elements: readonly ExcalidrawElement[]) => {
    doc.transact(() => {
      const existingKeys = new Set<string>();
      elementsMap.forEach((_, key) => existingKeys.add(key));

      for (const el of elements) {
        const existing = elementsMap.get(el.id);
        if (!existing || existing.version !== el.version) {
          elementsMap.set(el.id, el);
        }
        existingKeys.delete(el.id);
      }

      for (const key of existingKeys) {
        elementsMap.delete(key);
      }
    });
  }, [doc, elementsMap]);

  return { handleChange };
}
```

### 7.3 Awareness (포인터 공유)

```typescript
interface BoardAwarenessState {
  user: { name: string; color: string; };
  pointer?: { x: number; y: number; };
}
```

Excalidraw의 `onPointerUpdate` 콜백에서 awareness를 업데이트하고, 다른 사용자의 awareness state를 Excalidraw의 collaborators로 변환.

### 7.4 저장 전략

| 액션 | 동작 |
|------|------|
| 실시간 (Yjs) | 모든 변경이 즉시 Yjs를 통해 다른 클라이언트에 동기화 |
| Auto-save (30초) | CollabProvider.sendFullState()로 Yjs state를 서버에 저장 |
| 수동 저장 (Cmd+S) | Yjs state 전송 + REST API로 content에 scene JSON 저장 + 버전 생성 |
| 연결 종료 | CollabProvider.disconnect()에서 full state 전송 |

---

## 8. UI/UX 디자인

### 8.1 사이드바

BRIDGE 디자인 시스템 준수.

```
+----------------------------+
|  Notes                     |  text-foreground
|  [Tree] [List]             |  토글
|  [Search...]               |  bg-foreground/5
|                            |
|  [새 문서] [새 폴더] [새 보드] |  text-slate-400 hover:text-foreground
|                            |
|  > [FOLDER] 프로젝트 기획   |  text-bridge-accent
|    [DOC] 요구사항 정의서     |  text-slate-400
|    [BOARD] 아키텍처 다이어그램|  text-bridge-secondary
|  [DOC] 온보딩 가이드        |  text-slate-400
|  [BOARD] 브레인스토밍       |  text-bridge-secondary
+----------------------------+
```

### 8.2 에디터 영역 (BOARD 선택 시)

```
+-----------------------------------------------------------+
| [제목 입력]                        [협업] [태그] [버전] [저장] |  헤더
| tag1  .  2026-03-12 14:30 . 홍길동                          |  메타
+-----------------------------------------------------------+
|                                                           |
|                                                           |
|              Excalidraw Canvas                            |  bg-bridge-obsidian
|            (무한 캔버스 화이트보드)                           |  rounded-2xl
|                                                           |
|                                                           |
|  [------ 도구 모음 (Excalidraw 내장 UI) ------]             |
+-----------------------------------------------------------+
```

### 8.3 Excalidraw 테마 통합

```tsx
<Excalidraw
  theme={isDark ? 'dark' : 'light'}
  UIOptions={{
    canvasActions: {
      loadScene: false,     // BRIDGE 자체 저장/로드 사용
      export: { saveFileToDisk: true },
    },
  }}
  initialData={{
    appState: {
      viewBackgroundColor: isDark ? '#151B28' : '#efe6d8',  // bridge-obsidian
    }
  }}
/>
```

### 8.4 공유 보드 뷰

BOARD 공유 시 Excalidraw를 읽기 전용으로 렌더링:

```tsx
{note.type === 'BOARD' ? (
  <Excalidraw
    initialData={JSON.parse(note.content || '{}')}
    viewModeEnabled={true}
    theme={isDark ? 'dark' : 'light'}
  />
) : (
  <BlockNoteView editor={editor} ... />
)}
```

### 8.5 반응형

- 캔버스 영역: `min-h-[60vh]` (데스크톱), `min-h-[50vh]` (모바일)
- Excalidraw 내장 반응형 UI 활용
- 터치/모바일 기본 지원 (조회 + 간단한 편집)

---

## 9. DB 마이그레이션

### 9.1 마이그레이션 파일

**파일명**: `V{YYYYMMDD_HHmmss}__add_board_note_type.sql`
**경로**: `backend/src/main/resources/db/migration/`

```sql
-- BOARD 타입을 notes.type CHECK 제약조건에 추가 (멱등)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_notes_type') THEN
        ALTER TABLE notes DROP CONSTRAINT chk_notes_type;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_notes_type') THEN
        ALTER TABLE notes ADD CONSTRAINT chk_notes_type CHECK (type IN ('FOLDER', 'DOCUMENT', 'BOARD'));
    END IF;
END $$;
```

### 9.2 H2 호환성

H2(local 프로필)은 `ddl-auto: update` -> Flyway 미실행. JPA `@Enumerated(EnumType.STRING)`이 H2에서 자동 처리되므로 별도 조치 불필요.

---

## 10. 구현 단계

### Phase 1: 기반 구조 (백엔드 + 타입)

1. `NoteType.java`에 `BOARD` 추가
2. `Note.java`에 `isBoard()` 메서드 추가
3. `NoteService.createNote()` content 할당 로직 수정
4. `NoteService.enableShare()` BOARD 공유 허용
5. `NoteResponse.SharedNote`에 `type` 필드 추가
6. `NoteRepository` 리스트 쿼리 수정 (BOARD 포함)
7. DB 마이그레이션 파일 작성

### Phase 2: 프론트엔드 타입 + 사이드바

1. `@excalidraw/excalidraw` 패키지 설치
2. `api.ts` 타입 인터페이스 수정 (BOARD 추가)
3. `services.ts` noteService.create 타입 수정
4. `NoteTreeSidebar.tsx`: BOARD 아이콘, 컨텍스트 메뉴, DragOverlay
5. `NotesView.tsx`: "새 보드" 버튼, handleCreateBoard
6. 10개 i18n locale 파일에 키 추가

### Phase 3: Excalidraw 에디터 (비협업)

1. `ExcalidrawEditor.tsx` 컴포넌트 작성
2. `NotesView.tsx`에서 BOARD 시 ExcalidrawEditor 렌더링
3. 테마 연동 (dark/light)
4. 헤더 UI (제목, 태그, 버전, 공유 재사용)
5. `SharedNotePage.tsx` 수정: BOARD 읽기 전용 뷰

### Phase 4: 실시간 협업 (Yjs)

1. `useCollaboration.ts`: BOARD 타입 활성화
2. Yjs Y.Map 기반 elements 동기화 구현
3. Awareness 연동 (포인터 위치 공유)
4. 초기 state 로드 (Yjs -> content JSON 폴백)
5. 동시 편집 테스트

### Phase 5: 빌드 검증 + 마무리

1. `cd frontend && npm run build` 통과
2. `cd backend && ./gradlew build --no-daemon` 통과
3. E2E 테스트: 생성/편집/삭제/이동/공유/동시편집/버전

---

## 11. 향후 확장

### v1.1

- 보드 내 이미지 삽입 (S3 업로드 연동)
- PNG/SVG 내보내기 (Excalidraw 내장 기능)
- 보드 썸네일 미리보기 (트리 사이드바)
- 보드 템플릿 (Flow chart, Mind map, Wireframe 등)

### v1.2

- 문서 내 보드 임베드 (inline Excalidraw)
- 보드 AI 분석 (화이트보드 -> 태스크/피쳐 추천)
- 보드 영역 댓글 (element ID 기반)
- 프레젠테이션 모드

### 기술적 고려사항

- **번들 크기**: `@excalidraw/excalidraw` ~1.5MB (gzipped ~400KB). Lazy loading으로 Notes 탭 진입 시에만 로드
- **성능**: 대형 보드 (1000+ elements) Yjs 동기화 성능. 필요 시 element 수 제한
- **보안**: 공유 보드 scene JSON 민감 정보 주의. 기존 read-only 공유 정책 적용

---

## 수정 파일 목록

### Backend

| 파일 | 변경 내용 |
|------|---------|
| `domain/note/NoteType.java` | `BOARD` enum 추가 |
| `domain/note/Note.java` | `isBoard()` 메서드 추가 |
| `domain/note/service/NoteService.java` | createNote, enableShare 수정 |
| `domain/note/dto/NoteResponse.java` | SharedNote에 type 필드 추가 |
| `domain/note/repository/NoteRepository.java` | 리스트 쿼리 BOARD 포함 |
| `resources/db/migration/V*__add_board_note_type.sql` | CHECK 제약조건 마이그레이션 |

### Frontend

| 파일 | 변경 내용 |
|------|---------|
| `components/notes/ExcalidrawEditor.tsx` | **신규** - Excalidraw 에디터 |
| `components/notes/NotesView.tsx` | "새 보드" 버튼, 에디터 분기, collaboration 조건 |
| `components/notes/NoteTreeSidebar.tsx` | BOARD 아이콘, 컨텍스트 메뉴 |
| `components/notes/NoteShareButton.tsx` | BOARD 공유 허용 |
| `pages/SharedNotePage.tsx` | BOARD 읽기 전용 뷰 |
| `utils/api.ts` | NoteTreeItem, NoteDetail 타입 수정 |
| `utils/services.ts` | noteService.create 타입 수정 |
| `i18n/locales/*.json` (10개) | notes.newBoard, notes.addBoard 키 추가 |
