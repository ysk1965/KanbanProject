# TASK-2026-0227-001: Organization Cross-Board Schedule Sharing

## Summary
같은 Organization에 속한 보드들 간의 일일 스케줄 공유 기능 구현. 특정 구성원이 Board A에서 세팅한 스케줄 블록이 Board B의 스케줄 뷰에서 읽기 전용 오버레이로 표시됨.

## Analysis

### 문제 정의
- ScheduleBlock은 board_id NOT NULL로 보드 스코프 엔티티
- 같은 조직 멤버가 여러 보드에서 스케줄을 세팅할 수 있으나, 다른 보드에서는 보이지 않음
- 일정 충돌 방지를 위해 크로스보드 스케줄 가시성 필요

### 설계 결정 사항

| 결정 | 선택 | 대안 (기각) | 이유 |
|------|------|------------|------|
| 데이터 전달 방식 | 기존 API 확장 (`includeOrgSchedules` param) | 별도 API 엔드포인트 | 기존 flow 최소 변경, 하위 호환 |
| 렌더링 방식 | `org_blocks` 별도 필드 분리 | blocks에 합쳐서 flag 추가 | 기존 blocks 로직 영향 없음, 프론트 분기 명확 |
| 권한 모델 | 사용자가 멤버인 org 보드만 조회 | 모든 org 보드 조회 | 보안 (비멤버 보드 스케줄 노출 방지) |
| N+1 방지 | JOIN FETCH sb.board | Lazy loading | 크로스보드 쿼리에서 board.name 접근 필수 |
| ColumnInfo 수정 | 새 객체 rebuild | 기존 객체 mutate | @Builder 불변 패턴 준수 |
| 주간 뷰 최적화 | 전체 기간 1회 쿼리 → 날짜별 그룹핑 | 날짜별 반복 쿼리 | DB 라운드트립 최소화 |

## SubAgent Summary

| SubAgent | 역할 | 변경 파일 | 상태 |
|----------|------|----------|------|
| SA-001 (BE) | 백엔드 API 확장 | 7개 | 완료 |
| SA-002 (FE) | 프론트엔드 UI/UX | 5+10 i18n | 완료 |

### Upfront Contracts
- **UC-001**: `GET /schedule/daily-full?includeOrgSchedules=true` — ColumnInfo에 `org_blocks` 필드 추가
- **UC-002**: `GET /boards/{id}/full` — `organization_id`, `organization_name` 필드 추가

## Changes

### Backend (7 files)

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `ScheduleBlockRepository.java` | Modified | 크로스보드 쿼리 2개 추가 (JOIN FETCH sb.board) |
| `ScheduleResponse.java` | Modified | ColumnInfo.orgBlocks, BlockInfo.boardId/boardName 추가 |
| `BoardResponse.java` | Modified | Full DTO에 organizationId/organizationName 추가 |
| `BoardFacadeService.java` | Modified | getBoardFull()에 org 필드 매핑 |
| `ScheduleFacadeService.java` | Modified | getDailyFull()에 크로스보드 로직 추가 |
| `ScheduleService.java` | Modified | getDailySchedule/getWeeklySchedule에 org 블록 조회 |
| `ScheduleController.java` | Modified | 3개 엔드포인트에 includeOrgSchedules param 추가 |

### Frontend (5 components + 10 i18n)

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `api.ts` | Modified | ScheduleBlockInfo/ColumnInfo 타입 확장, API 파라미터 추가 |
| `useBoardDataLoader.ts` | Modified | organization_id/name 매핑 |
| `ScheduleBlock.tsx` | Modified | isOrgOverlay prop + 읽기전용 오버레이 렌더링 |
| `DailyScheduleView.tsx` | Modified | org 블록 로딩/렌더링 (일간+주간) |
| `KanbanBoardPage.tsx` | Modified | organizationId prop 전달 |
| `i18n/locales/*.json` (x10) | Modified | orgScheduleLabel, orgScheduleReadOnly 키 추가 |

### 변경 통계
- Created: 0
- Modified: 22
- Deleted: 0

## Test Summary
- Frontend build: **PASS** (6909 modules, 12.71s)
- Backend build: **PASS** (BUILD SUCCESSFUL)
- 코드 리뷰: 주간 뷰 org 블록 미렌더링 이슈 발견 → 수정 완료

## Architecture Impact

### 새로운 패턴: Cross-Board Schedule Overlay
```
ScheduleController → ScheduleService → ScheduleBlockRepository
                                          ├── findByBoard (기존)
                                          └── findByBoardIdIn (신규: 크로스보드)
                                                ↑
                              BoardMemberRepository.findByUserIdWithActiveBoards()
                              → 사용자 멤버십 기반 보드 필터링
```

### 영향 범위
- Schedule 도메인: 쿼리 확장 (기존 로직 변경 없음)
- Board 도메인: Full DTO 필드 추가 (하위 호환)
- Organization 도메인: 변경 없음 (기존 관계 활용)

### 성능 고려
- `includeOrgSchedules=false` (기본값): 기존과 동일한 쿼리
- `includeOrgSchedules=true`: 추가 1-2 쿼리 (보드 목록 + 크로스보드 블록)
- 주간 뷰: 7일치 크로스보드 블록을 1회 쿼리로 가져와 메모리에서 그룹핑

## Future Considerations
- **Phase 2**: WebSocket 실시간 크로스보드 업데이트 (현재는 API reload)
- **Phase 2**: 크로스보드 블록 클릭 시 해당 보드로 네비게이션
- **Phase 2**: org 스케줄 표시 on/off 사용자 설정
- 대규모 조직 (10+ 보드) 성능 모니터링 필요

## Tags
`schedule`, `organization`, `cross-board`, `overlay`, `read-only`, `fullstack`
