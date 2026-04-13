# Comment Reply Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 댓글 마우스오버 시 Reply 버튼을 추가하여 특정 댓글에 대한 답글 기능을 구현한다.

**Architecture:** Backend에 `parent_id` 셀프 참조 컬럼을 추가하고, Frontend에서 Reply 버튼 클릭 시 입력 영역에 "답글 대상" 표시 후 `parent_id`와 함께 댓글을 생성한다. 답글은 플랫 리스트에서 원본 댓글을 인용 표시하는 방식(Slack/Discord 스타일)으로 렌더링한다.

**Tech Stack:** Spring Boot (JPA Entity, DTO, Service), React (CommentPanel.tsx), Flyway Migration, i18n (10개 언어)

---

### Task 1: Backend — Flyway Migration (parent_id 컬럼 추가)

**Files:**
- Create: `backend/src/main/resources/db/migration/V20260407_180000__add_parent_id_to_comments.sql`

**Step 1: 마이그레이션 파일 생성**

```sql
-- 댓글 답글 기능: parent_id 컬럼 추가
DO $$ BEGIN
    ALTER TABLE comments ADD COLUMN parent_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 자기 참조 외래 키
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_comment_parent') THEN
        ALTER TABLE comments ADD CONSTRAINT fk_comment_parent
            FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_comment_parent_id ON comments(parent_id);
```

**Step 2: 빌드 확인**

Run: `cd backend && ./gradlew build --no-daemon`
Expected: BUILD SUCCESSFUL

---

### Task 2: Backend — Comment Entity 수정

**Files:**
- Modify: `backend/src/main/java/com/kanban/domain/comment/Comment.java`

**Step 1: parent 필드 추가**

Comment.java에 다음 필드를 `mentions` 필드 아래에 추가:

```java
@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "parent_id")
private Comment parent;
```

`@Table` 어노테이션의 indexes 배열에 추가:

```java
@Index(name = "idx_comment_parent_id", columnList = "parent_id")
```

---

### Task 3: Backend — DTO 수정 (Request + Response)

**Files:**
- Modify: `backend/src/main/java/com/kanban/domain/comment/dto/CommentRequest.java`
- Modify: `backend/src/main/java/com/kanban/domain/comment/dto/CommentResponse.java`

**Step 1: CommentRequest.Create에 parentId 필드 추가**

```java
public static class Create {
    @Size(max = 2000, message = "댓글은 2000자 이내여야 합니다")
    private String content;

    private List<String> mentions;

    /** 미리 업로드된 파일의 임시 키 목록 */
    private List<String> fileKeys;

    /** 답글 대상 댓글 ID (null이면 루트 댓글) */
    private String parentId;
}
```

**Step 2: CommentResponse.Detail에 parentId + parentAuthorName 필드 추가**

Detail 클래스에 필드 추가:

```java
private String parentId;
private String parentAuthorName;
```

`Detail.of()` 메서드의 빌더에 추가:

```java
.parentId(comment.getParent() != null ? comment.getParent().getId() : null)
.parentAuthorName(comment.getParent() != null && comment.getParent().getAuthor() != null
        ? comment.getParent().getAuthor().getName() : null)
```

---

### Task 4: Backend — CommentService 수정

**Files:**
- Modify: `backend/src/main/java/com/kanban/domain/comment/service/CommentService.java`

**Step 1: createComment 메서드에서 parentId 처리**

`createComment` 메서드의 Comment.builder() 부분을 수정:

```java
// parentId 처리 (기존 builder 호출 직전에)
Comment parentComment = null;
if (request.getParentId() != null && !request.getParentId().isBlank()) {
    parentComment = commentRepository.findById(request.getParentId())
            .orElseThrow(() -> new BusinessException(ErrorCode.COMMENT_NOT_FOUND));
}

Comment comment = Comment.builder()
        .task(task)
        .board(board)
        .author(user)
        .content(content)
        .mentions(mentionsStr)
        .parent(parentComment)
        .build();
```

---

### Task 5: Backend — CommentRepository 수정

**Files:**
- Modify: `backend/src/main/java/com/kanban/domain/comment/CommentRepository.java`

**Step 1: 기존 쿼리에 parent fetch join 추가**

`findByTaskIdWithAuthorAndReactions` 쿼리에 parent LEFT JOIN FETCH 추가:

```java
@Query("SELECT DISTINCT c FROM Comment c " +
       "LEFT JOIN FETCH c.author " +
       "LEFT JOIN FETCH c.attachments " +
       "LEFT JOIN FETCH c.reactions r " +
       "LEFT JOIN FETCH r.user " +
       "LEFT JOIN FETCH c.parent p " +
       "LEFT JOIN FETCH p.author " +
       "WHERE c.task.id = :taskId " +
       "ORDER BY c.createdAt ASC")
List<Comment> findByTaskIdWithAuthorAndReactions(@Param("taskId") String taskId);
```

