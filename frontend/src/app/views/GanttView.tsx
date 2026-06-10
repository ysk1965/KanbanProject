import {
  useState,
  useEffect,
  Dispatch,
  SetStateAction,
  RefObject,
} from "react";
import {
  Feature,
  Task,
  Tag,
  Milestone,
  TaskDependency,
} from "../types";
import { KanbanFilterToolbar } from "../components/KanbanFilterToolbar";
import { WeeklyScheduleView } from "../components/WeeklyScheduleView";
import { FilterOptions } from "../components/FilterModal";
import { BoardMember as ShareBoardMember } from "../components/ShareBoardModal";
import { taskService, taskDependencyService } from "../utils/services";

interface GanttViewProps {
  boardId: string;
  searchInputRef: RefObject<HTMLInputElement>;
  filterOptions: FilterOptions;
  onFilterChange: (options: FilterOptions) => void;
  features: Feature[];
  filteredFeatures: Feature[];
  tasks: Task[];
  filteredTasks: Task[];
  setTasks: Dispatch<SetStateAction<Task[]>>;
  tags: Tag[];
  boardMembersData: ShareBoardMember[];
  milestones: Milestone[];
  selectedMilestoneId: string;
  canEdit: boolean;
  onFeatureClick: (feature: Feature) => void;
  onTaskClick: (task: Task) => void;
}

// 간트(주간 일정) 뷰 — 태스크 의존성 상태/로드를 자체 소유
export function GanttView({
  boardId,
  searchInputRef,
  filterOptions,
  onFilterChange,
  features,
  filteredFeatures,
  tasks,
  filteredTasks,
  setTasks,
  tags,
  boardMembersData,
  milestones,
  selectedMilestoneId,
  canEdit,
  onFeatureClick,
  onTaskClick,
}: GanttViewProps) {
  const [taskDependencies, setTaskDependencies] = useState<TaskDependency[]>(
    [],
  );

  // 태스크 의존성 로드 (간트 뷰 마운트 시)
  useEffect(() => {
    if (boardId) {
      taskDependencyService
        .getByBoard(boardId)
        .then(setTaskDependencies)
        .catch(() => setTaskDependencies([]));
    }
  }, [boardId]);

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <KanbanFilterToolbar
        ref={searchInputRef}
        filterOptions={filterOptions}
        onFilterChange={onFilterChange}
        features={features}
        tags={tags}
        boardMembersData={boardMembersData}
        tasks={tasks}
        boardId={boardId}
        canEdit={canEdit}
      />
      <WeeklyScheduleView
        boardId={boardId}
        features={filteredFeatures}
        tasks={filteredTasks}
        milestones={milestones}
        onViewFeature={(featureId) => {
          const feature = features.find((f) => f.id === featureId);
          if (feature) onFeatureClick(feature);
        }}
        onViewTask={(taskId) => {
          const task = tasks.find((t) => t.id === taskId);
          if (task) onTaskClick(task);
        }}
        onUpdateTaskDates={async (taskId, startDate, endDate) => {
          try {
            const updatedTask = await taskService.updateTaskDates(
              boardId,
              taskId,
              {
                start_date: startDate,
                end_date: endDate,
              },
            );
            setTasks((prev) =>
              prev.map((t) =>
                t.id === taskId
                  ? {
                      ...t,
                      start_date: updatedTask.start_date,
                      due_date: updatedTask.due_date,
                    }
                  : t,
              ),
            );
          } catch (error) {
            console.error("Failed to update task dates:", error);
          }
        }}
        selectedMilestoneId={selectedMilestoneId}
        onSaveBaseline={async () => {
          try {
            await taskService.saveBaseline(boardId);
            const updatedTasks = await taskService.getTasks(boardId);
            setTasks(updatedTasks);
          } catch (error) {
            console.error("Failed to save baseline:", error);
          }
        }}
        dependencies={taskDependencies}
        onCreateDependency={async (predecessorId, successorId) => {
          try {
            const newDep = await taskDependencyService.create(
              boardId,
              predecessorId,
              successorId,
            );
            setTaskDependencies((prev) => [...prev, newDep]);
          } catch (error) {
            console.error("Failed to create dependency:", error);
          }
        }}
        onDeleteDependency={async (dependencyId) => {
          try {
            await taskDependencyService.delete(boardId, dependencyId);
            setTaskDependencies((prev) =>
              prev.filter((d) => d.id !== dependencyId),
            );
          } catch (error) {
            console.error("Failed to delete dependency:", error);
          }
        }}
      />
    </main>
  );
}
