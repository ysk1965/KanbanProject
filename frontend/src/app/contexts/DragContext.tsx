import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { Task } from '../types';

interface TaskPlaceholder {
  blockId: string;
  index: number;
}

// 드래그 시작/종료 시에만 변경되는 상태
interface TaskDragState {
  draggedTask: Task | null;
  sourceBlockId: string | null;
}

// dragover 중 빈번히 변경되는 상태 — 별도 컨텍스트로 분리해
// placeholder 이동 시 카드(DraggableCard)가 재렌더되지 않도록 한다
interface DragActions {
  startTaskDrag: (task: Task, blockId: string) => void;
  updateTaskPlaceholder: (blockId: string, index: number) => void;
  clearTaskPlaceholder: () => void;
  endTaskDrag: () => void;
}

const initialDragState: TaskDragState = {
  draggedTask: null,
  sourceBlockId: null,
};

const TaskDragStateContext = createContext<TaskDragState | null>(null);
const PlaceholderContext = createContext<TaskPlaceholder | null | undefined>(
  undefined,
);
const DragActionsContext = createContext<DragActions | null>(null);

export function DragProvider({ children }: { children: ReactNode }) {
  const [dragState, setDragState] = useState<TaskDragState>(initialDragState);
  const [placeholder, setPlaceholder] = useState<TaskPlaceholder | null>(null);

  const startTaskDrag = useCallback((task: Task, blockId: string) => {
    setDragState({ draggedTask: task, sourceBlockId: blockId });
  }, []);

  const updateTaskPlaceholder = useCallback(
    (blockId: string, index: number) => {
      // 동일 위치면 참조 유지 → 불필요한 재렌더 방지
      setPlaceholder((prev) =>
        prev && prev.blockId === blockId && prev.index === index
          ? prev
          : { blockId, index },
      );
    },
    [],
  );

  const clearTaskPlaceholder = useCallback(() => {
    setPlaceholder(null);
  }, []);

  const endTaskDrag = useCallback(() => {
    setDragState(initialDragState);
    setPlaceholder(null);
  }, []);

  const actions = useMemo(
    () => ({
      startTaskDrag,
      updateTaskPlaceholder,
      clearTaskPlaceholder,
      endTaskDrag,
    }),
    [startTaskDrag, updateTaskPlaceholder, clearTaskPlaceholder, endTaskDrag],
  );

  return (
    <DragActionsContext.Provider value={actions}>
      <TaskDragStateContext.Provider value={dragState}>
        <PlaceholderContext.Provider value={placeholder}>
          {children}
        </PlaceholderContext.Provider>
      </TaskDragStateContext.Provider>
    </DragActionsContext.Provider>
  );
}

export function useTaskDragState() {
  const context = useContext(TaskDragStateContext);
  if (!context) {
    throw new Error('useTaskDragState must be used within a DragProvider');
  }
  return context;
}

export function useTaskPlaceholder() {
  const context = useContext(PlaceholderContext);
  if (context === undefined) {
    throw new Error('useTaskPlaceholder must be used within a DragProvider');
  }
  return context;
}

export function useDragActions() {
  const context = useContext(DragActionsContext);
  if (!context) {
    throw new Error('useDragActions must be used within a DragProvider');
  }
  return context;
}
