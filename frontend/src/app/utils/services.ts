import {
  boardAPI,
  featureAPI,
  taskAPI,
  blockAPI,
  tagAPI,
  memberAPI,
  authAPI,
  userAPI,
  inviteLinkAPI,
  subscriptionAPI,
  activityAPI,
  pricingAPI,
  checklistAPI,
  milestoneAPI,
  statisticsAPI,
  testDataAPI,
  inquiryAPI,
  noteAPI,
  apiClient,
  personalTaskAPI,
  personalHabitAPI,
  personalDashboardAPI,
  organizationAPI,
  orgAnnouncementAPI,
  orgActivityAPI,
  leaveAPI,
  anniversaryAPI,
  personalCalendarAPI,
  orgSubscriptionAPI,
  orgPhotoAPI,
  jobRoleAPI,
  contractorAPI,
} from "./api";
import {
  mockBoards,
  mockFeatures,
  mockTasks,
  mockBlocks,
  mockTags,
  mockMembers,
  loadFromLocalStorage,
  saveToLocalStorage,
} from "./mockData";
import { nowUTC, getTodayDateString } from "./dateUtils";
import type {
  Board,
  Feature,
  Task,
  Block,
  Tag,
  BoardMember,
  InviteLink,
  InviteResult,
  Subscription,
  ActivityLog,
  PricingPlan,
  ChecklistItem,
  User,
  Milestone,
  BoardTierInfo,
  BoardLimits,
  SeatPricing,
  BoardStatistics,
  PersonalStatistics,
  BoardWeightSettings,
  WeightLevel,
  StatisticsFilter,
  ManagementStatistics,
  MilestoneAllocation,
  OkrCycle,
  OkrObjective,
  OkrKeyResult,
  OkrCheckIn,
  OkrTreeData,
} from "../types";

// API 호출 실패 시 목업 데이터 사용
const USE_MOCK_ON_ERROR = true;

// ========================================
// Board Service
// ========================================

