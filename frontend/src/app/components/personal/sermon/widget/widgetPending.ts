import type { WidgetPendingOp } from '../../../../utils/widgetBridge';
import type { SermonNote } from '../sermonTypes';
import { toggleDaily, toggleOnce, type WeekPlan } from '../weekPlan';

/**
 * 위젯에서 누른 체크를 앱 저장소에 옮긴다.
 * 위젯은 「이 상태로」(done) 를 보내므로 지금 상태와 같으면 건너뛴다 — 같은 체크를 두 번 받아도 한 번만 바뀐다.
 * 노트에 없는 적용 · 이미 지운 할 일은 조용히 버린다.
 */

export interface PendingTargets {
  getNote: (id: string) => SermonNote | undefined;
  saveNote: (n: SermonNote) => void;
  updatePlan: (week: string, fn: (p: WeekPlan) => WeekPlan) => void;
  today: string;
}

/** 적용 하나를 done 으로 맞춘 노트 (바꿀 게 없으면 null) */
export function applyDone(
  n: SermonNote,
  thoughtId: string,
  done: boolean,
  at: number,
): SermonNote | null {
  const t = (n.thoughts || []).find((x) => x.id === thoughtId);
  if (!t || t.tag !== '적용' || !!t.done === done) return null;
  return {
    ...n,
    thoughts: n.thoughts.map((x) =>
      x.id === thoughtId ? { ...x, done, done_at: done ? at : null } : x,
    ),
  };
}

/** 할 일 하나를 그날 done 으로 맞춘 주 (바꿀 게 없으면 그대로) */
export function planDone(p: WeekPlan, op: WidgetPendingOp, today: string): WeekPlan {
  const it = p.items.find((x) => x.id === op.plan_id);
  if (!it || !op.date) return p;
  if (it.rep === 'once') return !!it.done_on === op.done ? p : toggleOnce(p, it.id, op.date);
  return (it.log || []).includes(op.date) === op.done ? p : toggleDaily(p, it.id, op.date, today);
}

/** 옮긴 개수 */
export function applyPending(ops: WidgetPendingOp[], to: PendingTargets): number {
  let n = 0;
  [...ops]
    .sort((a, b) => a.at - b.at)
    .forEach((op) => {
      if (op.op === 'apply' && op.note_id && op.thought_id) {
        const note = to.getNote(op.note_id);
        const next = note ? applyDone(note, op.thought_id, op.done, op.at) : null;
        if (next) {
          to.saveNote(next);
          n++;
        }
      } else if (op.op === 'plan' && op.plan_id && op.week) {
        let changed = false;
        to.updatePlan(op.week, (p) => {
          const next = planDone(p, op, to.today);
          changed = next !== p;
          return next;
        });
        if (changed) n++;
      }
    });
  return n;
}