동일하게 `findByTaskIdWithAuthor`에도 추가:

```java
@Query("SELECT DISTINCT c FROM Comment c " +
       "LEFT JOIN FETCH c.author " +
       "LEFT JOIN FETCH c.attachments " +
       "LEFT JOIN FETCH c.parent p " +
       "LEFT JOIN FETCH p.author " +
       "WHERE c.task.id = :taskId " +
       "ORDER BY c.createdAt ASC")
List<Comment> findByTaskIdWithAuthor(@Param("taskId") String taskId);
```

**Step 2: 백엔드 빌드 확인**

Run: `cd backend && ./gradlew build --no-daemon`
Expected: BUILD SUCCESSFUL

---

### Task 6: Frontend — TaskComment 타입 수정

**Files:**
- Modify: `frontend/src/app/types/index.ts`

**Step 1: TaskComment 인터페이스에 parent_id, parent_author_name 추가**

```typescript
export interface TaskComment {
  id: string;
  task_id: string;
  author: {
    id: string;
    name: string;
    profile_image: string | null;
  };
  content: string;
  mentions: string[];
  attachments: CommentAttachment[];
  reactions: CommentReaction[];
  parent_id: string | null;
  parent_author_name: string | null;
  created_at: string;
  updated_at: string;
}
```

---

### Task 7: Frontend — commentAPI 수정

**Files:**
- Modify: `frontend/src/app/utils/api.ts`

**Step 1: createComment에 parentId 파라미터 추가**

`commentAPI.createComment` 수정:

```typescript
createComment: async (
  boardId: string,
  taskId: string,
  data: { content: string; mentions?: string[]; fileKeys?: string[]; parentId?: string },
) => {
  return apiClient.post<CommentDetailResponse>(
    `/boards/${boardId}/tasks/${taskId}/comments`,
    {
      content: data.content,
      mentions: data.mentions,
      file_keys: data.fileKeys,
      parent_id: data.parentId,
    },
  );
},
```

---

### Task 8: Frontend — CommentPanel.tsx Reply 기능 추가

**Files:**
- Modify: `frontend/src/app/components/CommentPanel.tsx`

**Step 1: import에 Reply 아이콘 추가**

Lucide import에 `Reply` 추가:

```typescript
import { MessageSquare, Send, RefreshCw, Pencil, Trash2, X, Check, Loader2, Paperclip, Play, ChevronLeft, ChevronRight, SmilePlus, Plus, ImageIcon, Sparkles, CheckCircle2, HelpCircle, ListChecks, Users, Reply } from 'lucide-react';
```

**Step 2: replyTo 상태 추가**

CommentPanel 함수 내부, `// 새 댓글 입력` 섹션에 상태 추가:

```typescript
// 답글 대상
const [replyTo, setReplyTo] = useState<{ id: string; authorName: string } | null>(null);
```

**Step 3: hover 액션에 Reply 버튼 추가**

기존 hover actions div (line ~1393) 안에서 SmilePlus 버튼과 EmojiPickerPopup 사이에 Reply 버튼을 추가:

```tsx
{/* Reply 버튼 — emoji 피커 뒤, edit 버튼 앞 */}
<button
  onClick={() => {
    setReplyTo({ id: comment.id, authorName: comment.author.name });
    textareaRef.current?.focus();
  }}
  className="p-1 rounded hover:bg-foreground/10 text-slate-400 hover:text-muted-foreground"
  title={t('comment.reply')}>
  <Reply className="h-3 w-3" />
</button>
```

위치: `EmojiPickerPopup` 컴포넌트 바로 뒤, `{isAuthor && (` 바로 앞에 삽입.

**Step 4: handleSubmit에 parentId 전달**

handleSubmit 함수 내부 `commentAPI.createComment` 호출 부분 수정:

```typescript
const response = await commentAPI.createComment(boardId, taskId, {
  content: newComment.trim() || '',
  mentions: pendingMentions,
  fileKeys: fileKeys.length > 0 ? fileKeys : undefined,
  parentId: replyTo?.id,
});
```

성공 후 replyTo 초기화 추가 (setNewComment('') 아래):

```typescript
setReplyTo(null);
```

**Step 5: 입력 영역 위에 "답글 대상" 표시 배너 추가**

입력 영역 (`{canEdit ? (` 블록, line ~1505) 안에서 `<FilePreviewList` 바로 위에 추가:

