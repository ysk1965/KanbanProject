import { useState, useEffect, useCallback, useMemo } from 'react';
import { Block, Feature, Task, Tag, ChecklistItem } from '../../types';
import { KanbanBlock } from '../KanbanBlock';
import { DragProvider } from '../../contexts/DragContext';
import { taskService } from '../../utils/services';
import { boardAPI, BoardFullResponse } from '../../utils/api';
import { Loader2 } from 'lucide-react';

interface PersonalKanbanViewProps {
  boardId: string;
  onTaskClick?: (task: Task) => void;
  onFeatureClick?: (featureId: string) => void;
}

export function PersonalKanbanView({ boardId, onTaskClick, onFeatureClick }: PersonalKanbanViewProps) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [checklistDataMap, setChecklistDataMap] = useState<{ [taskId: string]: ChecklistItem[] }>({});
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const fullData: BoardFullResponse = await boardAPI.getBoardFull(boardId);

      setBlocks(fullData.blocks || []);
      setFeatures(fullData.features || []);
      setTasks(fullData.tasks || []);
      setTags(fullData.tags || []);
    } catch (error) {
      console.error('Failed to load personal board data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    if (boardId) loadData();
  }, [boardId, loadData]);

  const sortedBlocks = useMemo(() => {
    return [...blocks].sort((a, b) => a.position - b.position);
  }, [blocks]);

  const getTasksForBlock = useCallback((blockId: string) => {
    return tasks
      .filter(t => t.block_id === blockId)
      .sort((a, b) => a.position - b.position);
  }, [tasks]);

  const handleMoveTask = useCallback(async (taskId: string, targetBlockId: string, newPosition: number) => {
    try {
      // Optimistic update
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, block_id: targetBlockId, position: newPosition }
          : t
      ));
      await taskService.moveTask(boardId, taskId, targetBlockId, newPosition);
    } catch (error) {
      console.error('Failed to move task:', error);
      loadData();
    }
  }, [boardId, loadData]);

  const handleReorderTask = useCallback(async (taskId: string, blockId: string, newPosition: number) => {
    try {
      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, position: newPosition } : t
      ));
      await taskService.moveTask(boardId, taskId, blockId, newPosition);
    } catch (error) {
      console.error('Failed to reorder task:', error);
      loadData();
    }
  }, [boardId, loadData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-bridge-accent" />
      </div>
    );
  }

  return (
    <DragProvider>
      <div className="flex gap-4 p-4 overflow-x-auto h-full">
        {sortedBlocks.map((block, index) => (
          <KanbanBlock
            key={block.id}
            block={block}
            tasks={getTasksForBlock(block.id)}
            features={features}
            availableTags={tags}
            boardId={boardId}
            onMoveTask={handleMoveTask}
            onReorderTask={handleReorderTask}
            onTaskClick={onTaskClick}
            checklistDataMap={checklistDataMap}
            showFeatureLabel={true}
            isPersonal={true}
            blockIndex={index}
          />
        ))}
      </div>
    </DragProvider>
  );
}
