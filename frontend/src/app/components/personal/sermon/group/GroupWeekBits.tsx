import { useEffect, useSyncExternalStore } from 'react';
import type { SermonNote } from '../sermonTypes';
import { Faces } from './Faces';
import { useSermonGroups } from './GroupContext';
import { dowOf, slotPhase, weekSlots, weekStartOf } from './sessionMatch';
import './group.css';

/**
 * 「한 주 동안」 날짜 칸에 붙는 모임 조각.
 *  - GroupDaySlots: 그날의 모임 예배 자리(점선 스티커)와 모이는 날 표시. 내가 이미 쓴 자리는 그리지 않는다(내 스티커가 대신)
 *  - NoteGroupFaces: 내 노트 스티커 끝에 같은 자리를 채운 멤버 얼굴
 * 모임이 없거나 로그인 전이면 아무것도 그리지 않아 지금 화면과 같다.
 */
export function GroupDaySlots({ date, notes }: { date: string; notes: SermonNote[] }) {
  const ctx = useSermonGroups();
  const store = ctx?.store;
  useSyncExternalStore(store?.subscribe ?? noopSub, store?.snapshot ?? zero);
  const groups = store && !ctx?.anonymous ? store.active() : [];
  const ws = weekStartOf(date);
  useEffect(() => {
    groups.forEach((g) => store?.ensureWeek(g.id, ws));
  }, [groups.map((g) => g.id).join(','), ws, store]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ctx || !store || !groups.length) return null;
  const now = new Date();
  const out: JSX.Element[] = [];

  for (const g of groups) {
    const week = store.weekCached(g.id, ws);
    for (const sl of weekSlots(g, ws).filter((x) => x.date === date)) {
      const mine = notes.some((n) =>
        (n.groups || []).some(
          (l) => l.group_id === g.id && l.service_id === sl.service.id && l.date === date && !l.off,
        ),
      );
      if (mine) continue;
      const sess = week?.sessions.find((s) => s.service_id === sl.service.id && s.date === date);
      const writers = (sess?.members || []).filter((m) => m.user_id !== g.me.user_id);
      const people = writers.map((m) => ({
        user_id: m.user_id,
        display_name: g.members.find((x) => x.user_id === m.user_id)?.display_name || '?',
      }));
      const phase = slotPhase(date, sl.start, sl.end, now);
      if (phase === 'after' && !writers.length) continue; // 아무도 안 쓴 지난 자리는 지운다
      const label =
        phase === 'before' ? (
          <>
            <span className="sg-tm">{sl.start}</span>
            {sl.service.name}
            <small>{g.name} · 이 시간에 쓰면 여기에 모여요</small>
          </>
        ) : phase === 'live' ? (
          <>
            <span className="sg-dot" aria-hidden />
            {sl.service.name}
            <small>
              {writers.length
                ? `${g.name} ${writers.length}명 기록 중 · 같이 쓰기`
                : `${g.name} · 지금 같이 쓰기`}
            </small>
          </>
        ) : (
          <>
            {g.name} {sl.service.name} · <b>{writers.length}명 기록</b>
            <small>나도 쓰기</small>
          </>
        );
      out.push(
        <button
          key={`${g.id}|${sl.service.id}`}
          type="button"
          className="sg-slot"
          data-phase={phase}
          onClick={() =>
            phase === 'after' && sess
              ? ctx.openSession(sess.id, g.id)
              : ctx.startInSlot(g.id, sl.service.id, date)
          }
        >
          {label}
          {people.length > 0 && <Faces people={people} max={3} size={20} />}
        </button>,
      );
    }
    if (g.meet_dow != null && dowOf(date) === g.meet_dow) {
      out.push(
        <span key={`${g.id}|meet`} className="sg-slot" data-meet>
          {g.meet_time && <span className="sg-tm">{g.meet_time}</span>}
          {g.name}
          <small>모이는 날</small>
        </span>,
      );
    }
  }
  return out.length ? <>{out}</> : null;
}

export function NoteGroupFaces({ note }: { note: SermonNote }) {
  const ctx = useSermonGroups();
  const store = ctx?.store;
  useSyncExternalStore(store?.subscribe ?? noopSub, store?.snapshot ?? zero);
  if (!ctx || !store || ctx.anonymous) return null;
  const people: Array<{ user_id: string; display_name: string }> = [];
  for (const l of note.groups || []) {
    if (l.off || !l.session_id) continue;
    const g = store.get(l.group_id);
    if (!g || g.me.status !== 'active') continue;
    const s = store
      .weekCached(g.id, weekStartOf(l.date))
      ?.sessions.find((x) => x.id === l.session_id);
    (s?.members || [])
      .filter((m) => m.user_id !== g.me.user_id && !people.some((p) => p.user_id === m.user_id))
      .forEach((m) =>
        people.push({
          user_id: m.user_id,
          display_name: g.members.find((x) => x.user_id === m.user_id)?.display_name || '?',
        }),
      );
  }
  return people.length ? <Faces people={people} max={2} size={20} /> : null;
}

const noopSub = () => () => undefined;
const zero = () => 0;