```tsx
{/* 답글 대상 표시 */}
{replyTo && (
  <div className="flex items-center gap-2 px-1 py-1.5 mb-1.5 rounded-lg bg-bridge-accent/10 border border-bridge-accent/20">
    <Reply className="h-3 w-3 text-bridge-accent flex-shrink-0" />
    <span className="text-xs text-bridge-accent font-medium truncate">
      {t('comment.replyingTo', { name: replyTo.authorName })}
    </span>
    <button
      onClick={() => setReplyTo(null)}
      className="ml-auto p-0.5 rounded hover:bg-foreground/10 text-slate-400 hover:text-muted-foreground flex-shrink-0">
      <X className="h-3 w-3" />
    </button>
  </div>
)}
```

**Step 6: 댓글 렌더링 시 답글 인용 표시**

댓글 본문 렌더링 부분 (line ~1486 `{comment.content && comment.content.trim() && (` 바로 위)에 부모 댓글 인용 추가:

```tsx
{comment.parent_id && comment.parent_author_name && (
  <div className="flex items-center gap-1 mb-1 text-xs text-slate-400">
    <Reply className="h-2.5 w-2.5 flex-shrink-0" />
    <span className="truncate">@{comment.parent_author_name}</span>
  </div>
)}
```

**Step 7: 빌드 확인**

Run: `cd frontend && npm run build`
Expected: BUILD SUCCESSFUL

---

### Task 9: Frontend — i18n 번역 추가 (10개 언어)

**Files:**
- Modify: `frontend/src/app/i18n/locales/ko.json`
- Modify: `frontend/src/app/i18n/locales/en.json`
- Modify: `frontend/src/app/i18n/locales/ja.json`
- Modify: `frontend/src/app/i18n/locales/zh.json`
- Modify: `frontend/src/app/i18n/locales/zh-TW.json`
- Modify: `frontend/src/app/i18n/locales/vi.json`
- Modify: `frontend/src/app/i18n/locales/th.json`
- Modify: `frontend/src/app/i18n/locales/es.json`
- Modify: `frontend/src/app/i18n/locales/pt-BR.json`
- Modify: `frontend/src/app/i18n/locales/hi.json`

**Step 1: comment 섹션에 reply 관련 키 2개 추가**

각 언어별로 `"comment"` 객체의 기존 키 마지막(예: `"uploadFailedRetry"` 뒤, `"reaction"` 앞)에 추가:

| Key | ko | en | ja | zh | zh-TW | vi | th | es | pt-BR | hi |
|-----|----|----|----|----|-------|----|----|----|-------|----|
| `comment.reply` | 답글 | Reply | 返信 | 回复 | 回覆 | Trả lời | ตอบกลับ | Responder | Responder | उत्तर |
| `comment.replyingTo` | {{name}}에게 답글 | Replying to {{name}} | {{name}}に返信 | 回复 {{name}} | 回覆 {{name}} | Trả lời {{name}} | ตอบกลับ {{name}} | Respondiendo a {{name}} | Respondendo a {{name}} | {{name}} को उत्तर |

---

### Task 10: 전체 빌드 검증

**Step 1: Backend 빌드**

Run: `cd backend && ./gradlew build --no-daemon`
Expected: BUILD SUCCESSFUL

**Step 2: Frontend 빌드**

Run: `cd frontend && npm run build`
Expected: BUILD SUCCESSFUL

---

## 구현 요약

| 영역 | 변경 | 파일 수 |
|------|------|---------|
| DB Migration | `parent_id` 컬럼 + FK + Index | 1 |
| Backend Entity | `parent` 셀프 참조 필드 | 1 |
| Backend DTO | Request에 `parentId`, Response에 `parentId` + `parentAuthorName` | 2 |
| Backend Service | createComment에서 parent 조회/설정 | 1 |
| Backend Repository | 쿼리에 parent fetch join | 1 |
| Frontend Type | `TaskComment`에 `parent_id`, `parent_author_name` | 1 |
| Frontend API | createComment에 `parentId` 파라미터 | 1 |
| Frontend UI | Reply 버튼 + 답글 배너 + 인용 표시 | 1 |
| i18n | 10개 언어 × 2 키 | 10 |
| **합계** | | **19 파일** |

## 동작 흐름

1. 댓글 hover → 기존 아이콘들(😊 ✏️ 🗑) 옆에 **↩ Reply** 버튼 표시
2. Reply 클릭 → 하단 입력 영역 위에 "{{name}}에게 답글" 배너 표시 + 텍스트 영역 포커스
3. 댓글 작성 → `parent_id` 포함하여 API 호출
4. 답글 댓글은 리스트에서 "↩ @name" 인용 표시와 함께 시간순으로 렌더링
