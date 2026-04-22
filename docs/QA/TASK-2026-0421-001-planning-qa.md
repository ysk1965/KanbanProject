# TASK-2026-0421-001 수동 QA 체크리스트 — Planning 서브탭

**작성일**: 2026-04-21  
**대상**: 일정 탭 Planning 서브탭 (인원×주차 매트릭스, Capacity 시뮬레이션)  
**사전 조건**: 보드에 멤버 3인 이상, 마일스톤 2개 이상(갭 있음), MilestoneAllocation 설정된 상태에서 테스트

---

## 빌드 검증 (자동)

| # | 항목 | 명령 | 결과 |
|---|------|------|------|
| B1 | 백엔드 빌드 + 전체 테스트 통과 | `cd backend && ./gradlew build --no-daemon` | PASS |
| B2 | `PlanningCardServiceTest` 15케이스 green | `./gradlew test --tests 'com.kanban.domain.planning.service.PlanningCardServiceTest'` | PASS |
| B3 | `PlanningCardControllerIT` 12케이스 green | `./gradlew test --tests 'com.kanban.domain.planning.controller.PlanningCardControllerIT'` | PASS |
| B4 | `PlanningCardRecomputeServiceTest` 4케이스 green | `./gradlew test --tests 'com.kanban.domain.planning.service.PlanningCardRecomputeServiceTest'` | PASS |
| B5 | 프론트엔드 빌드 (`@capacitor-community/media` 이슈는 기존 버그, Planning과 무관) | `cd frontend && npm run build` | 기존 버그 |

---

## 수동 QA 항목 (기획서 섹션 9)

### QA-01 — 플래닝 서브탭 진입
- [ ] 일정 탭 클릭 후 서브탭 바에 **4번째 탭 "Planning"** 표시 확인
- [ ] 키보드 단축키 **숫자 `4`** 로도 진입 가능 (INPUT/TEXTAREA 포커스 시 제외)
- [ ] 진입 후 인원×주차 매트릭스 그리드 렌더링 확인
- [ ] 이전 서브탭(timeblock/calendar/resource) 로컬스토리지 복원 정상 동작 (탭 변경 후 재방문)

### QA-02 — 마일스톤 0개 상태
- [ ] 마일스톤이 없을 때 주차 헤더는 **"이번 주부터 12주"** 표시
- [ ] 마일스톤 레인(상단 2열) 비어있음 확인
- [ ] 인포 배너 또는 안내 메시지 표시
- [ ] capacity 없음 → 모든 셀 `UNKNOWN` 상태 배지

### QA-03 — 마일스톤 2개 + 갭 1주
- [ ] 마일스톤 바가 시작/종료 일자에 맞게 컬럼 범위로 렌더링
- [ ] **갭 주**(마일스톤 사이 주): 주차 헤더만 있고 부하 스트립은 `UNKNOWN` 상태
- [ ] 갭 주 셀은 capacity null → status `UNKNOWN` 표기 (자동 fallback 없음)
- [ ] 마일스톤 1의 마지막 주와 마일스톤 2의 첫 주 경계값 정상 매핑

### QA-04 — 풀 연속 생성 (Enter 반복)
- [ ] 풀 영역에서 제목 입력 후 Enter → 카드 생성 + 제목 필드만 초기화
- [ ] 두 번째 Enter → 동일 시간/담당자 유지된 상태로 다음 카드 생성
- [ ] 빈 제목으로 Enter → 생성 안 됨 (`@NotBlank` 검증)
- [ ] 생성된 카드 `week_start_date=null`, `assignee=null` (풀 상태)

### QA-05 — 풀 카드 → 주차 셀 드래그
- [ ] 풀 카드 드래그 시작 → 3px threshold 초과 시 ghost 활성
- [ ] 드래그 중 유효 셀 위 hover → 셀 하이라이트
- [ ] 드롭 성공 → 부하 스트립 즉시 갱신 (낙관적 업데이트)
- [ ] 드롭 대상 셀의 `load_hours` / `capacity_hours` 반영 확인 (Network 탭 PATCH 확인)

### QA-06 — OVER 예상 드롭 프리뷰
- [ ] 드래그 카드를 capacity 초과 예상 셀 위로 이동 시 **rose-500/50 highlight** 표시
- [ ] OVER 임계값: `(현재 load + 카드 estimated_hours) / capacity > 1.10`
- [ ] 드롭 확정 후 셀 상태가 `OVER` 배지 + AlertTriangle 아이콘 표시

### QA-07 — 셀 → 다른 주 또는 다른 멤버 재배치
- [ ] 셀 내 카드를 다른 주차 컬럼으로 드래그 → 이동 성공
- [ ] 셀 내 카드를 다른 멤버 행으로 드래그 → 이동 성공
- [ ] 이동 후 원본 셀 load_hours 감소, 목적 셀 load_hours 증가 확인
- [ ] 이동 후 `primary_milestone_id` 서버 재계산 확인 (주 기준 마일스톤 변경 시)

### QA-08 — 셀 → 풀 복귀
- [ ] 셀 카드를 풀 영역으로 드래그 → 드롭 성공
- [ ] 복귀 후 카드의 `week_start_date=null`, `assignee_id=null`, `primary_milestone_id=null`
- [ ] 원본 셀 load_hours 감소 및 부하 스트립 갱신 확인
- [ ] 풀 영역에 카드 표시 확인

