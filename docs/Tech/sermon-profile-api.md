# 설교 노트 「나의 갈피」 이름표 API 계약 (v1)

마이페이지 「나의 갈피」의 이름표(캐릭터·잉크·대표 말씀)와 고정한 노트(폴라로이드 3장).
소속 교회는 이 테이블에 두지 않는다 — 챌린지 `user_churches`(docs/Tech/sermon-challenge-api.md §3)가 원본이고, 이름표 응답에 읽기 전용 `church` 로 붙인다.
기획: https://claude.ai/artifact/1pTWvwGGDy2aA1hYx6xnNA (1단계)

- Base: `/api/v1/sermon-profile` · 로그인 필요 · JSON snake_case · null 필드는 키가 빠짐(non_null)
- 에러: SPF001 입력 검증(400), SPF002 볼 수 없는 이름표(404 — 있는지도 숨김)

## 데이터

### sermon_profiles (user_id PK)
| 필드 | 값 |
|---|---|
| mascot | `galpi` `dong` `bang` `banjjak` (기본 galpi) |
| mascot_state | `idle` `listen` `done` `think` `sleep` (기본 idle) |
| ink | sermonLook INKS id 9종 (기본 cotton) |
| verse_ref | encRef `"44:5:3-4"` — 1~3절, 장 전체(`w`) 불가. 비우면 대표 말씀 없음 |
| verse_style | `serif` `hand` |
| visibility | `private` 나만 · `groups` 같은 모임 사람(기본) · `link` 로그인한 누구나 |
| pins | `[{note_id, ink?, pattern, sticker, line?}]` 최대 3, 배열 순서 = 카드 순서. pattern `dots` `lines` `stars` `plain`, sticker `mascot` `none`, line 40자 |
| galpi_auto | boolean, nullable — 자동 갈피(예배 시간에 노트를 열면 그 예배로 갈피). DB null = 정한 적 없음 → 응답 `true` |
| galpi_service | varchar(60), nullable — 자동 갈피가 고르는 예배. 앞뒤 공백 제거, 빈 값 → null, 60자 초과 → SPF001 |

### sermon_profile_verses — 대표 말씀 연대기
대표 말씀이 바뀌면 지금 행의 `to_at` 을 닫고 새 행을 넣는다. 지운 말씀도 기록은 남는다.

## 엔드포인트

### GET /me
저장한 적 없으면 `saved: false` + 기본값. `church: {id, name, region, dept}` 는 챌린지 소속 교회(없으면 키 없음). 본인에게만 `pins`, `verse_history`(최근 12, 최신 순), `verse_count`(지금 말씀이 몇 번째), `galpi_auto`(항상 키 있음, 기본 true), `galpi_service`(없으면 키 없음).

### PUT /me
본문 = 위 필드 전체(통째로 교체, 빠진 필드는 기본값/비움). 응답은 GET /me 와 같은 모양.
**예외 — 자동 갈피 두 필드**: `galpi_auto` 가 없거나 null 이면 두 필드 모두 바꾸지 않는다(이 필드를 모르는 옛 클라이언트가 지우지 않게).
`galpi_service` 는 `galpi_auto` 가 함께 올 때만 반영된다(그때 null/빈 값이면 지움).
```json
{ "mascot": "galpi", "mascot_state": "idle", "ink": "cotton",
  "verse_ref": "44:5:3-4", "verse_style": "hand", "visibility": "groups",
  "pins": [{ "note_id": "…", "ink": "mint", "pattern": "dots", "sticker": "mascot", "line": "버티는 게 아니라" }],
  "galpi_auto": true, "galpi_service": "주일 2부" }
```

### GET /{user_id}
visibility 규칙에 맞으면 이름표 + church 만(pins·연대기·galpi_auto·galpi_service 없음). 아니면 SPF002.

### 소속 교회 고르기·바꾸기
이 API 에는 없다 → `PUT/DELETE /api/v1/challenge/church` (30일에 한 번, CH005). 화면은 challenge/ChurchPicker 를 그대로 쓴다.

## 클라이언트 메모
- 로그인 전(`/sermonnote` 익명)은 기기에만 저장(`sermon-profile-v1:anon`), 로그인하면 서버가 비어 있을 때 올린다.
- 잉크·캐릭터는 기존 꾸미기(`sermon-look-v1`)와 같은 값 — 프로필을 받아오면 꾸미기에도 반영.
- 고정 노트의 `note_id` 가 `local-` 이면 서버 id 로 바뀔 때(SermonStore.onRemap) 같이 바꿔 다시 PUT.
