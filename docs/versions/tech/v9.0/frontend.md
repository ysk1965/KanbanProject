# BRIDGE - Frontend 기술 문서 v9.0

> 이 문서는 BRIDGE 서비스의 Frontend 타입 정의, API 클라이언트, 컴포넌트 구조를 정의합니다.
>
> **관련 문서**
> - [아키텍처 개요](./architecture.md)
> - [Backend 기술 문서](./backend.md)

---

## 1. 핵심 변경사항 (v9.0)

### 1.1 신규 컴포넌트
- **DailyChecklistView**: 데일리 체크리스트 메인 뷰
- **DailyChecklistColumn**: 멤버별 체크리스트 컬럼
- **DailyChecklistItem**: 개별 체크리스트 아이템
- **AddDailyChecklistModal**: 체크리스트 추가 모달
- **AlertModal**: 일반 알림 모달

### 1.2 신규 타입
- `DailyChecklistItem`, `DailyChecklistColumn`, `DailyChecklistResponse`

### 1.3 신규 API
- `dailyChecklistAPI` - 데일리 체크리스트 CRUD

### 1.4 라이브러리 추가
- `@dnd-kit/core`, `@dnd-kit/sortable` - 드래그-드롭 정렬

---

## 2. TypeScript 타입 정의

### 2.1 DailyChecklist 타입 ← v9.0 신규

```typescript
export interface DailyChecklistItem {
  id: string;
  checklist_item_id: string | null;
  title: string;
  is_completed: boolean;
  position: number;
  feature: {
    id: string;
    title: string;
    color: string;
  } | null;
  task: {
    id: string;
    title: string;
  } | null;
}

export interface DailyChecklistColumn {
  member: {
    id: string;
    name: string;
    profile_image: string | null;
  };
  items: DailyChecklistItem[];
}

export interface DailyChecklistResponse {
  date: string;
  columns: DailyChecklistColumn[];
}
```

### 2.2 User 타입

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

### 2.3 Task 타입

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

### 2.4 ChecklistItem 타입

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

### 2.5 Weight 타입

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

### 2.6 MilestoneAllocation 타입

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

### 2.7 Statistics 타입

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

### 2.8 Management 타입

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

## 3. API 클라이언트

### 3.1 Daily Checklist API ← v9.0 신규

```typescript
export const dailyChecklistAPI = {
  // 특정 날짜의 데일리 체크리스트 조회
  getDailyChecklist: async (boardId: string, date: string) => {
    return apiClient.get<DailyChecklistResponse>(
      `/boards/${boardId}/daily-checklists?date=${date}`
    );
  },

  // 기존 체크리스트 항목 추가
  addItem: async (
    boardId: string,
    data: { checklist_item_id: string; assigned_date: string }
  ) => {
    return apiClient.post<DailyChecklistItem>(
      `/boards/${boardId}/daily-checklists`,
      data
    );
  },

  // 새 체크리스트 생성하며 추가
  addWithNewItem: async (
    boardId: string,
    data: {
      task_id: string;
      title: string;
      assignee_id: string;
      assigned_date: string;
    }
  ) => {
    return apiClient.post<DailyChecklistItem>(
      `/boards/${boardId}/daily-checklists/with-item`,
      data
    );
  },

  // 우선순위 변경
  updatePosition: async (
    boardId: string,
    itemId: string,
    data: { new_position: number }
  ) => {
    return apiClient.put<{ message: string }>(
      `/boards/${boardId}/daily-checklists/${itemId}/position`,
      data
    );
  },

  // 데일리 체크리스트에서 제거
  removeItem: async (boardId: string, itemId: string) => {
    return apiClient.delete<{ message: string }>(
      `/boards/${boardId}/daily-checklists/${itemId}`
    );
  },
};
```

### 3.2 Auth API

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

  // 이메일 인증
  verifyEmail: async (token: string) => {
    return apiClient.get<{ message: string }>(`/auth/verify-email?token=${token}`);
  },

  resendVerification: async (email: string) => {
    return apiClient.post<{ message: string }>('/auth/resend-verification', { email });
  },

  // 비밀번호 재설정
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

### 3.3 User API

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

### 3.4 Weight API

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

### 3.5 Statistics API

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

---

## 4. Context 구조

### 4.1 ThemeContext

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

### 4.2 AuthContext

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

## 5. 핵심 컴포넌트

### 5.1 DailyChecklistView ← v9.0 신규

