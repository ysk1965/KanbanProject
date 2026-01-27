# BRIDGE - Frontend 기술 문서 v8.0

> 이 문서는 BRIDGE 서비스의 Frontend 타입 정의, API 클라이언트, 컴포넌트 구조를 정의합니다.
>
> **관련 문서**
> - [아키텍처 개요](./architecture.md)
> - [Backend 기술 문서](./backend.md)

---

## 1. TypeScript 타입 정의

### 1.1 User 타입

```typescript
export interface User {
  id: string;
  email: string;
  name: string;
  profile_image: string | null;
  email_verified?: boolean;
  theme?: 'dark' | 'light';
}
```

### 1.2 Task 타입

```typescript
export interface Task {
  id: string;
  feature_id: string;
  feature_title: string;
  feature_color: string;
  block_id: string;
  block_name?: string;
  title: string;
  description?: string;
  start_date: string | null;
  due_date: string | null;
  estimated_minutes: number | null;
  completed: boolean;
  position: number;
  tags: Tag[];
  checklist_total?: number;
  checklist_completed?: number;
  checklist_version?: number;
  created_by?: { id: string; name: string };
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  // Note: assignee 필드 없음 - ChecklistItem.assignee로 대체
}
```

### 1.3 ChecklistItem 타입

```typescript
export interface ChecklistItem {
  id: string;
  task_id: string;
  title: string;
  is_completed: boolean;
  position: number;
  assignee?: {
    id: string;
    name: string;
    profile_image: string | null;
  } | null;
  start_date: string | null;
  due_date: string | null;
  done_date: string | null;
  created_at?: string;
  updated_at?: string;
}
```

### 1.4 Weight 타입

```typescript
export interface WeightLevel {
  id: string;
  name: string;
  weight: number;
  color: string;
  position: number;
  is_default: boolean;
}

export interface BoardWeightSettings {
  board_id: string;
  levels: WeightLevel[];
  default_level_id: string;
}

export interface TaskWeight {
  task_id: string;
  weight_level: WeightLevel;
}
```

### 1.5 MilestoneAllocation 타입

```typescript
export type MilestoneAllocationStatus = 'OVER' | 'UNDER' | 'NORMAL';

export interface MilestoneAllocation {
  id: string;
  milestone_id: string;
  member: {
    id: string;
    name: string;
    profile_image: string | null;
  };
  working_days: number;
  total_allocated_hours: number;
  actual_worked_hours?: number;
  difference?: number;
  status?: MilestoneAllocationStatus;
}
```

### 1.6 Statistics 타입

```typescript
export interface ImpactStatistics {
  total_impact_score: number;
  average_weight: number;
  impact_by_weight_level: Record<string, number>;
  member_impacts: MemberImpact[];
}

export interface MemberImpact {
  member: MemberInfo;
  impact_score: number;
  contribution_percentage: number;
  high_priority_completed: number;
}

export interface BoardStatistics {
  summary: StatisticsSummary;
  time_statistics: TimeStatistics;
  task_statistics: TaskStatistics;
  member_statistics: MemberStatistics[];
  feature_statistics: FeatureStatistics[];
  tag_statistics: TagStatistics[];
  impact_statistics: ImpactStatistics;
  daily_trends: DailyTrend[];
}

export interface StatisticsFilter {
  start_date?: string;
  end_date?: string;
  milestone_id?: string;
  feature_ids?: string[];
  member_ids?: string[];
  tag_ids?: string[];
}
```

### 1.7 Management 타입

```typescript
export type MilestoneHealthStatus = 'ON_TRACK' | 'SLOW' | 'AT_RISK' | 'OVERDUE';
export type MemberProductivityStatus = 'NORMAL' | 'OVERWORKED' | 'RELAXED';

export interface MilestoneHealth {
  milestone: MilestoneInfo;
  progress_percentage: number;
  estimated_completion_date: string | null;
  status: MilestoneHealthStatus;
  days_remaining: number;
  days_overdue: number;
  velocity: VelocityInfo;
  burndown: BurndownPoint[];
  feature_summary: FeatureSummary;
  tasks: MilestoneTask[];
}

export interface MemberProductivity {
  member: ManagementMemberInfo;
  assigned_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  completion_rate: number;
  total_checklists: number;
  completed_checklists: number;
  checklist_completion_rate: number;
  status: MemberProductivityStatus;
  total_estimated_minutes: number | null;
  total_actual_minutes: number | null;
  time_efficiency: number | null;
}

export interface ManagementStatistics {
  milestone_health: MilestoneHealth[];
  team_productivity: MemberProductivity[];
  delayed_items: DelayedItems;
  summary: ManagementSummary;
  settings: ManagementSettings;
}
```

