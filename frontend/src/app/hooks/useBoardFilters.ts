import { useMemo } from 'react';
import { Feature, Task, Block, ChecklistItem } from '../types';
import { FilterOptions } from '../components/FilterModal';
import { getTodayDateString } from '../utils/dateUtils';
import { isChecklistOverdue } from '../utils/checklistStatus';

/**
 * 태스크가 '지연'인지 — 태스크 자신의 마감이 지났거나, 미완료 체크리스트 항목 중 마감이 지난 게 있으면 지연.
 * 자동 보고서가 세는 지연은 체크리스트 단위라, 체크리스트를 포함해야 보고서와 같은 것을 가리킨다.
 */
function isTaskOverdue(
  task: Task,
  checklists: ChecklistItem[],
  today: string
): boolean {
  if (!task.completed && task.due_date && task.due_date < today) return true;
  return checklists.some((ci) => isChecklistOverdue(ci, today));
}

export function useBoardFilters(
  features: Feature[],
  tasks: Task[],
  blocks: Block[],
  filterOptions: FilterOptions,
  checklistDataMap: { [taskId: string]: ChecklistItem[] }
) {
  const sortedBlocks = useMemo(() => {
    return [...blocks].sort((a, b) => a.position - b.position);
  }, [blocks]);

  const filteredFeatures = useMemo(() => {
    return features.filter((feature) => {
      if (filterOptions.keyword && !feature.title.toLowerCase().includes(filterOptions.keyword.toLowerCase())) {
        return false;
      }
      if (filterOptions.members.length > 0) {
        const hasNoAssigneeFilter = filterOptions.members.includes('__no_members__');
        const memberNames = filterOptions.members.filter(m => m !== '__no_members__');
        const featureAssigneeName = feature.assignee?.name;
        const matchesNoAssignee = hasNoAssigneeFilter && !featureAssigneeName;
        const matchesMember = memberNames.length > 0 && memberNames.some(m => featureAssigneeName === m);
        if (!matchesNoAssignee && !matchesMember) {
          // Feature 직접 assignee가 매칭되지 않아도, 하위 Task에 해당 담당자가 있으면 표시
          const featureTasks = tasks.filter(t => t.feature_id === feature.id);
          const hasMatchingTask = featureTasks.some(task => {
            const taskAssigneeNames = new Set<string>();
            if (task.assignees) {
              task.assignees.forEach(a => taskAssigneeNames.add(a.name));
            }
            const taskChecklists = checklistDataMap[task.id] || [];
            taskChecklists.filter(ci => ci.assignee?.name).forEach(ci => taskAssigneeNames.add(ci.assignee!.name));
            const hasNoAssignee = taskAssigneeNames.size === 0;
            return (hasNoAssigneeFilter && hasNoAssignee) ||
              (memberNames.length > 0 && memberNames.some(m => taskAssigneeNames.has(m)));
          });
          if (!hasMatchingTask) {
            return false;
          }
        }
      }
      if (filterOptions.tags.length > 0 && !filterOptions.tags.some((tagId) => feature.tags?.some((t) => t.id === tagId))) {
        return false;
      }
      return true;
    });
  }, [features, filterOptions, tasks, checklistDataMap]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filterOptions.keyword && !task.title.toLowerCase().includes(filterOptions.keyword.toLowerCase())) {
        return false;
      }
      if (filterOptions.members.length > 0) {
        const hasNoAssigneeFilter = filterOptions.members.includes('__no_members__');
        const memberNames = filterOptions.members.filter(m => m !== '__no_members__');
        const taskAssigneeNames = new Set<string>();
        if (task.assignees) {
          task.assignees.forEach(a => taskAssigneeNames.add(a.name));
        }
        const taskChecklists = checklistDataMap[task.id] || [];
        taskChecklists.filter(ci => ci.assignee?.name).forEach(ci => taskAssigneeNames.add(ci.assignee!.name));
        const hasNoAssignee = taskAssigneeNames.size === 0;
        const matchesNoAssignee = hasNoAssigneeFilter && hasNoAssignee;
        const matchesMember = memberNames.length > 0 && memberNames.some(m => taskAssigneeNames.has(m));
        if (!matchesNoAssignee && !matchesMember) {
          return false;
        }
      }
      if (filterOptions.features.length > 0 && !filterOptions.features.includes(task.feature_id)) {
        return false;
      }
      if (filterOptions.tags.length > 0 && !filterOptions.tags.some((tagId) => task.tags?.some((t) => t.id === tagId))) {
        return false;
      }
      if (filterOptions.cardStatus.length > 0) {
        const hasStatus =
          (filterOptions.cardStatus.includes('completed') && task.completed) ||
          (filterOptions.cardStatus.includes('incomplete') && !task.completed);
        if (!hasStatus) return false;
      }
      // 마감 필터는 현재 'overdue'만 적용한다 — 보고서의 "지연" 진입점(?overdue=1)이 쓰는 값이다.
      // 나머지 범위(no-date/next-day/next-week/next-month)는 아직 판정이 없어 무시된다.
      if (filterOptions.dueDate.includes('overdue')) {
        const today = getTodayDateString();
        if (!isTaskOverdue(task, checklistDataMap[task.id] || [], today)) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, filterOptions, checklistDataMap]);

  return { filteredFeatures, filteredTasks, sortedBlocks };
}