```typescript
interface DailyChecklistViewProps {
  boardId: string;
  members: BoardMember[];
  milestones: Milestone[];
  isPremium: boolean;
}

export const DailyChecklistView: React.FC<DailyChecklistViewProps> = ({
  boardId,
  members,
  milestones,
  isPremium,
}) => {
  const [date, setDate] = useState<Date>(new Date());
  const [data, setData] = useState<DailyChecklistResponse | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const isReadOnly = isBefore(date, startOfToday());

  const loadData = async () => {
    const response = await dailyChecklistAPI.getDailyChecklist(
      boardId,
      format(date, 'yyyy-MM-dd')
    );
    setData(response);
  };

  useEffect(() => {
    loadData();
  }, [boardId, date]);

  const handleAddClick = (memberId: string) => {
    if (isReadOnly) return;
    setSelectedMemberId(memberId);
    setIsAddModalOpen(true);
  };

  const handlePositionChange = async (itemId: string, newPosition: number) => {
    if (isReadOnly) return;
    await dailyChecklistAPI.updatePosition(boardId, itemId, { new_position: newPosition });
    loadData();
  };

  const handleRemove = async (itemId: string) => {
    if (isReadOnly) return;
    await dailyChecklistAPI.removeItem(boardId, itemId);
    loadData();
  };

  return (
    <div className="h-full flex flex-col">
      {/* 날짜 네비게이션 */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <button onClick={() => setDate(prev => subDays(prev, 1))}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-lg font-bold">{format(date, 'yyyy년 MM월 dd일')}</span>
          <button onClick={() => setDate(prev => addDays(prev, 1))}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <button
          onClick={() => setDate(new Date())}
          className="px-4 py-2 bg-white/5 rounded-lg hover:bg-white/10"
        >
          오늘
        </button>
      </div>

      {/* 읽기 전용 알림 */}
      {isReadOnly && (
        <div className="px-4 py-2 bg-amber-500/20 text-amber-400 text-sm">
          과거 날짜는 수정할 수 없습니다
        </div>
      )}

      {/* 멤버 컬럼 */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4">
          {data?.columns.map(column => (
            <DailyChecklistColumn
              key={column.member.id}
              column={column}
              isReadOnly={isReadOnly}
              onAddClick={() => handleAddClick(column.member.id)}
              onPositionChange={handlePositionChange}
              onRemove={handleRemove}
            />
          ))}

          {/* 멤버 없음 안내 */}
          {(!data?.columns || data.columns.length === 0) && (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              멤버를 초대하여 시작하세요
            </div>
          )}
        </div>
      </div>

      {/* 추가 모달 */}
      {isAddModalOpen && (
        <AddDailyChecklistModal
          boardId={boardId}
          memberId={selectedMemberId!}
          date={format(date, 'yyyy-MM-dd')}
          milestones={milestones}
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={() => {
            setIsAddModalOpen(false);
            loadData();
          }}
        />
      )}
    </div>
  );
};
```

### 5.2 DailyChecklistColumn ← v9.0 신규

```typescript
interface DailyChecklistColumnProps {
  column: DailyChecklistColumn;
  isReadOnly: boolean;
  onAddClick: () => void;
  onPositionChange: (itemId: string, newPosition: number) => void;
  onRemove: (itemId: string) => void;
}

export const DailyChecklistColumn: React.FC<DailyChecklistColumnProps> = ({
  column,
  isReadOnly,
  onAddClick,
  onPositionChange,
  onRemove,
}) => {
  const [items, setItems] = useState(column.items);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    setItems(column.items);
  }, [column.items]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex(item => item.id === active.id);
    const newIndex = items.findIndex(item => item.id === over.id);

    // Optimistic update
    const newItems = arrayMove(items, oldIndex, newIndex);
    setItems(newItems);

    try {
      await onPositionChange(active.id as string, newIndex);
    } catch (error) {
      // Rollback
      setItems(column.items);
    }
  };

  return (
    <div className="flex flex-col bg-bridge-obsidian rounded-xl border border-white/10 p-4 min-w-[280px] max-w-[280px]">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-4">
        <img
          src={column.member.profile_image || '/default-avatar.png'}
          className="w-8 h-8 rounded-full"
          alt={column.member.name}
        />
        <span className="text-white font-medium">{column.member.name}</span>
        <span className="text-slate-500 text-sm">({items.length})</span>
      </div>

      {/* 아이템 목록 */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2 flex-1">
            {items.map(item => (
              <DailyChecklistItem
                key={item.id}
                item={item}
                isReadOnly={isReadOnly}
                onRemove={() => onRemove(item.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* 추가 버튼 */}
      {!isReadOnly && (
        <button
          onClick={onAddClick}
          className="mt-4 flex items-center justify-center gap-2 py-2
            text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>추가</span>
        </button>
      )}
    </div>
  );
};
```

### 5.3 DailyChecklistItem ← v9.0 신규