---

## 2. API 클라이언트

### 2.1 Auth API

```typescript
export const authAPI = {
  signup: async (data: { email: string; password: string; name: string }) => {
    return apiClient.post<TokenResponse>('/auth/signup', data);
  },

  login: async (data: { email: string; password: string }) => {
    return apiClient.post<TokenResponse>('/auth/login', data);
  },

  googleLogin: async (data: { idToken: string }) => {
    return apiClient.post<TokenResponse>('/auth/google', data);
  },

  refresh: async (refreshToken: string) => {
    return apiClient.post<TokenResponse>('/auth/refresh', { refreshToken });
  },

  logout: async () => {
    return apiClient.post<{ message: string }>('/auth/logout');
  },

  // v8.0: 이메일 인증
  verifyEmail: async (token: string) => {
    return apiClient.get<{ message: string }>(`/auth/verify-email?token=${token}`);
  },

  resendVerification: async (email: string) => {
    return apiClient.post<{ message: string }>('/auth/resend-verification', { email });
  },

  // v8.0: 비밀번호 재설정
  forgotPassword: async (email: string) => {
    return apiClient.post<{ message: string }>('/auth/forgot-password', { email });
  },

  resetPassword: async (token: string, newPassword: string) => {
    return apiClient.post<{ message: string }>('/auth/reset-password', {
      token,
      newPassword,
    });
  },
};
```

### 2.2 User API

```typescript
export const userAPI = {
  getMe: async () => {
    return apiClient.get<UserResponse>('/users/me');
  },

  updateProfile: async (data: {
    name?: string;
    profileImage?: string;
    theme?: 'dark' | 'light';
  }) => {
    return apiClient.patch<UserResponse>('/users/me', data);
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    return apiClient.post<{ message: string }>('/users/me/password', {
      currentPassword,
      newPassword,
    });
  },

  deleteAccount: async () => {
    return apiClient.delete<{ message: string }>('/users/me');
  },
};
```

### 2.3 Weight API

```typescript
export const weightAPI = {
  getWeightLevels: async (boardId: string) => {
    return apiClient.get<BoardWeightSettings>(`/boards/${boardId}/weight-levels`);
  },

  updateWeightLevels: async (
    boardId: string,
    data: {
      levels: Array<{
        id?: string;
        name: string;
        weight: number;
        color: string;
        position: number;
      }>;
      default_level_id: string;
    }
  ) => {
    return apiClient.put<BoardWeightSettings>(`/boards/${boardId}/weight-levels`, data);
  },

  setTaskWeight: async (boardId: string, taskId: string, weightLevelId: string) => {
    return apiClient.post<TaskWeight>(`/boards/${boardId}/tasks/${taskId}/weight`, {
      weight_level_id: weightLevelId,
    });
  },

  getTaskWeight: async (boardId: string, taskId: string) => {
    return apiClient.get<TaskWeight>(`/boards/${boardId}/tasks/${taskId}/weight`);
  },
};
```

### 2.4 Statistics API

```typescript
export const statisticsAPI = {
  getBoardStatistics: async (boardId: string, params?: StatisticsFilter) => {
    const queryString = buildQueryString(params);
    return apiClient.get<BoardStatistics>(
      `/boards/${boardId}/statistics${queryString ? `?${queryString}` : ''}`
    );
  },

  getPersonalStatistics: async (boardId: string, params?: StatisticsFilter) => {
    const queryString = buildQueryString(params);
    return apiClient.get<PersonalStatistics>(
      `/boards/${boardId}/statistics/personal${queryString ? `?${queryString}` : ''}`
    );
  },

  getManagementStatistics: async (
    boardId: string,
    params?: {
      milestone_id?: string;
      stagnant_task_days?: number;
      stuck_checklist_days?: number;
    }
  ) => {
    const queryString = buildQueryString(params);
    return apiClient.get<ManagementStatistics>(
      `/boards/${boardId}/statistics/management${queryString ? `?${queryString}` : ''}`
    );
  },
};
```

