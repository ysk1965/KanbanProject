# 워크로드 뷰: 오늘 날짜 왼쪽 정렬 (초기 스크롤)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 일정-워크로드(Resource) 뷰에서 초기 로드 시 오늘 날짜가 뷰포트 중앙이 아닌 왼쪽에 위치하도록 변경

**Architecture:** `ScheduleResourceView.tsx`의 mount scroll useEffect에서 스크롤 공식만 변경. 타임라인 range(84일 전 ~ 280일 후)는 그대로 유지하여 과거 데이터 좌측 스크롤은 여전히 가능. 약간의 좌측 여백(1일분)을 두어 오늘 날짜 컬럼이 왼쪽 멤버 패널 바로 옆에 위치하도록 함.

**Tech Stack:** React, TypeScript

---

## 현재 코드 분석

### `ScheduleResourceView.tsx` (line 302-311)

```typescript
// 현재: 오늘을 뷰포트 중앙에 배치
useEffect(() => {
  if (!loading && scrollContainerRef.current && todayIndex >= 0) {
    const scrollTo =
      todayIndex * DAY_WIDTH -
      scrollContainerRef.current.clientWidth / 2 +
      DAY_WIDTH / 2;
    scrollContainerRef.current.scrollLeft = Math.max(0, scrollTo);
  }
}, [loading, todayIndex]);
```

- `DAY_WIDTH = 60` (각 날짜 컬럼 폭)
- `todayIndex ≈ 84` (84일 전부터 시작하므로)
- 공식: `84 * 60 - (containerWidth / 2) + 30` → 오늘이 정중앙

### 변경 방향

오늘 날짜를 왼쪽에 배치하되, 1일분 여백을 줘서 오늘 컬럼이 살짝 안쪽에서 시작:

```
scrollTo = todayIndex * DAY_WIDTH - DAY_WIDTH
```

이렇게 하면 오늘 날짜 바로 앞 1칸(어제)이 살짝 보이면서, 오늘부터 미래가 펼쳐짐.

---

### Task 1: 스크롤 공식 변경

**Files:**
- Modify: `frontend/src/app/components/schedule/ScheduleResourceView.tsx:302-311`

**Step 1: 스크롤 공식 수정**

`ScheduleResourceView.tsx` line 305-308의 scrollTo 계산식을 변경:

```typescript
// Before (중앙 정렬)
const scrollTo =
  todayIndex * DAY_WIDTH -
  scrollContainerRef.current.clientWidth / 2 +
  DAY_WIDTH / 2;

// After (왼쪽 정렬 — 오늘 앞 1일 여백)
const scrollTo = todayIndex * DAY_WIDTH - DAY_WIDTH;
```

**Step 2: 빌드 검증**

Run: `cd frontend && npm run build`
Expected: 빌드 성공 (타입 변경 없음)

**Step 3: 브라우저 테스트**

1. 일정 탭 → 워크로드 서브탭 진입
2. 오늘 날짜가 왼쪽 멤버 패널 바로 옆에 위치하는지 확인
3. 좌측 스크롤하면 과거 날짜(최대 84일 전)도 볼 수 있는지 확인
4. 패널에서 아이템 클릭 시 해당 위치로 스크롤 (기존 기능 — line 641-684, 이 부분은 중앙 정렬 유지)
