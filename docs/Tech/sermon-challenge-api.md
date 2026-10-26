# 설교 노트 「챌린지」 1단계 — 달란트 · 게임 · 랭킹 · 리그 · 소속 교회 API

기획: https://claude.ai/artifact/FDwYoYSrdaGhiMTKZVzPXx (v2) · 경제 근거 https://claude.ai/artifact/GFHGwwAK9i2uHkLVAWo8it

모든 JSON 필드는 snake_case. 모든 경로는 로그인 필요(공개 경로 없음). 시각은 UTC ISO 로 주고받는다.

## 0. 공통 규칙

### 한 주 (KST 고정 — 제품 규칙)
- 랭킹·리그·주간 상한의 "한 주"는 **한국 시간 월요일 00:00 ~ 일요일 22:00**.
- 일요일 22:00 ~ 24:00(KST)에 생긴 달란트는 **다음 주**로 센다.
- `week` 키 = 그 주 월요일 날짜 `yyyy-MM-dd`(KST).
- 백엔드는 `ChallengeClock`(Zone `Asia/Seoul` 상수 하나)에서만 이 계산을 한다. 저장 시각은 UTC.
- "하루"(게임 달란트 하루 상한)도 KST 자정 기준.

### 달란트 원장
- 모든 증감은 `talent_ledger` 한 줄. 같은 근거(award key)로 두 번 적립되지 않고, 조건이 사라지면 상쇄 행(음수)으로 되돌린 뒤 다시 조건이 맞으면 재적립할 수 있어야 한다.
- `counts_for_rank` 가 true 인 행만 주간 랭킹 점수(`weekly_scores.talents`)에 더한다. (연속 기록 보너스·교환 차감은 false)
- 잔액 = 원장 합계(지갑 테이블에 캐시).

### 적립 규칙 (설교 노트 = personal_feature_docs, feature_key='sermon')
문서 create / patch / delete 때 서버가 content 를 읽어 계산한다. 노트 `date` 가 오늘(KST)보다 14일 넘게 지난 노트는 새로 적립하지 않는다.

| reason | 달란트 | 조건 | 상한 | award key |
|---|---|---|---|---|
| `note` | +20 | 본문 텍스트(HTML 태그 제거) 100자 이상 **또는** 생각 2개 이상 **또는** 녹음 10분 이상 | 주 3편 | `note:{docId}` |
| `note_audio` | +5 | 녹음 토막 합계 600초 이상 + 업로드된 토막 존재 | 노트당 1 | `audio:{docId}` |
| `apply` | +3 | 생각 tag `적용`, text 10자 이상 | 노트당 2개 | `apply:{docId}:{thoughtId}` |
| `apply_done` | +10 | 적용 생각 `done=true` 이고 `done_at - at ≥ 12시간` | 주 5개 | `done:{docId}:{thoughtId}` |
| `galpi` | +5 | `bookmarked_at` 있음 | 주 1 (노트 date 의 주) | `galpi:{noteWeek}` |
| `week_complete` | +20 | 그 주에 `note` 1 + `apply_done` 1 이상 | 주 1 | `complete:{week}` |
| `streak` | +50/+150/+500 | `note` 가 있는 주가 4·12·52주 연속 | 각 1번 | `streak:{n}:{week}` (counts_for_rank=false) |
| `game` | 점수/100 | 게임 판 완료 | **하루 30 (모든 게임 합산)** | `game:{runId}` |
| `game_first` | +5 | 그날 첫 완료 판 | 하루 1 (위 30 안에 포함) | `game_first:{day}` |
| `exchange` | −50×n | 리워드 크레딧 교환 | 한 달 20크레딧 | `exchange:{id}` (counts_for_rank=false) |

문서 삭제 → 그 문서에서 나온 적립을 모두 상쇄. 적용 체크 해제·적용 삭제 → 해당 행 상쇄.
모임 함께 완주(+30)는 2단계.

## 1. 지갑

### `GET /api/v1/challenge/wallet`
```json
{
  "balance": 1240,
  "week": "2026-10-26",
  "week_ends_at": "2026-11-01T13:00:00Z",
  "week_talents": 186,
  "today_game_talents": 12,
  "game_daily_cap": 30,
  "streak_weeks": 9,
  "best_streak": 9,
  "week_complete": { "note": true, "apply_done": false, "done": false },
  "reward_credits": 4,
  "reward_expires_at": "2026-11-30T14:59:59Z",
  "exchanged_this_month": 4,
  "exchange_monthly_cap": 20,
  "exchange_rate": 50,
  "personal_credits_available": 33
}
```

