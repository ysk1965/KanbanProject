import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type SVGProps,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, LogIn, Mic, Plus, Search, X } from 'lucide-react';
import { BOOKS, encRef, norm, refLong, refShort } from './bibleRefs';
import { homeSyncLine, type SyncStatus } from './sermonStore';
import {
  applyItems,
  audioDuration,
  audioPending,
  fmtDate,
  mainRef,
  noteRefs,
  plainText,
  thisWeek,
  todayString,
  type SermonNote,
} from './sermonTypes';

/** 2461초 → '41분', 59초 → '1분' */
function fmtMin(sec: number): string {
  const m = Math.max(1, Math.round(sec / 60));
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
}
import { Mascot } from './Mascot';
import { useJellyTab } from './microFx';
import { BibleTabIcon, ChallengeTabIcon, GroupsTabIcon, MeTabIcon, NoteTabIcon } from './TabIcons';
import { playTabVerb } from './tabMotion';
import { SermonBottomNav } from './SermonBottomNav';
import { SnViewBar, type ViewBarItem } from './SnViewBar';
import { GROUP_TABS, readGroupTab, withGroupTab } from './group/groupTabs';
import { ActionBarHostProvider, useActionBarHost } from './SnActionBar';
import { SermonHome } from './SermonHome';
import { SermonCalendar } from './SermonCalendar';
import { SermonThoughts } from './SermonThoughts';
import { SermonTidy } from './SermonTidy';
import { useTidy } from './useTidy';
import { displayTitle } from './noteTidy';
import { noteNav, type NoteView } from './noteNav';
import { useSermonGroups } from './group/GroupContext';
import { BibleReader } from './BibleReader';
import { HighlightList } from './HighlightList';
import { SermonVerses, useNarrow } from './VerseIndex';
import { loadReadPos, useHighlights } from './bibleHighlights';
import { MyGalpi, type MeView } from './MyGalpi';
import { WorshipPage } from './GalpiSettings';
import { useGalpiPrefs, useGalpiStickers } from './galpiPrefs';
import { GroupsLanding } from './group/GroupsLanding';
import { ChallengeTab, type ChallengeView } from './challenge/ChallengeTab';
import './sermonNav.css';
import type { MascotId } from './sermonLook';

/**
 * 노트 목록 — 핵심 탭 다섯 개(설교 노트 · 모임 · 성경 읽기 · 챌린지 · 나의 갈피).
 * 넓은 화면: 왼쪽 패널 위에 탭 고정, 점선 아래 고른 탭의 세부 목록, 맨 아래 한 줄 저장 상태.
 * 좁은 화면(760px 이하): 패널을 숨기고 세부 목록은 본문 위 칩 줄, 탭은 하단 바(독립 화면) 또는 본문 위 탭 줄.
 * 고른 탭은 주소 ?tab= 에 남긴다(설교 노트 = 기본, 모임은 ?group= 이 있어도 모임 탭).
 */