export const boardService = {
  getBoards: async (): Promise<Board[]> => {
    try {
      const boards = await boardAPI.getBoards();
      return boards;
    } catch (error) {
      console.warn("API failed, using mock data for boards", error);
      if (USE_MOCK_ON_ERROR) {
        return loadFromLocalStorage("kanban_boards", mockBoards);
      }
      throw error;
    }
  },

  getBoard: async (boardId: string): Promise<Board> => {
    try {
      const board = await boardAPI.getBoard(boardId);
      return board;
    } catch (error) {
      console.warn("API failed, using mock data for board", error);
      if (USE_MOCK_ON_ERROR) {
        const boards = loadFromLocalStorage("kanban_boards", mockBoards);
        const board = boards.find((b: Board) => b.id === boardId);
        if (board) return board;
      }
      throw error;
    }
  },

  createBoard: async (
    name: string,
    description?: string,
    backgroundGradient?: string,
  ): Promise<Board> => {
    try {
      const board = await boardAPI.createBoard({
        name,
        description,
        background_gradient: backgroundGradient,
      });
      return board;
    } catch (error) {
      console.warn("API failed, using mock data for create board", error);
      if (USE_MOCK_ON_ERROR) {
        const boards = loadFromLocalStorage("kanban_boards", mockBoards);
        const newBoard: Board = {
          id: `board-${Date.now()}`,
          name,
          description,
          is_starred: false,
          member_count: 1,
          subscription: {
            status: "TRIAL",
            plan: null,
            trial_ends_at: new Date(
              Date.now() + 3 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            current_period_end: null,
          },
          created_at: nowUTC(),
        };
        const updatedBoards = [...boards, newBoard];
        saveToLocalStorage("kanban_boards", updatedBoards);
        return newBoard;
      }
      throw error;
    }
  },

  updateBoard: async (
    boardId: string,
    name: string,
    description?: string,
    backgroundGradient?: string,
  ): Promise<Board> => {
    try {
      const board = await boardAPI.updateBoard(boardId, {
        name,
        description,
        background_gradient: backgroundGradient,
      });
      return board;
    } catch (error) {
      console.warn("API failed for update board", error);
      if (USE_MOCK_ON_ERROR) {
        const boards = loadFromLocalStorage("kanban_boards", mockBoards);
        const updatedBoards = boards.map((b: Board) =>
          b.id === boardId
            ? {
                ...b,
                name,
                description,
                background_gradient: backgroundGradient,
              }
            : b,
        );
        saveToLocalStorage("kanban_boards", updatedBoards);
        return updatedBoards.find((b: Board) => b.id === boardId)!;
      }
      throw error;
    }
  },

  toggleStar: async (
    boardId: string,
  ): Promise<{ board_id: string; is_starred: boolean }> => {
    try {
      const result = await boardAPI.toggleStar(boardId);
      return result;
    } catch (error) {
      console.warn("API failed, using mock data for toggle star", error);
      if (USE_MOCK_ON_ERROR) {
        const boards = loadFromLocalStorage("kanban_boards", mockBoards);
        const board = boards.find((b: Board) => b.id === boardId);
        const newStarred = !board?.is_starred;
        const updatedBoards = boards.map((b: Board) =>
          b.id === boardId ? { ...b, is_starred: newStarred } : b,
        );
        saveToLocalStorage("kanban_boards", updatedBoards);
        return { board_id: boardId, is_starred: newStarred };
      }
      throw error;
    }
  },

  deleteBoard: async (boardId: string): Promise<void> => {
    try {
      await boardAPI.deleteBoard(boardId);
    } catch (error) {
      console.warn("API failed, using mock data for delete board", error);
      if (USE_MOCK_ON_ERROR) {
        const boards = loadFromLocalStorage("kanban_boards", mockBoards);
        const updatedBoards = boards.filter((b: Board) => b.id !== boardId);
        saveToLocalStorage("kanban_boards", updatedBoards);
        return;
      }
      throw error;
    }
  },

  updateSelectedMilestone: async (
    boardId: string,
    milestoneId: string | null,
  ): Promise<Board> => {
    try {
      const board = await boardAPI.updateSelectedMilestone(
        boardId,
        milestoneId,
      );
      return board;
    } catch (error) {
      console.warn("API failed for updateSelectedMilestone", error);
      throw error;
    }
  },

  getBoardTier: async (boardId: string): Promise<BoardTierInfo> => {
    try {
      const tierInfo = await boardAPI.getBoardTier(boardId);
      return tierInfo;
    } catch (error) {
      console.warn("API failed, using mock data for board tier", error);
      if (USE_MOCK_ON_ERROR) {
        return {
          tier: "TRIAL",
          trial_ends_at: new Date(
            Date.now() + 3 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          can_access_schedule: true,
          can_access_milestone: true,
          can_access_statistics: true,
        };
      }
      throw error;
    }
  },

  getBoardLimits: async (boardId: string): Promise<BoardLimits> => {
    try {
      const limits = await boardAPI.getBoardLimits(boardId);
      return limits;
    } catch (error) {
      console.warn("API failed, using mock data for board limits", error);
      if (USE_MOCK_ON_ERROR) {
        return {
          task_limit: null, // Premium에서는 무제한
          current_task_count: 0,
          can_create_task: true,
        };
      }
      throw error;
    }
  },

  /**
   * 보드 진입 시 필요한 모든 데이터를 한 번에 조회
   * 기존 13개 개별 API 호출을 1개로 통합하여 서버 부하 감소
   */
  getBoardFull: async (boardId: string) => {
    const data = await boardAPI.getBoardFull(boardId);
    return data;
  },

  moveTask: async (
    taskId: string,
    data: { target_board_id: string; target_block_id: string },
  ) => {
    await boardAPI.moveTask(taskId, data);
  },

  copyTask: async (
    taskId: string,
    data: { target_board_id: string; target_block_id: string },
  ) => {
    await boardAPI.copyTask(taskId, data);
  },
};

// ========================================
// Block Service
// ========================================

export const blockService = {
  getBlocks: async (boardId: string, milestoneId?: string): Promise<Block[]> => {
    try {
      const response = await blockAPI.getBlocks(boardId, milestoneId);
      return response.blocks;
    } catch (error) {
      console.warn("API failed, using mock data for blocks", error);
      if (USE_MOCK_ON_ERROR) {
        return loadFromLocalStorage("kanban_blocks", mockBlocks);
      }
      throw error;
    }
  },

  getBlocksWithHidden: async (boardId: string, milestoneId?: string): Promise<{ blocks: Block[]; hiddenBlocks: Block[] }> => {
    try {
      const response = await blockAPI.getBlocks(boardId, milestoneId);
      return {
        blocks: response.blocks,
        hiddenBlocks: response.hidden_blocks || [],
      };
    } catch (error) {
      console.warn("API failed for getBlocksWithHidden", error);
      if (USE_MOCK_ON_ERROR) {
        return { blocks: loadFromLocalStorage("kanban_blocks", mockBlocks), hiddenBlocks: [] };
      }
      throw error;
    }
  },

  createBlock: async (
    boardId: string,
    data: { name: string; color: string; milestone_id?: string },
  ): Promise<Block> => {
    try {
      const block = await blockAPI.createBlock(boardId, data);
      return block;
    } catch (error) {
      console.warn("API failed, using mock data for create block", error);
      if (USE_MOCK_ON_ERROR) {
        const blocks = loadFromLocalStorage("kanban_blocks", mockBlocks);
        const maxPosition = Math.max(
          ...blocks.map((b: Block) => b.position),
          0,
        );
        const newBlock: Block = {
          id: `block-${Date.now()}`,
          name: data.name,
          color: data.color,
          type: "CUSTOM",
          fixed_type: null,
          position: maxPosition + 1,
        };
        const updatedBlocks = [...blocks, newBlock];
        saveToLocalStorage("kanban_blocks", updatedBlocks);
        return newBlock;
      }
      throw error;
    }
  },

  updateBlock: async (
    boardId: string,
    blockId: string,
    data: { name?: string; color?: string },
  ): Promise<Block> => {
    try {
      const block = await blockAPI.updateBlock(boardId, blockId, data);
      return block;
    } catch (error) {
      console.warn("API failed, using mock data for update block", error);
      if (USE_MOCK_ON_ERROR) {
        const blocks = loadFromLocalStorage("kanban_blocks", mockBlocks);
        const updatedBlocks = blocks.map((b: Block) =>
          b.id === blockId ? { ...b, ...data } : b,
        );
        saveToLocalStorage("kanban_blocks", updatedBlocks);
        return updatedBlocks.find((b: Block) => b.id === blockId)!;
      }
      throw error;
    }
  },

  deleteBlock: async (boardId: string, blockId: string): Promise<void> => {
    try {
      await blockAPI.deleteBlock(boardId, blockId);
    } catch (error) {
      console.warn("API failed, using mock data for delete block", error);
      if (USE_MOCK_ON_ERROR) {
        const blocks = loadFromLocalStorage("kanban_blocks", mockBlocks);
        const updatedBlocks = blocks.filter((b: Block) => b.id !== blockId);
        saveToLocalStorage("kanban_blocks", updatedBlocks);
        return;
      }
      throw error;
    }
  },

  reorderBlocks: async (
    boardId: string,
    blockIds: string[],
  ): Promise<Block[]> => {
    try {
      const response = await blockAPI.reorderBlocks(boardId, blockIds);
      return response.blocks;
    } catch (error) {
      console.warn("API failed, using mock data for reorder blocks", error);
      if (USE_MOCK_ON_ERROR) {
        const blocks = loadFromLocalStorage("kanban_blocks", mockBlocks);
        const updatedBlocks = blockIds
          .map((id, index) => {
            const block = blocks.find((b: Block) => b.id === id);
            return block ? { ...block, position: index } : null;
          })
          .filter(Boolean) as Block[];
        saveToLocalStorage("kanban_blocks", updatedBlocks);
        return updatedBlocks;
      }
      throw error;
    }
  },
};

// ========================================
// Feature Service
// ========================================

export const featureService = {
  getFeatures: async (
    boardId: string,
    milestoneId?: string,
  ): Promise<Feature[]> => {
    try {
      const response = await featureAPI.getFeatures(boardId, milestoneId);
      return response.features;
    } catch (error) {
      console.warn("API failed, using mock data for features", error);
      if (USE_MOCK_ON_ERROR) {
        return loadFromLocalStorage("kanban_features", mockFeatures);
      }
      throw error;
    }
  },

  getFeature: async (boardId: string, featureId: string): Promise<Feature> => {
    try {
      const feature = await featureAPI.getFeature(boardId, featureId);
      return feature;
    } catch (error) {
      console.warn("API failed, using mock data for feature", error);
      if (USE_MOCK_ON_ERROR) {
        const features = loadFromLocalStorage("kanban_features", mockFeatures);
        return features.find((f: Feature) => f.id === featureId);
      }
      throw error;
    }
  },

  createFeature: async (
    boardId: string,
    data: {
      title: string;
      description?: string;
      color?: string;
      assignee_id?: string;
      start_date?: string;
      due_date?: string;
    },
  ): Promise<Feature> => {
    try {
      const feature = await featureAPI.createFeature(boardId, data);
      return feature;
    } catch (error) {
      console.warn("API failed, using mock data for create feature", error);
      if (USE_MOCK_ON_ERROR) {
        const features = loadFromLocalStorage("kanban_features", mockFeatures);
        const newFeature: Feature = {
          id: `feature-${Date.now()}`,
          title: data.title,
          description: data.description,
          color: data.color || "#3B82F6",
          assignee: null,
          start_date: data.start_date || null,
          due_date: data.due_date || null,
          status: "ACTIVE",
          total_tasks: 0,
          completed_tasks: 0,
          progress_percentage: 0,
          position: features.length,
          tags: [],
          created_at: nowUTC(),
        };
        const updatedFeatures = [...features, newFeature];
        saveToLocalStorage("kanban_features", updatedFeatures);
        return newFeature;
      }
      throw error;
    }
  },

  updateFeature: async (
    boardId: string,
    featureId: string,
    data: {
      title?: string;
      description?: string;
      color?: string;
      assignee_id?: string | null;
      start_date?: string | null;
      due_date?: string | null;
    },
  ): Promise<Feature> => {
    try {
      const feature = await featureAPI.updateFeature(boardId, featureId, data);
      return feature;
    } catch (error) {
      console.warn("API failed, using mock data for update feature", error);
      if (USE_MOCK_ON_ERROR) {
        const features = loadFromLocalStorage("kanban_features", mockFeatures);
        const updatedFeatures = features.map((f: Feature) =>
          f.id === featureId ? { ...f, ...data } : f,
        );
        saveToLocalStorage("kanban_features", updatedFeatures);
        return updatedFeatures.find((f: Feature) => f.id === featureId)!;
      }
      throw error;
    }
  },

  deleteFeature: async (
    boardId: string,
    featureId: string,
    taskMigrations?: Array<{ task_id: string; target_feature_id: string }>,
  ): Promise<void> => {
    try {
      const data =
        taskMigrations && taskMigrations.length > 0
          ? { task_migrations: taskMigrations }
          : undefined;
      await featureAPI.deleteFeature(boardId, featureId, data);
    } catch (error) {
      console.warn("API failed, using mock data for delete feature", error);
      if (USE_MOCK_ON_ERROR) {
        const features = loadFromLocalStorage("kanban_features", mockFeatures);
        const updatedFeatures = features.filter(
          (f: Feature) => f.id !== featureId,
        );
        saveToLocalStorage("kanban_features", updatedFeatures);
        return;
      }
      throw error;
    }
  },

  reorderFeatures: async (
    boardId: string,
    featureIds: string[],
  ): Promise<Feature[]> => {
    try {
      const response = await featureAPI.reorderFeatures(boardId, featureIds);
      return response.features;
    } catch (error) {
      console.warn("API failed, using mock data for reorder features", error);
      if (USE_MOCK_ON_ERROR) {
        const features = loadFromLocalStorage("kanban_features", mockFeatures);
        const updatedFeatures = featureIds
          .map((id, index) => {
            const feature = features.find((f: Feature) => f.id === id);
            return feature ? { ...feature, position: index } : null;
          })
          .filter(Boolean) as Feature[];
        saveToLocalStorage("kanban_features", updatedFeatures);
        return updatedFeatures;
      }
      throw error;
    }
  },

  addTag: async (
    boardId: string,
    featureId: string,
    tagId: string,
  ): Promise<Tag[]> => {
    try {
      const tags = await featureAPI.addTag(boardId, featureId, tagId);
      return tags;
    } catch (error) {
      console.warn("API failed for add tag to feature", error);
      throw error;
    }
  },

  removeTag: async (
    boardId: string,
    featureId: string,
    tagId: string,
  ): Promise<void> => {
    try {
      await featureAPI.removeTag(boardId, featureId, tagId);
    } catch (error) {
      console.warn("API failed for remove tag from feature", error);
      throw error;
    }
  },
};

// ========================================
// Task Service
// ========================================

export const taskService = {
  getTasks: async (
    boardId: string,
    params?: { block_id?: string; feature_id?: string; milestone_id?: string },
  ): Promise<Task[]> => {
    try {
      const response = await taskAPI.getTasks(boardId, params);
      return response.tasks;
    } catch (error) {
      console.warn("API failed, using mock data for tasks", error);
      if (USE_MOCK_ON_ERROR) {
        let tasks = loadFromLocalStorage("kanban_tasks", mockTasks);
        if (params?.block_id) {
          tasks = tasks.filter((t: Task) => t.block_id === params.block_id);
        }
        if (params?.feature_id) {
          tasks = tasks.filter((t: Task) => t.feature_id === params.feature_id);
        }
        return tasks;
      }
      throw error;
    }
  },

  getTask: async (boardId: string, taskId: string): Promise<Task> => {
    try {
      const task = await taskAPI.getTask(boardId, taskId);
      return task;
    } catch (error) {
      console.warn("API failed, using mock data for task", error);
      if (USE_MOCK_ON_ERROR) {
        const tasks = loadFromLocalStorage("kanban_tasks", mockTasks);
        return tasks.find((t: Task) => t.id === taskId);
      }
      throw error;
    }
  },

  createTask: async (
    boardId: string,
    featureId: string,
    data: {
      title: string;
      description?: string;
      assignee_id?: string;
      start_date?: string;
      due_date?: string;
      estimated_minutes?: number;
    },
  ): Promise<Task> => {
    try {
      const task = await taskAPI.createTask(boardId, featureId, data);
      return task;
    } catch (error) {
      console.warn("API failed, using mock data for create task", error);
      if (USE_MOCK_ON_ERROR) {
        const tasks = loadFromLocalStorage("kanban_tasks", mockTasks);
        const features = loadFromLocalStorage("kanban_features", mockFeatures);
        const blocks = loadFromLocalStorage("kanban_blocks", mockBlocks);
        const feature = features.find((f: Feature) => f.id === featureId);
        const taskBlock = blocks.find((b: Block) => b.fixed_type === "TASK");

        const newTask: Task = {
          id: `task-${Date.now()}`,
          feature_id: featureId,
          feature_title: feature?.title || "",
          feature_color: feature?.color || "#3B82F6",
          block_id: taskBlock?.id || "task-block",
          title: data.title,
          description: data.description,
          assignee: null,
          start_date: data.start_date || null,
          due_date: data.due_date || null,
          estimated_minutes: data.estimated_minutes || null,
          completed: false,
          position: tasks.filter((t: Task) => t.feature_id === featureId)
            .length,
          tags: [],
          created_at: nowUTC(),
        };
        const updatedTasks = [...tasks, newTask];
        saveToLocalStorage("kanban_tasks", updatedTasks);
        return newTask;
      }
      throw error;
    }
  },

  updateTask: async (
    boardId: string,
    taskId: string,
    data: {
      title?: string;
      description?: string;
      assignee_id?: string | null;
      start_date?: string | null;
      due_date?: string | null;
      estimated_minutes?: number | null;
    },
  ): Promise<Task> => {
    try {
      const task = await taskAPI.updateTask(boardId, taskId, data);
      return task;
    } catch (error) {
      console.warn("API failed, using mock data for update task", error);
      if (USE_MOCK_ON_ERROR) {
        const tasks = loadFromLocalStorage("kanban_tasks", mockTasks);
        const updatedTasks = tasks.map((t: Task) =>
          t.id === taskId ? { ...t, ...data } : t,
        );
        saveToLocalStorage("kanban_tasks", updatedTasks);
        return updatedTasks.find((t: Task) => t.id === taskId)!;
      }
      throw error;
    }
  },

  deleteTask: async (boardId: string, taskId: string): Promise<void> => {
    try {
      await taskAPI.deleteTask(boardId, taskId);
    } catch (error) {
      console.warn("API failed, using mock data for delete task", error);
      if (USE_MOCK_ON_ERROR) {
        const tasks = loadFromLocalStorage("kanban_tasks", mockTasks);
        const updatedTasks = tasks.filter((t: Task) => t.id !== taskId);
        saveToLocalStorage("kanban_tasks", updatedTasks);
        return;
      }
      throw error;
    }
  },

  moveTask: async (
    boardId: string,
    taskId: string,
    targetBlockId: string,
    position: number,
  ): Promise<Task> => {
    try {
      const task = await taskAPI.moveTask(boardId, taskId, {
        target_block_id: targetBlockId,
        position,
      });
      return task;
    } catch (error) {
      console.warn("API failed, using mock data for move task", error);
      if (USE_MOCK_ON_ERROR) {
        const tasks = loadFromLocalStorage("kanban_tasks", mockTasks);
        const blocks = loadFromLocalStorage("kanban_blocks", mockBlocks);
        const doneBlock = blocks.find((b: Block) => b.fixed_type === "DONE");
        const isCompleted = doneBlock?.id === targetBlockId;

        const updatedTasks = tasks.map((t: Task) =>
          t.id === taskId
            ? {
                ...t,
                block_id: targetBlockId,
                position,
                completed: isCompleted,
              }
            : t,
        );
        saveToLocalStorage("kanban_tasks", updatedTasks);
        return updatedTasks.find((t: Task) => t.id === taskId)!;
      }
      throw error;
    }
  },

  moveTaskToFeature: async (
    boardId: string,
    taskId: string,
    targetFeatureId: string,
  ): Promise<Task> => {
    const task = await taskAPI.moveTaskToFeature(boardId, taskId, {
      target_feature_id: targetFeatureId,
    });
    return task;
  },

  updateTaskDates: async (
    boardId: string,
    taskId: string,
    data: {
      start_date?: string | null;
      end_date?: string | null;
    },
  ): Promise<Task> => {
    try {
      const task = await taskAPI.updateTaskDates(boardId, taskId, data);
      return task;
    } catch (error) {
      console.warn("API failed, using mock data for update task dates", error);
      if (USE_MOCK_ON_ERROR) {
        const tasks = loadFromLocalStorage("kanban_tasks", mockTasks);
        const updatedTasks = tasks.map((t: Task) =>
          t.id === taskId
            ? {
                ...t,
                start_date: data.start_date ?? t.start_date,
                due_date: data.end_date ?? t.due_date,
              }
            : t,
        );
        saveToLocalStorage("kanban_tasks", updatedTasks);
        return updatedTasks.find((t: Task) => t.id === taskId)!;
      }
      throw error;
    }
  },

  saveBaseline: async (boardId: string): Promise<void> => {
    await taskAPI.saveBaseline(boardId);
  },

  clearBaseline: async (boardId: string): Promise<void> => {
    await taskAPI.clearBaseline(boardId);
  },

  addTag: async (
    boardId: string,
    taskId: string,
    tagId: string,
  ): Promise<Tag[]> => {
    try {
      const tags = await taskAPI.addTag(boardId, taskId, tagId);
      return tags;
    } catch (error) {
      console.warn("API failed for add tag to task", error);
      throw error;
    }
  },

  removeTag: async (
    boardId: string,
    taskId: string,
    tagId: string,
  ): Promise<void> => {
    try {
      await taskAPI.removeTag(boardId, taskId, tagId);
    } catch (error) {
      console.warn("API failed for remove tag from task", error);
      throw error;
    }
  },
};

// ========================================
// Tag Service
// ========================================

export const tagService = {
  getTags: async (boardId: string): Promise<Tag[]> => {
    try {
      const response = await tagAPI.getTags(boardId);
      return response.tags;
    } catch (error) {
      console.warn("API failed, using mock data for tags", error);
      if (USE_MOCK_ON_ERROR) {
        return loadFromLocalStorage("kanban_tags", mockTags);
      }
      throw error;
    }
  },

  createTag: async (
    boardId: string,
    data: { name: string; color: string },
  ): Promise<Tag> => {
    try {
      const tag = await tagAPI.createTag(boardId, data);
      return tag;
    } catch (error) {
      console.warn("API failed, using mock data for create tag", error);
      if (USE_MOCK_ON_ERROR) {
        const tags = loadFromLocalStorage("kanban_tags", mockTags);
        const newTag: Tag = {
          id: `tag-${Date.now()}`,
          name: data.name,
          color: data.color,
          created_at: nowUTC(),
        };
        const updatedTags = [...tags, newTag];
        saveToLocalStorage("kanban_tags", updatedTags);
        return newTag;
      }
      throw error;
    }
  },

  updateTag: async (
    boardId: string,
    tagId: string,
    data: { name?: string; color?: string },
  ): Promise<Tag> => {
    try {
      const tag = await tagAPI.updateTag(boardId, tagId, data);
      return tag;
    } catch (error) {
      console.warn("API failed, using mock data for update tag", error);
      if (USE_MOCK_ON_ERROR) {
        const tags = loadFromLocalStorage("kanban_tags", mockTags);
        const updatedTags = tags.map((t: Tag) =>
          t.id === tagId ? { ...t, ...data } : t,
        );
        saveToLocalStorage("kanban_tags", updatedTags);
        return updatedTags.find((t: Tag) => t.id === tagId)!;
      }
      throw error;
    }
  },

  deleteTag: async (boardId: string, tagId: string): Promise<void> => {
    try {
      await tagAPI.deleteTag(boardId, tagId);
    } catch (error) {
      console.warn("API failed, using mock data for delete tag", error);
      if (USE_MOCK_ON_ERROR) {
        const tags = loadFromLocalStorage("kanban_tags", mockTags);
        const updatedTags = tags.filter((t: Tag) => t.id !== tagId);
        saveToLocalStorage("kanban_tags", updatedTags);
        return;
      }
      throw error;
    }
  },
};

// ========================================
// Checklist Service
// ========================================

export const checklistService = {
  getChecklist: async (
    boardId: string,
    taskId: string,
  ): Promise<{ total: number; completed: number; items: ChecklistItem[] }> => {
    try {
      const checklist = await checklistAPI.getChecklist(boardId, taskId);
      return checklist;
    } catch (error) {
      console.warn("API failed, using mock data for checklist", error);
      if (USE_MOCK_ON_ERROR) {
        return { total: 0, completed: 0, items: [] };
      }
      throw error;
    }
  },

  getBatchChecklists: async (
    boardId: string,
    taskIds: string[],
  ): Promise<{
    [taskId: string]: {
      total: number;
      completed: number;
      items: ChecklistItem[];
    };
  }> => {
    try {
      if (taskIds.length === 0) {
        return {};
      }
      const response = await checklistAPI.getBatchChecklists(boardId, taskIds);
      return response;
    } catch (error) {
      console.warn("API failed, using empty data for batch checklists", error);
      if (USE_MOCK_ON_ERROR) {
        return {};
      }
      throw error;
    }
  },

  addItem: async (
    boardId: string,
    taskId: string,
    data: { title: string; assignee_id?: string; due_date?: string },
  ): Promise<ChecklistItem> => {
    try {
      const item = await checklistAPI.addItem(boardId, taskId, data);
      return item;
    } catch (error) {
      console.warn("API failed for add checklist item", error);
      throw error;
    }
  },

  updateItem: async (
    boardId: string,
    taskId: string,
    itemId: string,
    data: {
      title?: string;
      assignee_id?: string | null;
      due_date?: string | null;
    },
  ): Promise<ChecklistItem> => {
    try {
      const item = await checklistAPI.updateItem(boardId, taskId, itemId, data);
      return item;
    } catch (error) {
      console.warn("API failed for update checklist item", error);
      throw error;
    }
  },

  deleteItem: async (
    boardId: string,
    taskId: string,
    itemId: string,
  ): Promise<void> => {
    try {
      await checklistAPI.deleteItem(boardId, taskId, itemId);
    } catch (error) {
      console.warn("API failed for delete checklist item", error);
      throw error;
    }
  },

  toggleItem: async (
    boardId: string,
    taskId: string,
    itemId: string,
  ): Promise<ChecklistItem> => {
    try {
      const item = await checklistAPI.toggleItem(boardId, taskId, itemId);
      return item;
    } catch (error) {
      console.warn("API failed for toggle checklist item", error);
      throw error;
    }
  },
};

// ========================================
// Member Service
// ========================================

export const memberService = {
  getMembers: async (
    boardId: string,
  ): Promise<{ total: number; billable: number; members: BoardMember[] }> => {
    try {
      const response = await memberAPI.getMembers(boardId);
      return response;
    } catch (error) {
      console.warn("API failed, using mock data for members", error);
      if (USE_MOCK_ON_ERROR) {
        const members = loadFromLocalStorage("kanban_members", mockMembers);
        return { total: members.length, billable: members.length, members };
      }
      throw error;
    }
  },

  inviteMember: async (
    boardId: string,
    email: string,
    role: "ADMIN" | "MEMBER" | "VIEWER",
  ): Promise<InviteResult> => {
    // 멤버 초대는 mock 폴백 없이 API 에러를 그대로 throw
    const result = await memberAPI.inviteMember(boardId, { email, role });

    // API 응답을 InviteResult 형식으로 변환
    if (result.type === "DIRECT_ADD" && result.member) {
      return {
        type: "DIRECT_ADD",
        member: {
          id: result.member.id,
          user: {
            id: result.member.user.id,
            email: result.member.user.email,
            name: result.member.user.name,
            profile_image: result.member.user.profile_image,
          },
          role: result.member.role,
          joined_at: result.member.joined_at,
          invited_by: result.member.invited_by,
        },
      };
    } else {
      return {
        type: "EMAIL_SENT",
        email: result.email,
        role: result.role,
      };
    }
  },

  updateMemberRole: async (
    boardId: string,
    memberId: string,
    role: "ADMIN" | "MEMBER" | "VIEWER",
  ): Promise<BoardMember> => {
    try {
      const member = await memberAPI.updateMemberRole(boardId, memberId, role);
      return member;
    } catch (error: any) {
      // 시트 부족(S005) 등 결제 관련 에러는 mock 폴백 없이 그대로 throw
      if (error?.code === "S005") {
        throw error;
      }
      console.warn("API failed, using mock data for update member role", error);
      if (USE_MOCK_ON_ERROR) {
        const members = loadFromLocalStorage("kanban_members", mockMembers);
        const updatedMembers = members.map((m: BoardMember) =>
          m.id === memberId ? { ...m, role } : m,
        );
        saveToLocalStorage("kanban_members", updatedMembers);
        return updatedMembers.find((m: BoardMember) => m.id === memberId)!;
      }
      throw error;
    }
  },

  updateMemberColor: async (
    boardId: string,
    memberId: string,
    assigneeColor: string | null,
  ) => {
    return memberAPI.updateMemberColor(boardId, memberId, assigneeColor);
  },

  updateMemberJobRole: async (
    boardId: string,
    memberId: string,
    jobRoleId: string | null,
  ) => {
    return memberAPI.updateMemberJobRole(boardId, memberId, jobRoleId);
  },

  reorderMembers: async (boardId: string, memberIds: string[]) => {
    return memberAPI.reorderMembers(boardId, memberIds);
  },

  getOrgCandidates: memberAPI.getOrgCandidates,

  removeMember: async (boardId: string, memberId: string): Promise<void> => {
    try {
      await memberAPI.removeMember(boardId, memberId);
    } catch (error) {
      console.warn("API failed, using mock data for remove member", error);
      if (USE_MOCK_ON_ERROR) {
        const members = loadFromLocalStorage("kanban_members", mockMembers);
        const updatedMembers = members.filter(
          (m: BoardMember) => m.id !== memberId,
        );
        saveToLocalStorage("kanban_members", updatedMembers);
        return;
      }
      throw error;
    }
  },

  transferOwnership: async (boardId: string, newOwnerUserId: string) => {
    return memberAPI.transferOwnership(boardId, newOwnerUserId);
  },
};

// ========================================
// Job Role Service
// ========================================

export const jobRoleService = {
  list: async (boardId: string) => {
    const response = await jobRoleAPI.list(boardId);
    return response.job_roles;
  },
  create: async (
    boardId: string,
    payload: { name: string; color?: string | null; icon?: string | null },
  ) => jobRoleAPI.create(boardId, payload),
  update: async (
    boardId: string,
    roleId: string,
    payload: { name?: string; color?: string | null; icon?: string | null },
  ) => jobRoleAPI.update(boardId, roleId, payload),
  remove: async (boardId: string, roleId: string) =>
    jobRoleAPI.remove(boardId, roleId),
  reorder: async (boardId: string, ids: string[]) => {
    const response = await jobRoleAPI.reorder(boardId, ids);
    return response.job_roles;
  },
};

// ========================================
// Contractor Service (외주)
// ========================================

export const contractorService = {
  list: async (boardId: string) => {
    const response = await contractorAPI.list(boardId);
    return response.contractors;
  },
  create: async (
    boardId: string,
    payload: {
      name: string;
      manager_member_id: string;
      job_role_id?: string | null;
      color?: string | null;
      start_date?: string | null;
      end_date?: string | null;
    },
  ) => contractorAPI.create(boardId, payload),
  update: async (
    boardId: string,
    contractorId: string,
    payload: {
      name?: string;
      manager_member_id?: string;
      job_role_id?: string | null;
      color?: string | null;
    },
  ) => contractorAPI.update(boardId, contractorId, payload),
  remove: async (boardId: string, contractorId: string) =>
    contractorAPI.remove(boardId, contractorId),
  reorder: async (boardId: string, ids: string[]) => {
    const response = await contractorAPI.reorder(boardId, ids);
    return response.contractors;
  },
  // 계약 기간(갱신/연장)
  addPeriod: async (
    boardId: string,
    contractorId: string,
    payload: { start_date?: string | null; end_date?: string | null },
  ) => contractorAPI.addPeriod(boardId, contractorId, payload),
  updatePeriod: async (
    boardId: string,
    contractorId: string,
    periodId: string,
    payload: {
      start_date?: string | null;
      end_date?: string | null;
      clear_start_date?: boolean;
      clear_end_date?: boolean;
    },
  ) => contractorAPI.updatePeriod(boardId, contractorId, periodId, payload),
  deletePeriod: async (
    boardId: string,
    contractorId: string,
    periodId: string,
  ) => contractorAPI.deletePeriod(boardId, contractorId, periodId),
};

// ========================================
// Auth Service
// ========================================

// API 에러인지 확인 (code, message 필드가 있는 경우)
const isApiError = (
  error: unknown,
): error is {
  code: string;
  message: string;
  errors?: Record<string, string>;
} => {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  );
};

export const authService = {
  signup: async (email: string, password: string, name: string) => {
    try {
      const response = await authAPI.signup({ email, password, name });
      localStorage.setItem("user", JSON.stringify(response.user));
      return response;
    } catch (error) {
      // API 에러(4xx)는 mock 사용 안함 - 에러 메시지 그대로 전달
      if (isApiError(error)) {
        console.error("Signup validation error:", error);
        // errors 필드에서 상세 메시지 추출
        if (error.errors && Object.keys(error.errors).length > 0) {
          const errorMessages = Object.values(error.errors).join("\n");
          throw new Error(errorMessages);
        }
        throw new Error(error.message);
      }
      // 네트워크 에러 등은 mock 사용
      console.warn("API failed, using mock auth", error);
      if (USE_MOCK_ON_ERROR) {
        const mockUser: User = {
          id: `user-${Date.now()}`,
          email,
          name,
          profile_image: null,
        };
        localStorage.setItem("access_token", "mock-access-token");
        localStorage.setItem("refresh_token", "mock-refresh-token");
        localStorage.setItem("user", JSON.stringify(mockUser));
        return {
          access_token: "mock-access-token",
          refresh_token: "mock-refresh-token",
          token_type: "Bearer",
          user: mockUser,
        };
      }
      throw error;
    }
  },

  login: async (email: string, password: string) => {
    try {
      const response = await authAPI.login({ email, password });
      localStorage.setItem("user", JSON.stringify(response.user));
      return response;
    } catch (error) {
      // API 에러(4xx)는 mock 사용 안함 - 에러 메시지 그대로 전달
      if (isApiError(error)) {
        console.error("Login error:", error);
        throw new Error(error.message);
      }
      // 네트워크 에러 등은 mock 사용
      console.warn("API failed, using mock auth", error);
      if (USE_MOCK_ON_ERROR) {
        const mockUser: User = {
          id: "user-1",
          email,
          name: email.split("@")[0],
          profile_image: null,
        };
        localStorage.setItem("access_token", "mock-access-token");
        localStorage.setItem("refresh_token", "mock-refresh-token");
        localStorage.setItem("user", JSON.stringify(mockUser));
        return {
          access_token: "mock-access-token",
          refresh_token: "mock-refresh-token",
          token_type: "Bearer",
          user: mockUser,
        };
      }
      throw error;
    }
  },

  googleLogin: async (code: string) => {
    try {
      const response = await authAPI.googleLogin(code);
      // 구글 로그인 사용자임을 표시
      const userWithProvider = {
        ...response.user,
        provider: "google" as const,
      };
      localStorage.setItem("user", JSON.stringify(userWithProvider));
      return { ...response, user: userWithProvider };
    } catch (error) {
      console.warn("Google login failed", error);
      throw error;
    }
  },

  googleLoginWithIdToken: async (idToken: string) => {
    try {
      const response = await authAPI.googleLoginWithIdToken(idToken);
      const userWithProvider = {
        ...response.user,
        provider: "google" as const,
      };
      localStorage.setItem("user", JSON.stringify(userWithProvider));
      return { ...response, user: userWithProvider };
    } catch (error) {
      console.warn("Google login with id_token failed", error);
      throw error;
    }
  },

  logout: async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.warn("API failed for logout", error);
    } finally {
      authAPI.clearTokens();
      localStorage.removeItem("user");
    }
  },

  getCurrentUser: (): User | null => {
    const userStr = localStorage.getItem("user");
    return userStr ? JSON.parse(userStr) : null;
  },

  isAuthenticated: () => {
    return authAPI.isAuthenticated();
  },

  // 토큰이 존재하지만 만료되었는지 확인
  isTokenExpiredButExists: () => {
    return authAPI.isTokenExpiredButExists();
  },

  // refresh token으로 access token 갱신 시도
  tryRefreshToken: async (): Promise<boolean> => {
    return authAPI.tryRefreshToken();
  },

  // 이메일 인증
  verifyEmail: async (token: string) => {
    return authAPI.verifyEmail(token);
  },

  // 인증 이메일 재발송
  resendVerificationEmail: async (email: string) => {
    return authAPI.resendVerificationEmail(email);
  },

  // 비밀번호 재설정 요청
  forgotPassword: async (email: string) => {
    return authAPI.forgotPassword(email);
  },

  // 비밀번호 재설정
  resetPassword: async (token: string, newPassword: string) => {
    return authAPI.resetPassword(token, newPassword);
  },
};