### `GET /api/v1/challenge/ledger?before={iso}&limit=30`
`{ "items": [{ "id", "amount", "reason", "label", "created_at" }], "next_before": "iso|null" }`
`label` 은 사람이 읽는 한 줄(예: "설교 기록 · 한 사람으로 인해…", "말씀 산성비 1,240점").

### `POST /api/v1/challenge/exchange` `{ "credits": 2 }`
50×credits 달란트 차감 → `users.personal_reward_credits += credits`, 만료 = 다음 달 말(KST 기준 말일 23:59:59 → UTC 저장). 잔액 부족 CH003, 월 상한 CH004. 응답은 wallet 과 같은 모양.

리워드 크레딧 소비 순서: 월 무료 → 리워드(만료 전) → 구매. `personal_credits_available` 및 기존 개인 크레딧 응답에 리워드 포함.

## 2. 프로필 (랭킹 이름)

### `GET /api/v1/challenge/profile`
`{ "nickname": "새벽별" | null, "tag": "0312" | null, "anonymous": false, "anon_name": "익명의 양 #312", "league_tier": 1, "church": { "id","name","region","dept","changed_at","can_change_at" } | null }`

### `PUT /api/v1/challenge/profile` `{ "nickname": "새벽별", "anonymous": false }`
- 닉네임 2~12자(한글·영문·숫자·공백·_), 앞뒤 공백 제거, 금칙어 간단 목록. 실패 CH001.
- 같은 닉네임 허용, `tag` 는 처음 정할 때 4자리 랜덤(같은 nickname 안에서 겹치지 않게).

## 3. 소속 교회 (카카오 장소 검색은 2단계 — 지금은 직접 등록)

### `GET /api/v1/churches?q=사랑&limit=20`
이름 부분 일치(공백 무시). `{ "items": [{ "id","name","region","address","member_count" }] }`

### `POST /api/v1/churches` `{ "name": "사랑의교회", "region": "서울 서초구", "address": null }`
이름(공백 제거·소문자) + region 이 같은 교회가 있으면 그 교회를 200 으로 돌려준다(새로 만들지 않음). 이름 2~40자, region 2~40자.

### `PUT /api/v1/challenge/church` `{ "church_id": "...", "dept": "청년부" }`
### `DELETE /api/v1/challenge/church`
바꾸기·빼기는 30일에 한 번(첫 설정은 제한 없음). 위반 CH005(`can_change_at` 를 메시지에). 응답은 profile.

## 4. 게임

게임 키: `rain`(말씀 산성비), `books`(66권 줄 세우기).

### `POST /api/v1/challenge/games/rain/runs`
요청: `{ "set": "sermon" | "john15" | "ps23" | "books" | ..., "label": "로마서 5:12–21", "pool": ["이러므로", ...] }`
- `pool` 은 클라이언트가 성경 본문에서 뽑은 단어(2~7자, 20~400개). 서버는 검증 후 시드로 섞어 순서와 종류를 정한다.

응답:
```json
{ "run_id": "...", "seed": 12345, "words": [{ "i": 0, "text": "사망이", "kind": "" }, { "i": 1, "text": "은혜", "kind": "gold" }, { "i": 2, "text": "갈피", "kind": "galpi" }], "rules": { "lives": 6, "level_every": 10, "min_gap_ms": 150, "max_duration_ms": 900000 } }
```
- words 는 판에 충분한 길이(최대 600)로. kind: 약 6% `gold`, 5% `galpi`(text 는 "갈피").
- 클라이언트는 words 순서대로 떨어뜨린다.

### `POST /api/v1/challenge/games/rain/runs/{runId}/finish`
```json
{ "duration_ms": 183000, "events": [{ "type": "hit", "i": 0, "t": 2400 }, { "type": "miss", "t": 3100 }, { "type": "drop", "i": 1, "t": 9000 }] }
```
서버 재계산(이 식이 기준 — 프론트도 같은 식으로 화면 점수를 그린다):
- `level = 1 + floor(hits_so_far / 10)` (10번째 맞힌 뒤부터 다음 단계)
- hit 점수 = `len(text) × 10 × level × (gold ? 3 : 1) + min(combo, 10) × 5` (combo 는 이 hit 포함 연속 수)
- miss · (galpi 가 아닌) drop → combo 0. galpi 아닌 drop 6번이면 끝(그 뒤 이벤트 무시).
- 검증: 같은 i 두 번 hit 금지, t 증가, t ≤ duration ≤ max_duration, 판은 1시간 안에 finish. 연속 hit 간격이 min_gap_ms 미만인 비율이 30% 넘으면 `valid=false`(점수는 기록하되 랭킹·달란트 제외).

