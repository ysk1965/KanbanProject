# 워크로드 뷰 드래그 스크롤 개선 계획

## 문제
- 현재: 12주 고정 범위 + 네비게이션 버튼(◀ 오늘 ▶)으로 4주씩 점프 → 매번 API 재호출 + 로딩
- 사용자 의도: **헤더 영역을 드래그해서 좌우로 스크롤**하면 다른 날짜를 볼 수 있으면 됨

## 해결 방향
1. **범위를 크게 확장** (12주 → 52주: 앞 12주 + 뒤 40주) — 한 번 fetch로 충분
2. **네비게이션 바 제거** — 불필요한 버튼/상태 삭제 (weekOffset, handlers, rangeLabel, i18n 키)
3. **헤더 드래그 스크롤 추가** — 날짜 헤더 영역을 마우스로 잡고 좌우 드래그하면 전체 타임라인 스크롤
4. 스크롤바는 기존 `overflow-auto`로 이미 있으므로, 드래그는 **추가적인 편의 기능**

## 수정 사항

### 1단계: 이전 네비게이션 코드 제거
- `weekOffset` state 삭제
- `handleNavigatePrev`, `handleNavigateNext`, `handleNavigateToday` 삭제
- `rangeLabel` useMemo 삭제
- import에서 `ChevronLeft`, `ChevronRight`, `CalendarDays` 제거
- JSX에서 네비게이션 바 div 전체 삭제

### 2단계: 타임라인 범위 확장
- `useMemo` 의존성에서 `weekOffset` 제거 (다시 `[]`로)
- 범위: 앞 12주(-84일) + 뒤 40주(+280일) = 약 52주
- API fetch도 동일 범위 사용

### 3단계: 헤더 드래그 스크롤 구현
- 날짜 헤더 row에 `onMouseDown` → `document.onMouseMove` → `document.onMouseUp` 리스너
- `mousemove`에서 `scrollContainerRef.current.scrollLeft -= deltaX` 적용
- 커서: 드래그 시 `cursor: grabbing`, 기본 `cursor: grab`
- 기존 바 드래그/리사이즈와 충돌 없음 (헤더는 바가 없는 영역)

### 4단계: i18n 정리
- 10개 언어 파일에서 `prevWeeks`, `nextWeeks` 키 제거 (방금 추가한 것)

## 수정 파일
- `frontend/src/app/components/schedule/ScheduleResourceView.tsx`
- `frontend/src/app/i18n/locales/{ko,en,ja,zh,zh-TW,vi,th,es,pt-BR,hi}.json`
