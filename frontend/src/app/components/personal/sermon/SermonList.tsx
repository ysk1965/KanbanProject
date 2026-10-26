import { useMemo, useState } from 'react';
import { Check, LogIn, Mic, Plus, Search, X } from 'lucide-react';
import { compareRef, encRef, norm, refLong, refShort, type Ref } from './bibleRefs';
import type { SyncStatus } from './sermonStore';
import {
  applyItems,
  audioDuration,
  audioPending,
  fmtDate,
  galpiByWeek,
  mainRef,
  noteRefs,
  plainText,
  thisWeek,
  UNTITLED,
  weekRangeLabel,
  type ApplyItem,
  type SermonNote,
} from './sermonTypes';

/** 2461초 → '41분', 59초 → '1분' */
function fmtMin(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
}
import { firstVerseText, useBible } from './useBible';
import { Mascot } from './Mascot';
import { SermonHome } from './SermonHome';
import { useSermonGroups } from './group/GroupContext';
import { BibleReader } from './BibleReader';
import type { MascotId } from './sermonLook';

/**
 * 노트 목록 — 기획서 §1, §8 이번 주 적용.
 * 왼쪽 내비(새 설교 기록 · 보기 · 예배별 · 저장 상태), 본문(검색 · 이번 주 적용 배너 · 월별 노트).
 */
interface SermonListProps {
  notes: SermonNote[];
  status: SyncStatus;
  onOpen: (id: string, aid?: string | null) => void;
  onNew: () => void;
  onToggleApply: (noteId: string, thoughtId: string) => void;
  /** 갈피 꽂기/빼기 (그 주의 중심 설교) */
  onToggleGalpi: (noteId: string) => void;
  /** 로그인 전이면 기존 로그인으로 보낸다 (없으면 안내를 그리지 않음) */
  onLogin?: () => void;
  /** 꾸미기에서 고른 마스코트 */
  mascot?: MascotId;
  /** 꾸미기 창 열기 */
  onOpenLook?: () => void;
  /** 사이드바 「함께」(모임) 묶음 — group/GroupNav */
  groupNav?: React.ReactNode;
  /** 본문을 통째로 바꿔 그림 (모임 홈·설교 자리) */
  main?: React.ReactNode;
  /** 보기·예배를 누르면 모임 화면에서 빠져나온다 */
  onLeaveMain?: () => void;
}

