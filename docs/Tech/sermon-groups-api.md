# 설교 노트 「모임」 API 계약 (v1)

설교 노트(/sermonnote)의 모임 기능. 모임이 「같이 드리는 예배(예배표)」를 정해 두면, 그 예배 시간에 쓴 노트가
모임의 **설교 자리(session)** 에 붙고, 멤버끼리 공개한 조각(밑줄·생각·적용·질문)을 서로 본다.
노트 원본은 지금처럼 `personal_feature_docs(feature_key='sermon')` 에 있고, 모임 쪽에는 **공개 사본(share)** 만 둔다.

- Base: `/api/v1/sermon-groups`, `/api/v1/sermon-sessions`, `/api/v1/sermon-shares`
- JSON 은 전부 snake_case (Jackson SNAKE_CASE). 시각은 UTC ISO, 날짜는 `yyyy-MM-dd`(교회 현지 날짜, 클라이언트가 보냄)
- 인증: 아래 `GET /sermon-groups/invite/{code}` 만 공개(permitAll). 나머지는 로그인 필요
- 에러: 기존 ErrorCode/ApiException 체계. 코드 접두 `SG`
  - SG001 모임 없음/삭제됨, SG002 멤버 아님(또는 승인 대기), SG003 리더 권한 필요, SG004 초대 코드 무효/만료,
    SG005 이미 멤버, SG006 인원 상한(50), SG007 내 모임 수 상한(20), SG008 설교 자리 잠김, SG009 같이 써요 주 1회 초과,
    SG010 입력 검증(예배표 등)

## 데이터

### 모임 sermon_groups
| 필드 | 타입 | 설명 |
|---|---|---|
| id | varchar(36) | uuid |
| name | varchar(60) | 모임 이름 |
| kind | varchar(20) | `church`(교회 모임) / `study`(성경공부) / `family`(가족) / `friend`(친구) / `team`(사역팀) |
| services | json | 예배표 (아래) |
| invite_code | varchar(12) unique null | 초대 코드. null = 링크 꺼짐 |
| invite_expires_at | timestamp null | null = 무기한 |
| join_approval | boolean | 참여 승인 필요 |
| created_by | user | |
| deleted_at | timestamp null | 소프트 삭제 |

**services (예배표)** — JSON 배열, 최대 12개
```json
[{ "id": "sun", "name": "주일 설교", "active": true,
   "slots": [{ "dow": 0, "start": "09:00", "end": "10:20", "part": "1부" },
             { "dow": 0, "start": "11:00", "end": "12:20", "part": "2부" }] }]
```
- id: 모임 안에서 고유한 짧은 문자열(클라이언트가 만듦, `[a-z0-9_-]{1,20}`)
- slots: 1~10개, dow 0~6, start/end "HH:mm", part 선택(최대 10자)

### 멤버 sermon_group_members
id, group_id, user_id, role(`leader`/`co_leader`/`member`), status(`pending`/`active`), display_name(varchar 20),
muted_service_ids(json 문자열 배열 — 내가 안 드리는 예배), joined_at. UNIQUE(group_id, user_id)

### 설교 자리 sermon_sessions
id, group_id, service_id(varchar 20 null — 예배표 밖이면 null), date(date), name(varchar 60 null — 예배표 밖 자리 이름),
title(varchar 200), preacher(varchar 60), refs(json 문자열 배열, encRef 형식 "44:5:12-14"), locked(boolean),
updated_by(user null), opened_by(user null). UNIQUE(group_id, service_id, date) (service_id 가 있을 때)

### 공개 사본 sermon_note_shares
id, session_id, group_id, user_id, note_id(varchar 64 — 클라이언트 노트 id, 참고용), my_title(varchar 200),
heard(`live`/`video`/`other`), part(varchar 10 null), private(boolean — 기록은 했지만 내용 비공개),
galpi(boolean NOT NULL DEFAULT false — 이 멤버가 이 노트를 이번 주 갈피로 꽂았는지. 내용이 아니라서 private 이어도 보인다),
fields(json, 최대 64KB), updated_at. UNIQUE(session_id, user_id)

