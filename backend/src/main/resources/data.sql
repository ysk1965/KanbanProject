-- ============================================================================
-- BRIDGE 시드 데이터 (로컬 개발용)
-- 계정: admin@test.com / admin123
-- ============================================================================

-- ============================================================================
-- 1. 사용자
-- ============================================================================
MERGE INTO users (id, email, password_hash, name, auth_provider, email_verified, email_verified_at,
  personal_space_enabled, personal_ai_credits, personal_credits_used,
  system_role, is_active, theme, last_login_at, last_active_at, created_at, updated_at)
KEY(email)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'admin@test.com',
  '$2a$10$FuP3qrDEZAZiB0MJhRuYue9q1YaXKv3xvJ6joE.xEI6dKWjJDjxfK',
  'Admin',
  'email',
  true,
  TIMESTAMP '2025-01-15 09:00:00',
  true,
  30,
  5,
  'ADMIN',
  true,
  'dark',
  TIMESTAMP '2026-02-19 01:00:00',
  TIMESTAMP '2026-02-19 01:30:00',
  TIMESTAMP '2025-01-15 09:00:00',
  TIMESTAMP '2026-02-19 01:30:00'
);

-- ============================================================================
-- 2. 팀 보드: "BRIDGE 프로덕트"
-- ============================================================================
MERGE INTO boards (id, name, description, owner_id, board_type, tier,
  work_hours_per_day, work_start_time, schedule_display_mode,
  created_at, updated_at)
KEY(id)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'BRIDGE 프로덕트',
  '팀 칸반 보드 - 스프린트 관리 및 피처 트래킹',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'TEAM',
  'STANDARD',
  10,
  TIME '09:00:00',
  'TIME',
  TIMESTAMP '2025-06-01 00:00:00',
  TIMESTAMP '2026-02-19 00:00:00'
);

-- 보드 멤버
MERGE INTO board_members (id, board_id, user_id, role, joined_at, assignee_color, display_order)
KEY(id)
VALUES (
  '99999999-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'OWNER',
  TIMESTAMP '2025-06-01 00:00:00',
  'indigo',
  1
);

-- ============================================================================
-- 2-1. 블록 (칸반 컬럼)
-- ============================================================================
MERGE INTO blocks (id, board_id, name, type, fixed_type, position, show_progress_bar) KEY(id) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Feature',     'FIXED',  'FEATURE', 0, FALSE);
MERGE INTO blocks (id, board_id, name, type, fixed_type, position, show_progress_bar) KEY(id) VALUES
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'Task',        'FIXED',  'TASK',    1, FALSE);
MERGE INTO blocks (id, board_id, name, type, fixed_type, color, position, show_progress_bar) KEY(id) VALUES
  ('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001', 'In Progress', 'CUSTOM', NULL, '#3B82F6', 2, FALSE);
MERGE INTO blocks (id, board_id, name, type, fixed_type, color, position, show_progress_bar) KEY(id) VALUES
  ('cccccccc-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000001', 'Code Review', 'CUSTOM', NULL, '#F59E0B', 3, FALSE);
MERGE INTO blocks (id, board_id, name, type, fixed_type, position, show_progress_bar) KEY(id) VALUES
  ('cccccccc-0000-0000-0000-000000000005', 'bbbbbbbb-0000-0000-0000-000000000001', 'Done',        'FIXED',  'DONE',    4, FALSE);

-- ============================================================================
-- 2-2. 피처 (Feature Cards)
-- ============================================================================
-- Feature 1: 사용자 인증 개선
MERGE INTO features (id, board_id, title, description, color, assignee_id,
  start_date, due_date, status, total_tasks, completed_tasks, position, is_inbox, created_by, created_at, updated_at)
KEY(id) VALUES (
  'dddddddd-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  '사용자 인증 개선',
  'JWT 토큰 갱신 로직 개선 및 소셜 로그인 추가',
  '#6366F1',
  'aaaaaaaa-0000-0000-0000-000000000001',
  DATE '2026-02-10',
  DATE '2026-03-07',
  'ACTIVE',
  3, 1, 0, FALSE,
  'aaaaaaaa-0000-0000-0000-000000000001',
  TIMESTAMP '2026-02-10 02:00:00',
  TIMESTAMP '2026-02-18 05:00:00'
);

-- Feature 2: 대시보드 v2
MERGE INTO features (id, board_id, title, description, color, assignee_id,
  start_date, due_date, status, total_tasks, completed_tasks, position, is_inbox, created_by, created_at, updated_at)
KEY(id) VALUES (
  'dddddddd-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000001',
  '대시보드 v2',
  '대시보드 UI 리뉴얼 - 위젯 시스템 및 통계 차트 추가',
  '#2DD4BF',
  'aaaaaaaa-0000-0000-0000-000000000001',
  DATE '2026-02-03',
  DATE '2026-02-28',
  'ACTIVE',
  4, 1, 1, FALSE,
  'aaaaaaaa-0000-0000-0000-000000000001',
  TIMESTAMP '2026-02-03 01:00:00',
  TIMESTAMP '2026-02-19 03:00:00'
);

-- Feature 3: 알림 시스템
MERGE INTO features (id, board_id, title, description, color, assignee_id,
  start_date, due_date, status, total_tasks, completed_tasks, position, is_inbox, created_by, created_at, updated_at)
KEY(id) VALUES (
  'dddddddd-0000-0000-0000-000000000003',
  'bbbbbbbb-0000-0000-0000-000000000001',
  '알림 시스템 고도화',
  '실시간 알림 + 이메일 다이제스트 + 슬랙 연동 개선',
  '#F43F5E',
  'aaaaaaaa-0000-0000-0000-000000000001',
  DATE '2026-02-17',
  DATE '2026-03-14',
  'ACTIVE',
  3, 0, 2, FALSE,
  'aaaaaaaa-0000-0000-0000-000000000001',
  TIMESTAMP '2026-02-17 01:00:00',
  TIMESTAMP '2026-02-19 01:00:00'
);

-- ============================================================================
-- 2-3. 태스크 (Tasks)
-- ============================================================================
-- Feature 1 태스크 (사용자 인증 개선)
-- T1: Done
MERGE INTO tasks (id, feature_id, board_id, block_id, title, description,
  start_date, due_date, estimated_minutes, is_completed, position, feature_position, created_by, completed_at, created_at, updated_at)
KEY(id) VALUES (
  'eeeeeeee-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000005',
  'JWT Refresh Token 로직 리팩토링',
  '토큰 갱신 시 race condition 해결 및 sliding window 적용',
  DATE '2026-02-10',
  DATE '2026-02-14',
  240,
  true, 0, 0,
  'aaaaaaaa-0000-0000-0000-000000000001',
  TIMESTAMP '2026-02-13 08:00:00',
  TIMESTAMP '2026-02-10 02:00:00',
  TIMESTAMP '2026-02-13 08:00:00'
);

-- T2: In Progress
MERGE INTO tasks (id, feature_id, board_id, block_id, title, description,
  start_date, due_date, estimated_minutes, is_completed, position, feature_position, created_by, created_at, updated_at)
