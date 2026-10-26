# 설교 노트 버전 기록 API 계약 (v1)

기기가 찍어 두던 노트 버전(열 때·자동·닫을 때·되돌리기 직전)을 서버에도 올려, 다른 기기에서도 보고 되돌릴 수 있게 한다.
노트 원본은 `personal_feature_docs(feature_key='sermon')` 이고, `{noteId}` 는 그 **서버 문서 id** 다 (`local-…` 아님).

- Base: `/api/v1/sermon-notes/{noteId}/versions` — 로그인 필요
- JSON 은 snake_case, null 필드는 키가 빠진다(non_null)
- 서버 코드: `com.kanban.domain.sermonnote` (SermonNoteVersionService / SermonNoteDocHook)

## 데이터 — sermon_note_versions
| 필드 | 값 |
|---|---|
| id | varchar(36) PK — **기기에서 만든다**, `[A-Za-z0-9_-]{8,36}` |
| user_id | varchar(36) — 노트 주인 |
| note_id | varchar(36) — personal_feature_docs.id (FK 없음) |
| reason | `open` `auto` `close` `restore` |
| title | varchar(200) null — 앞뒤 공백 제거, 빈 값 null, 200자 넘으면 잘라 저장 |
| body | text — UTF-8 256KB(262,144 바이트)까지 |
| chars | int — 글자 수(클라이언트 계산값, 안 보내면 서버가 body 코드포인트 수) |
| at | timestamp — 기기 시각(UTC). API 에선 **epoch millis 숫자** |
| created_at | timestamp — 서버가 받은 시각 (API 에 없음) |

인덱스 `(user_id, note_id, at DESC)`. **노트마다 최근 30장** — 넣은 뒤 `at` 이 오래된 것부터 30장 밖을 지운다
(`at` 같으면 created_at 이 오래된 것부터).

## 공통 규칙
- 노트가 내 것이고, 살아 있고(deleted_at null), feature_key='sermon' 이어야 한다. 아니면 모두 **SNV001 (404)**
  (남의 노트·지운 노트·다른 기능 문서·없는 id 구분 없음)
- 입력 오류 **SNV002 (400)**: id 형식, reason 이 4가지 밖, body 없음/256KB 초과, at 없음, chars 음수,
  같은 id 가 다른 노트(또는 다른 사람)에 이미 있음

## 엔드포인트

### GET /sermon-notes/{noteId}/versions
최신 순(`at` DESC), 본문 없음.
```json
{ "items": [
  { "id": "v-1730000000000-ab12", "note_id": "6f1c…", "reason": "close", "title": "포도나무와 가지",
    "chars": 1532, "at": 1761400000000 }
] }
```
`title` 이 null 이면 키가 없다.

### GET /sermon-notes/{noteId}/versions/{id}
한 장 + `body`. 없으면 SNV001.
```json
{ "id": "v-…", "note_id": "6f1c…", "reason": "auto", "title": "…", "chars": 1532, "at": 1761400000000,
  "body": "<p>…</p>" }
```

### PUT /sermon-notes/{noteId}/versions/{id}
멱등 업로드. 본문:
```json
{ "reason": "auto", "title": "포도나무와 가지", "body": "<p>…</p>", "chars": 1532, "at": 1761400000000 }
```
- 처음이면 저장 후 30장 정리. 응답 200 = 목록 항목 모양(본문 없음)
- 같은 id 가 이미 있으면(같은 노트·같은 사람) **아무것도 바꾸지 않고** 저장된 것을 200 으로 돌려준다
  (본문이 달라도 덮지 않음 — 오프라인 재전송용)

## 노트 삭제 · 탈퇴 · 하드 삭제
- `DELETE /api/v1/personal/features/sermon/docs/{id}`(소프트 삭제) 때 같은 트랜잭션에서 지운다:
  그 노트의 버전 기록 전부 + 그 노트로 올린 내 모임 공개 사본(`sermon_note_shares.note_id` = 문서 id)과 거기 달린 반응.
- 회원 탈퇴: `SermonAccountCleaner` 가 `sermon_note_versions WHERE user_id = ?` 를 지운다.
- 30일 뒤 하드 삭제 스케줄러(PersonalTaskCleanupScheduler)는 FK 가 없어 막히지 않는다(버전은 이미 소프트 삭제 때 지워짐).

## 노트 개수 상한 (personal_feature_docs)
사용자 × 기능당 살아 있는 문서 상한은 기능별이다 — **설교 노트(sermon) 5000**, 그 밖(timetable 등) 200.
넘으면 기존과 같이 PF004 (400).