### 2.5 Milestone Allocation API

```typescript
export const milestoneAPI = {
  getAllocations: async (boardId: string, milestoneId: string) => {
    return apiClient.get<{ allocations: MilestoneAllocation[] }>(
      `/boards/${boardId}/milestones/${milestoneId}/allocations`
    );
  },

  createAllocation: async (
    boardId: string,
    milestoneId: string,
    data: {
      member_id: string;
      working_days: number;
      total_allocated_hours: number;
    }
  ) => {
    return apiClient.post<MilestoneAllocation>(
      `/boards/${boardId}/milestones/${milestoneId}/allocations`,
      data
    );
  },

  updateAllocation: async (
    boardId: string,
    milestoneId: string,
    allocationId: string,
    data: {
      working_days?: number;
      total_allocated_hours?: number;
    }
  ) => {
    return apiClient.put<MilestoneAllocation>(
      `/boards/${boardId}/milestones/${milestoneId}/allocations/${allocationId}`,
      data
    );
  },

  deleteAllocation: async (boardId: string, milestoneId: string, allocationId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/milestones/${milestoneId}/allocations/${allocationId}`
    );
  },
};
```

---

## 3. Context 구조

### 3.1 ThemeContext

```typescript
interface ThemeContextType {
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  isDark: boolean;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
```

### 3.2 AuthContext

```typescript
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isEmailVerified: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateCurrentUser: (updates: Partial<User>) => void;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isEmailVerified = useMemo(() => {
    return user?.email_verified ?? false;
  }, [user]);

