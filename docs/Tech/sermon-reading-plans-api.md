# 함께 읽는 길 — 통독 API (모임 길 · 나의 길)

기획: https://claude.ai/artifact/MZ4ZgxBb6CDGDdWjC8ZBnS (v2)
JSON 필드는 snake_case, null 필드는 키가 빠진다(Jackson non_null).
장 키 `"b:c"` — 책 번호 `b` 0~65 (창세기=0, 프런트 `BOOKS` 인덱스), 장 `c` 1부터. 예: 마가복음 9장 = `"40:9"`.
`today` — 클라이언트 현지 날짜(yyyy-MM-dd). 서버 UTC 날짜와 ±1일 넘게 다르면 400 `RPL001`.

## 0. 개념

- **길(plan)** 하나 = 날짜가 붙은 날(day)들의 목록. 날마다 읽을 장 1~10개.
- 주인은 둘 중 하나: `group_id`(모임 길) 또는 `owner_user_id`(나의 길). 둘 다 채우거나 둘 다 비우면 안 됨.
- 모임당 진행 중(`active`) 길 1개, 나의 길은 사람당 active 3개.
- 날을 나누는 일은 **프런트가 한다**(장 수·템플릿을 프런트만 안다). 서버는 받은 날 목록을 검증해 저장.
- 도장은 **장 단위**. 그날 장을 모두 찍으면 그날 완료.
- 모임 길은 그 모임 active 멤버만 보고 찍는다. 나의 길은 주인만.

## 1. 길 만들기

### `POST /api/v1/reading-plans`
```json
{
  "group_id": "…",              // 생략 = 나의 길
  "title": "마가복음 16일",
  "template": "mark16",          // mark16 | pp31 | nt90 | bible365 | custom (표시용, 자유 문자열 ≤20)
  "days": [
    { "date": "2026-10-27", "chapters": ["40:1"] },
    { "date": "2026-10-28", "chapters": ["40:2"] }
  ]
}
```
- 검증: title 1~40자, days 1~400개, date 엄격히 오름차순(같은 날 두 번 X), 첫 날 ≥ today-1, chapters 1~10개·중복 없음·0≤b≤65·1≤c≤150, 전체 장 ≤ 1300. 어기면 400 `RPL002`.
- 모임 길: 리더·함께 리더만(403 `SG003`), 이미 active 길이 있으면 409 `RPL003`.
- 나의 길: active 3개면 409 `RPL004`.
- day_no 는 1부터 순서대로 서버가 매긴다. end_date = 마지막 날.
- 응답 201: `PlanDetail` (아래 3절, today 는 서버 UTC 날짜 기준).

## 2. 내 길 모두 + 오늘 읽을 곳

### `GET /api/v1/reading-plans/mine?today=2026-10-26`
나의 길(active) + 내가 active 멤버인 모임의 active 길.
```json
{
  "plans": [
    {
      "id": "…", "title": "마가복음 16일", "template": "mark16",
      "group_id": "…", "group_name": "6팀",            // 나의 길이면 키 없음
      "start_date": "2026-10-18", "end_date": "2026-11-02",
      "total_days": 16,
      "today_day_no": 9,               // 오늘 날짜인 날이 없으면(쉼표·시작 전·끝난 뒤) 키 없음
      "my_done_days": 7,               // 내가 장을 모두 찍은 날 수
      "behind_days": 1,                // date ≤ today 인데 내가 다 못 찍은 날 수 (오늘 포함)
      "due": [                         // date ≤ today 인 날 중 내가 안 찍은 장 (날짜순, 최대 30개)
        { "day_no": 8, "date": "2026-10-25", "chapter": "40:8" },
        { "day_no": 9, "date": "2026-10-26", "chapter": "40:9" }
      ]
    }
  ]
}
```
- plans 정렬: 모임 길 먼저(모임 이름순), 그다음 나의 길(만든 순).

## 3. 길 하나 자세히