응답:
```json
{ "score": 1240, "valid": true, "talents": 12, "talents_capped": false, "best": 1890, "is_best": false,
  "ranks": { "global": 1204, "church": 12, "league": 5 } }
```

### `POST /api/v1/challenge/games/books/runs` `{ "stage": "pentateuch" | "ot" | "nt" | "all" }`
응답: `{ "run_id", "stage", "cards": [bookIndex...] }` (섞인 순서, bookIndex 는 0=창세기 … 65=요한계시록)

### `POST /api/v1/challenge/games/books/runs/{runId}/finish` `{ "order": [bookIndex...], "duration_ms": 48200, "moves": 70 }`
- order 가 정답(오름차순 연속)이어야 valid. duration_ms ≥ 카드 수 × 250ms.
- 점수(랭킹용) = duration_ms (작을수록 좋음). 달란트: pentateuch 3, nt 8, ot 10, all 15 (하루 30 안에서).
- 응답: `{ "time_ms", "valid", "talents", "talents_capped", "best_ms", "is_best", "ranks": {...} }`

### `GET /api/v1/challenge/games/{game}/best?stage=all` → `{ "best": 1890 | null, "week_best": ... }` (books 는 ms)

## 5. 랭킹

### `GET /api/v1/challenge/rankings?scope=global|church|group&group_id=&board=talent|rain|books&week=`
- board `talent` = 이번 주 랭킹 달란트, `rain` = 이번 주 최고 점수, `books` = 이번 주 `all` 단계 최단 시간.
- global: 상위 100 + me. church: 내 교회 기준, 소속 교회가 없으면 `{ "locked": "no_church" }`, 교회 등록자 5명 미만이면 `{ "locked": "too_few", "members": 3 }`. group: 모임 active 멤버만(아니면 SG002), 멤버 전원.
```json
{ "week": "2026-10-26", "ends_at": "...", "board": "talent", "scope": "church",
  "entries": [{ "rank": 1, "name": "새벽별#0312", "anonymous": false, "dept": "청년부", "value": 260, "me": false }],
  "me": { "rank": 6, "value": 186 }, "gap_to_next": 15, "locked": null }
```
이름 표시: anonymous 면 `anon_name`, 닉네임 없으면 "이름 없는 양 #{tag 또는 id 앞 4자리}".

## 6. 주간 리그

티어: 0 겨자씨 · 1 새싹 · 2 가지 · 3 열매 · 4 포도나무.

### `GET /api/v1/challenge/league`
그 주 첫 적립(또는 이 호출) 때 리그 반에 들어간다(같은 티어 반을 30명까지 채우고 넘치면 새 반).
```json
{ "week": "...", "ends_at": "...", "tier": 1, "tier_name": "새싹", "promote": 7, "demote": 5,
  "entries": [{ "rank": 1, "name": "...", "value": 260, "me": false, "zone": "up|stay|down" }],
  "last_result": { "week": "2026-10-19", "rank": 3, "tier_from": 0, "tier_to": 1, "moved": "up" } | null }
```
- 마감 스케줄러(`ChallengeWeekScheduler`, 월 00:05 KST): 지난주 반마다 순위 → 위 7명(달란트>0) 한 단계 위, 아래 5명 한 단계 아래(겨자씨는 그대로, 포도나무는 위로 못 감), 0달란트는 내려감 대상. 결과를 `league_results` 에 남기고 `ranking_profile.league_tier` 갱신.
- 반 인원이 12명 미만이면 promote/demote 를 비례로 줄인다(최소 1·0).

## 7. 오류 코드
| code | HTTP | 뜻 |
|---|---|---|
| CH001 | 400 | 닉네임 형식 |
| CH002 | 400 | 입력값(게임 pool·이벤트·교회 이름 등) |
| CH003 | 409 | 달란트 부족 |
| CH004 | 409 | 이번 달 교환 상한 |
| CH005 | 409 | 교회는 30일에 한 번 바꿀 수 있음 |
| CH006 | 404 | 게임 판 없음/이미 끝남/만료 |
| CH007 | 404 | 교회 없음 |

## 8. 테이블 (마이그레이션 하나, 멱등)
- `talent_ledger`, `talent_wallets`, `weekly_scores`(week, user_id, talents, rain_best, books_best_ms), `game_runs`, `churches`(kakao_place_id nullable unique), `user_churches`, `ranking_profiles`, `league_members`(week, user_id, tier, cohort), `league_results`
- `users` + `personal_reward_credits`, `personal_reward_expires_at`
- `sermon_groups` + `church_id`(nullable, 2단계에서 사용)