interface SermonListProps {
  notes: SermonNote[];
  status: SyncStatus;
  onOpen: (id: string, aid?: string | null) => void;
  /** date 를 주면 그 날짜로 새 노트 (홈 「들은 예배」의 지난 주 기록) */
  onNew: (date?: string) => void;
  onToggleApply: (noteId: string, thoughtId: string) => void;
  /** 「내 생각」 질문에 답 적기 (null = 지우기) */
  onAnswer: (noteId: string, thoughtId: string, answer: string | null) => void;
  /** 「다듬기」 — 여러 노트를 한 번에 저장 / 지우기 */
  onSaveNotes: (notes: SermonNote[]) => void;
  onRemoveNotes: (ids: string[]) => void;
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
  /** /sermonnote 독립 화면이면 폰에서 하단 탭 바를 쓴다 (마이스페이스 안에서는 앱 하단 바와 겹쳐 본문 위 탭 줄) */
  standalone?: boolean;
  /** 나의 갈피 프로필 이름 */
  userName?: string;
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

export type SermonTabKey = 'note' | 'groups' | 'bible' | 'challenge' | 'me';
/** 이번 주(폰은 이번 주 · 한 주) · 달력 · 내 생각 · 다듬기 — noteNav.ts */
type BibleView = 'read' | 'verses' | 'highlights';

const TABS: Array<{
  k: SermonTabKey;
  label: string;
  short: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}> = [
  { k: 'note', label: '설교 노트', short: '노트', Icon: NoteTabIcon },
  { k: 'groups', label: '모임', short: '모임', Icon: GroupsTabIcon },
  { k: 'bible', label: '성경 읽기', short: '성경', Icon: BibleTabIcon },
  { k: 'challenge', label: '챌린지', short: '챌린지', Icon: ChallengeTabIcon },
  { k: 'me', label: '나의 갈피', short: '나의 갈피', Icon: MeTabIcon },
];
const TAB_KEYS = new Set<string>(TABS.map((t) => t.k));

const noopSubscribe = () => () => {};
const zeroSnapshot = () => 0;

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

export function SermonList({
  notes,
  status,
  onOpen,
  onNew,
  onToggleApply,
  onAnswer,
  onSaveNotes,
  onRemoveNotes,
  onLogin,
  mascot = 'galpi',
  onOpenLook,
  groupNav,
  main,
  standalone = false,
  userName,
}: SermonListProps) {
  // 모임이 있으면 노트가 없어도 「한 주 동안」(모임 자리)을 보여 준다
  const gctx = useSermonGroups();
  useSyncExternalStore(
    gctx ? gctx.store.subscribe : noopSubscribe,
    gctx ? gctx.store.snapshot : zeroSnapshot,
  );
  const hasGroups = !!gctx && !gctx.anonymous && gctx.store.active().length > 0;
  /** 내가 리더인 모임의 가입 요청 수 — 모임 탭 뱃지 */
  const groupRequests =
    gctx && !gctx.anonymous
      ? gctx.store.groups.reduce(
          (a, g) =>
            a +
            (g.me.role !== 'member' ? g.members.filter((m) => m.status === 'pending').length : 0),
          0,
        )
      : 0;
  const [sp, setSp] = useSearchParams();
  const tabParam = sp.get('tab') || '';
  const tab: SermonTabKey =
    sp.get('group') || sp.get('session')
      ? 'groups'
      : TAB_KEYS.has(tabParam)
        ? (tabParam as SermonTabKey)
        : 'note';
  const jelly = useJellyTab(TABS.findIndex((t) => t.k === tab));
  const rowTab = useJellyTab(
    TABS.findIndex((t) => t.k === tab),
    { axis: 'x' },
  );
  // 노트를 열었다 「← 달력」으로 돌아오면 보던 보기 그대로
  const [noteView, setNoteView] = useState<NoteView>(() => noteNav.view);
  useEffect(() => {
    noteNav.view = noteView;
  }, [noteView]);
  const [bibleView, setBibleView] = useState<BibleView>('read');
  /** 성경 읽기의 마지막 자리 — 「성경」 칩 옆에 「롬 5」로 */
  const [readPos, setReadPos] = useState(loadReadPos);
  const highlights = useHighlights();
  const [challengeView, setChallengeView] = useState<ChallengeView>('home');
  /** 나의 갈피 안 화면 — 첫 화면 / 내 예배표 */
  const [meView, setMeView] = useState<Exclude<MeView, 'all'> | 'worship'>('home');
  // 나의 갈피는 좁은 화면에서만 홈·스티커·설정으로 나눈다
  const narrow = useNarrow();
  const abar = useActionBarHost();
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
  const [q, setQ] = useState('');
  /** 달력에서 고른 날 — 새 기록 버튼이 그 날짜로 만든다 */
  const [calSel, setCalSel] = useState(todayString);
  const { tidy, dismiss: dismissTidy } = useTidy(notes);
  /** 좁은 화면 보기 줄 — 본문을 내리면 이름표로 접힌다 */
  const [vbMin, setVbMin] = useState(false);
  const listMainRef = useRef<HTMLElement>(null);
  /** 성경 읽기 — 하단 보기 줄에서 연 말씀 찾기 칸과 그 자리 */
  const [bsOpen, setBsOpen] = useState(false);
  const [bsHost, setBsHost] = useState<HTMLElement | null>(null);
  /** 설교 구절·형광펜 — 보기 줄 위 66칸 한 줄 자리 */
  const [shelfHost, setShelfHost] = useState<HTMLElement | null>(null);
  // 연결이 끊긴 동안 '마지막 맞춤 N분 전'이 멈추지 않게 1분마다 다시 그린다
  const [now, setNow] = useState(() => Date.now());
  const offlineTick = status.online === false && !!status.lastSync;
  useEffect(() => {
    if (!offlineTick) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, [offlineTick]);

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
  const filtered = useMemo(() => notes.filter((n) => matchQuery(n, query)), [notes, query]);

  const weekDone = week.length - weekLeft.length;

  /** 탭 바꾸기 — 모임 화면(?group=·?session=)에서도 한 번에 빠져나온다 */
  const goTab = (t: SermonTabKey) => {
    const next = new URLSearchParams(sp);
    next.delete('group');
    next.delete('session');
    next.delete('gtab');
    if (t === 'note') next.delete('tab');
    else next.set('tab', t);
    if (t === tab && vbMin) {
      // 보기 줄이 접혀 있으면 지금 탭을 다시 눌러 펼친다
      setVbMin(false);
      return;
    }
    if (t === tab) {
      // 지금 탭을 다시 누르면 그 탭의 첫 화면으로
      if (t === 'note') {
        setNoteView('home');
        setQ('');
      }
      if (t === 'bible') setBibleView('read');
      if (t === 'challenge') setChallengeView('home');
      if (t === 'me') setMeView('home');
    }
    if (next.toString() !== sp.toString()) setSp(next);
  };
  const pickNote = (v: NoteView) => {
    setNoteView(v);
    if (tab !== 'note') goTab('note');
  };
  const stickerCount = useGalpiStickers(notes).size;
  // 넓은 화면은 한 페이지라 모은 설교 스티커 자리로 내린다
  const goStickers = () => {
    setMeView('stickers');
    if (tab !== 'me') goTab('me');
    window.setTimeout(
      () =>
        document.querySelector('.sermon-app .sn-sticker-sec')?.scrollIntoView({ block: 'start' }),
      60,
    );
  };
  const worshipCount = useGalpiPrefs().worship.length;

  const tabBadge = (k: SermonTabKey): string | null =>
    k === 'groups' && groupRequests
      ? `요청 ${groupRequests}`
      : k === 'challenge' && weekLeft.length
        ? `${weekDone}/${week.length}`
        : null;

  const storeNote = !status.localOk
    ? '저장 공간을 쓸 수 없어 이 창을 닫으면 사라져요.'
    : status.localFull
      ? '기기 저장 공간이 부족해 마지막 변경을 기기에 저장하지 못했어요. 연결되면 바로 올라가요.'
      : status.anonymous
        ? '노트는 이 기기에만 저장돼요. 로그인하면 다른 기기와 맞춰지고 사진·영상도 붙일 수 있어요.'
        : status.limit
          ? '노트 보관 한도에 닿았어요. 새 노트는 이 기기에만 저장되고, 지난 노트를 지우면 다시 올라가요.'
          : status.pending
            ? `기기에 저장된 변경 ${status.pending}건은 연결되면 올라가요.`
            : '노트는 기기에 먼저 저장되고, 다른 기기와 맞춰져요.';
  /** 평소엔 한 줄 상태, 문제가 있을 때(저장 불가·공간 부족·로그인 전)만 설명을 펼친다 */
  const storeTrouble = !status.localOk || status.localFull || status.anonymous || status.limit;
  const sync = homeSyncLine(status, now);
  const syncLine = sync.sub ? `${sync.text} · ${sync.sub}` : sync.text;

  // 보기 줄(vbar)이 뜨는 조건 중 성경 구절·형광펜일 때 — 66칸 한 줄을 줄 위 선반에 올린다
  // 설교 노트 달력·내 생각도 거르기 칩을 선반에 올린다 (검색 중엔 목록이라 없음)
  const vbShelf =
    standalone &&
    !sp.get('session') &&
    ((tab === 'bible' && bibleView !== 'read') ||
      (tab === 'note' && !query && (noteView === 'cal' || noteView === 'thoughts')));
  const stripHost = vbShelf ? shelfHost : undefined;
  let body: React.ReactNode;
  if (tab === 'bible' && bibleView === 'read') {
    body = (
      <BibleReader
        notes={notes}
        onOpen={onOpen}
        mascot={mascot}
        onPos={setReadPos}
        dockSearch={
          standalone ? { open: bsOpen, host: bsHost, onClose: () => setBsOpen(false) } : undefined
        }
      />
    );
  } else if (tab === 'bible' && bibleView === 'highlights') {
    body = <HighlightList onRead={() => setBibleView('read')} stripHost={stripHost} />;
  } else if (tab === 'groups') {
    body = <GroupsLanding mascot={mascot} />;
  } else if (tab === 'me' && meView === 'worship') {
    body = <WorshipPage notes={notes} onBack={() => setMeView('settings')} />;
  } else if (tab === 'me') {
    body = (
      <MyGalpi
        view={!narrow ? 'all' : meView === 'worship' ? 'settings' : meView}
        notes={notes}
        mascot={mascot}
        name={userName}
        anonymous={status.anonymous}
        syncLine={storeTrouble ? storeNote : syncLine}
        onOpen={onOpen}
        onLogin={onLogin}
        onGoWorship={() => setMeView('worship')}
      />
    );
  } else if (tab === 'note' && !notes.length && status.restoring) {
    // 기기 저장분(IndexedDB)을 읽는 중 — '비었음'을 잠깐 보이지 않게
    body = (
      <div className="sn-empty" role="status" aria-label="불러오는 중">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--sn-accent)' }} />
      </div>
    );
  } else if (tab === 'note' && !notes.length && !hasGroups) {
    body = (
      <div className="sn-empty">
        <Mascot kind={mascot} size={96} state="think" />
        <h2>아직 기록한 설교가 없어요</h2>
        <div>
          ‘새 설교 기록’을 눌러 이번 주 말씀을 적어보세요.
          <br />
          본문 구절은 ‘요 15:5’처럼 쓰면 바로 찾아 넣어 드려요.
        </div>
        <button type="button" className="sn-btn sn-primary" onClick={() => onNew()}>
          새 설교 기록
        </button>
      </div>
    );
  } else if (tab === 'challenge') {
    const older = allApply.filter((x) => !week.includes(x) && !x.t.done);
    body = (
      <ChallengeTab
        view={challengeView}
        onView={setChallengeView}
        notes={notes}
        anonymous={status.anonymous}
        onLogin={onLogin}
        apply={{ week: [...weekLeft, ...week.filter((x) => x.t.done)], older }}
        onToggleApply={onToggleApply}
        onOpenNote={onOpen}
        onNew={onNew}
      />
    );
  } else if (tab === 'note' && noteView === 'thoughts') {
    body = (
      <SermonThoughts
        notes={notes}
        query={query}
        mascot={mascot}
        onOpen={onOpen}
        onToggleApply={onToggleApply}
        onAnswer={onAnswer}
        shelfHost={stripHost}
      />
    );
  } else if (tab === 'bible') {
    body = (
      <SermonVerses
        notes={filtered}
        onOpen={onOpen}
        onRead={() => setBibleView('read')}
        stripHost={stripHost}
      />
    );
  } else if (noteView === 'tidy' && !query) {
    body = (
      <SermonTidy
        notes={notes}
        tidy={tidy}
        mascot={mascot}
        onDismiss={dismissTidy}
        onOpen={onOpen}
        onSave={onSaveNotes}
        onRemove={onRemoveNotes}
      />
    );
  } else if (noteView === 'cal' && !query) {
    body = (
      <SermonCalendar
        notes={notes}
        mascot={mascot}
        onOpen={onOpen}
        onNew={onNew}
        onSel={setCalSel}
        shelfHost={stripHost}
      />
    );
  } else if ((noteView === 'home' || noteView === 'week') && !query) {
    body = (
      <SermonHome
        notes={notes}
        mascot={mascot}
        onOpen={onOpen}
        onNew={onNew}
        onToggleApply={onToggleApply}
        part={noteView === 'week' ? 'week' : 'main'}
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
                        <b data-auto={!n.title.trim() || undefined}>{displayTitle(n).text}</b>
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

  /* 고른 탭의 세부 목록 — 넓은 화면은 왼쪽 패널 점선 아래, 좁은 화면은 본문 위 칩 줄 */
  type Sub = {
    key: string;
    label: string;
    /** 좁은 화면 칩 줄에 쓰는 짧은 이름 */
    short?: string;
    count?: string | number;
    /** 하단 보기 줄에서만 쓸 수 (null = 줄에선 숨김) */
    barCount?: string | number | null;
    on: boolean;
    go: () => void;
  };
  const subs: Array<{ title?: string; items: Sub[] }> =
    tab === 'note'
      ? [
          {
            items: [
              {
                key: 'home',
                label: '이번 주',
                on: noteView === 'home' || noteView === 'week',
                go: () => pickNote('home'),
              },
              {
                key: 'cal',
                label: '달력',
                count: notes.length,
                barCount: null,
                on: noteView === 'cal',
                go: () => pickNote('cal'),
              },
              {
                key: 'thoughts',
                label: '내 생각',
                short: '생각',
                count: thoughtCount,
                on: noteView === 'thoughts',
                go: () => pickNote('thoughts'),
              },
              // 다듬을 게 없으면 숨는다 (보고 있는 동안엔 남겨 둔다)
              ...(tidy.count > 0 || noteView === 'tidy'
                ? [
                    {
                      key: 'tidy',
                      label: '다듬기',
                      count: tidy.count || undefined,
                      on: noteView === 'tidy',
                      go: () => pickNote('tidy'),
                    },
                  ]
                : []),
            ],
          },
        ]
      : tab === 'bible'
        ? [
            {
              items: [
                {
                  key: 'read',
                  label: '성경',
                  count: readPos ? `${BOOKS[readPos.b][1]} ${readPos.c}` : undefined,
                  on: bibleView === 'read',
                  go: () => setBibleView('read'),
                },
                {
                  key: 'verses',
                  label: '설교 구절',
                  count: refCount,
                  on: bibleView === 'verses',
                  go: () => setBibleView('verses'),
                },
                {
                  key: 'highlights',
                  label: '표시한 구절',
                  count: highlights.count,
                  on: bibleView === 'highlights',
                  go: () => setBibleView('highlights'),
                },
              ],
            },
          ]
        : tab === 'challenge'
          ? [
              {
                items: [
                  {
                    key: 'home',
                    label: '홈',
                    on: challengeView !== 'ranking',
                    go: () => setChallengeView('home'),
                  },
                  // 랭킹 — 잠시 숨김 (2026-10-29)
                  // {
                  //   key: 'ranking',
                  //   label: '랭킹',
                  //   on: challengeView === 'ranking',
                  //   go: () => setChallengeView('ranking'),
                  // },
                ],
              },
            ]
          : tab === 'me' && narrow
            ? [
                {
                  items: [
                    {
                      key: 'home',
                      label: '홈',
                      on: meView === 'home',
                      go: () => setMeView('home'),
                    },
                    {
                      key: 'stickers',
                      label: '스티커',
                      count: stickerCount,
                      on: meView === 'stickers',
                      go: () => setMeView('stickers'),
                    },
                    {
                      key: 'settings',
                      label: '설정',
                      // 내 예배표는 설정 안 화면
                      on: meView === 'settings' || meView === 'worship',
                      go: () => setMeView('settings'),
                    },
                  ],
                },
              ]
            : [];

  /**
   * 좁은 화면(보기 줄·칩 줄)의 설교 노트 보기 — 「이번 주」를 표지·들은 예배 / 「한 주」(한 주 동안)로 나누고,
   * 「다듬기」는 넓은 화면에서만.
   */
  const narrowItems = (items: Sub[]): Sub[] =>
    tab !== 'note'
      ? items
      : items.flatMap((it) =>
          it.key === 'home'
            ? [
                { ...it, on: noteView === 'home' },
                {
                  key: 'week',
                  label: '한 주',
                  on: noteView === 'week',
                  go: () => pickNote('week'),
                },
              ]
            : it.key === 'tidy'
              ? []
              : [it],
        );

  const subChip = (it: Sub) => (
    <button key={it.key} type="button" aria-pressed={it.on} onClick={it.go}>
      {it.short || it.label}
      {it.count !== undefined && it.count !== '' && <span className="sn-count">{it.count}</span>}
    </button>
  );

  /** 탭 안의 상세 화면(모임 설교 자리 · 게임) — 칩 줄·새 기록 버튼을 빼고 하단은 동작 바 */
  const deep =
    !!sp.get('session') ||
    (tab === 'challenge' && (challengeView === 'rain' || challengeView === 'books'));
  const showSearch = tab === 'note' || (tab === 'bible' && bibleView === 'verses');
  const showFab = !deep && (tab === 'note' || tab === 'groups');
  // 달력 보기에선 고른 날짜로 새 기록 (오늘을 고르면 평소처럼 예배표로 채운다)
  const calNew = tab === 'note' && noteView === 'cal' && !query && calSel !== todayString();
  const newLabel = calNew ? `${fmtDate(calSel)}에 새 기록` : '새 설교 기록';
  const newHere = () => (calNew ? onNew(calSel) : onNew());

  /* 설치 앱 좁은 화면 — 위쪽 칩 줄·검색·새 기록 버튼 대신 하단 바 위 보기 줄 */
  const myGroups = gctx && !gctx.anonymous ? gctx.store.groups : [];
  // 모임 하나를 열었으면 줄에는 그 모임 보기(이번 주·통독 …)를, 모임 고르기는 위쪽 칩 줄로
  const openG =
    tab === 'groups' && !sp.get('session')
      ? myGroups.find((g) => g.id === sp.get('group'))
      : undefined;
  const gTabs = !!openG && openG.me.status === 'active';
  const gTab = readGroupTab(sp);
  const vbItems: ViewBarItem[] = gTabs
    ? GROUP_TABS.map(([k, l]) => ({
        key: k,
        label: l,
        count:
          k !== 'members'
            ? undefined
            : openG.me.role !== 'member' && openG.members.some((m) => m.status === 'pending')
              ? `요청 ${openG.members.filter((m) => m.status === 'pending').length}`
              : openG.members.filter((m) => m.status === 'active').length,
        on: gTab === k,
        go: () => setSp(withGroupTab(sp, k), { replace: true }),
      }))
    : tab === 'groups'
      ? [
          ...myGroups.map((g) => ({
            key: g.id,
            label: g.name,
            on: sp.get('group') === g.id,
            go: () => gctx?.openGroup(g.id),
          })),
          ...(myGroups.length && gctx
            ? [{ key: 'create', label: '＋ 만들기', on: false, go: gctx.openCreate }]
            : []),
        ]
      : subs.flatMap((g) =>
          narrowItems(g.items).map((it) => ({
            key: it.key,
            label: it.short || it.label,
            count: it.barCount === null ? undefined : (it.barCount ?? it.count),
            on: it.on,
            go: it.go,
          })),
        );
  const vbar = standalone && !deep && vbItems.length > 0;
  const vbSearch = vbar && showSearch && !main;
  const vbIndex = TABS.findIndex((t) => t.k === tab);
  const vbDock = vbar && tab === 'bible' && bibleView === 'read';
  useEffect(() => {
    if (!vbDock) setBsOpen(false);
  }, [vbDock]);

  // 본문을 아래로 내리면 접고, 조금이라도 올리면 펼친다
  useEffect(() => {
    setVbMin(false);
    const el = listMainRef.current;
    if (!vbar || !el) return;
    let last = el.scrollTop;
    const onScroll = () => {
      const y = el.scrollTop;
      const d = y - last;
      last = y;
      if (y < 24) setVbMin(false);
      else if (d > 4) setVbMin(true);
      else if (d < -4) setVbMin(false);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [vbar, tab]);

  return (
    <ActionBarHostProvider value={standalone ? abar.host : null}>
      <section
        className="sn-list"
        data-tab={tab}
        data-standalone={standalone}
        data-vbar={vbar || undefined}
        data-gtabs={(vbar && gTabs) || undefined}
        data-vsearch={vbSearch || undefined}
        data-shelf={vbShelf || undefined}
        aria-label="설교 노트"
      >
        <nav className="sn-side" aria-label="설교 노트 메뉴">
          {/* 왼쪽 레일 — 하단 바와 같은 탭 색 동그라미 */}
          <div
            ref={jelly.listRef}
            className="sn-tabs"
            role="tablist"
            aria-orientation="vertical"
            aria-label="갈피 탭"
          >
            <span ref={jelly.indRef} className="sn-tab-ind" data-k={tab} aria-hidden />
            {TABS.map(({ k, label, Icon }) => {
              // 레일 모서리에 붙는 작은 표 — 모임은 요청 수만
              const badge = k === 'groups' && groupRequests ? String(groupRequests) : tabBadge(k);
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  data-k={k}
                  title={tabBadge(k) ? `${label} · ${tabBadge(k)}` : undefined}
                  aria-selected={tab === k}
                  onClick={(e) => {
                    if (tab !== k) playTabVerb(k, e.currentTarget.querySelector('svg'));
                    goTab(k);
                  }}
                >
                  <span className="sn-tab-chip">
                    <Icon className="sn-icon" aria-hidden />
                  </span>
                  {label}
                  {badge && (
                    <span className="sn-tab-badge" data-k={k}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {/* 오른쪽 패널 — 고른 탭의 이름과 그 탭 메뉴만 */}
          <div className="sn-side-panel" data-k={tab}>
            <h2 className="sn-side-title">{TABS.find((t) => t.k === tab)?.label}</h2>
            <button type="button" className="sn-btn sn-primary" onClick={() => onNew()}>
              <Plus className="sn-icon" aria-hidden />새 설교 기록
            </button>
            <div className="sn-sub">
              {tab === 'groups'
                ? groupNav
                : subs.map((g, i) => (
                    <div key={g.title || i} className="sn-nav">
                      {g.title && <div className="sn-label">{g.title}</div>}
                      {g.items.map((it) => (
                        <button key={it.key} type="button" aria-current={it.on} onClick={it.go}>
                          {it.label}
                          {it.count !== undefined && <span className="sn-count">{it.count}</span>}
                        </button>
                      ))}
                    </div>
                  ))}
              {tab === 'me' && (
                <div className="sn-nav">
                  {onOpenLook && (
                    <button type="button" onClick={onOpenLook}>
                      <Mascot kind={mascot} size={22} />
                      꾸미기
                    </button>
                  )}
                  <button type="button" onClick={goStickers}>
                    모은 설교 스티커
                    <span className="sn-count">{stickerCount}</span>
                  </button>
                  <button
                    type="button"
                    aria-current={meView === 'worship'}
                    onClick={() => setMeView('worship')}
                  >
                    내 예배표
                    {worshipCount > 0 && <span className="sn-count">{worshipCount}</span>}
                  </button>
                </div>
              )}
            </div>
            <div className="sn-side-foot" data-trouble={storeTrouble}>
              {storeTrouble ? (
                <>
                  {storeNote}
                  {status.anonymous && onLogin && (
                    <div>
                      <button type="button" className="sn-login-link" onClick={onLogin}>
                        <LogIn className="sn-icon" style={{ width: 14, height: 14 }} aria-hidden />
                        로그인
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <span className="sn-sync" role="status" data-sn-net>
                  <i aria-hidden data-state={sync.state} />
                  <span>
                    {sync.text}
                    {sync.sub && <small>{sync.sub}</small>}
                  </span>
                </span>
              )}
            </div>
          </div>
        </nav>
        <main ref={listMainRef} className="sn-list-main">
          {!standalone && (
            <div ref={rowTab.listRef} className="sn-tabrow" role="tablist" aria-label="갈피 탭">
              <span ref={rowTab.indRef} className="sn-seg-ind" aria-hidden />
              {TABS.map(({ k, short }) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => goTab(k)}
                >
                  {short}
                  {tabBadge(k) && <span className="sn-dot" aria-label={tabBadge(k) || ''} />}
                </button>
              ))}
            </div>
          )}
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
          {(!vbar || gTabs) &&
            !deep &&
            tab === 'groups' &&
            gctx &&
            !gctx.anonymous &&
            gctx.store.groups.length > 0 && (
              <div className="sn-subchips" aria-label="내 모임">
                {gctx.store.groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={sp.get('group') === g.id}
                    onClick={() => gctx.openGroup(g.id)}
                  >
                    {g.name}
                  </button>
                ))}
                <button type="button" onClick={gctx.openCreate}>
                  <Plus className="sn-icon" aria-hidden />
                  만들기
                </button>
              </div>
            )}
          {!vbar && !deep && subs.length > 0 && (
            <div className="sn-subchips" aria-label="보기">
              {narrowItems(subs.flatMap((g) => g.items)).map(subChip)}
            </div>
          )}
          {main ? (
            main
          ) : (
            <>
              {showSearch && (
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
          {showFab && !vbar && (
            <button type="button" className="sn-fab" aria-label={newLabel} onClick={newHere}>
              <Plus aria-hidden />
              <span>새 기록</span>
            </button>
          )}
        </main>
        {standalone && (
          <div className="sn-bdock" data-away={abar.active}>
            <SermonBottomNav tabs={TABS} tab={tab} badge={tabBadge} onGo={goTab}>
              {vbar && (
                <SnViewBar
                  key={tab}
                  k={tab}
                  items={vbItems}
                  index={vbIndex}
                  count={TABS.length}
                  collapsed={vbMin && !bsOpen}
                  onExpand={() => setVbMin(false)}
                  search={
                    vbSearch
                      ? {
                          value: q,
                          onChange: setQ,
                          placeholder:
                            tab === 'note' ? '제목, 설교자, 구절, 내 생각' : '구절, 설교 제목',
                        }
                      : undefined
                  }
                  dock={
                    vbDock
                      ? {
                          open: bsOpen,
                          onOpen: () => {
                            setVbMin(false);
                            setBsOpen(true);
                          },
                          onHost: setBsHost,
                        }
                      : undefined
                  }
                  shelf={vbShelf ? setShelfHost : undefined}
                  action={showFab ? { label: newLabel, onClick: newHere } : undefined}
                />
              )}
            </SermonBottomNav>
            <div ref={abar.slotRef} className="sn-abar-slot" />
          </div>
        )}
      </section>
    </ActionBarHostProvider>
  );
}