KEY(id) VALUES (
  'eeeeeeee-0000-0000-0000-000000000002',
  'dddddddd-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000003',
  'Google OAuth2 로그인 연동',
  'Google Identity Platform 연동 및 계정 병합 로직 구현',
  DATE '2026-02-14',
  DATE '2026-02-21',
  480,
  false, 0, 0,
  'aaaaaaaa-0000-0000-0000-000000000001',
  TIMESTAMP '2026-02-14 01:00:00',
  TIMESTAMP '2026-02-18 06:00:00'
);

-- T3: Code Review
MERGE INTO tasks (id, feature_id, board_id, block_id, title, description,
  start_date, due_date, estimated_minutes, is_completed, position, feature_position, created_by, created_at, updated_at)
KEY(id) VALUES (
  'eeeeeeee-0000-0000-0000-000000000003',
  'dddddddd-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000004',
  '비밀번호 재설정 이메일 템플릿',
  '비밀번호 재설정 이메일 HTML 템플릿 디자인 및 발송 로직',
  DATE '2026-02-15',
  DATE '2026-02-20',
  180,
  false, 0, 0,
  'aaaaaaaa-0000-0000-0000-000000000001',
  TIMESTAMP '2026-02-15 01:00:00',
  TIMESTAMP '2026-02-18 03:00:00'
);

-- Feature 2 태스크 (대시보드 v2)
-- T4: Done
MERGE INTO tasks (id, feature_id, board_id, block_id, title, description,
  start_date, due_date, estimated_minutes, is_completed, position, feature_position, created_by, completed_at, created_at, updated_at)
KEY(id) VALUES (
  'eeeeeeee-0000-0000-0000-000000000004',
  'dddddddd-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000005',
  '위젯 레이아웃 시스템 구현',
  'React Grid Layout 기반 드래그 가능한 위젯 시스템',
  DATE '2026-02-03',
  DATE '2026-02-10',
  600,
  true, 1, 1,
  'aaaaaaaa-0000-0000-0000-000000000001',
  TIMESTAMP '2026-02-09 07:00:00',
  TIMESTAMP '2026-02-03 01:00:00',
  TIMESTAMP '2026-02-09 07:00:00'
);

-- T5: In Progress
MERGE INTO tasks (id, feature_id, board_id, block_id, title, description,
  start_date, due_date, estimated_minutes, is_completed, position, feature_position, created_by, created_at, updated_at)
KEY(id) VALUES (
  'eeeeeeee-0000-0000-0000-000000000005',
  'dddddddd-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000003',
  '통계 차트 컴포넌트',
  'Recharts 기반 번다운 차트, 벨로시티 차트, 완료율 차트 구현',
  DATE '2026-02-10',
  DATE '2026-02-21',
  480,
  false, 1, 1,
  'aaaaaaaa-0000-0000-0000-000000000001',
  TIMESTAMP '2026-02-10 01:00:00',
  TIMESTAMP '2026-02-18 04:00:00'
);

-- T6: Code Review
MERGE INTO tasks (id, feature_id, board_id, block_id, title, description,
  start_date, due_date, estimated_minutes, is_completed, position, feature_position, created_by, created_at, updated_at)
KEY(id) VALUES (
  'eeeeeeee-0000-0000-0000-000000000006',
  'dddddddd-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000004',
  '활동 피드 위젯',
  '최근 활동 타임라인 위젯 - 댓글, 상태 변경, 멤버 활동 표시',
  DATE '2026-02-14',
  DATE '2026-02-22',
  360,
  false, 1, 1,
  'aaaaaaaa-0000-0000-0000-000000000001',
  TIMESTAMP '2026-02-14 01:00:00',
  TIMESTAMP '2026-02-17 05:00:00'
);

-- T7: Task (backlog)
MERGE INTO tasks (id, feature_id, board_id, block_id, title, description,
  due_date, estimated_minutes, is_completed, position, feature_position, created_by, created_at, updated_at)
KEY(id) VALUES (
  'eeeeeeee-0000-0000-0000-000000000007',
  'dddddddd-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000002',
  '다크모드 위젯 스타일 통일',
  'Bridge 디자인 시스템에 맞게 모든 위젯 다크모드 스타일 조정',
  DATE '2026-02-28',
  120,
  false, 0, 0,
  'aaaaaaaa-0000-0000-0000-000000000001',
  TIMESTAMP '2026-02-17 01:00:00',
  TIMESTAMP '2026-02-17 01:00:00'
);

-- Feature 3 태스크 (알림 시스템)
-- T8: Task
MERGE INTO tasks (id, feature_id, board_id, block_id, title, description,
  due_date, estimated_minutes, is_completed, position, feature_position, created_by, created_at, updated_at)
KEY(id) VALUES (
  'eeeeeeee-0000-0000-0000-000000000008',
  'dddddddd-0000-0000-0000-000000000003',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000002',
  '이메일 다이제스트 스케줄러',
  '일간/주간 알림 요약 이메일 발송 스케줄러 구현',
  DATE '2026-03-07',
  360,
  false, 1, 1,
  'aaaaaaaa-0000-0000-0000-000000000001',
  TIMESTAMP '2026-02-17 02:00:00',
  TIMESTAMP '2026-02-17 02:00:00'
);

-- T9: Task
MERGE INTO tasks (id, feature_id, board_id, block_id, title, description,
  due_date, estimated_minutes, is_completed, position, feature_position, created_by, created_at, updated_at)
KEY(id) VALUES (
  'eeeeeeee-0000-0000-0000-000000000009',
  'dddddddd-0000-0000-0000-000000000003',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000002',
  '슬랙 웹훅 재연결 로직',
  '슬랙 웹훅 실패 시 재시도 및 에러 알림 로직',
  DATE '2026-03-10',
  240,
  false, 2, 2,
  'aaaaaaaa-0000-0000-0000-000000000001',
  TIMESTAMP '2026-02-18 01:00:00',
  TIMESTAMP '2026-02-18 01:00:00'
);

-- T10: In Progress
MERGE INTO tasks (id, feature_id, board_id, block_id, title, description,
  start_date, due_date, estimated_minutes, is_completed, position, feature_position, created_by, created_at, updated_at)
KEY(id) VALUES (
  'eeeeeeee-0000-0000-0000-000000000010',
  'dddddddd-0000-0000-0000-000000000003',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-000000000003',
  '실시간 알림 WebSocket 구현',
  'STOMP 기반 WebSocket 알림 전송 및 프론트엔드 연동',
  DATE '2026-02-17',
  DATE '2026-02-25',
  600,
  false, 2, 2,
  'aaaaaaaa-0000-0000-0000-000000000001',
  TIMESTAMP '2026-02-17 01:00:00',
  TIMESTAMP '2026-02-19 02:00:00'
);

-- ============================================================================
-- 2-4. 체크리스트 (Checklist Items)
-- ============================================================================
-- T2 (Google OAuth2) 체크리스트
INSERT INTO checklist_items (id, task_id, title, is_completed, position, created_at) VALUES
  ('ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000002', 'Google API Console 프로젝트 설정', true, 0, TIMESTAMP '2026-02-14 01:00:00'),
  ('ffffffff-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000002', 'OAuth2 콜백 엔드포인트 구현', true, 1, TIMESTAMP '2026-02-14 01:00:00'),
  ('ffffffff-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000002', '기존 이메일 계정과 Google 계정 병합 로직', false, 2, TIMESTAMP '2026-02-14 01:00:00'),
  ('ffffffff-0000-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000002', '프론트엔드 Google 로그인 버튼 추가', false, 3, TIMESTAMP '2026-02-14 01:00:00');