const NUDGE_KEY = 'sermon-login-nudge-until';
const NUDGE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
function nudgeSnoozed(): boolean {
  try {
    return Number(localStorage.getItem(NUDGE_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

type Nav = 'all' | 'apply' | 'galpi' | 'thoughts' | 'verses' | 'bible';

function matchQuery(n: SermonNote, q: string): boolean {
  if (!q) return true;
  const lq = q.toLowerCase();
  const qn = norm(lq);
  const hay = [
    n.title,
    n.preacher,
    n.service,
    plainText(n.body),
    ...(n.thoughts || []).map((t) => t.text),
  ]
    .join(' ')
    .toLowerCase();
  if (hay.includes(lq)) return true;
  return noteRefs(n).some(
    (r) => norm(refShort(r)).startsWith(qn) || norm(refLong(r)).startsWith(qn),
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="sn-prog" role="img" aria-label={`${total}개 중 ${done}개 실천`}>
      <div className="sn-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <span className="sn-mono">
        {done}/{total}
      </span>
    </div>
  );
}

export function SermonList({
  notes,
  status,
  onOpen,
  onNew,
  onToggleApply,
  onToggleGalpi,
  onLogin,
  mascot = 'galpi',
  onOpenLook,
  groupNav,
  main,
  onLeaveMain,
}: SermonListProps) {
  const { bible } = useBible();
  // 모임이 있으면 노트가 없어도 「한 주 동안」(모임 자리)을 보여 준다
  const gctx = useSermonGroups();
  const hasGroups = !!gctx && !gctx.anonymous && gctx.store.active().length > 0;
  const [nav, setNav] = useState<Nav>('all');
  const [nudgeHidden, setNudgeHidden] = useState(() => nudgeSnoozed());
  const showNudge = status.anonymous && !!onLogin && notes.length > 0 && !nudgeHidden;
  const snoozeNudge = () => {
    setNudgeHidden(true);
    try {
      localStorage.setItem(NUDGE_KEY, String(Date.now() + NUDGE_SNOOZE_MS));
    } catch {
      /* ignore */
    }
  };
  const [service, setService] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const query = q.trim();
  const allApply = useMemo(() => applyItems(notes), [notes]);
  const week = useMemo(() => thisWeek(allApply), [allApply]);
  const weekLeft = week.filter((x) => !x.t.done);
  const thoughtCount = notes.reduce((a, n) => a + (n.thoughts || []).length, 0);
  const refCount = useMemo(() => {
    const s = new Set<string>();
    notes.forEach((n) => noteRefs(n).forEach((r) => s.add(encRef(r))));
    return s.size;
  }, [notes]);
  const galpi = useMemo(() => galpiByWeek(notes), [notes]);
  const galpiWeeks = useMemo(
    () => [...galpi.entries()].sort((a, b) => b[0].localeCompare(a[0])),
    [galpi],
  );
  const services = useMemo(
    () => [...new Set(notes.map((n) => n.service).filter(Boolean))].sort(),
    [notes],
  );

  const filtered = useMemo(
    () => notes.filter((n) => (!service || n.service === service) && matchQuery(n, query)),
    [notes, service, query],
  );

  const navItems: Array<[Nav, string, string | number]> = [
    ['all', '전체 노트', notes.length],
    [
      'apply',
      '이번 주 적용',
      week.length ? `${week.length - weekLeft.length}/${week.length}` : '0',
    ],
    ['galpi', '갈피 모아보기', galpiWeeks.length],
    ['thoughts', '생각 모아보기', thoughtCount],
    ['verses', '구절 모아보기', refCount],
    ['bible', '성경 읽기', ''],
  ];

  const storeNote = !status.localOk
    ? '저장 공간을 쓸 수 없어 이 창을 닫으면 사라져요.'
    : status.localFull
      ? '기기 저장 공간이 부족해 마지막 변경을 기기에 저장하지 못했어요. 연결되면 바로 올라가요.'
      : status.anonymous
        ? '노트는 이 기기에만 저장돼요. 로그인하면 다른 기기와 맞춰지고 사진·영상도 붙일 수 있어요.'
        : status.pending
          ? `기기에 저장된 변경 ${status.pending}건은 연결되면 올라가요.`
          : '노트는 기기에 먼저 저장되고, 다른 기기와 맞춰져요.';

  const applyRow = ({ n, t }: ApplyItem) => (
    <div key={`${n.id}|${t.id}`} className="sn-arow" data-checked={!!t.done}>
      <button
        type="button"
        className="sn-ck sn-big"
        aria-pressed={!!t.done}
        aria-label={t.done ? '실천 표시 지우기' : '실천했어요'}
        onClick={() => onToggleApply(n.id, t.id)}
      >
        <Check className="sn-icon" style={{ width: 16, height: 16 }} />
      </button>
      <div className="sn-abody">
        <div className="sn-txt">{t.text || ((t.media || []).length ? '(사진·영상 메모)' : '')}</div>
        <div className="sn-ameta">
          {fmtDate(n.date)} · {n.title || UNTITLED}
          {t.done && t.done_at
            ? ` · ${new Date(t.done_at).getMonth() + 1}.${new Date(t.done_at).getDate()} 실천`
            : ''}
        </div>
      </div>
      <button type="button" className="sn-btn sn-ghost" onClick={() => onOpen(n.id, t.aid)}>
        노트 보기
      </button>
    </div>
  );

  let body: React.ReactNode;
  if (nav === 'bible' && !service) {
    body = <BibleReader notes={notes} onOpen={onOpen} mascot={mascot} />;
  } else if (!notes.length && !hasGroups) {
    body = (
      <div className="sn-empty">
        <Mascot kind={mascot} size={96} state="think" />
        <h2>아직 기록한 설교가 없어요</h2>
        <div>
          ‘새 설교 기록’을 눌러 이번 주 말씀을 적어보세요.
          <br />
          본문 구절은 ‘요 15:5’처럼 쓰면 바로 찾아 넣어 드려요.
        </div>
        <button type="button" className="sn-btn sn-primary" onClick={onNew}>
          새 설교 기록
        </button>
      </div>
    );
  } else if (nav === 'apply' && !service) {
    const older = allApply.filter((x) => !week.includes(x) && !x.t.done);
    const done = week.filter((x) => x.t.done).length;
    body = (
      <>
        <div className="sn-apply-head">
          <div>
            <h2>이번 주 적용</h2>
            <p>최근 7일 동안 들은 설교에서 ‘적용’으로 남긴 메모예요. 실천하면 체크하세요.</p>
          </div>
          {week.length > 0 && <Progress done={done} total={week.length} />}
        </div>
        {week.length ? (
          <div className="sn-alist">
            {[...weekLeft, ...week.filter((x) => x.t.done)].map(applyRow)}
          </div>
        ) : (
          <div className="sn-empty">
            이번 주에 남긴 적용 메모가 없어요.
            <br />
            설교를 들으며 생각을 남길 때 ‘적용’ 태그를 고르면 여기 모여요.
          </div>
        )}
        {older.length > 0 && (
          <>
            <div className="sn-month">지난 설교에서 아직 남은 적용</div>
            <div className="sn-alist">{older.map(applyRow)}</div>
          </>
        )}
      </>
    );
  } else if (nav === 'galpi' && !service) {
    body = (
      <>
        <div className="sn-apply-head">
          <div>
            <h2>갈피 모아보기</h2>
            <p>주마다 갈피를 꽂은 그 주의 중심 설교예요. 지난 갈피도 여기 계속 남아요.</p>
          </div>
        </div>
        {galpiWeeks.length ? (
          <div className="sn-nlist">
            {galpiWeeks.map(([w, n]) => {
              const main = mainRef(n);
              return (
                <button key={w} type="button" className="sn-nrow" onClick={() => onOpen(n.id)}>
                  <span className="sn-nd">{weekRangeLabel(w)}</span>
                  <span className="sn-nm">
                    <b>{n.title || UNTITLED}</b>
                    <span className="sn-ns">
                      {[fmtDate(n.date), n.preacher, n.service].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="sn-nr">{main ? refShort(main) : ''}</span>
                  <span className="sn-nt">
                    {(n.thoughts || []).length ? `생각 ${(n.thoughts || []).length}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="sn-empty">
            <Mascot kind={mascot} size={80} state="think" />
            아직 꽂은 갈피가 없어요.
            <br />한 주를 붙들고 살 설교를 열고 ‘갈피 꽂기’를 눌러 보세요.
          </div>
        )}
      </>
    );
  } else if (nav === 'thoughts' && !service) {
    const rows: Array<{ n: SermonNote; t: SermonNote['thoughts'][number] }> = [];
    filtered.forEach((n) =>
      (n.thoughts || []).forEach((t) => {
        if (!query || t.text.toLowerCase().includes(query.toLowerCase()) || matchQuery(n, query))
          rows.push({ n, t });
      }),
    );
    rows.sort((a, b) => (b.n.date || '').localeCompare(a.n.date || '') || a.t.at - b.t.at);
    body = rows.length ? (
      <div className="sn-rows">
        {rows.map(({ n, t }) => (
          <button key={t.id} type="button" className="sn-row" onClick={() => onOpen(n.id, t.aid)}>
            <div className="sn-top">
              <span className="sn-tagT" data-t={t.tag}>
                {t.tag}
              </span>
              <span>{fmtDate(n.date)}</span>
              <span>·</span>
              <span>{n.title || UNTITLED}</span>
              {t.label && <span className="sn-refpill">{t.label}</span>}
            </div>
            <div className="sn-txt">{t.text}</div>
            {(t.media || []).length > 0 && (
              <div className="sn-top">첨부 {(t.media || []).length}개</div>
            )}
          </button>
        ))}
      </div>
    ) : (
      <div className="sn-empty">아직 남긴 생각이 없어요.</div>
    );
  } else if (nav === 'verses' && !service) {
    const map = new Map<string, { r: Ref; ns: SermonNote[] }>();
    filtered.forEach((n) =>
      noteRefs(n).forEach((r) => {
        const k = encRef(r);
        if (!map.has(k)) map.set(k, { r, ns: [] });
        map.get(k)!.ns.push(n);
      }),
    );
    const arr = [...map.values()].sort((a, b) => compareRef(a.r, b.r));
    void bible;
    body = arr.length ? (
      <div className="sn-rows">
        {arr.map(({ r, ns }) => {
          const first = firstVerseText(r);
          return (
            <div key={encRef(r)} className="sn-row">
              <div className="sn-verse-row">
                <span className="sn-vref">{refLong(r)}</span>
                <div
                  style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--sn-f-display)',
                      fontSize: 14,
                      color: 'var(--sn-muted)',
                    }}
                  >
                    {first.length > 90 ? `${first.slice(0, 90)}…` : first}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ns.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className="sn-chip"
                        onClick={() => onOpen(n.id)}
                      >
                        {fmtDate(n.date)} {n.title || UNTITLED}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="sn-empty">노트에 넣은 구절이 아직 없어요.</div>
    );
  } else if (!query && !service) {
    body = (
      <SermonHome
        notes={notes}
        week={week}
        mascot={mascot}
        onOpen={onOpen}
        onNew={onNew}
        onToggleApply={onToggleApply}
        onToggleGalpi={onToggleGalpi}
      />
    );
  } else if (!filtered.length) {
    body = <div className="sn-empty">‘{query}’에 맞는 노트가 없어요.</div>;
  } else {
    const groups: Array<{ month: string; items: SermonNote[] }> = [];
    filtered.forEach((n) => {
      const m = (n.date || '').slice(0, 7);
      const g = groups[groups.length - 1];
      if (g && g.month === m) g.items.push(n);
      else groups.push({ month: m, items: [n] });
    });
    body = (
      <>
        {groups.map((g) => {
          const [y, mm] = g.month.split('-');
          return (
            <div key={g.month || 'none'}>
              <h2 className="sn-month">{y ? `${y}년 ${+mm}월` : '날짜 없음'}</h2>
              <div className="sn-nlist">
                {g.items.map((n) => {
                  const main = mainRef(n);
                  const thn = (n.thoughts || []).length;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      className="sn-nrow"
                      onClick={() => onOpen(n.id)}
                    >
                      <span className="sn-nd">{fmtDate(n.date)}</span>
                      <span className="sn-nm">
                        <b>{n.title || UNTITLED}</b>
                        <span className="sn-ns">
                          {[n.preacher, n.service].filter(Boolean).join(' · ')}
                        </span>
                        <span className="sn-nx">{plainText(n.body).slice(0, 110)}</span>
                      </span>
                      <span className="sn-nr">{main ? refShort(main) : ''}</span>
                      <span className="sn-nt">
                        {audioDuration(n) > 0 && (
                          <span
                            className="sn-nrec"
                            data-pending={audioPending(n) > 0}
                            title={
                              audioPending(n) > 0
                                ? '녹음이 아직 이 기기에만 있어요'
                                : '설교 녹음 있음'
                            }
                          >
                            <Mic className="sn-icon" aria-hidden />
                            {fmtMin(audioDuration(n))}
                          </span>
                        )}
                        {thn ? `생각 ${thn}` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </>
    );
  }

  return (
    <section className="sn-list" aria-label="노트 목록">
      <nav className="sn-side" aria-label="노트 분류">
        <div className="sn-brand">
          설교 노트 <small>개역한글</small>
        </div>
        <button type="button" className="sn-btn sn-primary" onClick={onNew}>
          <Plus className="sn-icon" aria-hidden />새 설교 기록
        </button>
        <div className="sn-nav">
          <div className="sn-label">보기</div>
          {navItems.map(([k, l, c]) => (
            <button
              key={k}
              type="button"
              aria-current={nav === k && !service && !main}
              onClick={() => {
                setNav(k);
                setService(null);
                onLeaveMain?.();
              }}
            >
              {l}
              <span className="sn-count">{c}</span>
            </button>
          ))}
        </div>
        {services.length > 0 && (
          <div className="sn-nav">
            <div className="sn-label">예배</div>
            {services.map((s) => (
              <button
                key={s}
                type="button"
                aria-current={service === s}
                onClick={() => {
                  setService(service === s ? null : s);
                  setNav('all');
                  onLeaveMain?.();
                }}
              >
                {s}
                <span className="sn-count">{notes.filter((n) => n.service === s).length}</span>
              </button>
            ))}
          </div>
        )}
        {groupNav}
        {onOpenLook && (
          <button type="button" className="sn-btn sn-look-btn" onClick={onOpenLook}>
            <Mascot kind={mascot} size={24} />
            꾸미기
          </button>
        )}
        <div className="sn-store-note">
          {storeNote}
          {status.anonymous && onLogin && (
            <div>
              <button type="button" className="sn-login-link" onClick={onLogin}>
                <LogIn className="sn-icon" style={{ width: 14, height: 14 }} aria-hidden />
                로그인
              </button>
            </div>
          )}
        </div>
      </nav>
      <main className="sn-list-main">
        {showNudge && (
          <div className="sn-nudge" role="status">
            <div className="sn-nudge-text">
              <b>지금은 이 기기에만 저장되고 있어요.</b> 로그인하면 다른 기기에서도 보이고,
              사진·영상도 붙일 수 있어요. 적어 둔 노트는 그대로 옮겨져요.
            </div>
            <button type="button" className="sn-btn sn-primary" onClick={onLogin}>
              <LogIn className="sn-icon" aria-hidden />
              로그인
            </button>
            <button
              type="button"
              className="sn-x"
              aria-label="일주일 동안 보지 않기"
              onClick={snoozeNudge}
            >
              <X className="sn-icon" style={{ width: 16, height: 16 }} />
            </button>
          </div>
        )}
        {main ? (
          main
        ) : (
          <>
            {!(nav === 'bible' && !service) && (
              <div className="sn-toolbar">
                <label className="sn-search" htmlFor="sn-q">
                  <Search className="sn-icon" style={{ color: 'var(--sn-muted)' }} aria-hidden />
                  <span className="sn-sr">검색</span>
                  <input
                    id="sn-q"
                    type="search"
                    placeholder="제목, 설교자, 구절(예: 요 15), 내 생각 검색"
                    autoComplete="off"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </label>
              </div>
            )}
            <div>{body}</div>
          </>
        )}
      </main>
    </section>
  );
}
