import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Task } from '../types';

interface TaskPlaceholder {
  blockId: string;
  index: number;
}

interface DragState {
  // Task 드래그 상태
  draggedTask: Task | null;
  sourceBlockId: string | null;
  taskPlaceholder: TaskPlaceholder | null;
}

interface DragContextValue {
  state: DragState;
  // Task 드래그 액션
  startTaskDrag: (task: Task, blockId: string) => void;
  updateTaskPlaceholder: (blockId: string, index: number) => void;
  clearTaskPlaceholder: () => void;
  endTaskDrag: () => void;
}

const initialState: DragState = {
  draggedTask: null,
  sourceBlockId: null,
  taskPlaceholder: null,
};

const DragContext = createContext<DragContextValue | null>(null);

export function DragProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DragState>(initialState);

  // Task 드래그 액션
  const startTaskDrag = useCallback((task: Task, blockId: string) => {
    setState((prev) => ({
      ...prev,
      draggedTask: task,
      sourceBlockId: blockId,
    }));
  }, []);

  const updateTaskPlaceholder = useCallback((blockId: string, index: number) => {
    setState((prev) => ({
      ...prev,
      taskPlaceholder: { blockId, index },
    }));
  }, []);

  const clearTaskPlaceholder = useCallback(() => {
    setState((prev) => ({
      ...prev,
      taskPlaceholder: null,
    }));
  }, []);

  const endTaskDrag = useCallback(() => {
    setState((prev) => ({
      ...prev,
      draggedTask: null,
      sourceBlockId: null,
      taskPlaceholder: null,
    }));
  }, []);

  return (
    <DragContext.Provider
      value={{
        state,
        startTaskDrag,
        updateTaskPlaceholder,
        clearTaskPlaceholder,
        endTaskDrag,
      }}
    >
      {children}
    </DragContext.Provider>
  );
}

export function useDragContext() {
  const context = useContext(DragContext);
  if (!context) {
    throw new Error('useDragContext must be used within a DragProvider');
  }
  return context;
}
