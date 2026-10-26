# 설교 노트 홈 「한 주 동안」 할 일 — 저장 계약

설교 노트 홈 오른쪽 「한 주 동안」 판에 **직접 적은 할 일**(설교 노트의 「적용」 태그와 별개)을 저장한다.
설교 노트에서 온 적용은 여기 담지 않는다 — 노트 `thoughts[].done / done_at` 이 그대로 맡는다.

## 저장 위치

기존 「기능」 문서 API를 그대로 쓴다 (새 테이블·마이그레이션 없음).

- `feature_key`: `sermon_plan` (`PersonalFeatureTermService.FEATURE_SERMON_PLAN`)
- 한 주(일~토) = 문서 하나, `title` = 그 주 일요일 `yyyy-MM-dd` (기기 로컬 날짜)
- 사용자당 문서 상한 1100 (`PersonalFeatureDocService.DOC_LIMITS`)
- 탈퇴 시 `SermonAccountCleaner` 가 `personal_feature_docs` 를 사용자 단위로 지우므로 따로 할 일 없음

| 동작 | 호출 |
|------|------|
| 이번 주 문서 찾기 | `GET /api/v1/personal/features/sermon_plan/docs` → `title` 로 찾음 |
| 읽기 | `GET /api/v1/personal/features/sermon_plan/docs/{id}` |
| 처음 저장 | `POST /api/v1/personal/features/sermon_plan/docs` `{ title, content, schema_ver: 1 }` |
| 고치기 | `PATCH /api/v1/personal/features/sermon_plan/docs/{id}` `{ content }` (통째 교체) |

## content (schema_ver 1)

```json
{
  "week": "2026-10-25",
  "updated_at": 1793023835000,
  "items": [
    { "id": "p…", "text": "교회 화단 물 주기", "rep": "once", "day": null, "done_on": null, "created_at": 0 },
    { "id": "p…", "text": "친구에게 설교 나누기", "rep": "once", "day": "2026-10-30", "done_on": "2026-10-29", "created_at": 0 },
    { "id": "p…", "text": "자기 전 감사 기도", "rep": "daily", "short": "감사기도", "log": ["2026-10-26", "2026-10-27"], "created_at": 0 }
  ]
}
```

- `rep: once` — 이번 주 안에 한 번. `day` 를 정하면 그날 줄에 점선으로 놓이고, 하면 `done_on` 날짜 줄에 ♥ 스티커
- `rep: daily` — 이번 주 매일. `log` = 한 날짜들(오늘 이후는 못 체크), `short` = 날짜 옆 기둥 머리 이름(5자, 비우면 앞 4자). 한 주에 3개까지
- 날짜는 모두 기기 로컬 `yyyy-MM-dd` (설교 노트 `date` 와 같은 규칙)

## 프런트 동기화 (`frontend/src/app/components/personal/sermon/weekPlan.ts`)

- 기기 캐시 `sn-plan:{userId}` (최근 8주 + 안 올린 주) 가 먼저 그린다
- 로그인했으면 고친 주를 800ms 뒤 올린다. 실패하면 15초 뒤 다시. 받은 값보다 안 올린 기기 값이 이긴다
- 로그인 전(`anon`)은 기기에만. 로그인하면 내 계정에 비어 있는 주만 가져온다

## 아직 안 정한 것

- 지난주에 못 한 할 일 넘기기 (다음 주 첫날 「지난주에서 가져오기」 제안 예정)
- 설교에서 온 적용을 「매일」로 바꾸기
