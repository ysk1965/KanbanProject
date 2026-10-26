# 이번 주 말씀 필사 API (챌린지)

시안: https://claude.ai/artifact/VGETvTSKVaHg9Xfy2FhQKv
한 주 정의·달란트 원장은 `sermon-challenge-api.md` §0 을 그대로 쓴다 (주 키 = 월요일 날짜, 일요일 22:00 KST 부터 다음 주).
JSON 필드는 snake_case. 책 번호 `b` 는 0~65 (창세기=0, 프런트 `BOOKS` 인덱스와 같음), 장 `c`·절 `v` 는 1부터.

## 1. 이번 주 일곱 장

일곱 장은 **프런트가 고른다** (노트 본문·성경 절 수를 프런트만 안다). 서버는 그 주에 처음 받은 것을 고정해 둔다.

### `GET /api/v1/challenge/pilsa/week`
```json
{
  "week": "2026-10-26",
  "ends_at": "2026-11-01T13:00:00Z",
  "chapters": [
    { "b": 44, "c": 5, "reason": "main", "verses": 21, "done": [1, 2, 3] }
  ],
  "completed_chapters": 0,
  "week_done": false
}
```
- 아직 정하지 않은 주면 `chapters: []`.
- `reason`: `main`(설교 본문) · `cited`(설교에 나온 장) · `near`(앞뒤 장) · `next`(다음 주 본문) · `common`(설교가 없는 주의 공통 일곱 장).
- `done`: 쓴 절 번호(오름차순).

### `PUT /api/v1/challenge/pilsa/week`
```json
{ "week": "2026-10-26", "chapters": [ { "b": 44, "c": 5, "reason": "main", "verses": 21 } ] }
```
- 정확히 7개, (b,c) 중복 없음, 0 ≤ b ≤ 65, 1 ≤ c ≤ 150, 1 ≤ verses ≤ 176.
- `week` 가 서버의 이번 주가 아니면 400 `PIL001`.
- 그 주에 이미 정해져 있으면 **바꾸지 않고** 저장된 것을 그대로 돌려준다 (먼저 온 것이 이김, 200). 응답은 GET 과 같다.

## 2. 한 절 쓰기

### `POST /api/v1/challenge/pilsa/verses`
```json
{ "week": "2026-10-26", "b": 44, "c": 5, "v": 3, "chars": 31, "ms": 14200 }
```
- `chars`: 그 절에서 비교한 글자 수(공백·문장 부호 제외), `ms`: 첫 입력부터 끝까지 걸린 시간.
- 정확도(90%)는 프런트가 판단한다. 서버는 본문을 모른다.
- 검증
  - 이번 주가 아니면 400 `PIL001`
  - 그 주 계획에 없는 장이면 400 `PIL002` (계획이 없어도 PIL002)
  - `v` 가 1..verses 밖이면 400 `PIL003`
  - 사람 손으로 불가능한 속도면 422 `PIL004`: `chars` 가 0 이하거나, `ms` < 600, 또는 `chars * 1000 / ms > 15` (1초에 15자 초과)
- 같은 절을 다시 보내면 아무것도 바꾸지 않고 200 (멱등).
```json
{ "b": 44, "c": 5, "done": [1, 2, 3], "chapter_done": false, "week_done": false, "awarded": 0 }
```
- `awarded`: 이 요청으로 새로 적립된 달란트 합.

## 3. 달란트

| 사유(reason) | 금액 | award_key | 조건 |
|---|---|---|---|
| `pilsa` | +5 | `pilsa:{week}:{b}:{c}` | 그 장의 1..verses 절을 모두 씀 |
| `pilsa_week` | +20 | `pilsa_week:{week}` | 일곱 장을 모두 씀 |

- 게임 하루 상한(30)과 무관 (`GAME_REASONS` 아님). 주간 랭킹 달란트에 들어간다.
- 원장 `week` 는 계획의 week. 상쇄는 없다(필사는 지울 수 없다).
- 지갑 응답(`/challenge/wallet`) 형식은 바뀌지 않는다.

## 4. 오류 코드
| 코드 | HTTP | 뜻 |
|---|---|---|
| PIL001 | 400 | 이번 주가 아님 |
| PIL002 | 400 | 이번 주 일곱 장에 없는 장 (또는 계획 없음) |
| PIL003 | 400 | 계획이 잘못됨(7개 아님·중복·범위 밖) 또는 절 번호가 범위 밖 |
| PIL004 | 422 | 너무 빠름 |

## 5. 테이블 (마이그레이션 하나, 멱등)
- `pilsa_plans(id varchar(36) pk, user_id varchar(36) not null, week date not null, chapters text not null /* JSON 배열 */, created_at timestamp not null)` — UNIQUE(user_id, week)
- `pilsa_verses(id varchar(36) pk, user_id varchar(36) not null, week date not null, book int not null, chapter int not null, verse int not null, chars int not null, ms int not null, created_at timestamp not null)` — UNIQUE(user_id, week, book, chapter, verse), INDEX(user_id, week)

## 6. 프런트 (기기 우선)
- 일곱 장 고르기: 최근 7일 안 가장 최근 노트(구절 있는 것)의 첫 구절 장 = main → 본문 인용 구절 블록의 다른 장 = cited → main 의 앞뒤 장(±1, ±2…) = near 로 7개 채움. 노트가 없으면 요한복음 1–7 / 8–14 / 15–21 을 주 번호로 돌려 common.
- 저장: `sermon-pilsa-v1:<userId>` (익명 `anon` 은 서버 호출 없음, 달란트 없음). 절은 기기에 먼저 쓰고, 서버 전송 실패분은 큐에 남겨 다시 보낸다. PIL004 는 버린다.