노트를 지우면(`DELETE /api/v1/personal/features/sermon/docs/{id}`, 소프트 삭제) 그 노트로 올린 **내** 공개 사본
(`user_id` = 나 AND `note_id` = 서버 문서 id, 모든 모임)과 거기 달린 반응을 같은 트랜잭션에서 지운다.
`note_id` 가 아직 `local-…` 인 사본은 맞지 않아 남는다 — 클라이언트는 서버 id 로 바뀐 뒤 다시 PUT 해 note_id 를 고친다.

**fields**
```json
{ "highlights": [{ "ref": "44:5:12-12", "marks": [[0, 18]], "text": "이와 같이 모든 사람이 죄를 지었으므로" }],
  "thoughts": [{ "id": "t1", "tag": "생각|질문|적용", "text": "…" }],
  "summary": "정리 본문 텍스트(공개했을 때만)" }
```

### 반응 sermon_reactions
id, share_id, item_key(varchar 64 — 생각 id 또는 "h:<ref>" 또는 "note"), user_id, kind(`amen`/`curious`/`keeping`), created_at.
UNIQUE(share_id, item_key, user_id, kind)

### 같이 써요 sermon_pokes
id, group_id, from_user, to_user, week_start(date), session_id null, created_at, seen_at null. UNIQUE(group_id, from_user, to_user, week_start)

## 응답 모양

**GroupSummary / GroupDetail**
```json
{ "id": "…", "name": "청년부 2모임", "kind": "church",
  "services": [ … ], "join_approval": true,
  "invite_code": "a7Kd2xQp", "invite_expires_at": "2026-11-02T00:00:00Z",   // 리더·함께 리더에게만, 아니면 null
  "me": { "user_id": "…", "role": "leader", "status": "active", "display_name": "상건", "muted_service_ids": [] },
  "members": [{ "user_id": "…", "display_name": "민지", "role": "member", "status": "active", "profile_image": null }],
  // pending 멤버는 리더·함께 리더에게만 포함
  "member_count": 7, "created_at": "…" }
```

**SessionSummary** (week 응답 안)
```json
{ "id": "…", "service_id": "sun", "date": "2026-10-25", "name": null,
  "title": "한 사람으로 인해…", "preacher": "김성현 감독님", "refs": ["44:5:12-14"], "locked": false,
  "updated_by_name": "민지",
  "members": [{ "user_id": "…", "state": "written" | "private", "galpi": false }],   // 기록한 사람만. 없는 사람 = 아직. galpi 는 항상 키 있음
  "my_share_id": "…" | null }
```

## 엔드포인트

### 모임
- `GET /api/v1/sermon-groups` → `GroupDetail[]` (내가 active 또는 pending 인 모임)
- `POST /api/v1/sermon-groups` body `{ name, kind, services, join_approval, display_name, invite_expires_days }`
  → 201 `GroupDetail` (만든 사람 = leader, 초대 코드 생성. invite_expires_days: 7|30|null)
- `GET /api/v1/sermon-groups/{id}` → `GroupDetail` (active 멤버만)
- `PATCH /api/v1/sermon-groups/{id}` (리더·함께 리더) body 부분 `{ name, kind, services, join_approval }` → `GroupDetail`
- `DELETE /api/v1/sermon-groups/{id}` (리더) → 204, 소프트 삭제
- `POST /api/v1/sermon-groups/{id}/invite` (리더·함께 리더) body `{ expires_days: 7|30|null }` → `GroupDetail` (새 코드)
- `DELETE /api/v1/sermon-groups/{id}/invite` (리더·함께 리더) → `GroupDetail` (invite_code=null)