### `GET /api/v1/reading-plans/{id}?today=…` → `PlanDetail`
### `GET /api/v1/reading-plans/group/{groupId}?today=…` → `{ "plan": PlanDetail }` (active 길 없으면 `{}`)
```json
{
  "id": "…", "title": "…", "template": "…", "status": "active",
  "group_id": "…", "group_name": "6팀", "owner_user_id": "…",
  "start_date": "…", "end_date": "…", "total_days": 16,
  "today_day_no": 9,
  "can_manage": true,                 // 모임: 리더·함께 리더 / 나의 길: 주인
  "days": [
    {
      "day_no": 1, "date": "2026-10-18", "chapters": ["40:1"],
      "done_count": 6,                // 그날 장을 모두 찍은 사람 수 (나의 길이면 0/1)
      "my_chapters": ["40:1"],        // 내가 찍은 장 (없으면 [])
      "readers": [0, 2],              // 그날 장을 모두 찍은 멤버 번호(members 순서). 없으면 키 생략
      "late": [2]                     // readers 중 마지막 도장이 그날+2일 이후(UTC)인 멤버. 없으면 키 생략
    }
  ],
  "member_count": 6,                  // 모임 active 멤버 수 (나의 길 = 1)
  "team_done": 45,                    // 모든 사람의 (날, 장) 도장 수 합계
  "team_total": 96,                   // member_count × 전체 장 수
  "members": [                        // 사람별 줄 — 모임 active 멤버(가입순), 나의 길은 주인 한 명
    { "user_id": "…", "display_name": "유상건", "profile_image": "…", "done_days": 8, "me": true }  // me 는 본인만
  ],
  "today": {                          // today_day_no 가 있을 때만
    "read": [ { "user_id": "…", "display_name": "김하은", "profile_image": "…" } ],
    "unread": [ { "user_id": "…", "display_name": "최", "profile_image": "…" } ]
  }
}
```
- read/unread 는 모임 active 멤버를 그날 완료 여부로 나눈다(멤버 가입순). 나의 길은 주인 한 명.

## 4. 도장

### `POST /api/v1/reading-plans/checks/chapter`
성경 읽기 장 끝 「다 읽었어요」. 내 모든 active 길에서, date ≤ today 이고 이 장을 안 찍은 **가장 이른 날** 하나씩에 찍는다.
```json
{ "chapter": "40:9", "today": "2026-10-26" }
```
응답 200:
```json
{ "stamped": [ { "plan_id": "…", "title": "마가복음 16일", "group_name": "6팀", "day_no": 9, "day_done": true } ] }
```
- 찍을 곳이 없으면 `stamped: []` (200).
- via = `scroll`.

### `PUT /api/v1/reading-plans/{id}/days/{dayNo}/check`
「따로 읽었어요」(종이 성경 등). 그날 장 전부를 찍거나 지운다.
```json
{ "checked": true, "today": "2026-10-26" }
```
- 그날 date > today 면 400 `RPL005`. via = `manual`. 응답: `PlanDetail`.

## 5. 끝내기

### `DELETE /api/v1/reading-plans/{id}`
status → `ended` (기록은 남는다). 모임 길은 리더·함께 리더, 나의 길은 주인. 응답 204.

## 6. 상태 자동 전환
- 조회 시 end_date < today-1 인 active 길은 `done` 으로 바꾼다 (모임 active 1개 제약에서 빠짐).

## 에러 코드
| 코드 | HTTP | 뜻 |
|---|---|---|
| RPL001 | 400 | today 값이 이상함 |
| RPL002 | 400 | 길 입력값 확인 |
| RPL003 | 409 | 이 모임엔 이미 진행 중인 길이 있음 |
| RPL004 | 409 | 나의 길은 3개까지 |
| RPL005 | 400 | 아직 오지 않은 날 |
| RPL006 | 404 | 길을 찾을 수 없음 (볼 권한 없음 포함) |