// ========================================
// User Service
// ========================================

export const userService = {
  // 현재 사용자 정보 조회
  getMe: async () => {
    return userAPI.getMe();
  },

  // 프로필 수정
  updateProfile: async (data: {
    name?: string;
    profileImage?: string;
    theme?: "dark" | "light";
  }) => {
    const response = await userAPI.updateProfile(data);
    // 로컬 스토리지의 사용자 정보도 업데이트
    const userStr = localStorage.getItem("user");
    if (userStr) {
      const user = JSON.parse(userStr);
      if (data.name) user.name = data.name;
      if (data.profileImage) user.profile_image = data.profileImage;
      if (data.theme) user.theme = data.theme;
      localStorage.setItem("user", JSON.stringify(user));
    }
    return response;
  },

  // 프로필 이미지 업로드
  uploadProfileImage: async (file: File) => {
    const response = await userAPI.uploadProfileImage(file);
    const userStr = localStorage.getItem("user");
    if (userStr) {
      const user = JSON.parse(userStr);
      user.profile_image = response.profile_image;
      localStorage.setItem("user", JSON.stringify(user));
    }
    return response;
  },

  // 프로필 이미지 삭제
  deleteProfileImage: async () => {
    const response = await userAPI.deleteProfileImage();
    const userStr = localStorage.getItem("user");
    if (userStr) {
      const user = JSON.parse(userStr);
      user.profile_image = "";
      localStorage.setItem("user", JSON.stringify(user));
    }
    return response;
  },

  // 비밀번호 변경
  changePassword: async (currentPassword: string, newPassword: string) => {
    return userAPI.changePassword(currentPassword, newPassword);
  },

  // 계정 탈퇴
  deleteAccount: async () => {
    const response = await userAPI.deleteAccount();
    // 로컬 스토리지 정리
    authAPI.clearTokens();
    localStorage.removeItem("user");
    return response;
  },
};

