# Notes 화이트보드(BOARD) 기능 구현

## Task Information
- **Task ID**: TASK-2026-0312-001
- **Date**: 2026-03-12
- **Classification**: 상
- **Domain**: fullstack
- **Confidence**: 95%
- **Spec**: `docs/notes-whiteboard-board-spec.md`

## Summary
Notes 섹션에 BOARD(화이트보드) 타입을 추가하여 Excalidraw 기반 무한 캔버스 기능을 구현했습니다.
기존 Yjs/CollabProvider 인프라를 재사용하여 실시간 협업을 지원하며, 별도 테이블 추가 없이
content TEXT 컬럼에 scene JSON을 저장하는 구조입니다.

## Analysis Summary
- **Scope**: Backend 6파일 + Frontend 17파일 (신규 2, 수정 15) + DB 마이그레이션 1
- **Risk Areas**:
  - NoteService.java content 조건 + enableShare 조건 정확한 변경 필요
  - NoteRepository.java DOCUMENT-only 쿼리 → BOARD 포함 필요
  - SharedNotePage.tsx BlockNote만 렌더링 → BOARD 분기 누락 시 공유 보드 깨짐
  - @excalidraw/excalidraw ~1.5MB 번들 → Lazy loading 필수
- **Cross-cutting**: Yjs Y.Map vs Y.XmlFragment 충돌 방지, Excalidraw lazy loading

## Changes Made

### Backend (5 modified + 1 new)

| 파일 | 변경 | 설명 |
|------|------|------|
| `NoteType.java` | Modified | `BOARD` enum 추가 |
| `Note.java` | Modified | `isBoard()` 메서드 추가 |
| `NoteService.java` | Modified | content 저장 조건, 공유 허용, 쿼리 포함 |
| `NoteResponse.java` | Modified | SharedNote에 `type` 필드 추가 |
| `NoteRepository.java` | Modified | JPQL `IN ('DOCUMENT', 'BOARD')` |
| `V20260312_143000__add_board_note_type.sql` | **New** | CHECK 제약조건 마이그레이션 (멱등) |

### Frontend (1 new + 12 modified)

| 파일 | 변경 | 설명 |
|------|------|------|
| `ExcalidrawEditor.tsx` | **New** | Excalidraw + Yjs Y.Map 협업 에디터 |
| `NotesView.tsx` | Modified | handleCreateBoard, 새 보드 버튼, 협업 조건 |
| `NoteEditor.tsx` | Modified | BOARD → ExcalidrawEditor lazy 분기 |
| `NoteTreeSidebar.tsx` | Modified | PenTool 아이콘, onCreateBoard, 컨텍스트 메뉴 |
| `NoteShareButton.tsx` | Modified | BOARD 공유 허용 |
| `SharedNotePage.tsx` | Modified | BOARD 읽기전용 Excalidraw 뷰 |
| `api.ts` | Modified | NoteTreeItem, NoteDetail, SharedNote 타입에 BOARD |
| `services.ts` | Modified | noteService.create 타입에 BOARD |
| `10개 i18n 파일` | Modified | `newBoard`, `addBoard` 키 추가 |
| `package.json` | Modified | `@excalidraw/excalidraw@^0.18.0` |

## Decision Log

| # | 결정 | 근거 |
|---|------|------|
| 1 | content 컬럼에 scene JSON 저장 | 별도 테이블 불필요, 기존 버전 관리 재사용 |
| 2 | Y.Map('excalidraw-elements') 사용 | Y.XmlFragment(BlockNote)과 충돌 방지 |
| 3 | React.lazy + Suspense | Excalidraw ~1.5MB 번들 코드스플리팅 |
| 4 | enableShare에서 `note.isFolder()` 조건으로 변경 | DOCUMENT와 BOARD 모두 공유 허용 (FOLDER만 차단) |
| 5 | findAllDocumentsAndBoardsByBoardId 메서드명 | BOARD 포함 의도를 명시적으로 표현 |
| 6 | 3-SubAgent 병렬/순차 구조 | BE+FE기반(A그룹 병렬) → 컴포넌트통합(B그룹 순차) |

## SubAgent Summary

| ID | 설명 | 모델 | 그룹 | 결과 |
|----|------|------|------|------|
| SA-001 | Backend BOARD 타입 + DB 마이그레이션 | Sonnet | A (병렬) | ✅ |
| SA-002 | Frontend 타입 + 사이드바 + i18n + npm install | Sonnet | A (병렬) | ✅ |
| SA-003 | ExcalidrawEditor + NotesView 통합 + 공유 뷰 | Opus | B (순차) | ✅ |

## Test Results

| 검증 | 결과 |
|------|------|
| `./gradlew build --no-daemon` | ✅ BUILD SUCCESSFUL |
| `npm run build` | ✅ built in 14.94s |
| Data Contract 13개 항목 | ✅ 전체 통과 |

## Architecture Impact

- **새 의존성**: `@excalidraw/excalidraw@^0.18.0` (MIT, lazy loaded)
- **새 컴포넌트**: `ExcalidrawEditor.tsx` — Notes 컴포넌트 그룹에 추가
- **DB 변경**: CHECK 제약조건 확장 (`FOLDER, DOCUMENT` → `FOLDER, DOCUMENT, BOARD`)
- **기존 인프라 재사용**: CollabProvider, NoteCollabHandler, WebSocket, tree 구조, 공유, 태그, 버전 관리

## Future Considerations

- Excalidraw Library 패널 커스터마이징 (팀 공유 도형/아이콘)
- 보드 템플릿 (마인드맵, 플로우차트 프리셋)
- 보드 → 이미지 내보내기 (PNG/SVG)
- 협업 커서 색상 assignee color 연동
- 모바일(Capacitor) 터치 최적화

## Tags
`feature` `fullstack` `excalidraw` `yjs` `collaboration` `notes` `whiteboard`
