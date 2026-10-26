# 설교 노트 성경 읽기 「형광펜」 API 계약 (v1)

성경 읽기에서 내가 직접 칠한 구절(색·밑줄·한 줄 메모). 설교 노트에서 자동으로 생기는 물결 밑줄(bibleMarks)과는 별개다.
기획: https://claude.ai/artifact/NaSdGHKqSDbiPDxybnUmH7 (1단계)

- Base: `/api/v1/sermon-highlights` · 로그인 필요 · JSON snake_case · null 필드는 키가 빠짐(non_null)
- 나만 보는 데이터. 다른 사람의 id 는 없는 것처럼 404.
- 에러: SHL001 입력 검증(400), SHL002 없음/남의 것(404), SHL003 사용자당 5,000개 상한(409)

## 데이터 — sermon_highlights

| 필드 | 값 |
|---|---|
| id | 기기에서 만든 id (`[A-Za-z0-9_-]{8,36}`, 보통 UUID). 오프라인에서 먼저 칠하고 나중에 올린다 |
| book | 0 = 창세기 … 65 = 요한계시록 |
| chapter | 1~150 |
| verse_from · verse_to | 1~176, `verse_to >= verse_from`, 최대 30절 |
| char_start | verse_from 안의 시작 글자 (없음/0 = 절 처음부터) |
| char_end | verse_to 안의 끝 글자, 끝은 포함하지 않음 (없음 = 절 끝까지). 같은 절이면 `char_end > char_start` |
| color | `yellow` `green` `blue` `pink` 또는 없음 |
| underline | 밑줄 |
| memo | 200자 |
| deleted | 응답 전용. true = 이미 지운 형광펜 |

색·밑줄·메모 중 하나는 있어야 한다 (모두 비면 400 — 클라이언트는 DELETE 로 보낸다).
글자 위치는 앱에 들어 있는 개역한글 본문(`public/bible/krv.json`) 문자열 기준이다.

## 엔드포인트

### GET /
지우지 않은 내 형광펜 전체 (권·장·절 순). 클라이언트는 이 목록에 없는데 예전에 올라갔던 것을 다른 기기에서 지운 것으로 본다.

### PUT /{id}
있으면 고치고 없으면 만든다 (통째로 교체). 응답은 항목 하나.
지운 id 에 PUT 하면 되살리지 않고 `deleted: true` 로 돌려준다 — 다른 기기의 늦은 수정이 지운 것을 되살리지 않게.
```json
{ "book": 18, "chapter": 51, "verse_from": 10, "verse_to": 10,
  "char_start": null, "char_end": 12, "color": "pink", "underline": false, "memo": "정한 마음" }
```

### DELETE /{id}
소프트 삭제(deleted_at). 멱등 — 없는 id 도 204.