  const updateCurrentUser = useCallback((updates: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  // ... 나머지 구현

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      isEmailVerified,
      login,
      logout,
      updateCurrentUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
```

---

## 4. 핵심 컴포넌트

### 4.1 ErrorBoundary

```typescript
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-bridge-dark">
          <h1 className="text-2xl font-bold text-white mb-4">오류가 발생했습니다</h1>
          <p className="text-slate-400 mb-6">{this.state.error?.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-bridge-accent text-white rounded-xl"
          >
            새로고침
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### 4.2 SettingsPage

```typescript
export const SettingsPage: React.FC = () => {
  const { user, updateCurrentUser } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold text-white">설정</h1>

      {/* 프로필 섹션 */}
      <ProfileSection user={user} onUpdate={updateCurrentUser} />

      {/* 테마 섹션 */}
      <div className="bg-bridge-obsidian rounded-2xl p-6 border border-white/10">
        <h2 className="text-lg font-bold text-white mb-4">테마 설정</h2>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">다크 모드</span>
          <Switch
            checked={theme === 'dark'}
            onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
          />
        </div>
      </div>

      {/* 비밀번호 변경 섹션 */}
      <PasswordSection />

      {/* 계정 삭제 섹션 */}
      <DeleteAccountSection />
    </div>
  );
};
```

### 4.3 StatisticsView

```typescript
interface StatisticsViewProps {
  boardId: string;
  milestones: Milestone[];
  members: BoardMember[];
}

export const StatisticsView: React.FC<StatisticsViewProps> = ({
  boardId,
  milestones,
  members,
}) => {
  const [data, setData] = useState<BoardStatistics | null>(null);
  const [filter, setFilter] = useState<StatisticsFilter>({});
  const [activeTab, setActiveTab] = useState<
    'time' | 'tasks' | 'impact' | 'members' | 'trends'
  >('time');

  useEffect(() => {
    loadStatistics();
  }, [boardId, filter]);

  const loadStatistics = async () => {
    const response = await statisticsAPI.getBoardStatistics(boardId, filter);
    setData(response);
  };

  return (
    <div className="space-y-6">
      <SummaryCards data={data?.summary} />
      <FilterBar
        milestones={milestones}
        members={members}
        filter={filter}
        onFilterChange={setFilter}
      />
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'time' && <TimeAnalysis data={data?.time_statistics} />}
      {activeTab === 'tasks' && <TaskAnalysis data={data?.task_statistics} />}
      {activeTab === 'impact' && <ImpactAnalysis data={data?.impact_statistics} />}
      {activeTab === 'members' && <MemberAnalysis data={data?.member_statistics} />}
      {activeTab === 'trends' && <TrendsChart data={data?.daily_trends} />}
    </div>
  );
};
```

### 4.4 ManagementView

```typescript
interface ManagementViewProps {
  boardId: string;
  milestones: Milestone[];
  members: BoardMember[];
  onTaskClick?: (taskId: string) => void;
  refreshTrigger?: number;
}

export const ManagementView: React.FC<ManagementViewProps> = ({
  boardId,
  milestones,
  members,
  onTaskClick,
  refreshTrigger,
}) => {
  const [data, setData] = useState<ManagementStatistics | null>(null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    stagnant_task_days: 3,
    stuck_checklist_days: 2,
  });
  const [activeTab, setActiveTab] = useState<'health' | 'productivity' | 'delayed'>('health');

  // 구조:
  // - 요약 카드 (건강점수, 마일스톤, 팀원, 지연항목)
  // - 탭 네비게이션
  // - 탭 컨텐츠
  //   - MilestoneHealthSection (번다운 차트, Task 목록)
  //   - TeamProductivitySection (팀원별 통계)
  //   - DelayedItemsSection (지연 항목)
};
```

---

## 5. 유틸리티 함수

### 5.1 시간 포맷팅

```typescript
// 전체 형식: "2시간 30분"
export const formatMinutes = (minutes: number | null | undefined): string => {
  if (minutes == null || minutes === 0) return '-';
  const totalMins = Math.round(minutes);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) return `${mins}분`;
  if (mins === 0) return `${hours}시간`;
  return `${hours}시간 ${mins}분`;
};

// 축약 형식: "2h 30m"
export const formatMinutesShort = (minutes: number | null | undefined): string => {
  if (minutes == null || minutes === 0) return '-';
  const totalMins = Math.round(minutes);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};
```

### 5.2 상태 색상

```typescript
export const getStatusColor = (status: MemberProductivityStatus) => {
  switch (status) {
    case 'NORMAL':
      return 'text-emerald-400 bg-emerald-500/20';
    case 'OVERWORKED':
      return 'text-red-400 bg-red-500/20';
    case 'RELAXED':
      return 'text-blue-400 bg-blue-500/20';
    default:
      return 'text-slate-400 bg-slate-500/20';
  }
};

export const getMilestoneHealthColor = (status: MilestoneHealthStatus) => {
  switch (status) {
    case 'ON_TRACK':
      return 'text-emerald-400 bg-emerald-500/20';
    case 'SLOW':
      return 'text-amber-400 bg-amber-500/20';
    case 'AT_RISK':
      return 'text-red-400 bg-red-500/20';
    case 'OVERDUE':
      return 'text-red-500 bg-red-600/20';
    default:
      return 'text-slate-400 bg-slate-500/20';
  }
};

export const getWeightLevelColor = (color: string) => {
  const colors: Record<string, string> = {
    slate: 'text-slate-400 bg-slate-500/20',
    blue: 'text-blue-400 bg-blue-500/20',
    amber: 'text-amber-400 bg-amber-500/20',
    red: 'text-red-400 bg-red-500/20',
  };
  return colors[color] || colors.slate;
};
```

### 5.3 쿼리 스트링 빌더

```typescript
export const buildQueryString = (params?: Record<string, any>): string => {
  if (!params) return '';

  const queryString = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if (Array.isArray(value)) {
        value.forEach(v => queryString.append(key, v));
      } else {
        queryString.append(key, String(value));
      }
    }
  });

  return queryString.toString();
};
```

---

## 변경 이력

| 버전 | 날짜 | 주요 변경 |
|------|------|----------|
| v7.0 | 2026-01-13 | Task.assignee 제거, ManagementStatistics 타입, MilestoneAllocation 타입 |
| v8.0 | 2026-01-15 | ThemeContext, Weight 타입, ImpactStatistics, ErrorBoundary, SettingsPage, StatisticsView |

---

**문서 버전**: 8.0
**최종 수정**: 2026년 1월 15일