-- T5 (통계 차트) 체크리스트
INSERT INTO checklist_items (id, task_id, title, is_completed, position, created_at) VALUES
  ('ffffffff-0000-0000-0000-000000000005', 'eeeeeeee-0000-0000-0000-000000000005', '번다운 차트 API 구현', true, 0, TIMESTAMP '2026-02-10 01:00:00'),
  ('ffffffff-0000-0000-0000-000000000006', 'eeeeeeee-0000-0000-0000-000000000005', '번다운 차트 UI 컴포넌트', true, 1, TIMESTAMP '2026-02-10 01:00:00'),
  ('ffffffff-0000-0000-0000-000000000007', 'eeeeeeee-0000-0000-0000-000000000005', '벨로시티 차트 구현', false, 2, TIMESTAMP '2026-02-10 01:00:00'),
  ('ffffffff-0000-0000-0000-000000000008', 'eeeeeeee-0000-0000-0000-000000000005', '완료율 도넛 차트 구현', false, 3, TIMESTAMP '2026-02-10 01:00:00');

-- T10 (WebSocket 알림) 체크리스트
INSERT INTO checklist_items (id, task_id, title, is_completed, position, created_at) VALUES
  ('ffffffff-0000-0000-0000-000000000009', 'eeeeeeee-0000-0000-0000-000000000010', 'STOMP 메시지 브로커 설정', true, 0, TIMESTAMP '2026-02-17 01:00:00'),
  ('ffffffff-0000-0000-0000-000000000010', 'eeeeeeee-0000-0000-0000-000000000010', '알림 이벤트 Publisher 구현', false, 1, TIMESTAMP '2026-02-17 01:00:00'),
  ('ffffffff-0000-0000-0000-000000000011', 'eeeeeeee-0000-0000-0000-000000000010', '프론트엔드 WebSocket 클라이언트', false, 2, TIMESTAMP '2026-02-17 01:00:00');

-- ============================================================================
-- 3. MySpace 데이터
-- ============================================================================