### QA-09 — 마일스톤 기간 수정 → primary_milestone_id 재계산
- [ ] 마일스톤 기간 수정 후 플래닝 뷰 열기 또는 새로고침
- [ ] 영향 받은 셀 카드의 `primary_milestone_id` 갱신 확인 (API GET 응답)
- [ ] WebSocket `PLANNING_MILESTONE_REINDEXED` 이벤트 수신 → capacity 재계산 자동 갱신
- [ ] 마일스톤 삭제 시 영향 카드의 `primary_milestone_id` → null (UNKNOWN 상태)

### QA-10 — 다른 탭에서 실시간 반영
- [ ] 브라우저 탭 A에서 카드 생성/이동
- [ ] 브라우저 탭 B(같은 보드)에서 WS 이벤트 수신 → 플래닝 뷰 자동 갱신
- [ ] 탭 B에서 별도 새로고침 없이 변경사항 반영 확인

### QA-11 — Today 마커
- [ ] 현재 날짜가 속한 주차 컬럼에 **세로 라인** Today 마커 표시
- [ ] 툴바에 **"Today로 스크롤"** 버튼 표시
- [ ] 버튼 클릭 시 Today 마커 컬럼으로 스크롤 이동

### QA-12 — 마일스톤 바 클릭 → 마일스톤 상세
- [ ] 마일스톤 타임라인 레인의 바 클릭 → 기존 `onMilestoneClick` 콜백 호출
- [ ] 마일스톤 상세 모달/패널 열림 확인
- [ ] 마일스톤 없는 주의 헤더 영역 클릭 → 아무 동작 없음

### QA-13 — 모바일 대응
- [ ] 모바일 뷰포트(375px)에서 플래닝 탭 표시 확인
- [ ] 수평 스크롤로 주차 컬럼 탐색 가능
- [ ] 터치 드래그로 카드 이동 (3px threshold 적용)
- [ ] `MobileBottomNav` 하단 내비에서 일정 탭 → 플래닝 서브탭 진입 가능

### QA-14 — Viewer 권한 제한
- [ ] Viewer 계정으로 보드 접근 → 플래닝 서브탭은 **읽기 전용** 배지 표시
- [ ] 카드 생성 입력 필드 비활성(disabled) 또는 숨김
- [ ] 드래그 불가 (mousedown 이벤트 차단 또는 드롭 후 403 toast)
- [ ] API로 직접 POST/PUT/PATCH/DELETE 시도 시 **403 BOARD_ACCESS_DENIED** 응답

### QA-15 — Reduced Motion
- [ ] OS 또는 브라우저 "동작 줄이기" 활성화 후 플래닝 뷰 진입
- [ ] 부하 스트립 **pulse 애니메이션 없음** (motion-safe 클래스 또는 useReducedMotion 훅 적용)
- [ ] 카드 진입 애니메이션 제거 (`initial={}/animate={}` 비활성)
- [ ] 드래그 ghost는 여전히 표시되나 transition 없음

---

## 성능 검증

| # | 항목 | 기준 | 확인 방법 |
|---|------|------|----------|
| P1 | 10명 × 12주 × 480카드 렌더링 FPS | 60fps 드래그 유지 | Chrome DevTools Performance 탭 |
| P2 | GET /planning-cards 응답 시간 | < 200ms | Network 탭 (idx_pc_board_week 인덱스 활용) |
| P3 | GET 쿼리 수 | < 5 쿼리 (N+1 방지) | Spring 로그 `show-sql: true` 또는 EXPLAIN |

---

## 에러 코드 검증

| ErrorCode | 상황 | 기대 HTTP 상태 |
|-----------|------|---------------|
| PL001 `PLANNING_CARD_NOT_FOUND` | 존재하지 않는 cardId | 404 |
| PL002 `PLANNING_CARD_BOARD_MISMATCH` | 다른 보드의 카드 접근 | 404 |
| PL003 `PLANNING_CARD_INVALID_WEEK` | week_start_date가 월요일 아님 | 400 |
| PL004 `PLANNING_CARD_REORDER_MISMATCH` | reorder 시 다른 셀 카드 혼재 | 400 |

---

## DB 마이그레이션 검증

| # | 항목 |
|---|------|
| M1 | `V20260421_021705__create_planning_cards.sql` Flyway 적용 완료 (`flyway_schema_history` 확인) |
| M2 | `V20260421_080819__add_planning_card_activity_types.sql` 적용 완료 |
| M3 | `planning_cards` 테이블 12 컬럼 + FK 5개 + 인덱스 6개 + CHECK 3개 |
| M4 | `activity_log_action_check` 에 `PLANNING_CARD_*` 4개 포함 |
| M5 | `activity_log_target_type_check` 에 `PLANNING_CARD` 포함 |
| M6 | 재실행 시 멱등성: 오류 없이 skip 확인 |

---

## Critical Path (최우선 검증 항목)

QA-01, QA-02, QA-03, QA-05, QA-07, QA-09, QA-10, QA-14 — 이 8개 항목은 반드시 수동 확인 필요.