```typescript
interface DailyChecklistItemProps {
  item: DailyChecklistItem;
  isReadOnly: boolean;
  onRemove: () => void;
}

export const DailyChecklistItem: React.FC<DailyChecklistItemProps> = ({
  item,
  isReadOnly,
  onRemove,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: isReadOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-white/5 rounded-lg border
        ${item.checklist_item_id ? 'border-white/10' : 'border-dashed border-white/20'}
        ${!isReadOnly ? 'hover:border-white/20 cursor-grab active:cursor-grabbing' : ''}
        transition-all`}
    >
      {/* 드래그 핸들 */}
      {!isReadOnly && (
        <div {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4 text-slate-500" />
        </div>
      )}

      {/* Feature 색상 바 */}
      {item.feature && (
        <div
          className="w-1 h-8 rounded-full"
          style={{ backgroundColor: item.feature.color }}
        />
      )}

      {/* 체크리스트 내용 */}
      <div className="flex-1 min-w-0">
        <span className={`text-sm truncate ${item.is_completed ? 'text-slate-500 line-through' : 'text-white'}`}>
          {item.title}
        </span>
        {item.task && (
          <span className="text-slate-500 text-xs ml-2 truncate">
            ({item.task.title})
          </span>
        )}
      </div>

      {/* 완료 상태 표시 */}
      {item.is_completed && (
        <Check className="h-4 w-4 text-emerald-400" />
      )}

      {/* 삭제 버튼 */}
      {!isReadOnly && (
        <button
          onClick={onRemove}
          className="text-slate-500 hover:text-red-400 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
```

### 5.4 AddDailyChecklistModal ← v9.0 신규

```typescript
interface AddDailyChecklistModalProps {
  boardId: string;
  memberId: string;
  date: string;
  milestones: Milestone[];
  onClose: () => void;
  onSuccess: () => void;
}

export const AddDailyChecklistModal: React.FC<AddDailyChecklistModalProps> = ({
  boardId,
  memberId,
  date,
  milestones,
  onClose,
  onSuccess,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [groupedItems, setGroupedItems] = useState<GroupedChecklistItems[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [newItemTitle, setNewItemTitle] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // 체크리스트 데이터 로딩 및 그룹화
  useEffect(() => {
    loadChecklistItems();
  }, [selectedMilestoneId, memberId]);

  const loadChecklistItems = async () => {
    // Feature → Task → ChecklistItem 계층 구조로 그룹화
    // ...
  };

  const handleAddExisting = async (checklistItemId: string) => {
    try {
      await dailyChecklistAPI.addItem(boardId, {
        checklist_item_id: checklistItemId,
        assigned_date: date,
      });
      setAddedIds(prev => new Set(prev).add(checklistItemId));
    } catch (error) {
      if (error.message.includes('이미 추가')) {
        // 이미 추가된 항목
      }
    }
  };

  const handleAddNew = async () => {
    if (!newItemTitle.trim() || !selectedTaskId) return;

    await dailyChecklistAPI.addWithNewItem(boardId, {
      task_id: selectedTaskId,
      title: newItemTitle.trim(),
      assignee_id: memberId,
      assigned_date: date,
    });

    setNewItemTitle('');
    onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-bridge-obsidian rounded-2xl border border-white/10 p-6 max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">체크리스트 항목 추가</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 마일스톤 필터 */}
        <div className="flex items-center gap-4 mb-4">
          <span className="text-slate-400 text-sm">마일스톤:</span>
          <select
            value={selectedMilestoneId || ''}
            onChange={e => setSelectedMilestoneId(e.target.value || null)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
          >
            <option value="">전체</option>
            {milestones.map(m => (
              <option key={m.id} value={m.id}>{m.title}</option>
            ))}
          </select>
        </div>

        {/* 검색 */}
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="검색..."
          className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white mb-4"
        />

        {/* 체크리스트 목록 */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {groupedItems.map(feature => (
            <div key={feature.id}>
              <div className="text-sm font-medium text-slate-300 mb-2">
                {feature.title}
              </div>
              {feature.tasks.map(task => (
                <div key={task.id} className="ml-4 mb-2">
                  <div className="text-xs text-slate-500 mb-1">{task.title}</div>
                  {task.checklists.map(checklist => (
                    <div
                      key={checklist.id}
                      className={`flex items-center justify-between p-2 rounded-lg
                        ${addedIds.has(checklist.id) ? 'bg-white/5 opacity-50' : 'hover:bg-white/5 cursor-pointer'}`}
                      onClick={() => !addedIds.has(checklist.id) && handleAddExisting(checklist.id)}
                    >
                      <span className="text-white text-sm">{checklist.title}</span>
                      {addedIds.has(checklist.id) ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Plus className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 새 항목 추가 */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newItemTitle}
              onChange={e => setNewItemTitle(e.target.value)}
              placeholder="새 체크리스트 항목"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-white text-sm"
            />
            <button
              onClick={handleAddNew}
              disabled={!newItemTitle.trim() || !selectedTaskId}
              className="px-4 py-2 bg-bridge-accent text-white rounded-lg disabled:opacity-50"
            >
              추가
            </button>
          </div>
        </div>

        {/* 푸터 */}
        <div className="mt-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white">
            닫기
          </button>
          <button onClick={onSuccess} className="px-4 py-2 bg-bridge-accent text-white rounded-lg">
            완료
          </button>
        </div>
      </div>
    </div>
  );
};
```

### 5.5 ErrorBoundary

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

---

## 6. 유틸리티 함수

### 6.1 시간 포맷팅

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

### 6.2 상태 색상

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

### 6.3 쿼리 스트링 빌더

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
| v9.0 | 2026-01-17 | DailyChecklist 타입, dailyChecklistAPI, DailyChecklistView, DailyChecklistColumn, DailyChecklistItem, AddDailyChecklistModal, AlertModal, @dnd-kit 통합 |

---

**문서 버전**: 9.0
**최종 수정**: 2026년 1월 17일