// ========================================
// Invite Link Service
// ========================================

export const inviteLinkService = {
  getInviteLinks: async (boardId: string): Promise<InviteLink[]> => {
    try {
      const response = await inviteLinkAPI.getInviteLinks(boardId);
      return response.invites;
    } catch (error) {
      console.warn("API failed, using mock data for invite links", error);
      if (USE_MOCK_ON_ERROR) {
        return loadFromLocalStorage("kanban_invite_links", []);
      }
      throw error;
    }
  },

  createInviteLink: async (
    boardId: string,
    data: {
      role: "ADMIN" | "MEMBER" | "VIEWER";
      max_uses?: number | null;
      expires_in_hours?: number | null;
    },
  ): Promise<InviteLink> => {
    // 초대 링크는 반드시 백엔드 API를 통해 생성해야 함 (mock 사용 안함)
    const link = await inviteLinkAPI.createInviteLink(boardId, data);
    return link;
  },

  deleteInviteLink: async (boardId: string, linkId: string): Promise<void> => {
    await inviteLinkAPI.deleteInviteLink(boardId, linkId);
  },

  getInviteLinkInfo: async (code: string) => {
    // 초대 링크 유효성은 반드시 백엔드에서 확인해야 함 (mock 사용 안함)
    const info = await inviteLinkAPI.getInviteLinkInfo(code);
    return info;
  },

  acceptInvite: async (code: string) => {
    // 초대 수락은 반드시 백엔드에서 처리해야 함 (mock 사용 안함)
    const result = await inviteLinkAPI.acceptInvite(code);
    return result;
  },
};

// ========================================
// Subscription Service
// ========================================

