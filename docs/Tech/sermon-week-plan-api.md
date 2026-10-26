# 설교 노트 홈 「한 주 동안」 — 저장 계약

홈 오른쪽 「한 주 동안」은 이번 주(일~토)를 **날짜 단위**로 보여 준다. 위쪽 날짜 띠에서 하루를 고르면 그날 할 일이 **카테고리별**로 나온다.

- 첫 카테고리 **예배 갈피**는 고정이다(저장하지 않음, id `galpi`). 이번 주 설교 노트에서 「적용」 태그로 적은 생각이 그 설교 날짜에 들어온다. 설교 적용의 체크는 지금처럼 노트 `thoughts[].done / done_at`이 맡는다. 예배 갈피 칸에서 바로 적은 할 일은 `cat: "galpi"`인 직접 할 일로 저장하고, 그 주 갈피 노트 id를 `note_id`에 둔다.
- **내 카테고리**는 최대 5개다. 이름(12자), 색, 아이콘, 순서를 가진다. 한 번도 고치지 않았으면 기본 「할 일」(id `todo`) 하나가 있다.

## 저장 위치

기존 「기능」 문서 API를 그대로 쓴다. 새 테이블이나 마이그레이션은 없다.

- `feature_key`: `sermon_plan` (`PersonalFeatureTermService.FEATURE_SERMON_PLAN`)
- 한 주(일~토) = 문서 하나, `title` = 그 주 일요일 `yyyy-MM-dd` (기기 로컬 날짜)
- 카테고리 = 계정에 문서 하나, `title` = `categories`
- 사용자당 문서 상한 1100 (`PersonalFeatureDocService.DOC_LIMITS`)
- 탈퇴 시 `SermonAccountCleaner`가 `personal_feature_docs`를 사용자 단위로 지우므로 따로 할 일 없음

| 동작 | 호출 |
|------|------|
| 이번 주·카테고리 문서 찾기 | `GET /api/v1/personal/features/sermon_plan/docs` → `title`로 찾음 |
| 읽기 | `GET /api/v1/personal/features/sermon_plan/docs/{id}` |
| 처음 저장 | `POST /api/v1/personal/features/sermon_plan/docs` `{ title, content, schema_ver: 1 }` |
| 고치기 | `PATCH /api/v1/personal/features/sermon_plan/docs/{id}` `{ content }` (통째 교체) |

## content — 주 문서

```json
{
  "week": "2026-10-25",
  "updated_at": 1793023835000,
  "items": [
    { "id": "p…", "text": "어머니께 안부 전화", "cat": "c…", "rep": "once", "day": "2026-10-27", "done_on": null, "created_at": 0 },
    { "id": "p…", "text": "모임 기도제목 나누기", "cat": "galpi", "rep": "once", "day": "2026-10-25", "done_on": "2026-10-26", "note_id": "…", "created_at": 0 },
    { "id": "p…", "text": "아이와 저녁 기도", "cat": "c…", "rep": "daily", "from": "2026-10-26", "log": ["2026-10-26", "2026-10-27"], "created_at": 0 }
  ]
}
```

- `rep: once`: `day` 하루의 할 일이다. 한 날이 `done_on`이다. 못 한 채 그날이 지나면 이번 주 안에서는 오늘 목록으로 넘어와 「M.D부터」가 붙고, 원래 날을 보면 흐린 「오늘로 넘김」으로 남는다. 앞으로 올 날에는 적을 수 있지만 체크는 그날부터 된다.
- `rep: daily`: `from` 날부터 이번 주 남은 날마다 나온다. 한 날들은 `log`다. 오늘 이후는 체크할 수 없다.
- 날짜는 모두 기기 로컬 `yyyy-MM-dd`이고, 설교 노트 `date`와 같은 규칙이다.
- 예전 형식(카테고리 이전)은 읽을 때 이렇게 바꾼다.
  - `cat`이 없으면 `todo`로 넣는다.
  - `once`인데 `day`가 null이면(예전 「이번 주 안에」) 오늘 할 일로 본다.
  - `daily`인데 `from`이 없으면 그 주 일요일부터로 본다.
  - `short`는 읽기만 한다.

## content — 카테고리 문서

```json
{ "updated_at": 1793023835000, "cats": [ { "id": "c…", "name": "가정", "color": "g1", "icon": "home" } ] }
```

- `color`: `g1 | g3 | purple | orange | green | red` (`g2` 분홍은 예배 갈피 전용)
- `icon`: `tag | home | users | book | briefcase | heart`
- 카테고리를 지우면 **이번 주**의 그 카테고리 할 일도 지운다. 다른 주에 남은 할 일은 첫 내 카테고리 아래에 보인다.

## 프런트 동기화 (`frontend/src/app/components/personal/sermon/weekPlan.ts`)

- 기기 캐시 `sn-plan:{userId}`(최근 8주 + 안 올린 주 + 카테고리)가 먼저 그린다.
- 로그인했으면 고친 문서를 800ms 뒤에 올린다. 실패하면 15초 뒤에 다시 올린다. 받은 값보다 안 올린 기기 값이 이긴다.
- 로그인 전(`anon`)에는 기기에만 저장한다. 로그인하면 내 계정에 비어 있는 주와 카테고리만 가져온다.

## 아직 안 정한 것

- 주가 바뀔 때 지난주에 못 한 할 일 가져오기 (다음 주 첫날 「지난주에서 가져오기」 제안 예정)
- 설교에서 온 적용을 「매일」로 바꾸기
