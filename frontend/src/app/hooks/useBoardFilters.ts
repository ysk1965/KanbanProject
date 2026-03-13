import { useMemo } from 'react';
import { Feature, Task, Block, ChecklistItem } from '../types';
import { FilterOptions } from '../components/FilterModal';

export function useBoardFilters(
  features: Feature[],
  tasks: Task[],
  blocks: Block[],
  filterOptions: FilterOptions,
  checklistDataMap: { [taskId: string]: ChecklistItem[] },
  selectedFeatureIds: string[] | null,
  scheduledTaskIds: Set<string>
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
      return true;
    });
  }, [tasks, filterOptions, checklistDataMap]);

  const getTasksForBlock = (blockId: string) => {
    let blockTasks = filteredTasks.filter((task) => task.block_id === blockId);
    if (selectedFeatureIds !== null) {
      blockTasks = blockTasks.filter((task) => selectedFeatureIds.includes(task.feature_id));
    }
    const block = sortedBlocks.find((b) => b.id === blockId);
    if (block?.fixed_type === 'TASK' && scheduledTaskIds.size > 0) {
      return blockTasks.sort((a, b) => {
        const aScheduled = scheduledTaskIds.has(a.id) ? 0 : 1;
        const bScheduled = scheduledTaskIds.has(b.id) ? 0 : 1;
        if (aScheduled !== bScheduled) return aScheduled - bScheduled;
        return a.position - b.position;
      });
    }
    return blockTasks.sort((a, b) => a.position - b.position);
  };

  return { filteredFeatures, filteredTasks, sortedBlocks, getTasksForBlock };
}
