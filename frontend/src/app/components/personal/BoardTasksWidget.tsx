import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, CheckCircle2, Loader2, Clock } from 'lucide-react';
import { personalDashboardService } from '../../utils/services';
import type { BoardTasksData, BoardTaskGroup, BoardTaskItem } from '../../types';

interface BoardTasksWidgetProps {
  date: string; // yyyy-MM-dd
}

// ── Board Task Item Row ──

function BoardTaskItemRow({ item, index }: { item: BoardTaskItem; index: number }) {
  const [checked, setChecked] = useState(item.is_completed ?? false);

  const handleToggle = () => {
    // Placeholder: UI-only toggle for now
    setChecked((prev) => !prev);
  };

  if (item.type === 'MEETING') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04 }}
        className="flex items-center gap-2 py-1.5"
      >
        <Clock className="w-4 h-4 text-purple-400 shrink-0" />
        <span className="text-[12px] text-foreground truncate flex-1">{item.title}</span>
        {item.start_time && (
          <span className="text-[10px] text-slate-400 shrink-0">{item.start_time}</span>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="flex items-center gap-2 py-1.5"
    >
      {/* Check circle */}
      <button
        onClick={handleToggle}
        className="shrink-0"
      >
        <div
          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
            checked
              ? 'bg-emerald-500 border-emerald-500'
              : 'border-foreground/20 hover:border-foreground/40'
          }`}
        >
          {checked && (
            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2.5 6L5 8.5L9.5 3.5" />
            </svg>
          )}
        </div>
      </button>

      <span
        className={`text-[12px] truncate flex-1 transition-colors ${
          checked ? 'line-through text-slate-500' : 'text-foreground'
        }`}
      >
        {item.title}
      </span>

      {/* Feature pill */}
      {item.feature_title && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-bold"
          style={{
            backgroundColor: item.feature_color ? `${item.feature_color}25` : 'rgba(99,102,241,0.15)',
            color: item.feature_color || '#6366F1',
          }}
        >
          {item.feature_title}
        </span>
      )}
    </motion.div>
  );
}

// ── Board Group ──

function BoardGroup({ group, groupIndex }: { group: BoardTaskGroup; groupIndex: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: groupIndex * 0.04 }}
      className="mb-3 last:mb-0"
    >
      {/* Board header */}
      <div className="flex items-center gap-2 mb-1.5">
        {group.board_emoji && <span className="text-sm">{group.board_emoji}</span>}
        <span className="text-[11px] font-bold text-foreground">{group.board_name}</span>
        <span className="text-[10px] text-slate-500 ml-auto">
          {group.pending_count}건 남음
        </span>
      </div>

      {/* Items */}
      <div className="pl-1 border-l-2 border-foreground/[0.06] ml-2">
        {group.items.map((item, idx) => (
          <BoardTaskItemRow
            key={`${item.type}-${item.checklist_item_id || item.daily_checklist_id || item.meeting_id || idx}`}
            item={item}
            index={idx}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ── Main Widget ──

export function BoardTasksWidget({ date }: BoardTasksWidgetProps) {
  const [data, setData] = useState<BoardTasksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    personalDashboardService.getBoardTasks(date)
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [date]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.12 }}
      className="rounded-2xl border border-foreground/[0.08] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 md:px-5 py-2 md:py-3 bg-foreground/[0.06] border-b border-foreground/[0.08]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-bridge-accent" />
            <h3 className="text-[13px] md:text-sm font-bold text-foreground">보드 할 일</h3>
          </div>
          {data && data.total_pending > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-bridge-accent/15 text-bridge-accent">
              {data.total_pending}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col min-h-0 bg-bridge-dark p-3 md:p-5">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-bridge-accent" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-500 text-[12px]">
            데이터를 불러올 수 없습니다
          </div>
        ) : !data || data.boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400/50" />
            <span className="text-[12px] text-slate-500">오늘 할당된 보드 작업이 없습니다</span>
          </div>
        ) : (
          <div className="overflow-auto custom-scrollbar max-h-[300px]">
            {data.boards.map((group, idx) => (
              <BoardGroup key={group.board_id} group={group} groupIndex={idx} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
