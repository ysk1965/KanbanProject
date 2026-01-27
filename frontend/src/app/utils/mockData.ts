import type { Board, Feature, Task, Block, Tag, BoardMember } from '../types';

// ========================================
// Mock Boards
// ========================================

export const mockBoards: Board[] = [
  {
    id: '1',
    name: '프로젝트 관리',
    description: '개발팀 프로젝트 관리 보드',
    is_starred: true,
    member_count: 5,
    subscription: {
      status: 'TRIAL',
      plan: null,
      trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      current_period_end: null,
    },
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: '2',
    name: '마케팅 캠페인',
    description: '마케팅팀 캠페인 관리',
    is_starred: false,
    member_count: 3,
    subscription: {
      status: 'TRIAL',
      plan: null,
      trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      current_period_end: null,
    },
    created_at: '2025-01-02T00:00:00Z',
  },
  {
    id: '3',
    name: '제품 로드맵',
    description: '제품 개발 로드맵',
    is_starred: true,
    member_count: 8,
    subscription: {
      status: 'ACTIVE',
      plan: 'team_10',
      trial_ends_at: null,
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
    created_at: '2025-01-03T00:00:00Z',
  },
];

// ========================================
// Mock Blocks
// ========================================

export const mockBlocks: Block[] = [
  { id: 'feature', name: 'Feature', type: 'FIXED', fixed_type: 'FEATURE', color: null, position: 0 },
  { id: 'task', name: 'Task', type: 'FIXED', fixed_type: 'TASK', color: null, position: 1 },
  { id: 'in-progress', name: 'In Progress', type: 'CUSTOM', fixed_type: null, color: '#3B82F6', position: 2 },
  { id: 'done', name: 'Done', type: 'FIXED', fixed_type: 'DONE', color: null, position: 999 },
];

// ========================================
// Mock Tags
// ========================================

export const mockTags: Tag[] = [
  { id: 'tag1', name: 'Backend', color: '#3b82f6' },
  { id: 'tag2', name: 'Frontend', color: '#10b981' },
  { id: 'tag3', name: 'Design', color: '#f59e0b' },
  { id: 'tag4', name: 'Bug', color: '#ef4444' },
];

// ========================================
// Mock Features
// ========================================

export const mockFeatures: Feature[] = [
  {
    id: '1',
    title: '사용자 인증 시스템',
    description: '로그인, 회원가입, 비밀번호 찾기 기능',
    color: '#3b82f6',
    assignee: {
      id: 'member1',
      name: '김철수',
      email: 'kim@example.com',
      profile_image: null,
    },
    priority: 'HIGH',
    due_date: '2026-01-15',
    status: 'ACTIVE',
    total_tasks: 2,
    completed_tasks: 0,
    progress_percentage: 0,
    position: 0,
    tags: [mockTags[0], mockTags[1]],
    created_at: '2025-01-05T00:00:00Z',
  },
  {
    id: '2',
    title: '대시보드 UI 개선',
    description: '사용자 경험 향상을 위한 대시보드 리디자인',
    color: '#10b981',
    assignee: {
      id: 'member3',
      name: '박민수',
      email: 'park@example.com',
      profile_image: null,
    },
    priority: 'MEDIUM',
    due_date: '2026-01-20',
    status: 'ACTIVE',
    total_tasks: 1,
    completed_tasks: 1,
    progress_percentage: 100,
    position: 1,
    tags: [mockTags[2]],
    created_at: '2025-01-06T00:00:00Z',
  },
];

// ========================================
// Mock Tasks
// ========================================

export const mockTasks: Task[] = [
  {
    id: 'task1',
    feature_id: '1',
    feature_title: '사용자 인증 시스템',
    feature_color: '#3b82f6',
    block_id: 'task',
    title: 'JWT 토큰 인증 구현',
    description: 'JWT 기반 인증 시스템 구현',
    assignee: {
      id: 'member1',
      name: '김철수',
      email: 'kim@example.com',
      profile_image: null,
    },
    due_date: '2026-01-12',
    estimated_minutes: 480,
    completed: false,
    position: 0,
    tags: [mockTags[0]],
    checklist_total: 3,
    checklist_completed: 2,
    created_at: '2025-01-07T00:00:00Z',
  },
  {
    id: 'task2',
    feature_id: '1',
    feature_title: '사용자 인증 시스템',
    feature_color: '#3b82f6',
    block_id: 'in-progress',
    title: '소셜 로그인 연동',
    description: 'Google, GitHub 소셜 로그인',
    assignee: {
      id: 'member2',
      name: '이영희',
      email: 'lee@example.com',
      profile_image: null,
    },
    due_date: null,
    estimated_minutes: 240,
    completed: false,
    position: 0,
    tags: [mockTags[1]],
    checklist_total: 0,
    checklist_completed: 0,
    created_at: '2025-01-08T00:00:00Z',
  },
  {
    id: 'task3',
    feature_id: '2',
    feature_title: '대시보드 UI 개선',
    feature_color: '#10b981',
    block_id: 'done',
    title: '차트 컴포넌트 개발',
    description: 'Recharts를 활용한 데이터 시각화',
    assignee: {
      id: 'member3',
      name: '박민수',
      email: 'park@example.com',
      profile_image: null,
    },
    due_date: '2026-01-10',
    estimated_minutes: 360,
    completed: true,
    position: 0,
    tags: [mockTags[2]],
    checklist_total: 2,
    checklist_completed: 2,
    created_at: '2025-01-09T00:00:00Z',
  },
];

// ========================================
// Mock Members
// ========================================

export const mockMembers: BoardMember[] = [
  {
    id: 'member1',
    user: {
      id: 'user1',
      name: '김철수',
      email: 'kim@example.com',
      profile_image: null,
    },
    role: 'OWNER',
    joined_at: '2025-01-01T00:00:00Z',
    invited_by: null,
  },
  {
    id: 'member2',
    user: {
      id: 'user2',
      name: '이영희',
      email: 'lee@example.com',
      profile_image: null,
    },
    role: 'ADMIN',
    joined_at: '2025-01-02T00:00:00Z',
    invited_by: { id: 'user1', name: '김철수' },
  },
  {
    id: 'member3',
    user: {
      id: 'user3',
      name: '박민수',
      email: 'park@example.com',
      profile_image: null,
    },
    role: 'MEMBER',
    joined_at: '2025-01-03T00:00:00Z',
    invited_by: { id: 'user1', name: '김철수' },
  },
];

// ========================================
// Helper Functions
// ========================================

export function loadFromLocalStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (error) {
    console.error(`Failed to load ${key} from localStorage`, error);
    return defaultValue;
  }
}

export function saveToLocalStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Failed to save ${key} to localStorage`, error);
  }
}

export function initializeMockData() {
  const boards = loadFromLocalStorage('kanban_boards', mockBoards);
  const features = loadFromLocalStorage('kanban_features', mockFeatures);
  const tasks = loadFromLocalStorage('kanban_tasks', mockTasks);
  const blocks = loadFromLocalStorage('kanban_blocks', mockBlocks);
  const tags = loadFromLocalStorage('kanban_tags', mockTags);
  const members = loadFromLocalStorage('kanban_members', mockMembers);

  return {
    boards,
    features,
    tasks,
    blocks,
    tags,
    members,
  };
}

// Feature의 색상을 gradient로 변환하는 헬퍼
export function getFeatureGradient(color: string): string {
  // 단색을 gradient로 변환
  return `linear-gradient(135deg, ${color} 0%, ${adjustColor(color, -20)} 100%)`;
}

// 색상 밝기 조절 헬퍼
function adjustColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