### 초대·참여
- `GET /api/v1/sermon-groups/invite/{code}` **공개** →
  `{ group_id, name, kind, services, leader_name, member_count, join_approval,
     this_week: [{ service_id, date, name, title, refs, recorded_count }],
     my_status: null | "pending" | "active" }` (로그인 상태로 부르면 my_status 채움). 멤버 노트·이름 목록은 절대 넣지 않음
- `POST /api/v1/sermon-groups/invite/{code}/join` body `{ display_name, muted_service_ids }` → `GroupDetail`
  (join_approval 이면 status=pending)

### 멤버
- `PATCH /api/v1/sermon-groups/{id}/members/me` body `{ display_name, muted_service_ids }` → `GroupDetail`
- `DELETE /api/v1/sermon-groups/{id}/members/me` → 204 (나가기. 내 share·reaction 삭제. 리더는 다른 active 멤버가 있으면 SG003 — 먼저 넘기기)
- `POST /api/v1/sermon-groups/{id}/members/{userId}/approve` (리더·함께 리더) → `GroupDetail`
- `DELETE /api/v1/sermon-groups/{id}/members/{userId}` (리더·함께 리더, 리더는 못 내보냄) → 204 (그 사람 share 삭제)
- `PATCH /api/v1/sermon-groups/{id}/members/{userId}` (리더) body `{ role: "co_leader"|"member"|"leader" }` → `GroupDetail`
  (leader 지정 = 넘기기, 나는 co_leader 가 됨)

### 이번 주
- `GET /api/v1/sermon-groups/{id}/week?start=2026-10-25` (start~start+6 일) →
  `{ sessions: SessionSummary[], pokes_for_me: [{ from_name, created_at }] }`
  (그 주에 내게 온 같이 써요. 조회 시 seen 처리)

### 설교 자리
- `PUT /api/v1/sermon-sessions/resolve` body `{ group_id, service_id, date }` → `SessionSummary` (get-or-create, 멱등. 동시 생성 경합은 UNIQUE 로 잡고 재조회)
- `POST /api/v1/sermon-groups/{id}/sessions` body `{ name, date }` → `SessionSummary` (예배표 밖 자리 열기, opened_by=나)
- `PATCH /api/v1/sermon-sessions/{id}` body `{ title, preacher, refs }` (active 멤버, locked 면 리더만) → `SessionSummary`
- `PATCH /api/v1/sermon-sessions/{id}/lock` (리더) body `{ locked }` → `SessionSummary`
- `GET /api/v1/sermon-sessions/{id}` (active 멤버) →
  `{ session: SessionSummary,
     shares: [{ id, user_id, display_name, my_title, heard, part, private, galpi, fields(private 면 null), updated_at,
                reactions: [{ item_key, kind, count, mine }] }] }`

### 공개 사본
- `PUT /api/v1/sermon-sessions/{id}/share` body `{ note_id, my_title, heard, part, private, galpi, fields }` → share (upsert, 내 것). `galpi` 없거나 null = false (PUT 마다 통째로 덮으므로 켜 둔 갈피를 유지하려면 매번 `true` 를 보낸다)
- `DELETE /api/v1/sermon-sessions/{id}/share` → 204 (이 노트는 모임과 상관없어요 / 옮기기)
- `POST /api/v1/sermon-shares/{shareId}/reactions` body `{ item_key, kind }` → `{ item_key, kind, count, mine }` (토글. 내 share 에는 못 누름)

### 같이 써요
- `POST /api/v1/sermon-groups/{id}/pokes` body `{ to_user_id, session_id, week_start }` → 204 (같은 주 같은 상대 1회, 초과 SG009)

## 비고
- 알림(FCM)은 v1 에서 보내지 않는다. 참여 요청은 그룹 상세의 pending 멤버로, 같이 써요는 week 응답의 pokes_for_me 로 화면에서 보여 준다.
- activity_log 는 쓰지 않는다 (CHECK 제약 함정 회피).
- 마이그레이션: `V{YYYYMMDD_HHmmss}__create_sermon_groups.sql` 멱등. local(H2)은 ddl-auto update.
