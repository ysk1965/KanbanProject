import { useEffect, useState, useSyncExternalStore } from 'react';
import type { NoteGroupLink, SermonNote } from '../sermonTypes';
import { Faces } from './Faces';
import type { SermonGroup } from './groupApi';
import type { GroupStore } from './groupStore';
import { useSermonGroups } from './GroupContext';
import { dowOf, slotPhase, weekSlots, weekStartOf } from './sessionMatch';
import './group.css';

/**
 * 「한 주 동안」 날짜 칸에 붙는 모임 조각.
 *  - GroupDaySlots: 그날의 모임 예배 자리(점선 스티커)와 모이는 날 표시. 내가 이미 쓴 자리는 그리지 않는다(내 스티커가 대신)
 *  - NoteGroupFaces: 내 노트 스티커 끝에 모임 이름과 같은 자리를 채운 멤버 얼굴(2명까지, 넘치면 +n)
 *  - NoteShareRow: 표지 카드의 「나눈 곳」 — 모임마다 공개 상태와 다음 행동(비교하기·공개하기·되돌리기)
 *  - useNoteGroups: 노트가 「모임 노트」(내가 속한 모임 자리에 연결)인지 — 스티커 색을 나누는 기준
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

/** 노트가 연결된, 내가 속한 모임들 (꺼진 연결·나간 모임 제외) */
function linkedGroups(note: SermonNote, store: GroupStore): SermonGroup[] {
  const out: SermonGroup[] = [];
  for (const l of note.groups || []) {
    if (l.off) continue;
    const g = store.get(l.group_id);
    if (g && g.me.status === 'active' && !out.includes(g)) out.push(g);
  }
  return out;
}

/** 「한 주 동안」 색 구분용 — 모임이 있는지, 노트가 모임 노트인지 */
export function useNoteGroups(): {
  hasGroups: boolean;
  isGroupNote: (note: SermonNote) => boolean;
} {
  const ctx = useSermonGroups();
  const store = ctx?.store;
  useSyncExternalStore(store?.subscribe ?? noopSub, store?.snapshot ?? zero);
  if (!ctx || !store || ctx.anonymous) return { hasGroups: false, isGroupNote: () => false };
  return {
    hasGroups: store.active().length > 0,
    isGroupNote: (note) => linkedGroups(note, store).length > 0,
  };
}

export function NoteGroupFaces({ note }: { note: SermonNote }) {
  const ctx = useSermonGroups();
  const store = ctx?.store;
  useSyncExternalStore(store?.subscribe ?? noopSub, store?.snapshot ?? zero);
  if (!ctx || !store || ctx.anonymous) return null;
  const groups = linkedGroups(note, store);
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
  if (!groups.length) return null;
  return (
    <>
      <span className="sn-grp-n">
        {groups[0].name}
        {groups.length > 1 && ` +${groups.length - 1}`}
      </span>
      {people.length > 0 && <Faces people={people} max={2} size={20} />}
    </>
  );
}

/**
 * 표지 카드 「나눈 곳」 — 이 노트가 모임마다 어떻게 보이는지와 다음 행동.
 *  공개 중 → 같은 자리에 쓴 사람 + 비교하기 / 나만 보기 → 공개하기(한 번 더 확인) / 뺀 연결 → 되돌리기
 *  연결된 모임이 없으면(로그인 전 포함) 카드로 보내기 한 줄.
 */
export function NoteShareRow({ note, onCard }: { note: SermonNote; onCard: () => void }) {
  const ctx = useSermonGroups();
  const store = ctx?.store;
  useSyncExternalStore(store?.subscribe ?? noopSub, store?.snapshot ?? zero);
  const [asking, setAsking] = useState<string | null>(null);

  const rows: Array<{ g: SermonGroup; l: NoteGroupLink; people: FacePerson[] }> = [];
  if (ctx && store && !ctx.anonymous) {
    for (const l of note.groups || []) {
      const g = store.get(l.group_id);
      if (!g || g.me.status !== 'active' || rows.some((r) => r.g.id === g.id)) continue;
      const sess = l.session_id
        ? store.weekCached(g.id, weekStartOf(l.date))?.sessions.find((x) => x.id === l.session_id)
        : undefined;
      const people = (sess?.members || [])
        .filter((m) => m.user_id !== g.me.user_id)
        .map((m) => ({
          user_id: m.user_id,
          display_name: g.members.find((x) => x.user_id === m.user_id)?.display_name || '?',
        }));
      rows.push({ g, l, people });
    }
  }

  return (
    <div className="sn-share-row" aria-label="나눈 곳">
      <span className="sn-share-lbl">나눈 곳</span>
      {rows.length === 0 && (
        <p className="sn-share-it">
          <span className="sn-share-st" data-st="none">
            아직 아무에게도
          </span>
          <button type="button" className="sn-share-go" onClick={onCard}>
            카드로 보내기 →
          </button>
        </p>
      )}
      {rows.map(({ g, l, people }) => {
        if (l.off)
          return (
            <p key={g.id} className="sn-share-it">
              <span className="sn-share-off">{g.name}에는 안 보여요</span>
              <button
                type="button"
                className="sn-share-go"
                onClick={() => ctx?.setNoteLink(note.id, g.id, { off: false })}
              >
                되돌리기
              </button>
            </p>
          );
        const grp = (
          <span className="sn-hc-grp">
            {people.length > 0 && <Faces people={people} max={2} size={20} />}
            {g.name}
          </span>
        );
        if (l.private)
          return (
            <p key={g.id} className="sn-share-it">
              {grp}
              <span className="sn-share-st" data-st="private">
                나만 보기
              </span>
              {asking === g.id ? (
                <>
                  <small>밑줄·생각·적용만 보여요</small>
                  <button
                    type="button"
                    className="sn-share-go"
                    onClick={() => {
                      setAsking(null);
                      ctx?.setNoteLink(note.id, g.id, { private: false });
                    }}
                  >
                    공개
                  </button>
                  <button type="button" className="sn-share-no" onClick={() => setAsking(null)}>
                    취소
                  </button>
                </>
              ) : (
                <button type="button" className="sn-share-go" onClick={() => setAsking(g.id)}>
                  공개하기
                </button>
              )}
            </p>
          );
        return (
          <p key={g.id} className="sn-share-it">
            {grp}
            <span className="sn-share-st" data-st="open">
              공개 중
            </span>
            {people.length > 0 && <small>{people.length}명도 썼어요</small>}
            {l.session_id && (
              <button
                type="button"
                className="sn-share-go"
                onClick={() => ctx?.openSession(l.session_id as string, g.id)}
              >
                {people.length > 0 ? '비교하기 →' : '자리 보기 →'}
              </button>
            )}
          </p>
        );
      })}
    </div>
  );
}

type FacePerson = { user_id: string; display_name: string };

const noopSub = () => () => undefined;
const zero = () => 0;