export const subscriptionService = {
  getSubscription: async (boardId: string): Promise<Subscription> => {
    try {
      const subscription = await subscriptionAPI.getSubscription(boardId);
      return subscription;
    } catch (error) {
      console.warn("API failed, using mock data for subscription", error);
      if (USE_MOCK_ON_ERROR) {
        return {
          status: "TRIAL",
          plan: null,
          billing_cycle: null,
          price: null,
          trial_ends_at: new Date(
            Date.now() + 3 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          current_period_end: null,
          billable_member_count: 1,
          member_limit: 999999,
        };
      }
      throw error;
    }
  },

  changePlan: async (
    boardId: string,
    billingCycle: "MONTHLY" | "YEARLY",
  ): Promise<Subscription> => {
    try {
      const subscription = await subscriptionAPI.changePlan(boardId, {
        billing_cycle: billingCycle,
      });
      return subscription;
    } catch (error) {
      console.warn("API failed for change plan", error);
      throw error;
    }
  },

  cancelSubscription: async (boardId: string): Promise<void> => {
    try {
      await subscriptionAPI.cancelSubscription(boardId);
    } catch (error) {
      console.warn("API failed for cancel subscription", error);
      throw error;
    }
  },

  undoCancellation: async (boardId: string): Promise<void> => {
    try {
      await subscriptionAPI.undoCancellation(boardId);
    } catch (error) {
      console.warn("API failed for undo cancellation", error);
      throw error;
    }
  },

  getBillingPortalUrl: async (boardId: string): Promise<string> => {
    const response = await subscriptionAPI.getBillingPortalUrl(boardId);
    return response.url;
  },

  // Seat 기반 가격 조회
  getSeatPricing: async (boardId: string): Promise<SeatPricing> => {
    try {
      const pricing = await subscriptionAPI.getSeatPricing(boardId);
      return pricing;
    } catch (error) {
      console.warn("API failed, using mock data for seat pricing", error);
      if (USE_MOCK_ON_ERROR) {
        return {
          price_per_seat: {
            monthly: 500, // $5.00 in cents
            yearly: 5000, // $50.00 in cents
          },
          seat_count: 1,
          estimated_price: {
            monthly: 500,
            yearly: 5000,
          },
        };
      }
      throw error;
    }
  },

  // Seat 기반 구독 시작 (Polar Checkout 리다이렉트)
  startSeatSubscription: async (
    boardId: string,
    data: {
      billing_cycle: "MONTHLY" | "YEARLY";
      seat_count: number;
    },
  ): Promise<void> => {
    const response = await subscriptionAPI.createBoardCheckout({
      board_id: boardId,
      billing_cycle: data.billing_cycle,
      seat_count: data.seat_count,
    });
    // Redirect to Polar checkout
    window.location.href = response.data.checkout_url;
  },

  // 추가 시트 구매 (Polar Checkout 리다이렉트)
  purchaseSeats: async (
    boardId: string,
    additionalSeats: number,
  ): Promise<void> => {
    const response = await subscriptionAPI.createSeatCheckout({
      board_id: boardId,
      additional_seats: additionalSeats,
    });
    // Redirect to Polar checkout
    window.location.href = response.data.checkout_url;
  },

  // AI 크레딧 구매 (Polar Checkout 리다이렉트)
  purchaseCredits: async (
    boardId: string,
    creditAmount: number,
  ): Promise<void> => {
    const response = await subscriptionAPI.createCreditCheckout({
      board_id: boardId,
      credit_amount: creditAmount,
    });
    // Redirect to Polar checkout
    window.location.href = response.data.checkout_url;
  },
};

// ========================================
// Activity Service
// ========================================

export const activityService = {
  getActivities: async (
    boardId: string,
    params?: { cursor?: string; limit?: number },
  ): Promise<{
    activities: ActivityLog[];
    has_more: boolean;
    next_cursor: string | null;
  }> => {
    try {
      const response = await activityAPI.getActivities(boardId, params);
      return response;
    } catch (error) {
      console.warn("API failed, using mock data for activities", error);
      if (USE_MOCK_ON_ERROR) {
        return {
          activities: loadFromLocalStorage("kanban_activities", []),
          has_more: false,
          next_cursor: null,
        };
      }
      throw error;
    }
  },
};

// ========================================
// Pricing Service
// ========================================

export const pricingService = {
  getPlans: async (): Promise<{
    plans: PricingPlan[];
    currency: string;
    trial_days: string;
  }> => {
    try {
      const response = await pricingAPI.getPlans();
      return response;
    } catch (error) {
      console.warn("API failed, using mock data for pricing plans", error);
      if (USE_MOCK_ON_ERROR) {
        return {
          plans: [
            {
              id: "team_10",
              name: "팀 10",
              min_members: 4,
              max_members: 10,
              monthly_price: 29000,
              yearly_price: 290000,
              yearly_monthly_price: 24166,
              discount_percentage: 16,
            },
            {
              id: "team_25",
              name: "팀 25",
              min_members: 11,
              max_members: 25,
              monthly_price: 69000,
              yearly_price: 660000,
              yearly_monthly_price: 55000,
              discount_percentage: 20,
            },
            {
              id: "team_50",
              name: "팀 50",
              min_members: 26,
              max_members: 50,
              monthly_price: 129000,
              yearly_price: 1190000,
              yearly_monthly_price: 99166,
              discount_percentage: 23,
            },
          ],
          currency: "KRW",
          trial_days: "7",
        };
      }
      throw error;
    }
  },
};

// ========================================
// Milestone Service
// ========================================

export const milestoneService = {
  getMilestones: async (boardId: string): Promise<Milestone[]> => {
    try {
      const response = await milestoneAPI.getMilestones(boardId);
      // BE에서 상세 정보를 함께 반환하므로 추가 API 호출 없이 바로 반환
      // N+1 문제 제거: 개별 getMilestone 호출 제거
      return response.milestones.map((m) => ({
        id: m.id,
        title: m.title,
        start_date: m.start_date,
        end_date: m.end_date,
        feature_count: m.feature_count,
        progress_percentage: m.progress_percentage,
        // 목록 조회 시에는 features가 없을 수 있음 (상세 조회 시에만 포함)
      }));
    } catch (error) {
      console.warn("API failed, using empty array for milestones", error);
      if (USE_MOCK_ON_ERROR) {
        return [];
      }
      throw error;
    }
  },

  getMilestone: async (
    boardId: string,
    milestoneId: string,
  ): Promise<Milestone> => {
    try {
      const m = await milestoneAPI.getMilestone(boardId, milestoneId);
      return {
        id: m.id,
        title: m.title,
        description: m.description,
        start_date: m.start_date,
        end_date: m.end_date,
        feature_count: m.feature_count,
        progress_percentage: m.progress_percentage,
        features: m.features,
        created_by: m.created_by,
        created_at: m.created_at,
      };
    } catch (error) {
      console.warn("API failed for getMilestone", error);
      throw error;
    }
  },

  createMilestone: async (
    boardId: string,
    data: {
      title: string;
      description?: string;
      start_date: string;
      end_date: string;
      feature_ids?: string[];
    },
  ): Promise<Milestone> => {
    try {
      const m = await milestoneAPI.createMilestone(boardId, data);
      return {
        id: m.id,
        title: m.title,
        description: m.description,
        start_date: m.start_date,
        end_date: m.end_date,
        feature_count: m.feature_count,
        progress_percentage: m.progress_percentage,
        features: m.features,
        created_by: m.created_by,
        created_at: m.created_at,
      };
    } catch (error) {
      console.warn("API failed for createMilestone", error);
      throw error;
    }
  },

  updateMilestone: async (
    boardId: string,
    milestoneId: string,
    data: {
      title?: string;
      description?: string;
      start_date?: string;
      end_date?: string;
    },
  ): Promise<Milestone> => {
    try {
      const m = await milestoneAPI.updateMilestone(boardId, milestoneId, data);
      return {
        id: m.id,
        title: m.title,
        description: m.description,
        start_date: m.start_date,
        end_date: m.end_date,
        feature_count: m.feature_count,
        progress_percentage: m.progress_percentage,
        features: m.features,
        created_by: m.created_by,
        created_at: m.created_at,
      };
    } catch (error) {
      console.warn("API failed for updateMilestone", error);
      throw error;
    }
  },

  deleteMilestone: async (
    boardId: string,
    milestoneId: string,
  ): Promise<void> => {
    try {
      await milestoneAPI.deleteMilestone(boardId, milestoneId);
    } catch (error) {
      console.warn("API failed for deleteMilestone", error);
      throw error;
    }
  },

  addFeatures: async (
    boardId: string,
    milestoneId: string,
    featureIds: string[],
  ): Promise<Milestone> => {
    try {
      const m = await milestoneAPI.addFeatures(
        boardId,
        milestoneId,
        featureIds,
      );
      return {
        id: m.id,
        title: m.title,
        description: m.description,
        start_date: m.start_date,
        end_date: m.end_date,
        feature_count: m.feature_count,
        progress_percentage: m.progress_percentage,
        features: m.features,
        created_by: m.created_by,
        created_at: m.created_at,
      };
    } catch (error) {
      console.warn("API failed for addFeatures", error);
      throw error;
    }
  },

  removeFeature: async (
    boardId: string,
    milestoneId: string,
    featureId: string,
  ): Promise<void> => {
    try {
      await milestoneAPI.removeFeature(boardId, milestoneId, featureId);
    } catch (error) {
      console.warn("API failed for removeFeature", error);
      throw error;
    }
  },

  // Milestone Allocation methods
  getAllocations: async (
    boardId: string,
    milestoneId: string,
  ): Promise<MilestoneAllocation[]> => {
    try {
      const response = await milestoneAPI.getAllocations(boardId, milestoneId);
      return response.allocations;
    } catch (error) {
      console.warn("API failed, returning empty allocations", error);
      if (USE_MOCK_ON_ERROR) {
        return [];
      }
      throw error;
    }
  },

  createAllocation: async (
    boardId: string,
    milestoneId: string,
    data: {
      member_id: string;
      working_days: number;
      total_allocated_hours: number;
    },
  ): Promise<MilestoneAllocation> => {
    try {
      const allocation = await milestoneAPI.createAllocation(
        boardId,
        milestoneId,
        data,
      );
      return allocation;
    } catch (error) {
      console.warn("API failed for createAllocation", error);
      throw error;
    }
  },

  updateAllocation: async (
    boardId: string,
    milestoneId: string,
    allocationId: string,
    data: {
      working_days?: number;
      total_allocated_hours?: number;
    },
  ): Promise<MilestoneAllocation> => {
    try {
      const allocation = await milestoneAPI.updateAllocation(
        boardId,
        milestoneId,
        allocationId,
        data,
      );
      return allocation;
    } catch (error) {
      console.warn("API failed for updateAllocation", error);
      throw error;
    }
  },

  deleteAllocation: async (
    boardId: string,
    milestoneId: string,
    allocationId: string,
  ): Promise<void> => {
    try {
      await milestoneAPI.deleteAllocation(boardId, milestoneId, allocationId);
    } catch (error) {
      console.warn("API failed for deleteAllocation", error);
      throw error;
    }
  },
};

// ========================================
// Statistics Service (Analytics & Productivity)
// ========================================

// 기본 가중치 레벨 (API 실패 시 사용)
const DEFAULT_WEIGHT_LEVELS: WeightLevel[] = [
  { id: "low", name: "Low", weight: 0.5, color: "#94A3B8", position: 0 },
  {
    id: "medium",
    name: "Medium",
    weight: 1.0,
    color: "#6366F1",
    position: 1,
    is_default: true,
  },
  { id: "high", name: "High", weight: 1.5, color: "#F59E0B", position: 2 },
  {
    id: "critical",
    name: "Critical",
    weight: 2.0,
    color: "#EF4444",
    position: 3,
  },
];

// 빈 통계 데이터 (API 실패 시 사용)
const EMPTY_BOARD_STATISTICS: BoardStatistics = {
  summary: {
    total_work_minutes: 0,
    completed_work_minutes: 0,
    incomplete_work_minutes: 0,
    total_tasks: 0,
    completed_tasks: 0,
    incomplete_tasks: 0,
    total_features: 0,
    completed_features: 0,
    average_feature_progress: 0,
    focus_rate: 0,
    period_start: getTodayDateString(),
    period_end: getTodayDateString(),
  },
  by_member: [],
  by_feature: [],
  by_milestone: [],
  by_tag: [],
  impact: {
    total_impact_score: 0,
    by_member: [],
    by_weight_level: [],
  },
  daily_trend: [],
};

const EMPTY_PERSONAL_STATISTICS: PersonalStatistics = {
  summary: {
    total_work_minutes: 0,
    completed_work_minutes: 0,
    total_tasks: 0,
    completed_tasks: 0,
    impact_score: 0,
  },
  by_feature: [],
  by_tag: [],
  top_tasks: [],
  daily_trend: [],
};

export const statisticsService = {
  // 보드 전체 통계 조회
  getBoardStatistics: async (
    boardId: string,
    filter?: StatisticsFilter,
  ): Promise<BoardStatistics> => {
    try {
      const response = await statisticsAPI.getBoardStatistics(boardId, {
        start_date: filter?.start_date || undefined,
        end_date: filter?.end_date || undefined,
        milestone_ids: filter?.milestone_ids,
        feature_ids: filter?.feature_ids,
        member_ids: filter?.member_ids,
        tag_ids: filter?.tag_ids,
      });

      return {
        summary: response.summary,
        by_member: response.by_member,
        by_feature: response.by_feature,
        by_milestone: [], // API에서 별도 조회 필요시 추가
        by_tag: response.by_tag,
        impact: response.impact,
        daily_trend: response.daily_trend,
      };
    } catch (error) {
      console.warn("API failed, using empty statistics", error);
      if (USE_MOCK_ON_ERROR) {
        return EMPTY_BOARD_STATISTICS;
      }
      throw error;
    }
  },

  // 개인 통계 조회 (본인 데이터만)
  getPersonalStatistics: async (
    boardId: string,
    filter?: { start_date?: string; end_date?: string },
  ): Promise<PersonalStatistics> => {
    try {
      const response = await statisticsAPI.getPersonalStatistics(
        boardId,
        filter,
      );
      return response;
    } catch (error) {
      console.warn("API failed, using empty personal statistics", error);
      if (USE_MOCK_ON_ERROR) {
        return EMPTY_PERSONAL_STATISTICS;
      }
      throw error;
    }
  },

  // 가중치 레벨 설정 조회
  getWeightLevels: async (boardId: string): Promise<BoardWeightSettings> => {
    try {
      const response = await statisticsAPI.getWeightLevels(boardId);
      return {
        board_id: response.board_id,
        levels: response.levels,
        default_level_id: response.default_level_id,
      };
    } catch (error) {
      console.warn("API failed, using default weight levels", error);
      if (USE_MOCK_ON_ERROR) {
        return {
          board_id: boardId,
          levels: DEFAULT_WEIGHT_LEVELS,
          default_level_id: "medium",
        };
      }
      throw error;
    }
  },

  // 가중치 레벨 설정 저장
  updateWeightLevels: async (
    boardId: string,
    data: {
      levels: Omit<WeightLevel, "id" | "is_default"> & { id?: string }[];
      default_level_id?: string;
    },
  ): Promise<BoardWeightSettings> => {
    try {
      const response = await statisticsAPI.updateWeightLevels(boardId, {
        levels: data.levels.map((l, i) => ({
          id: l.id,
          name: l.name,
          weight: l.weight,
          color: l.color,
          position: i,
        })),
        default_level_id: data.default_level_id,
      });
      return {
        board_id: response.board_id,
        levels: response.levels,
        default_level_id: response.default_level_id,
      };
    } catch (error) {
      console.warn("API failed for updateWeightLevels", error);
      throw error;
    }
  },

  // Task 가중치 설정
  setTaskWeight: async (
    boardId: string,
    taskId: string,
    weightLevelId: string,
  ): Promise<{ task_id: string; weight_level_id: string }> => {
    try {
      const response = await statisticsAPI.setTaskWeight(
        boardId,
        taskId,
        weightLevelId,
      );
      return response;
    } catch (error) {
      console.warn("API failed for setTaskWeight", error);
      throw error;
    }
  },

  // Task 가중치 조회
  getTaskWeight: async (
    boardId: string,
    taskId: string,
  ): Promise<{ task_id: string; weight_level: WeightLevel | null }> => {
    try {
      const response = await statisticsAPI.getTaskWeight(boardId, taskId);
      return {
        task_id: response.task_id,
        weight_level: response.weight_level,
      };
    } catch (error) {
      console.warn("API failed, returning null weight level", error);
      if (USE_MOCK_ON_ERROR) {
        return { task_id: taskId, weight_level: null };
      }
      throw error;
    }
  },
};

// ========================================
// Management Service (관리 대시보드)
// ========================================

export interface ManagementFilter {
  milestone_id?: string;
  stagnant_task_days?: number;
  stuck_checklist_days?: number;
}

const EMPTY_MANAGEMENT_STATISTICS: ManagementStatistics = {
  milestone_health: [],
  team_productivity: [],
  delayed_items: {
    overdue_features: [],
    stagnant_tasks: [],
    stuck_checklists: [],
    bottleneck_summary: {
      most_delayed_member: null,
      most_problematic_block: null,
      total_overdue_features: 0,
      total_stagnant_tasks: 0,
      total_stuck_checklists: 0,
    },
  },
  summary: {
    total_milestones: 0,
    on_track_milestones: 0,
    at_risk_milestones: 0,
    overdue_milestones: 0,
    total_members: 0,
    members_on_track: 0,
    members_needing_attention: 0,
    total_delayed_items: 0,
    overall_health_score: 100,
  },
  settings: {
    stagnant_task_days_threshold: 3,
    stuck_checklist_days_threshold: 2,
  },
};

export const managementService = {
  // 관리 대시보드 통계 조회
  getManagementStatistics: async (
    boardId: string,
    filter?: ManagementFilter,
  ): Promise<ManagementStatistics> => {
    try {
      const response = await statisticsAPI.getManagementStatistics(boardId, {
        milestone_id: filter?.milestone_id,
        stagnant_task_days: filter?.stagnant_task_days,
        stuck_checklist_days: filter?.stuck_checklist_days,
      });
      return response as ManagementStatistics;
    } catch (error) {
      console.warn("API failed, using empty management statistics", error);
      if (USE_MOCK_ON_ERROR) {
        return EMPTY_MANAGEMENT_STATISTICS;
      }
      throw error;
    }
  },
};

// ========================================
// Admin Service (시스템 관리)
// ========================================

import {
  adminAPI,
  systemAPI,
  AdminUserSummary,
  AdminUserDetail,
  AdminBoardSummary,
  AdminBoardDetail,
  AdminStatistics,
  AdminSubscriptionSummary,
  AdminOrgSummary,
  AdminOrgDetail,
  OrgListResponse,
  AdminOrgStatistics,
  UserListResponse,
  BoardListResponse,
  SubscriptionListResponse,
  SignupTrend,
  ActiveUserStats,
  ConversionStats,
  DiaryStats,
  PersonalConversionStats,
  RetentionAnalysis,
  InactiveUserList,
  TrialDropoutAnalysis,
  ActivityTrends,
  AnnouncementDetail,
  MaintenanceStatus,
  BulkCreateResult,
} from "./api";

export const adminService = {
  // 사용자 목록 조회
  getUsers: async (params: {
    page?: number;
    size?: number;
    search?: string;
  }): Promise<UserListResponse> => {
    const response = await adminAPI.getUsers(params);
    return response;
  },

  // 사용자 상세 조회
  getUser: async (userId: string): Promise<AdminUserDetail> => {
    const response = await adminAPI.getUser(userId);
    return response;
  },

  // 사용자 정보 수정 (역할 변경)
  updateUser: async (
    userId: string,
    data: { system_role?: "USER" | "TESTER" | "ADMIN" },
  ): Promise<AdminUserSummary> => {
    const response = await adminAPI.updateUser(userId, data);
    return response;
  },

  // 사용자의 보드 목록 조회
  getUserBoards: async (userId: string): Promise<AdminBoardSummary[]> => {
    const response = await adminAPI.getUserBoards(userId);
    return response.boards;
  },

  // 사용자 비활성화
  deactivateUser: async (
    userId: string,
    reason?: string,
  ): Promise<AdminUserSummary> => {
    return adminAPI.deactivateUser(userId, reason);
  },

  // 사용자 활성화
  activateUser: async (userId: string): Promise<AdminUserSummary> => {
    return adminAPI.activateUser(userId);
  },

  // 이메일 강제 인증
  verifyUserEmail: async (userId: string): Promise<AdminUserSummary> => {
    return adminAPI.verifyUserEmail(userId);
  },

  // 비밀번호 리셋 메일 발송
  sendPasswordResetEmail: async (
    userId: string,
  ): Promise<{ message: string }> => {
    return adminAPI.sendPasswordResetEmail(userId);
  },

  // Personal Board 생성
  createPersonalBoard: async (userId: string): Promise<{ message: string }> => {
    return adminAPI.createPersonalBoard(userId);
  },

  // 유저 개인 AI 크레딧 조정
  adjustPersonalAiCredits: async (
    userId: string,
    data: { personal_ai_credits?: number; add_bonus_credits?: number },
  ): Promise<AdminUserDetail> => {
    return adminAPI.adjustPersonalAiCredits(userId, data);
  },

  // 사용자 영구 삭제
  deleteUser: async (userId: string): Promise<void> => {
    await adminAPI.deleteUser(userId);
  },

  // 사용자를 보드에서 제거
  removeUserFromBoard: async (
    userId: string,
    boardId: string,
  ): Promise<void> => {
    await adminAPI.removeUserFromBoard(userId, boardId);
  },

  // 보드 목록 조회
  getBoards: async (params: {
    page?: number;
    size?: number;
    search?: string;
    tier?: string;
    board_type?: string;
  }): Promise<BoardListResponse> => {
    const response = await adminAPI.getBoards(params);
    return response;
  },

  // 보드 상세 조회
  getBoard: async (boardId: string): Promise<AdminBoardDetail> => {
    const response = await adminAPI.getBoard(boardId);
    return response;
  },

  // 보드 삭제 (소프트)
  deleteBoard: async (boardId: string): Promise<void> => {
    await adminAPI.deleteBoard(boardId);
  },

  // 보드 복구
  restoreBoard: async (boardId: string): Promise<void> => {
    await adminAPI.restoreBoard(boardId);
  },

  // 보드 영구 삭제
  permanentlyDeleteBoard: async (boardId: string): Promise<void> => {
    await adminAPI.permanentlyDeleteBoard(boardId);
  },

  // 삭제된 보드 목록 조회
  getDeletedBoards: async (params: {
    page?: number;
    size?: number;
    search?: string;
  }): Promise<BoardListResponse> => {
    return adminAPI.getDeletedBoards(params);
  },

  // 보드 이름 변경
  updateBoardName: async (
    boardId: string,
    name: string,
  ): Promise<AdminBoardDetail> => {
    return adminAPI.updateBoardName(boardId, name);
  },

  // 보드 티어 변경
  updateBoardTier: async (
    boardId: string,
    tier: "FREE" | "STANDARD" | "PREMIUM" | "ENTERPRISE",
  ): Promise<AdminBoardSummary> => {
    const response = await adminAPI.updateBoardTier(boardId, tier);
    return response;
  },

  // 소유권 이전
  transferBoardOwnership: async (
    boardId: string,
    newOwnerId: string,
  ): Promise<AdminBoardDetail> => {
    return adminAPI.transferBoardOwnership(boardId, newOwnerId);
  },

  // Trial 기간 연장
  extendTrial: async (
    boardId: string,
    extendDays: number,
  ): Promise<AdminBoardSummary> => {
    return adminAPI.extendTrial(boardId, extendDays);
  },

  // 멤버 역할 변경
  updateMemberRole: async (
    boardId: string,
    memberId: string,
    role: "ADMIN" | "MEMBER" | "VIEWER",
  ): Promise<AdminBoardDetail> => {
    return adminAPI.updateMemberRole(boardId, memberId, role);
  },

  // 시트 수 변경
  updateSeatCount: async (
    boardId: string,
    seatCount: number,
  ): Promise<AdminBoardDetail> => {
    return adminAPI.updateSeatCount(boardId, seatCount);
  },

  // AI 크레딧 조정
  adjustAiCredits: async (
    boardId: string,
    data: { monthly_ai_credits?: number; add_purchased_credits?: number },
  ): Promise<AdminBoardDetail> => {
    return adminAPI.adjustAiCredits(boardId, data);
  },

  // 통계 조회
  getStatistics: async (): Promise<AdminStatistics> => {
    const response = await adminAPI.getStatistics();
    return response;
  },

  // 구독 목록 조회
  getSubscriptions: async (params: {
    page?: number;
    size?: number;
  }): Promise<SubscriptionListResponse> => {
    const response = await adminAPI.getSubscriptions(params);
    return response;
  },

  // Analytics: 가입자 추이
  getSignupTrend: async (days: number = 30): Promise<SignupTrend> => {
    return await adminAPI.getSignupTrend(days);
  },

  // Analytics: DAU/WAU/MAU
  getActiveUserStats: async (days: number = 30): Promise<ActiveUserStats> => {
    return await adminAPI.getActiveUserStats(days);
  },

  // Analytics: 결제 전환율
  getConversionStats: async (days: number = 365): Promise<ConversionStats> => {
    return await adminAPI.getConversionStats(days);
  },

  // Analytics: Diary 통계
  getDiaryStats: async (days: number = 30): Promise<DiaryStats> => {
    return await adminAPI.getDiaryStats(days);
  },

  // Analytics: Personal → Team 전환 통계
  getPersonalConversionStats: async (
    days: number = 365,
  ): Promise<PersonalConversionStats> => {
    return await adminAPI.getPersonalConversionStats(days);
  },

  // Churn Analysis
  getRetentionAnalysis: async (weeks: number = 8): Promise<RetentionAnalysis> => {
    return await adminAPI.getRetentionAnalysis(weeks);
  },
  getInactiveUsers: async (inactiveDays: number = 14, page: number = 0, size: number = 20): Promise<InactiveUserList> => {
    return await adminAPI.getInactiveUsers(inactiveDays, page, size);
  },
  getTrialDropoutAnalysis: async (days: number = 90): Promise<TrialDropoutAnalysis> => {
    return await adminAPI.getTrialDropoutAnalysis(days);
  },
  getActivityTrends: async (days: number = 90): Promise<ActivityTrends> => {
    return await adminAPI.getActivityTrends(days);
  },

  // 공지사항 관리
  getAnnouncements: async (): Promise<AnnouncementDetail[]> => {
    return await adminAPI.getAnnouncements();
  },

  createAnnouncement: async (data: {
    title: string;
    content?: string;
    type?: "POPUP" | "BANNER" | "NOTICE";
    is_active?: boolean;
    start_at?: string | null;
    end_at?: string | null;
    priority?: number;
    target_role?: string | null;
  }): Promise<AnnouncementDetail> => {
    return await adminAPI.createAnnouncement(data);
  },

  updateAnnouncement: async (
    id: string,
    data: {
      title: string;
      content?: string;
      type?: "POPUP" | "BANNER" | "NOTICE";
      is_active?: boolean;
      start_at?: string | null;
      end_at?: string | null;
      priority?: number;
      target_role?: string | null;
    },
  ): Promise<AnnouncementDetail> => {
    return await adminAPI.updateAnnouncement(id, data);
  },

  deleteAnnouncement: async (id: string): Promise<void> => {
    await adminAPI.deleteAnnouncement(id);
  },

  bulkCreatePersonalBoards: async (): Promise<BulkCreateResult> => {
    return await adminAPI.bulkCreatePersonalBoards();
  },

  // ==================== Organizations ====================

  // 조직 목록 조회
  getOrganizations: async (params: {
    page?: number;
    size?: number;
    search?: string;
  }): Promise<OrgListResponse> => {
    return adminAPI.getOrganizations(params);
  },

  // 삭제된 조직 목록 조회
  getDeletedOrganizations: async (params: {
    page?: number;
    size?: number;
    search?: string;
  }): Promise<OrgListResponse> => {
    return adminAPI.getDeletedOrganizations(params);
  },

  // 조직 상세 조회
  getOrganization: async (orgId: string): Promise<AdminOrgDetail> => {
    return adminAPI.getOrganization(orgId);
  },

  // 조직 정보 수정
  updateOrganization: async (
    orgId: string,
    data: { name?: string; description?: string },
  ): Promise<AdminOrgDetail> => {
    return adminAPI.updateOrganization(orgId, data);
  },

  // 조직 삭제 (소프트)
  deleteOrganization: async (orgId: string): Promise<void> => {
    await adminAPI.deleteOrganization(orgId);
  },

  // 조직 복구
  restoreOrganization: async (orgId: string): Promise<void> => {
    await adminAPI.restoreOrganization(orgId);
  },

  // 조직 영구 삭제
  permanentlyDeleteOrganization: async (orgId: string): Promise<void> => {
    await adminAPI.permanentlyDeleteOrganization(orgId);
  },

  // 소유권 이전
  transferOrgOwnership: async (
    orgId: string,
    newOwnerMemberId: string,
  ): Promise<AdminOrgDetail> => {
    return adminAPI.transferOrgOwnership(orgId, newOwnerMemberId);
  },

  // 구독 수정
  updateOrgSubscription: async (
    orgId: string,
    data: {
      plan?: string;
      status?: string;
      billing_cycle?: string;
      seat_count?: number;
    },
  ): Promise<AdminOrgDetail> => {
    return adminAPI.updateOrgSubscription(orgId, data);
  },

  // Trial 연장
  extendOrgTrial: async (
    orgId: string,
    extendDays: number,
  ): Promise<AdminOrgDetail> => {
    return adminAPI.extendOrgTrial(orgId, extendDays);
  },

  // 조직 AI 크레딧 조정
  adjustOrgAiCredits: async (
    orgId: string,
    data: {
      monthly_ai_credits?: number;
      reset_used_credits?: boolean;
      add_bonus_credits?: number;
    },
  ): Promise<AdminOrgDetail> => {
    return adminAPI.adjustOrgAiCredits(orgId, data);
  },

  // 조직 통계
  getOrgStatistics: async (): Promise<AdminOrgStatistics> => {
    return adminAPI.getOrgStatistics();
  },

  // 수익화 토글
  getMonetizationStatus: async (): Promise<{ monetization_enabled: boolean }> => {
    return await adminAPI.getMonetizationStatus();
  },

  setMonetizationEnabled: async (enabled: boolean): Promise<{ monetization_enabled: boolean }> => {
    return await adminAPI.setMonetizationEnabled(enabled);
  },

  // 점검 모드
  getMaintenanceStatus: async (): Promise<MaintenanceStatus> => {
    return await adminAPI.getMaintenanceStatus();
  },

  setMaintenanceMode: async (data: {
    enabled: boolean;
    message?: string;
    estimated_end_at?: string | null;
  }): Promise<MaintenanceStatus> => {
    return await adminAPI.setMaintenanceMode(data);
  },

  // 문의 관리
  getInquiries: async (params: {
    page?: number;
    size?: number;
    status?: string;
  }) => {
    return await adminAPI.getInquiries(params);
  },

  getInquiryDetail: async (inquiryId: string) => {
    return await adminAPI.getInquiryDetail(inquiryId);
  },

  replyToInquiry: async (inquiryId: string, content: string) => {
    return await adminAPI.replyToInquiry(inquiryId, content);
  },

  updateInquiryStatus: async (inquiryId: string, status: string) => {
    return await adminAPI.updateInquiryStatus(inquiryId, status);
  },
};

// ========================================
// System Service (공개 API)
// ========================================

export const getMonetizationStatus = async (): Promise<{ monetization_enabled: boolean }> => {
  return await systemAPI.getMonetizationStatus();
};

// ========================================
// Inquiry Service (유저용)
// ========================================

export const inquiryService = {
  createInquiry: async (data: {
    title: string;
    content: string;
    fileKeys?: string[];
  }) => {
    return await inquiryAPI.createInquiry(data);
  },

  getMyInquiries: async () => {
    return await inquiryAPI.getMyInquiries();
  },

  getInquiry: async (inquiryId: string) => {
    return await inquiryAPI.getInquiry(inquiryId);
  },

  replyToInquiry: async (inquiryId: string, content: string) => {
    return await inquiryAPI.replyToInquiry(inquiryId, content);
  },

  getUnreadReplyCount: async () => {
    return await inquiryAPI.getUnreadReplyCount();
  },
};

export const systemService = {
  getStatus: async (): Promise<MaintenanceStatus> => {
    return await systemAPI.getStatus();
  },

  getActiveAnnouncements: async (): Promise<AnnouncementDetail[]> => {
    return await systemAPI.getActiveAnnouncements();
  },

  getMonetizationStatus: async (): Promise<{ monetization_enabled: boolean }> => {
    return await systemAPI.getMonetizationStatus();
  },
};

// ========================================
// Note Service
// ========================================

export const noteService = {
  getTree: async (boardId: string) => {
    return await noteAPI.getTree(boardId);
  },

  getList: async (boardId: string) => {
    return await noteAPI.getList(boardId);
  },

  getDetail: async (boardId: string, noteId: string) => {
    return await noteAPI.getDetail(boardId, noteId);
  },

  create: async (
    boardId: string,
    data: {
      title: string;
      type: "FOLDER" | "DOCUMENT" | "BOARD";
      parentId?: string | null;
      content?: string;
      tagIds?: string[];
    },
  ) => {
    return await noteAPI.create(boardId, data);
  },

  update: async (
    boardId: string,
    noteId: string,
    data: {
      title?: string;
      content?: string;
      tagIds?: string[];
    },
    createVersion = true,
  ) => {
    return await noteAPI.update(boardId, noteId, data, createVersion);
  },

  delete: async (boardId: string, noteId: string) => {
    return await noteAPI.delete(boardId, noteId);
  },

  move: async (
    boardId: string,
    noteId: string,
    data: {
      parentId?: string | null;
      position?: number;
    },
  ) => {
    return await noteAPI.move(boardId, noteId, data);
  },

  getVersions: async (boardId: string, noteId: string) => {
    return await noteAPI.getVersions(boardId, noteId);
  },

  getVersionDetail: async (
    boardId: string,
    noteId: string,
    versionId: string,
  ) => {
    return await noteAPI.getVersionDetail(boardId, noteId, versionId);
  },

  restoreVersion: async (
    boardId: string,
    noteId: string,
    versionId: string,
    liveSnapshot?: { current_title?: string; current_content?: string },
  ) => {
    return await noteAPI.restoreVersion(boardId, noteId, versionId, liveSnapshot);
  },

  deleteVersion: async (
    boardId: string,
    noteId: string,
    versionId: string,
  ) => {
    return await noteAPI.deleteVersion(boardId, noteId, versionId);
  },

  deleteAllVersions: async (boardId: string, noteId: string) => {
    return await noteAPI.deleteAllVersions(boardId, noteId);
  },

  getTags: async (boardId: string) => {
    return await noteAPI.getTags(boardId);
  },

  createTag: async (boardId: string, data: { name: string; color: string }) => {
    return await noteAPI.createTag(boardId, data);
  },

  deleteTag: async (boardId: string, tagId: string) => {
    return await noteAPI.deleteTag(boardId, tagId);
  },

  enableShare: async (boardId: string, noteId: string) => {
    return await noteAPI.enableShare(boardId, noteId);
  },

  disableShare: async (boardId: string, noteId: string) => {
    return await noteAPI.disableShare(boardId, noteId);
  },

  toggleLike: async (boardId: string, noteId: string) => {
    return await noteAPI.toggleLike(boardId, noteId);
  },

  getTrash: async (boardId: string) => {
    return await noteAPI.getTrash(boardId);
  },
  restoreFromTrash: async (boardId: string, noteId: string) => {
    return await noteAPI.restoreFromTrash(boardId, noteId);
  },
  permanentDelete: async (boardId: string, noteId: string) => {
    return await noteAPI.permanentDelete(boardId, noteId);
  },
  emptyTrash: async (boardId: string) => {
    return await noteAPI.emptyTrash(boardId);
  },
};

// ========================================
// Note Comment Service
// ========================================

import { noteCommentAPI } from "./api";

export const noteCommentService = {
  getComments: async (boardId: string, noteId: string) => {
    return await noteCommentAPI.getComments(boardId, noteId);
  },

  createComment: async (
    boardId: string,
    noteId: string,
    data: {
      content: string;
      block_id?: string | null;
      parent_id?: string | null;
      mentions?: string[];
    },
  ) => {
    return await noteCommentAPI.createComment(boardId, noteId, data);
  },

  updateComment: async (
    boardId: string,
    noteId: string,
    commentId: string,
    data: {
      content: string;
      mentions?: string[];
    },
  ) => {
    return await noteCommentAPI.updateComment(boardId, noteId, commentId, data);
  },

  deleteComment: async (boardId: string, noteId: string, commentId: string) => {
    return await noteCommentAPI.deleteComment(boardId, noteId, commentId);
  },

  toggleResolved: async (
    boardId: string,
    noteId: string,
    commentId: string,
  ) => {
    return await noteCommentAPI.toggleResolved(boardId, noteId, commentId);
  },

  toggleReaction: async (
    boardId: string,
    noteId: string,
    commentId: string,
    emoji: string,
  ) => {
    return await noteCommentAPI.toggleReaction(
      boardId,
      noteId,
      commentId,
      emoji,
    );
  },
};

// ========================================
// Organization Note Service
// ========================================

import { orgNoteAPI, orgNoteCommentAPI } from "./api";

export const orgNoteService = {
  getBoardNotes: async (orgId: string) => {
    return await orgNoteAPI.getBoardNotes(orgId);
  },
  getTree: async (orgId: string) => {
    return await orgNoteAPI.getTree(orgId);
  },
  getList: async (orgId: string) => {
    return await orgNoteAPI.getList(orgId);
  },
  getDetail: async (orgId: string, noteId: string) => {
    return await orgNoteAPI.getDetail(orgId, noteId);
  },
  create: async (
    orgId: string,
    data: {
      title: string;
      type: "FOLDER" | "DOCUMENT" | "BOARD";
      parentId?: string | null;
      content?: string;
      tagIds?: string[];
    },
  ) => {
    return await orgNoteAPI.create(orgId, data);
  },
  update: async (
    orgId: string,
    noteId: string,
    data: { title?: string; content?: string; tagIds?: string[] },
    createVersion = true,
  ) => {
    return await orgNoteAPI.update(orgId, noteId, data, createVersion);
  },
  delete: async (orgId: string, noteId: string) => {
    return await orgNoteAPI.delete(orgId, noteId);
  },
  move: async (
    orgId: string,
    noteId: string,
    data: { parentId?: string | null; position?: number },
  ) => {
    return await orgNoteAPI.move(orgId, noteId, data);
  },
  getVersions: async (orgId: string, noteId: string) => {
    return await orgNoteAPI.getVersions(orgId, noteId);
  },
  getVersionDetail: async (orgId: string, noteId: string, versionId: string) => {
    return await orgNoteAPI.getVersionDetail(orgId, noteId, versionId);
  },
  restoreVersion: async (
    orgId: string,
    noteId: string,
    versionId: string,
    liveSnapshot?: { current_title?: string; current_content?: string },
  ) => {
    return await orgNoteAPI.restoreVersion(orgId, noteId, versionId, liveSnapshot);
  },
  deleteVersion: async (orgId: string, noteId: string, versionId: string) => {
    return await orgNoteAPI.deleteVersion(orgId, noteId, versionId);
  },
  deleteAllVersions: async (orgId: string, noteId: string) => {
    return await orgNoteAPI.deleteAllVersions(orgId, noteId);
  },
  getTags: async (orgId: string) => {
    return await orgNoteAPI.getTags(orgId);
  },
  createTag: async (orgId: string, data: { name: string; color: string }) => {
    return await orgNoteAPI.createTag(orgId, data);
  },
  deleteTag: async (orgId: string, tagId: string) => {
    return await orgNoteAPI.deleteTag(orgId, tagId);
  },
  enableShare: async (orgId: string, noteId: string) => {
    return await orgNoteAPI.enableShare(orgId, noteId);
  },
  disableShare: async (orgId: string, noteId: string) => {
    return await orgNoteAPI.disableShare(orgId, noteId);
  },
  toggleLike: async (orgId: string, noteId: string) => {
    return await orgNoteAPI.toggleLike(orgId, noteId);
  },
  getTrash: async (orgId: string) => {
    return await orgNoteAPI.getTrash(orgId);
  },
  restoreFromTrash: async (orgId: string, noteId: string) => {
    return await orgNoteAPI.restoreFromTrash(orgId, noteId);
  },
  permanentDelete: async (orgId: string, noteId: string) => {
    return await orgNoteAPI.permanentDelete(orgId, noteId);
  },
  emptyTrash: async (orgId: string) => {
    return await orgNoteAPI.emptyTrash(orgId);
  },
};

export const orgNoteCommentService = {
  getComments: async (orgId: string, noteId: string) => {
    return await orgNoteCommentAPI.getComments(orgId, noteId);
  },
  createComment: async (
    orgId: string,
    noteId: string,
    data: {
      content: string;
      block_id?: string | null;
      parent_id?: string | null;
      mentions?: string[];
    },
  ) => {
    return await orgNoteCommentAPI.createComment(orgId, noteId, data);
  },
  updateComment: async (
    orgId: string,
    noteId: string,
    commentId: string,
    data: { content: string; mentions?: string[] },
  ) => {
    return await orgNoteCommentAPI.updateComment(orgId, noteId, commentId, data);
  },
  deleteComment: async (orgId: string, noteId: string, commentId: string) => {
    return await orgNoteCommentAPI.deleteComment(orgId, noteId, commentId);
  },
  toggleResolved: async (orgId: string, noteId: string, commentId: string) => {
    return await orgNoteCommentAPI.toggleResolved(orgId, noteId, commentId);
  },
  toggleReaction: async (orgId: string, noteId: string, commentId: string, emoji: string) => {
    return await orgNoteCommentAPI.toggleReaction(orgId, noteId, commentId, emoji);
  },
};

// ========================================
// Monitoring Service
// ========================================

export const monitoringService = {
  getDashboard: async () => {
    const response = await apiClient.get("/admin/monitoring/dashboard");
    return response.data || response;
  },

  getApiMetricHistory: async (hours: number = 24) => {
    const response = await apiClient.get(
      `/admin/monitoring/api-metrics/history?hours=${hours}`,
    );
    return (response.data || response).snapshots || [];
  },

  getAlertConfig: async () => {
    const response = await apiClient.get("/admin/monitoring/alert-config");
    return response.data || response;
  },

  updateAlertConfig: async (config: {
    slack_webhook_url: string;
    enabled: boolean;
    alert_email_recipients?: string[];
  }) => {
    const response = await apiClient.put(
      "/admin/monitoring/alert-config",
      config,
    );
    return response.data || response;
  },

  sendTestAlert: async () => {
    await apiClient.post("/admin/monitoring/alert-test");
  },

  getAiUsage: async (days: number = 30) => {
    const response = await apiClient.get(
      `/admin/monitoring/ai-usage?days=${days}`,
    );
    return response.data || response;
  },

  getOpenAIBilling: async (days: number = 30) => {
    const response = await apiClient.get(
      `/admin/monitoring/openai-billing?days=${days}`,
    );
    return response.data || response;
  },
};

// ========================================
// AI Credit Service
// ========================================

import type {
  AiCredits,
  AiCreditPurchaseRequest,
  AiCreditPurchaseResult,
  AiCreditPurchaseHistory,
  AiCreditUsageHistory,
} from "../types";

export const aiCreditService = {
  // 크레딧 조회
  getCredits: async (boardId: string): Promise<AiCredits> => {
    const response = await apiClient.get(`/boards/${boardId}/ai-credits`);
    return response.data || response;
  },

  // 크레딧 구매
  purchase: async (
    boardId: string,
    data: AiCreditPurchaseRequest,
  ): Promise<AiCreditPurchaseResult> => {
    const response = await apiClient.post(
      `/boards/${boardId}/ai-credits/purchase`,
      data,
    );
    return response.data || response;
  },

  // 구매 이력 조회
  getPurchases: async (boardId: string): Promise<AiCreditPurchaseHistory[]> => {
    const response = await apiClient.get(
      `/boards/${boardId}/ai-credits/purchases`,
    );
    return (response.data || response).purchases || response.data || response;
  },

  // AI 사용 내역 조회
  getUsageHistory: async (
    boardId: string,
    days: number = 30,
  ): Promise<AiCreditUsageHistory[]> => {
    const response = await apiClient.get(
      `/boards/${boardId}/ai-credits/usage?days=${days}`,
    );
    return response.data || response;
  },
};

// ========================================
// Task Dependency Service
// ========================================

import { taskDependencyAPI, personalEventAPI, diaryAPI } from "./api";
import type {
  TaskDependency,
  PersonalEvent,
  DiaryDetail,
  DiarySimple,
  DiaryAiReply,
  DiaryVoiceReply,
  DiaryVoiceSettings,
} from "../types";

export const taskDependencyService = {
  getByBoard: async (boardId: string) => {
    return taskDependencyAPI.getByBoard(boardId);
  },

  create: async (
    boardId: string,
    predecessorId: string,
    successorId: string,
  ) => {
    return taskDependencyAPI.create(boardId, {
      predecessor_id: predecessorId,
      successor_id: successorId,
    });
  },

  delete: async (boardId: string, dependencyId: string) => {
    return taskDependencyAPI.delete(boardId, dependencyId);
  },
};

// ========================================
// Personal Event Service
// ========================================

export const personalEventService = {
  getByDate: async (
    date: string,
    eventType?: string,
  ): Promise<PersonalEvent[]> => {
    return personalEventAPI.getByDate(date, eventType);
  },

  getWeekly: async (
    startDate: string,
    endDate: string,
    eventType?: string,
  ): Promise<PersonalEvent[]> => {
    return personalEventAPI.getWeekly(startDate, endDate, eventType);
  },

  create: async (data: {
    title: string;
    description?: string;
    event_date: string;
    end_date?: string;
    start_time?: string;
    end_time?: string;
    color?: string;
    all_day?: boolean;
    recurrence_rule?: string;
    recurrence_end_date?: string;
    recurrence_days_of_week?: number[];
    event_type?: string;
  }): Promise<PersonalEvent> => {
    return personalEventAPI.create(data);
  },

  update: async (
    eventId: string,
    data: {
      title?: string;
      description?: string;
      event_date?: string;
      end_date?: string | null;
      start_time?: string | null;
      end_time?: string | null;
      color?: string;
      all_day?: boolean;
      recurrence_rule?: string;
      recurrence_end_date?: string;
      recurrence_days_of_week?: number[];
      scope?: string;
    },
  ): Promise<PersonalEvent> => {
    return personalEventAPI.update(eventId, data);
  },

  delete: async (eventId: string, scope?: string): Promise<void> => {
    return personalEventAPI.delete(eventId, scope);
  },
};

// ========================================
// Diary Service
// ========================================

export const diaryService = {
  getByDate: async (date: string): Promise<DiaryDetail | null> => {
    return diaryAPI.getByDate(date);
  },

  getById: async (diaryId: string): Promise<DiaryDetail> => {
    return diaryAPI.getById(diaryId);
  },

  getList: async (year: number, month: number): Promise<DiarySimple[]> => {
    return diaryAPI.getList(year, month);
  },

  create: async (diaryDate: string, language?: string): Promise<DiaryDetail> => {
    return diaryAPI.create(diaryDate, language);
  },

  sendMessage: async (
    diaryId: string,
    content: string,
    language?: string,
  ): Promise<DiaryAiReply> => {
    return diaryAPI.sendMessage(diaryId, content, language);
  },

  complete: async (
    diaryId: string,
    data: {
      title?: string;
      content?: string;
      mood?: string;
    },
    language?: string,
  ): Promise<DiaryDetail> => {
    return diaryAPI.complete(diaryId, data, language);
  },

  reopen: async (diaryId: string): Promise<DiaryDetail> => {
    return diaryAPI.reopen(diaryId);
  },

  reset: async (diaryId: string, language?: string): Promise<DiaryDetail> => {
    return diaryAPI.reset(diaryId, language);
  },

  update: async (
    diaryId: string,
    data: {
      title?: string;
      content?: string;
      mood?: string;
    },
  ): Promise<DiaryDetail> => {
    return diaryAPI.update(diaryId, data);
  },

  delete: async (diaryId: string): Promise<void> => {
    return diaryAPI.delete(diaryId);
  },

  sendVoiceMessage: async (
    diaryId: string,
    audioBlob: Blob,
    language?: string,
  ): Promise<DiaryVoiceReply> => {
    return diaryAPI.sendVoiceMessage(diaryId, audioBlob, language);
  },

  getVoiceSettings: async (): Promise<DiaryVoiceSettings> => {
    return diaryAPI.getVoiceSettings();
  },

  updateVoiceSettings: async (
    data: Partial<DiaryVoiceSettings>,
  ): Promise<DiaryVoiceSettings> => {
    return diaryAPI.updateVoiceSettings(data);
  },

  // Personal AI Credits
  getPersonalCredits: async (): Promise<AiCredits> => {
    return diaryAPI.getPersonalCredits();
  },

  purchasePersonalCredits: async (
    data: AiCreditPurchaseRequest,
  ): Promise<AiCreditPurchaseResult> => {
    return diaryAPI.purchasePersonalCredits(data);
  },

  getWorkContext: diaryAPI.getWorkContext,
};

// ─── Personal Task Service (v9.0) ───

export const personalTaskService = {
  getTasks: personalTaskAPI.getAll,
  getTask: personalTaskAPI.getById,
  createTask: personalTaskAPI.create,
  updateTask: personalTaskAPI.update,
  updateStatus: personalTaskAPI.updateStatus,
  updatePosition: personalTaskAPI.updatePosition,
  deleteTask: personalTaskAPI.delete,
  getCategories: personalTaskAPI.getCategories,
};

export const personalHabitService = {
  getHabits: personalHabitAPI.getAll,
  getHabit: personalHabitAPI.getById,
  createHabit: personalHabitAPI.create,
  updateHabit: personalHabitAPI.update,
  deleteHabit: personalHabitAPI.delete,
  updatePosition: personalHabitAPI.updatePosition,
  checkIn: personalHabitAPI.checkIn,
  getLogs: personalHabitAPI.getLogs,
  getToday: personalHabitAPI.getToday,
  getWeekly: personalHabitAPI.getWeekly,
};

export const personalDashboardService = {
  getToday: personalDashboardAPI.getToday,
  getOverview: personalDashboardAPI.getOverview,
  getBoardTasks: personalDashboardAPI.getBoardTasks,
  getCelebrations: personalDashboardAPI.getCelebrations,
};

export const personalCalendarService = {
  getUnifiedCalendar: personalCalendarAPI.getUnifiedCalendar,
};

// ─── Organization Service ───

export const organizationService = {
  list: organizationAPI.list,
  get: organizationAPI.get,
  create: organizationAPI.create,
  update: organizationAPI.update,
  uploadLogo: organizationAPI.uploadLogo,
  delete: organizationAPI.delete,
  transferOwnership: organizationAPI.transferOwnership,

  // Structure Data (combined)
  getStructureData: organizationAPI.getStructureData,

  // Departments
  getDepartments: organizationAPI.getDepartments,
  createDepartment: organizationAPI.createDepartment,
  updateDepartment: organizationAPI.updateDepartment,
  deleteDepartment: organizationAPI.deleteDepartment,

  // Job Groups
  getJobGroups: organizationAPI.getJobGroups,
  createJobGroup: organizationAPI.createJobGroup,
  updateJobGroup: organizationAPI.updateJobGroup,
  deleteJobGroup: organizationAPI.deleteJobGroup,

  // Positions
  getPositions: organizationAPI.getPositions,
  createPosition: organizationAPI.createPosition,
  updatePosition: organizationAPI.updatePosition,
  deletePosition: organizationAPI.deletePosition,

  // Titles
  getTitles: organizationAPI.getTitles,
  createTitle: organizationAPI.createTitle,
  updateTitle: organizationAPI.updateTitle,
  deleteTitle: organizationAPI.deleteTitle,

  // Grades
  getGrades: organizationAPI.getGrades,
  createGrade: organizationAPI.createGrade,
  updateGrade: organizationAPI.updateGrade,
  deleteGrade: organizationAPI.deleteGrade,

  // Members
  getMembers: organizationAPI.getMembers,
  getMember: organizationAPI.getMember,
  inviteMember: organizationAPI.inviteMember,
  updateMember: organizationAPI.updateMember,
  changeMemberRole: organizationAPI.changeMemberRole,
  removeMember: organizationAPI.removeMember,
  getMemberBoards: organizationAPI.getMemberBoards,
  getMemberLeaveBalances: organizationAPI.getMemberLeaveBalances,
  uploadMemberProfileImage: organizationAPI.uploadMemberProfileImage,
  deleteMemberProfileImage: organizationAPI.deleteMemberProfileImage,
  updateMemberConcurrentDepts: organizationAPI.updateMemberConcurrentDepts,

  // Member History
  getMemberHistory: organizationAPI.getMemberHistory,
  createMemberHistory: organizationAPI.createMemberHistory,
  updateMemberHistoryDescription: organizationAPI.updateMemberHistoryDescription,
  deleteMemberHistory: organizationAPI.deleteMemberHistory,

  // Boards
  getBoards: organizationAPI.getBoards,
  checkBoardEligibility: organizationAPI.checkBoardEligibility,
  addBoard: organizationAPI.addBoard,
  createBoard: organizationAPI.createBoard,
  removeBoard: organizationAPI.removeBoard,
  deleteBoard: organizationAPI.deleteBoard,

  // Invite Links
  getInviteLinks: organizationAPI.getInviteLinks,
  createInviteLink: organizationAPI.createInviteLink,
  deleteInviteLink: organizationAPI.deleteInviteLink,
  getInviteInfo: organizationAPI.getInviteInfo,
  acceptInvite: organizationAPI.acceptInvite,

  // Onboarding
  getOnboardingTemplates: organizationAPI.getOnboardingTemplates,
  getOnboardingTemplate: organizationAPI.getOnboardingTemplate,
  createOnboardingTemplate: organizationAPI.createOnboardingTemplate,
  updateOnboardingTemplate: organizationAPI.updateOnboardingTemplate,
  deleteOnboardingTemplate: organizationAPI.deleteOnboardingTemplate,
  getOnboardingInstances: organizationAPI.getOnboardingInstances,
  getOnboardingInstanceItems: organizationAPI.getOnboardingInstanceItems,
  toggleOnboardingItem: organizationAPI.toggleOnboardingItem,
  createOnboardingInstance: organizationAPI.createOnboardingInstance,

  // Chart
  getChart: organizationAPI.getChart,
  updateManager: organizationAPI.updateManager,

  // Insights
  getInsightsSummary: organizationAPI.getInsightsSummary,
  getInsightMembers: organizationAPI.getInsightMembers,
  getInsightMemberDetail: organizationAPI.getInsightMemberDetail,
  getInsightBoards: organizationAPI.getInsightBoards,

  // 1:1 Meeting Notes
  getOneOnOnes: organizationAPI.getOneOnOnes,
  createOneOnOne: organizationAPI.createOneOnOne,
  updateOneOnOne: organizationAPI.updateOneOnOne,
  deleteOneOnOne: organizationAPI.deleteOneOnOne,
  getOneOnOneByMember: organizationAPI.getOneOnOneByMember,
  getOneOnOneMeetings: organizationAPI.getOneOnOneMeetings,
  createOneOnOneMeeting: organizationAPI.createOneOnOneMeeting,
  updateOneOnOneMeeting: organizationAPI.updateOneOnOneMeeting,
  deleteOneOnOneMeeting: organizationAPI.deleteOneOnOneMeeting,
  toggleOneOnOneActionItem: organizationAPI.toggleOneOnOneActionItem,
  getOneOnOneOpenActions: organizationAPI.getOneOnOneOpenActions,

  // Attendance & Time Tracking
  clockIn: organizationAPI.clockIn,
  clockOut: organizationAPI.clockOut,
  cancelClockOut: organizationAPI.cancelClockOut,
  getMyAttendanceRecords: organizationAPI.getMyAttendanceRecords,
  getAttendanceToday: organizationAPI.getAttendanceToday,
  getAttendanceTodayMembers: organizationAPI.getAttendanceTodayMembers,
  getAttendanceTeamSummary: organizationAPI.getAttendanceTeamSummary,
  adminModifyAttendance: organizationAPI.adminModifyAttendance,
  getAttendancePolicy: organizationAPI.getAttendancePolicy,
  updateAttendancePolicy: organizationAPI.updateAttendancePolicy,
  getAttendanceHolidays: organizationAPI.getAttendanceHolidays,
  createAttendanceHoliday: organizationAPI.createAttendanceHoliday,
  deleteAttendanceHoliday: organizationAPI.deleteAttendanceHoliday,
  exportAttendanceCsv: organizationAPI.exportAttendanceCsv,

  // Structure Settings
  getStructureSettings: organizationAPI.getStructureSettings,
  updateStructureSettings: organizationAPI.updateStructureSettings,
};

// ─── Organization Announcement Service ───

export const orgAnnouncementService = {
  list: orgAnnouncementAPI.list,
  create: orgAnnouncementAPI.create,
  update: orgAnnouncementAPI.update,
  delete: orgAnnouncementAPI.delete,
  togglePin: orgAnnouncementAPI.togglePin,
  getComments: orgAnnouncementAPI.getComments,
  addComment: orgAnnouncementAPI.addComment,
  updateComment: orgAnnouncementAPI.updateComment,
  deleteComment: orgAnnouncementAPI.deleteComment,
};

// ─── Organization Activity Service ───

export const orgActivityService = {
  list: orgActivityAPI.list,
};

// ─── Leave Service ───

export const leaveService = {
  getPolicies: leaveAPI.getPolicies,
  createPolicy: leaveAPI.createPolicy,
  updatePolicy: leaveAPI.updatePolicy,

  getOnLeaveToday: leaveAPI.getOnLeaveToday,
  getMyBalance: leaveAPI.getMyBalance,
  getMemberBalance: leaveAPI.getMemberBalance,
  updateMemberBalance: leaveAPI.updateMemberBalance,

  getRequests: leaveAPI.getRequests,
  createRequest: leaveAPI.createRequest,
  approveRequest: leaveAPI.approveRequest,
  rejectRequest: leaveAPI.rejectRequest,
  cancelRequest: leaveAPI.cancelRequest,
  reopenRequest: leaveAPI.reopenRequest,
};

// ─── Anniversary & Celebrations Service ───

export const anniversaryService = {
  getUpcoming: anniversaryAPI.getUpcoming,
  getMessages: anniversaryAPI.getMessages,
  createMessage: anniversaryAPI.createMessage,
  updateMessage: anniversaryAPI.updateMessage,
  deleteMessage: anniversaryAPI.deleteMessage,
  getSettings: anniversaryAPI.getSettings,
  updateSettings: anniversaryAPI.updateSettings,
};

// ─── OKR Service ───

export const okrService = {
  // Cycles
  getCycles: (orgId: string) =>
    apiClient.get<OkrCycle[]>(`/organizations/${orgId}/okr/cycles`),
  createCycle: (orgId: string, data: { name: string; cycle_type: string; start_date: string; end_date: string }) =>
    apiClient.post<OkrCycle>(`/organizations/${orgId}/okr/cycles`, data),
  updateCycle: (orgId: string, cycleId: string, data: { name?: string; cycle_type?: string; start_date?: string; end_date?: string; status?: string }) =>
    apiClient.put<OkrCycle>(`/organizations/${orgId}/okr/cycles/${cycleId}`, data),
  deleteCycle: (orgId: string, cycleId: string) =>
    apiClient.delete<void>(`/organizations/${orgId}/okr/cycles/${cycleId}`),

  // Tree (full tree query)
  getTree: (orgId: string, cycleId: string) =>
    apiClient.get<OkrTreeData>(`/organizations/${orgId}/okr/cycles/${cycleId}/tree`),

  // Objectives
  createObjective: (orgId: string, cycleId: string, data: {
    title: string; description?: string; level: string;
    department_id?: string; owner_id?: string; parent_objective_id?: string;
  }) =>
    apiClient.post<OkrObjective>(`/organizations/${orgId}/okr/cycles/${cycleId}/objectives`, data),
  updateObjective: (orgId: string, objectiveId: string, data: {
    title?: string; description?: string; level?: string;
    department_id?: string; owner_id?: string; parent_objective_id?: string;
  }) =>
    apiClient.put<OkrObjective>(`/organizations/${orgId}/okr/objectives/${objectiveId}`, data),
  deleteObjective: (orgId: string, objectiveId: string) =>
    apiClient.delete<void>(`/organizations/${orgId}/okr/objectives/${objectiveId}`),

  // Key Results
  createKeyResult: (orgId: string, objectiveId: string, data: {
    title: string; description?: string; metric_type: string;
    start_value: number; target_value: number; current_value?: number;
    unit?: string; owner_id?: string; weight?: number; linked_board_id?: string;
  }) =>
    apiClient.post<OkrKeyResult>(`/organizations/${orgId}/okr/objectives/${objectiveId}/key-results`, data),
  updateKeyResult: (orgId: string, krId: string, data: {
    title?: string; description?: string; metric_type?: string;
    start_value?: number; target_value?: number; unit?: string;
    owner_id?: string; weight?: number; linked_board_id?: string;
  }) =>
    apiClient.put<OkrKeyResult>(`/organizations/${orgId}/okr/key-results/${krId}`, data),
  deleteKeyResult: (orgId: string, krId: string) =>
    apiClient.delete<void>(`/organizations/${orgId}/okr/key-results/${krId}`),

  // Check-ins
  getCheckIns: (orgId: string, krId: string) =>
    apiClient.get<OkrCheckIn[]>(`/organizations/${orgId}/okr/key-results/${krId}/checkins`),
  createCheckIn: (orgId: string, krId: string, data: {
    new_value: number; confidence: string; note?: string;
  }) =>
    apiClient.post<OkrCheckIn>(`/organizations/${orgId}/okr/key-results/${krId}/checkins`, data),
};

// ─── Org Subscription Service ───

export const orgSubscriptionService = {
  get: orgSubscriptionAPI.get,
  activate: orgSubscriptionAPI.activate,
  migratePreview: orgSubscriptionAPI.migratePreview,
  migrate: orgSubscriptionAPI.migrate,
  downgrade: orgSubscriptionAPI.downgrade,
  cancel: orgSubscriptionAPI.cancel,
  undoCancel: orgSubscriptionAPI.undoCancel,
  getPayments: orgSubscriptionAPI.getPayments,
  purchaseSeats: orgSubscriptionAPI.purchaseSeats,
};

// ─── Org Photo Gallery Service ───

export const orgPhotoService = {
  // Tab CRUD
  getTabs: orgPhotoAPI.getTabs,
  createTab: orgPhotoAPI.createTab,
  updateTab: orgPhotoAPI.updateTab,
  deleteTab: orgPhotoAPI.deleteTab,
  reorderTabs: orgPhotoAPI.reorderTabs,

  // Per-album sharing
  enableShare: orgPhotoAPI.enableShare,
  disableShare: orgPhotoAPI.disableShare,

  // Gallery-level sharing
  enableGalleryShare: orgPhotoAPI.enableGalleryShare,
  disableGalleryShare: orgPhotoAPI.disableGalleryShare,
  updateGalleryShareTitle: orgPhotoAPI.updateGalleryShareTitle,
  getGalleryShareStatus: orgPhotoAPI.getGalleryShareStatus,

  // Gallery-level upload
  enableGalleryUpload: orgPhotoAPI.enableGalleryUpload,
  disableGalleryUpload: orgPhotoAPI.disableGalleryUpload,
  getGalleryUploadStatus: orgPhotoAPI.getGalleryUploadStatus,

  // Upload link
  enableUploadLink: orgPhotoAPI.enableUploadLink,
  disableUploadLink: orgPhotoAPI.disableUploadLink,

  // Multi share-link management
  listShareLinks: orgPhotoAPI.listShareLinks,
  issueShareLink: orgPhotoAPI.issueShareLink,
  revokeShareLink: orgPhotoAPI.revokeShareLink,

  // Photo CRUD
  getPhotos: orgPhotoAPI.getPhotos,
  uploadPhotos: orgPhotoAPI.uploadPhotos,
  updatePhoto: orgPhotoAPI.updatePhoto,
  deletePhotos: orgPhotoAPI.deletePhotos,

  // Download
  downloadPhoto: orgPhotoAPI.downloadPhoto,
  downloadPhotos: orgPhotoAPI.downloadPhotos,
};