-- ============================================================================
-- 3-1. 개인 태그 (Personal Tags)
-- ============================================================================
INSERT INTO personal_tags (id, user_id, name, color, created_at) VALUES
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '업무',           '#6366F1', TIMESTAMP '2025-12-01 00:00:00'),
  ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '건강',           '#10B981', TIMESTAMP '2025-12-01 00:00:00'),
  ('11111111-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '학습',           '#F59E0B', TIMESTAMP '2025-12-01 00:00:00'),
  ('11111111-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '사이드 프로젝트', '#8B5CF6', TIMESTAMP '2025-12-01 00:00:00'),
  ('11111111-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', '긴급',           '#EF4444', TIMESTAMP '2025-12-01 00:00:00');

-- ============================================================================
-- 3-2. 개인 태스크 (Personal Tasks)
-- ============================================================================
-- PT1: React 19 마이그레이션
INSERT INTO personal_tasks (id, user_id, title, description, status, priority, due_date, category, color, position, created_at, updated_at) VALUES
  ('22222222-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'React 19 마이그레이션 계획 수립',
   '현재 React 18 → 19 마이그레이션 전략 문서 작성. Server Components 도입 여부 검토 및 breaking changes 분석.',
   'TODO', 'HIGH', DATE '2026-03-01', '개발', '#6366F1', 0,
   TIMESTAMP '2026-02-10 02:00:00', TIMESTAMP '2026-02-10 02:00:00');

-- PT2: 포트폴리오 업데이트
INSERT INTO personal_tasks (id, user_id, title, description, status, priority, due_date, category, color, position, created_at, updated_at) VALUES
  ('22222222-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   '포트폴리오 웹사이트 업데이트',
   'BRIDGE 프로젝트 추가, 기술 스택 업데이트, 반응형 레이아웃 개선',
   'IN_PROGRESS', 'MEDIUM', DATE '2026-02-28', '사이드', '#8B5CF6', 1,
   TIMESTAMP '2026-02-05 01:00:00', TIMESTAMP '2026-02-18 03:00:00');

-- PT3: 건강검진 예약
INSERT INTO personal_tasks (id, user_id, title, description, status, priority, due_date, category, color, position, created_at, updated_at) VALUES
  ('22222222-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   '건강검진 예약',
   '종합건강검진 예약 - 삼성서울병원 또는 서울아산병원',
   'TODO', 'URGENT', DATE '2026-02-22', '건강', '#EF4444', 2,
   TIMESTAMP '2026-02-15 01:00:00', TIMESTAMP '2026-02-15 01:00:00');

-- PT4: TypeScript 학습
INSERT INTO personal_tasks (id, user_id, title, description, status, priority, due_date, category, color, position, created_at, updated_at) VALUES
  ('22222222-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001',
   'TypeScript 5.0 새 기능 학습',
   'const type parameters, decorators, satisfies operator 등 새 기능 정리 및 실습',
   'TODO', 'HIGH', DATE '2026-03-15', '학습', '#F59E0B', 3,
   TIMESTAMP '2026-02-12 01:00:00', TIMESTAMP '2026-02-12 01:00:00');

-- PT5: AWS 인증 준비
INSERT INTO personal_tasks (id, user_id, title, description, status, priority, due_date, category, color, position, created_at, updated_at) VALUES
  ('22222222-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001',
   'AWS SAA 인증 시험 준비',
   'AWS Solutions Architect Associate 시험 준비. Udemy 강의 수강 + 모의시험 3회 이상',
   'IN_PROGRESS', 'MEDIUM', DATE '2026-04-15', '학습', '#F59E0B', 4,
   TIMESTAMP '2026-01-20 01:00:00', TIMESTAMP '2026-02-17 04:00:00');

-- PT6: 운동 루틴
INSERT INTO personal_tasks (id, user_id, title, description, status, priority, due_date, category, color, position, created_at, updated_at) VALUES
  ('22222222-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001',
   '3월 운동 루틴 계획',
   '주 4회 웨이트 + 주 2회 유산소 루틴 작성. 식단 계획 포함.',
   'TODO', 'MEDIUM', DATE '2026-02-28', '건강', '#10B981', 5,
   TIMESTAMP '2026-02-16 01:00:00', TIMESTAMP '2026-02-16 01:00:00');

-- PT7: 팀 회고 발표
INSERT INTO personal_tasks (id, user_id, title, description, status, priority, due_date, category, color, position, created_at, updated_at) VALUES
  ('22222222-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001',
   '팀 스프린트 회고 발표 준비',
   '2월 스프린트 회고 발표자료 준비. 성과, 개선점, 다음 스프린트 목표 정리.',
   'IN_PROGRESS', 'HIGH', DATE '2026-02-21', '업무', '#6366F1', 6,
   TIMESTAMP '2026-02-14 01:00:00', TIMESTAMP '2026-02-18 05:00:00');

-- PT8: 블로그 글 (완료)
INSERT INTO personal_tasks (id, user_id, title, description, status, priority, due_date, category, color, position, completed_at, created_at, updated_at) VALUES
  ('22222222-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001',
   '기술 블로그 글 작성: Spring WebFlux vs MVC',
   'WebFlux와 Spring MVC의 성능 비교 분석 블로그 포스트 작성 및 게시',
   'DONE', 'MEDIUM', DATE '2026-02-15', '사이드', '#8B5CF6', 7,
   TIMESTAMP '2026-02-14 08:00:00',
   TIMESTAMP '2026-02-08 01:00:00', TIMESTAMP '2026-02-14 08:00:00');

-- ============================================================================
-- 3-2b. 개인 태스크 ↔ 태그 연결
-- ============================================================================
INSERT INTO personal_task_tags (id, personal_task_id, personal_tag_id) VALUES
  ('aabbccdd-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'),
  ('aabbccdd-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003'),
  ('aabbccdd-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000004'),
  ('aabbccdd-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002'),
  ('aabbccdd-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000005'),
  ('aabbccdd-0000-0000-0000-000000000006', '22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000003'),
  ('aabbccdd-0000-0000-0000-000000000007', '22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000003'),
  ('aabbccdd-0000-0000-0000-000000000008', '22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001'),
  ('aabbccdd-0000-0000-0000-000000000009', '22222222-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000002'),
  ('aabbccdd-0000-0000-0000-000000000010', '22222222-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001'),
  ('aabbccdd-0000-0000-0000-000000000011', '22222222-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000004');

-- ============================================================================
-- 3-3. 개인 습관 (Personal Habits)
-- ============================================================================
INSERT INTO personal_habits (id, user_id, title, description, icon, color, frequency_type, frequency_days, target_count, unit, importance, current_streak, best_streak, position, is_active, created_at, updated_at) VALUES
  ('44444444-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '아침 운동', '30분 이상 운동하기 (웨이트 or 유산소)', '🏋️', '#10B981',
   'DAILY', NULL, 1, NULL, 'HIGH', 3, 7, 0, true,
   TIMESTAMP '2026-01-01 00:00:00', TIMESTAMP '2026-02-19 00:00:00');

INSERT INTO personal_habits (id, user_id, title, description, icon, color, frequency_type, frequency_days, target_count, unit, importance, current_streak, best_streak, position, is_active, created_at, updated_at) VALUES
  ('44444444-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   '독서', '매일 최소 30페이지 읽기', '📚', '#6366F1',
   'DAILY', NULL, 30, 'pages', 'HIGH', 5, 12, 1, true,
   TIMESTAMP '2026-01-01 00:00:00', TIMESTAMP '2026-02-19 00:00:00');

INSERT INTO personal_habits (id, user_id, title, description, icon, color, frequency_type, frequency_days, target_count, unit, importance, current_streak, best_streak, position, is_active, created_at, updated_at) VALUES
  ('44444444-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   '물 마시기', '하루 8잔 이상 물 마시기', '💧', '#3B82F6',
   'DAILY', NULL, 8, 'glasses', 'MEDIUM', 2, 5, 2, true,
   TIMESTAMP '2026-01-01 00:00:00', TIMESTAMP '2026-02-19 00:00:00');

INSERT INTO personal_habits (id, user_id, title, description, icon, color, frequency_type, frequency_days, target_count, unit, importance, current_streak, best_streak, position, is_active, created_at, updated_at) VALUES
  ('44444444-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001',
   '명상', '10분 마음챙김 명상', '🧘', '#8B5CF6',
   'DAILY', NULL, 1, NULL, 'MEDIUM', 1, 8, 3, true,
   TIMESTAMP '2026-01-01 00:00:00', TIMESTAMP '2026-02-19 00:00:00');

INSERT INTO personal_habits (id, user_id, title, description, icon, color, frequency_type, frequency_days, target_count, unit, importance, current_streak, best_streak, position, is_active, created_at, updated_at) VALUES
  ('44444444-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001',
   '코딩 연습', 'LeetCode 또는 개인 프로젝트 1시간', '💻', '#F59E0B',
   'WEEKDAY', NULL, 1, NULL, 'HIGH', 4, 10, 4, true,
   TIMESTAMP '2026-01-01 00:00:00', TIMESTAMP '2026-02-19 00:00:00');

INSERT INTO personal_habits (id, user_id, title, description, icon, color, frequency_type, frequency_days, target_count, unit, importance, current_streak, best_streak, position, is_active, created_at, updated_at) VALUES
  ('44444444-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001',
   '일기 쓰기', '하루 돌아보기 & 감사한 점 기록', '✍️', '#EC4899',
   'DAILY', NULL, 1, NULL, 'MEDIUM', 2, 6, 5, true,
   TIMESTAMP '2026-01-01 00:00:00', TIMESTAMP '2026-02-19 00:00:00');

-- ============================================================================
-- 3-3a. 습관 로그 (최근 14일)
-- ============================================================================
-- 아침 운동 로그 (streak=3, best=7)
INSERT INTO personal_habit_logs (id, habit_id, log_date, completed_count, is_completed, note, created_at, updated_at) VALUES
  ('55555555-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', DATE '2026-02-05', 1, true,  NULL, TIMESTAMP '2026-02-05 07:30:00', TIMESTAMP '2026-02-05 07:30:00'),
  ('55555555-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', DATE '2026-02-06', 1, true,  NULL, TIMESTAMP '2026-02-06 07:15:00', TIMESTAMP '2026-02-06 07:15:00'),
  ('55555555-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000001', DATE '2026-02-07', 1, true,  NULL, TIMESTAMP '2026-02-07 07:45:00', TIMESTAMP '2026-02-07 07:45:00'),
  ('55555555-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000001', DATE '2026-02-08', 1, true,  NULL, TIMESTAMP '2026-02-08 08:00:00', TIMESTAMP '2026-02-08 08:00:00'),
  ('55555555-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000001', DATE '2026-02-09', 1, true,  NULL, TIMESTAMP '2026-02-09 07:20:00', TIMESTAMP '2026-02-09 07:20:00'),
  ('55555555-0000-0000-0000-000000000006', '44444444-0000-0000-0000-000000000001', DATE '2026-02-10', 1, true,  NULL, TIMESTAMP '2026-02-10 07:30:00', TIMESTAMP '2026-02-10 07:30:00'),
  ('55555555-0000-0000-0000-000000000007', '44444444-0000-0000-0000-000000000001', DATE '2026-02-11', 1, true,  NULL, TIMESTAMP '2026-02-11 07:10:00', TIMESTAMP '2026-02-11 07:10:00'),
  ('55555555-0000-0000-0000-000000000008', '44444444-0000-0000-0000-000000000001', DATE '2026-02-12', 0, false, NULL, TIMESTAMP '2026-02-12 23:00:00', TIMESTAMP '2026-02-12 23:00:00'),
  ('55555555-0000-0000-0000-000000000009', '44444444-0000-0000-0000-000000000001', DATE '2026-02-13', 1, true,  NULL, TIMESTAMP '2026-02-13 07:40:00', TIMESTAMP '2026-02-13 07:40:00'),
  ('55555555-0000-0000-0000-000000000010', '44444444-0000-0000-0000-000000000001', DATE '2026-02-14', 0, false, NULL, TIMESTAMP '2026-02-14 23:00:00', TIMESTAMP '2026-02-14 23:00:00'),
  ('55555555-0000-0000-0000-000000000011', '44444444-0000-0000-0000-000000000001', DATE '2026-02-15', 0, false, NULL, TIMESTAMP '2026-02-15 23:00:00', TIMESTAMP '2026-02-15 23:00:00'),
  ('55555555-0000-0000-0000-000000000012', '44444444-0000-0000-0000-000000000001', DATE '2026-02-16', 0, false, NULL, TIMESTAMP '2026-02-16 23:00:00', TIMESTAMP '2026-02-16 23:00:00'),
  ('55555555-0000-0000-0000-000000000013', '44444444-0000-0000-0000-000000000001', DATE '2026-02-17', 1, true,  '상체 운동', TIMESTAMP '2026-02-17 07:25:00', TIMESTAMP '2026-02-17 07:25:00'),
  ('55555555-0000-0000-0000-000000000014', '44444444-0000-0000-0000-000000000001', DATE '2026-02-18', 1, true,  '하체 운동', TIMESTAMP '2026-02-18 07:35:00', TIMESTAMP '2026-02-18 07:35:00'),
  ('55555555-0000-0000-0000-000000000015', '44444444-0000-0000-0000-000000000001', DATE '2026-02-19', 1, true,  '유산소 30분', TIMESTAMP '2026-02-19 07:20:00', TIMESTAMP '2026-02-19 07:20:00');

-- 독서 로그 (streak=5, best=12)
INSERT INTO personal_habit_logs (id, habit_id, log_date, completed_count, is_completed, note, created_at, updated_at) VALUES
  ('55555555-0000-0000-0000-000000000101', '44444444-0000-0000-0000-000000000002', DATE '2026-02-05', 35, true,  '클린 코드 Ch.7', TIMESTAMP '2026-02-05 22:00:00', TIMESTAMP '2026-02-05 22:00:00'),
  ('55555555-0000-0000-0000-000000000102', '44444444-0000-0000-0000-000000000002', DATE '2026-02-06', 30, true,  '클린 코드 Ch.8', TIMESTAMP '2026-02-06 22:30:00', TIMESTAMP '2026-02-06 22:30:00'),
  ('55555555-0000-0000-0000-000000000103', '44444444-0000-0000-0000-000000000002', DATE '2026-02-07', 40, true,  NULL, TIMESTAMP '2026-02-07 21:45:00', TIMESTAMP '2026-02-07 21:45:00'),
  ('55555555-0000-0000-0000-000000000104', '44444444-0000-0000-0000-000000000002', DATE '2026-02-08', 20, false, NULL, TIMESTAMP '2026-02-08 23:00:00', TIMESTAMP '2026-02-08 23:00:00'),
  ('55555555-0000-0000-0000-000000000105', '44444444-0000-0000-0000-000000000002', DATE '2026-02-09', 45, true,  NULL, TIMESTAMP '2026-02-09 20:30:00', TIMESTAMP '2026-02-09 20:30:00'),
  ('55555555-0000-0000-0000-000000000106', '44444444-0000-0000-0000-000000000002', DATE '2026-02-10', 30, true,  NULL, TIMESTAMP '2026-02-10 22:00:00', TIMESTAMP '2026-02-10 22:00:00'),
  ('55555555-0000-0000-0000-000000000107', '44444444-0000-0000-0000-000000000002', DATE '2026-02-11', 50, true,  '클린 코드 완독!', TIMESTAMP '2026-02-11 21:00:00', TIMESTAMP '2026-02-11 21:00:00'),
  ('55555555-0000-0000-0000-000000000108', '44444444-0000-0000-0000-000000000002', DATE '2026-02-12', 25, false, NULL, TIMESTAMP '2026-02-12 23:30:00', TIMESTAMP '2026-02-12 23:30:00'),
  ('55555555-0000-0000-0000-000000000109', '44444444-0000-0000-0000-000000000002', DATE '2026-02-13', 15, false, NULL, TIMESTAMP '2026-02-13 23:30:00', TIMESTAMP '2026-02-13 23:30:00'),
  ('55555555-0000-0000-0000-000000000110', '44444444-0000-0000-0000-000000000002', DATE '2026-02-14', 10, false, NULL, TIMESTAMP '2026-02-14 23:30:00', TIMESTAMP '2026-02-14 23:30:00'),
  ('55555555-0000-0000-0000-000000000111', '44444444-0000-0000-0000-000000000002', DATE '2026-02-15', 35, true,  '리팩토링 시작', TIMESTAMP '2026-02-15 22:00:00', TIMESTAMP '2026-02-15 22:00:00'),
  ('55555555-0000-0000-0000-000000000112', '44444444-0000-0000-0000-000000000002', DATE '2026-02-16', 40, true,  NULL, TIMESTAMP '2026-02-16 21:30:00', TIMESTAMP '2026-02-16 21:30:00'),
  ('55555555-0000-0000-0000-000000000113', '44444444-0000-0000-0000-000000000002', DATE '2026-02-17', 30, true,  NULL, TIMESTAMP '2026-02-17 22:15:00', TIMESTAMP '2026-02-17 22:15:00'),
  ('55555555-0000-0000-0000-000000000114', '44444444-0000-0000-0000-000000000002', DATE '2026-02-18', 33, true,  NULL, TIMESTAMP '2026-02-18 21:45:00', TIMESTAMP '2026-02-18 21:45:00'),
  ('55555555-0000-0000-0000-000000000115', '44444444-0000-0000-0000-000000000002', DATE '2026-02-19', 30, true,  '리팩토링 Ch.4', TIMESTAMP '2026-02-19 22:00:00', TIMESTAMP '2026-02-19 22:00:00');

-- 물 마시기 로그 (streak=2, best=5, target=8)
INSERT INTO personal_habit_logs (id, habit_id, log_date, completed_count, is_completed, note, created_at, updated_at) VALUES
  ('55555555-0000-0000-0000-000000000201', '44444444-0000-0000-0000-000000000003', DATE '2026-02-12', 8, true,  NULL, TIMESTAMP '2026-02-12 18:00:00', TIMESTAMP '2026-02-12 18:00:00'),
  ('55555555-0000-0000-0000-000000000202', '44444444-0000-0000-0000-000000000003', DATE '2026-02-13', 6, false, NULL, TIMESTAMP '2026-02-13 18:00:00', TIMESTAMP '2026-02-13 18:00:00'),
  ('55555555-0000-0000-0000-000000000203', '44444444-0000-0000-0000-000000000003', DATE '2026-02-14', 8, true,  NULL, TIMESTAMP '2026-02-14 18:00:00', TIMESTAMP '2026-02-14 18:00:00'),
  ('55555555-0000-0000-0000-000000000204', '44444444-0000-0000-0000-000000000003', DATE '2026-02-15', 5, false, NULL, TIMESTAMP '2026-02-15 18:00:00', TIMESTAMP '2026-02-15 18:00:00'),
  ('55555555-0000-0000-0000-000000000205', '44444444-0000-0000-0000-000000000003', DATE '2026-02-16', 7, false, NULL, TIMESTAMP '2026-02-16 18:00:00', TIMESTAMP '2026-02-16 18:00:00'),
  ('55555555-0000-0000-0000-000000000206', '44444444-0000-0000-0000-000000000003', DATE '2026-02-17', 4, false, NULL, TIMESTAMP '2026-02-17 18:00:00', TIMESTAMP '2026-02-17 18:00:00'),
  ('55555555-0000-0000-0000-000000000207', '44444444-0000-0000-0000-000000000003', DATE '2026-02-18', 8, true,  NULL, TIMESTAMP '2026-02-18 18:00:00', TIMESTAMP '2026-02-18 18:00:00'),
  ('55555555-0000-0000-0000-000000000208', '44444444-0000-0000-0000-000000000003', DATE '2026-02-19', 9, true,  NULL, TIMESTAMP '2026-02-19 18:00:00', TIMESTAMP '2026-02-19 18:00:00');

-- 명상 로그 (streak=1, best=8)
INSERT INTO personal_habit_logs (id, habit_id, log_date, completed_count, is_completed, note, created_at, updated_at) VALUES
  ('55555555-0000-0000-0000-000000000301', '44444444-0000-0000-0000-000000000004', DATE '2026-02-13', 1, true,  NULL, TIMESTAMP '2026-02-13 06:30:00', TIMESTAMP '2026-02-13 06:30:00'),
  ('55555555-0000-0000-0000-000000000302', '44444444-0000-0000-0000-000000000004', DATE '2026-02-14', 1, true,  NULL, TIMESTAMP '2026-02-14 06:45:00', TIMESTAMP '2026-02-14 06:45:00'),
  ('55555555-0000-0000-0000-000000000303', '44444444-0000-0000-0000-000000000004', DATE '2026-02-15', 0, false, NULL, TIMESTAMP '2026-02-15 23:00:00', TIMESTAMP '2026-02-15 23:00:00'),
  ('55555555-0000-0000-0000-000000000304', '44444444-0000-0000-0000-000000000004', DATE '2026-02-16', 1, true,  NULL, TIMESTAMP '2026-02-16 07:00:00', TIMESTAMP '2026-02-16 07:00:00'),
  ('55555555-0000-0000-0000-000000000305', '44444444-0000-0000-0000-000000000004', DATE '2026-02-17', 0, false, NULL, TIMESTAMP '2026-02-17 23:00:00', TIMESTAMP '2026-02-17 23:00:00'),
  ('55555555-0000-0000-0000-000000000306', '44444444-0000-0000-0000-000000000004', DATE '2026-02-18', 0, false, NULL, TIMESTAMP '2026-02-18 23:00:00', TIMESTAMP '2026-02-18 23:00:00'),
  ('55555555-0000-0000-0000-000000000307', '44444444-0000-0000-0000-000000000004', DATE '2026-02-19', 1, true,  '10분 호흡 명상', TIMESTAMP '2026-02-19 06:30:00', TIMESTAMP '2026-02-19 06:30:00');

-- 코딩 연습 로그 (WEEKDAY, streak=4, best=10)
INSERT INTO personal_habit_logs (id, habit_id, log_date, completed_count, is_completed, note, created_at, updated_at) VALUES
  ('55555555-0000-0000-0000-000000000401', '44444444-0000-0000-0000-000000000005', DATE '2026-02-10', 1, true,  'LeetCode #238', TIMESTAMP '2026-02-10 20:00:00', TIMESTAMP '2026-02-10 20:00:00'),
  ('55555555-0000-0000-0000-000000000402', '44444444-0000-0000-0000-000000000005', DATE '2026-02-11', 1, true,  'LeetCode #15',  TIMESTAMP '2026-02-11 20:30:00', TIMESTAMP '2026-02-11 20:30:00'),
  ('55555555-0000-0000-0000-000000000403', '44444444-0000-0000-0000-000000000005', DATE '2026-02-12', 0, false, NULL, TIMESTAMP '2026-02-12 23:00:00', TIMESTAMP '2026-02-12 23:00:00'),
  ('55555555-0000-0000-0000-000000000404', '44444444-0000-0000-0000-000000000005', DATE '2026-02-13', 1, true,  NULL, TIMESTAMP '2026-02-13 19:30:00', TIMESTAMP '2026-02-13 19:30:00'),
  ('55555555-0000-0000-0000-000000000405', '44444444-0000-0000-0000-000000000005', DATE '2026-02-14', 0, false, NULL, TIMESTAMP '2026-02-14 23:00:00', TIMESTAMP '2026-02-14 23:00:00'),
  ('55555555-0000-0000-0000-000000000406', '44444444-0000-0000-0000-000000000005', DATE '2026-02-16', 1, true,  '개인 프로젝트', TIMESTAMP '2026-02-16 19:00:00', TIMESTAMP '2026-02-16 19:00:00'),
  ('55555555-0000-0000-0000-000000000407', '44444444-0000-0000-0000-000000000005', DATE '2026-02-17', 1, true,  'LeetCode #53',  TIMESTAMP '2026-02-17 20:00:00', TIMESTAMP '2026-02-17 20:00:00'),
  ('55555555-0000-0000-0000-000000000408', '44444444-0000-0000-0000-000000000005', DATE '2026-02-18', 1, true,  'LeetCode #121', TIMESTAMP '2026-02-18 19:45:00', TIMESTAMP '2026-02-18 19:45:00'),
  ('55555555-0000-0000-0000-000000000409', '44444444-0000-0000-0000-000000000005', DATE '2026-02-19', 1, true,  'LeetCode #200', TIMESTAMP '2026-02-19 20:00:00', TIMESTAMP '2026-02-19 20:00:00');

-- 일기 쓰기 로그 (streak=2, best=6)
INSERT INTO personal_habit_logs (id, habit_id, log_date, completed_count, is_completed, note, created_at, updated_at) VALUES
  ('55555555-0000-0000-0000-000000000501', '44444444-0000-0000-0000-000000000006', DATE '2026-02-13', 1, true,  NULL, TIMESTAMP '2026-02-13 23:00:00', TIMESTAMP '2026-02-13 23:00:00'),
  ('55555555-0000-0000-0000-000000000502', '44444444-0000-0000-0000-000000000006', DATE '2026-02-14', 1, true,  NULL, TIMESTAMP '2026-02-14 22:30:00', TIMESTAMP '2026-02-14 22:30:00'),
  ('55555555-0000-0000-0000-000000000503', '44444444-0000-0000-0000-000000000006', DATE '2026-02-15', 0, false, NULL, TIMESTAMP '2026-02-15 23:30:00', TIMESTAMP '2026-02-15 23:30:00'),
  ('55555555-0000-0000-0000-000000000504', '44444444-0000-0000-0000-000000000006', DATE '2026-02-16', 1, true,  NULL, TIMESTAMP '2026-02-16 22:00:00', TIMESTAMP '2026-02-16 22:00:00'),
  ('55555555-0000-0000-0000-000000000505', '44444444-0000-0000-0000-000000000006', DATE '2026-02-17', 0, false, NULL, TIMESTAMP '2026-02-17 23:30:00', TIMESTAMP '2026-02-17 23:30:00'),
  ('55555555-0000-0000-0000-000000000506', '44444444-0000-0000-0000-000000000006', DATE '2026-02-18', 1, true,  NULL, TIMESTAMP '2026-02-18 22:15:00', TIMESTAMP '2026-02-18 22:15:00'),
  ('55555555-0000-0000-0000-000000000507', '44444444-0000-0000-0000-000000000006', DATE '2026-02-19', 1, true,  NULL, TIMESTAMP '2026-02-19 22:30:00', TIMESTAMP '2026-02-19 22:30:00');

-- ============================================================================
-- 3-4. 개인 일정 (Personal Events)
-- ============================================================================
-- 이번 주 일정
INSERT INTO personal_events (id, user_id, title, description, event_date, start_time, end_time, color, all_day, event_type, created_at, updated_at) VALUES
  ('66666666-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '팀 스탠드업', '데일리 스크럼 미팅',
   DATE '2026-02-19', TIME '09:00:00', TIME '09:30:00', '#6366F1', false, 'SCHEDULE',
   TIMESTAMP '2026-02-01 00:00:00', TIMESTAMP '2026-02-01 00:00:00');

INSERT INTO personal_events (id, user_id, title, description, event_date, start_time, end_time, color, all_day, event_type, created_at, updated_at) VALUES
  ('66666666-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   '점심 약속 - 대학 동기', '강남역 근처 이탈리안 레스토랑',
   DATE '2026-02-19', TIME '12:00:00', TIME '13:30:00', '#F59E0B', false, 'SCHEDULE',
   TIMESTAMP '2026-02-15 00:00:00', TIMESTAMP '2026-02-15 00:00:00');

INSERT INTO personal_events (id, user_id, title, description, event_date, start_time, end_time, color, all_day, event_type, created_at, updated_at) VALUES
  ('66666666-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   '코드 리뷰 세션', 'PR #142, #145 리뷰',
   DATE '2026-02-20', TIME '14:00:00', TIME '15:00:00', '#2DD4BF', false, 'SCHEDULE',
   TIMESTAMP '2026-02-18 00:00:00', TIMESTAMP '2026-02-18 00:00:00');

INSERT INTO personal_events (id, user_id, title, description, event_date, start_time, end_time, color, all_day, event_type, created_at, updated_at) VALUES
  ('66666666-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001',
   '스프린트 회고',  '2월 스프린트 회고 발표',
   DATE '2026-02-21', TIME '16:00:00', TIME '17:30:00', '#F43F5E', false, 'SCHEDULE',
   TIMESTAMP '2026-02-10 00:00:00', TIMESTAMP '2026-02-10 00:00:00');

INSERT INTO personal_events (id, user_id, title, description, event_date, start_time, end_time, color, all_day, event_type, created_at, updated_at) VALUES
  ('66666666-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001',
   '프로젝트 데모', '대시보드 v2 데모 시연',
   DATE '2026-02-22', TIME '15:00:00', TIME '16:30:00', '#6366F1', false, 'SCHEDULE',
   TIMESTAMP '2026-02-12 00:00:00', TIMESTAMP '2026-02-12 00:00:00');

-- 다음 주 일정
INSERT INTO personal_events (id, user_id, title, description, event_date, start_time, end_time, color, all_day, event_type, created_at, updated_at) VALUES
  ('66666666-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001',
   '치과 검진', '정기 치과 검진 (스케일링 포함)',
   DATE '2026-02-24', TIME '10:00:00', TIME '11:00:00', '#EF4444', false, 'SCHEDULE',
   TIMESTAMP '2026-02-10 00:00:00', TIMESTAMP '2026-02-10 00:00:00');

INSERT INTO personal_events (id, user_id, title, description, event_date, start_time, end_time, color, all_day, event_type, created_at, updated_at) VALUES
  ('66666666-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001',
   '온라인 세미나: Spring Boot 4.0', 'InfoQ 주관 Spring Boot 4.0 신기능 세미나',
   DATE '2026-02-25', TIME '19:00:00', TIME '21:00:00', '#8B5CF6', false, 'SCHEDULE',
   TIMESTAMP '2026-02-14 00:00:00', TIMESTAMP '2026-02-14 00:00:00');

-- All-day 이벤트
INSERT INTO personal_events (id, user_id, title, description, event_date, color, all_day, event_type, created_at, updated_at) VALUES
  ('66666666-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001',
   'AWS SAA 시험일', 'AWS Solutions Architect Associate 시험',
   DATE '2026-04-15', '#F59E0B', true, 'CALENDAR',
   TIMESTAMP '2026-01-20 00:00:00', TIMESTAMP '2026-01-20 00:00:00');

INSERT INTO personal_events (id, user_id, title, description, event_date, color, all_day, event_type, created_at, updated_at) VALUES
  ('66666666-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001',
   '연차 휴가', '개인 연차',
   DATE '2026-03-03', '#10B981', true, 'CALENDAR',
   TIMESTAMP '2026-02-18 00:00:00', TIMESTAMP '2026-02-18 00:00:00');

-- ============================================================================
-- 3-5. 다이어리 (Diary Entries)
-- ============================================================================
-- 어제 다이어리 (완료)
INSERT INTO diary_entries (id, user_id, diary_date, title, content, mood, status, created_at, updated_at) VALUES
  ('77777777-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   DATE '2026-02-18',
   '프로젝트 진행과 성장에 대한 생각',
   '오늘 대시보드 v2 작업을 하면서 많은 것을 배웠다. 코드 리뷰를 통해 더 나은 패턴을 발견했고, 팀원들과의 소통도 좋았다.',
   'thoughtful', 'COMPLETED',
   TIMESTAMP '2026-02-18 13:30:00', TIMESTAMP '2026-02-18 14:00:00');

INSERT INTO diary_messages (id, diary_id, role, content, message_order, created_at, updated_at) VALUES
  ('88888888-0000-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001', 'USER',
   '오늘 대시보드 v2 작업을 진행했는데, 통계 차트 구현이 생각보다 복잡했어.',
   0, TIMESTAMP '2026-02-18 13:30:00', TIMESTAMP '2026-02-18 13:30:00');

INSERT INTO diary_messages (id, diary_id, role, content, message_order, created_at, updated_at) VALUES
  ('88888888-0000-0000-0000-000000000002', '77777777-0000-0000-0000-000000000001', 'AI',
   '통계 차트 작업이 예상보다 복잡했군요. 어떤 부분이 특히 까다로웠나요? 데이터 가공 쪽인지, 시각화 쪽인지 궁금해요.',
   1, TIMESTAMP '2026-02-18 13:31:00', TIMESTAMP '2026-02-18 13:31:00');

INSERT INTO diary_messages (id, diary_id, role, content, message_order, created_at, updated_at) VALUES
  ('88888888-0000-0000-0000-000000000003', '77777777-0000-0000-0000-000000000001', 'USER',
   'Recharts 라이브러리를 처음 써봤는데, 커스텀 툴팁이랑 반응형 처리가 좀 어려웠어. 근데 코드 리뷰에서 팀원이 좋은 패턴을 알려줬어.',
   2, TIMESTAMP '2026-02-18 13:32:00', TIMESTAMP '2026-02-18 13:32:00');

INSERT INTO diary_messages (id, diary_id, role, content, message_order, created_at, updated_at) VALUES
  ('88888888-0000-0000-0000-000000000004', '77777777-0000-0000-0000-000000000001', 'AI',
   '새로운 라이브러리를 배우면서 동시에 프로젝트를 진행하는 건 쉽지 않은 일인데, 대단해요! 팀원의 코드 리뷰를 통해 성장하는 과정이 정말 멋지네요. 오늘 배운 패턴을 나중에도 활용할 수 있을 것 같나요?',
   3, TIMESTAMP '2026-02-18 13:33:00', TIMESTAMP '2026-02-18 13:33:00');

INSERT INTO diary_messages (id, diary_id, role, content, message_order, created_at, updated_at) VALUES
  ('88888888-0000-0000-0000-000000000005', '77777777-0000-0000-0000-000000000001', 'USER',
   '응, 확실히 재사용 가능한 차트 컴포넌트로 만들었으니까 다른 곳에서도 쓸 수 있을 거야. 오늘 전반적으로 생산적인 하루였어.',
   4, TIMESTAMP '2026-02-18 13:34:00', TIMESTAMP '2026-02-18 13:34:00');

INSERT INTO diary_messages (id, diary_id, role, content, message_order, created_at, updated_at) VALUES
  ('88888888-0000-0000-0000-000000000006', '77777777-0000-0000-0000-000000000001', 'AI',
   '재사용 가능한 컴포넌트로 만들어둔 건 정말 좋은 판단이에요. 생산적인 하루를 보낸 것에 대해 스스로를 칭찬해 주세요. 내일도 좋은 하루 보내시길 바랍니다!',
   5, TIMESTAMP '2026-02-18 13:35:00', TIMESTAMP '2026-02-18 13:35:00');

-- 2일 전 다이어리 (완료)
INSERT INTO diary_entries (id, user_id, diary_date, title, content, mood, status, created_at, updated_at) VALUES
  ('77777777-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   DATE '2026-02-17',
   '블로그 글 완성의 기쁨',
   'Spring WebFlux vs MVC 비교 블로그 글을 드디어 완성하고 게시했다. 많은 사람들이 반응해주었다.',
   'happy', 'COMPLETED',
   TIMESTAMP '2026-02-17 14:00:00', TIMESTAMP '2026-02-17 14:20:00');

INSERT INTO diary_messages (id, diary_id, role, content, message_order, created_at, updated_at) VALUES
  ('88888888-0000-0000-0000-000000000007', '77777777-0000-0000-0000-000000000002', 'USER',
   '드디어 WebFlux vs MVC 블로그 글을 완성했어! 일주일 넘게 작업했는데 결과물이 만족스러워.',
   0, TIMESTAMP '2026-02-17 14:00:00', TIMESTAMP '2026-02-17 14:00:00');

INSERT INTO diary_messages (id, diary_id, role, content, message_order, created_at, updated_at) VALUES
  ('88888888-0000-0000-0000-000000000008', '77777777-0000-0000-0000-000000000002', 'AI',
   '일주일 넘게 공들인 글을 완성했다니 정말 축하해요! 🎉 글을 쓰는 과정에서 가장 재미있었던 부분은 뭐였나요?',
   1, TIMESTAMP '2026-02-17 14:01:00', TIMESTAMP '2026-02-17 14:01:00');

INSERT INTO diary_messages (id, diary_id, role, content, message_order, created_at, updated_at) VALUES
  ('88888888-0000-0000-0000-000000000009', '77777777-0000-0000-0000-000000000002', 'USER',
   '실제 벤치마크 테스트를 돌려보고 결과를 분석하는 과정이 가장 재미있었어. 예상과 다른 결과가 나온 부분도 있어서 흥미로웠고.',
   2, TIMESTAMP '2026-02-17 14:02:00', TIMESTAMP '2026-02-17 14:02:00');

INSERT INTO diary_messages (id, diary_id, role, content, message_order, created_at, updated_at) VALUES
  ('88888888-0000-0000-0000-000000000010', '77777777-0000-0000-0000-000000000002', 'AI',
   '직접 벤치마크를 돌려본 경험은 글에 신뢰성을 더해줬을 거예요. 예상과 다른 결과가 나왔을 때 원인을 분석하는 과정도 좋은 학습이 됐을 것 같아요. 다음 블로그 주제도 구상 중인가요?',
   3, TIMESTAMP '2026-02-17 14:03:00', TIMESTAMP '2026-02-17 14:03:00');

-- 3일 전 다이어리 (완료)
INSERT INTO diary_entries (id, user_id, diary_date, title, content, mood, status, created_at, updated_at) VALUES
  ('77777777-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   DATE '2026-02-16',
   '긴 하루의 끝',
   '회의가 많았던 하루. 집중 시간이 부족했지만 운동으로 리프레시했다.',
   'tired', 'COMPLETED',
   TIMESTAMP '2026-02-16 14:30:00', TIMESTAMP '2026-02-16 14:45:00');

INSERT INTO diary_messages (id, diary_id, role, content, message_order, created_at, updated_at) VALUES
  ('88888888-0000-0000-0000-000000000011', '77777777-0000-0000-0000-000000000003', 'USER',
   '오늘 회의가 4개나 있었어. 집중해서 코딩할 시간이 거의 없었는데 좀 답답했어.',
   0, TIMESTAMP '2026-02-16 14:30:00', TIMESTAMP '2026-02-16 14:30:00');

INSERT INTO diary_messages (id, diary_id, role, content, message_order, created_at, updated_at) VALUES
  ('88888888-0000-0000-0000-000000000012', '77777777-0000-0000-0000-000000000003', 'AI',
   '회의 4개는 정말 많네요. 집중 코딩 시간이 없으면 답답할 수 있어요. 혹시 회의 중에서도 유익했던 것이 있었나요?',
   1, TIMESTAMP '2026-02-16 14:31:00', TIMESTAMP '2026-02-16 14:31:00');

INSERT INTO diary_messages (id, diary_id, role, content, message_order, created_at, updated_at) VALUES
  ('88888888-0000-0000-0000-000000000013', '77777777-0000-0000-0000-000000000003', 'USER',
   '기획팀과의 미팅은 유익했어. 새로운 기능 방향성에 대해 좋은 아이디어가 나왔거든. 근데 퇴근 후에 운동을 했더니 기분이 좋아졌어.',
   2, TIMESTAMP '2026-02-16 14:32:00', TIMESTAMP '2026-02-16 14:32:00');

INSERT INTO diary_messages (id, diary_id, role, content, message_order, created_at, updated_at) VALUES
  ('88888888-0000-0000-0000-000000000014', '77777777-0000-0000-0000-000000000003', 'AI',
   '기획팀과의 미팅에서 좋은 아이디어를 얻었다니 다행이에요. 그리고 운동으로 리프레시한 것도 정말 좋은 습관이에요. 바쁜 하루에도 운동을 빠뜨리지 않는 건 대단한 일이에요. 푹 쉬시고 내일은 더 집중할 수 있는 시간을 만들어 보세요!',
   3, TIMESTAMP '2026-02-16 14:33:00', TIMESTAMP '2026-02-16 14:33:00');
