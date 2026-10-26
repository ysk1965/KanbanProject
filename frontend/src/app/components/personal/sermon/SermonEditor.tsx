import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  ChevronDown,
  History,
  Mic,
  MicOff,
  MoreHorizontal,
  PanelRight,
  PenLine,
  Plus,
  Redo2,
  Share2,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Pin,
  PinOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { decRef, encRef, refLong, refShort, type Ref } from './bibleRefs';
import { EditorCore, verseHTML } from './editorCore';
import { SermonPlayer, type SermonPlayerHandle } from './SermonPlayer';
import { personalFeatureAPI } from '../../../utils/services';
import { SelectionBubble } from './SelectionBubble';
import { SnOverlay, afterSheetClose } from './SnOverlay';
import { SnSheetBar } from './SnSheetBar';
import { ThoughtsPanel, type ThoughtsPanelHandle } from './ThoughtsPanel';
import { VersePicker, type InsertForm, type PickerTarget } from './VersePicker';
import { StyleSettingsModal } from './StyleSettingsModal';
import { VersionHistoryModal } from './VersionHistoryModal';
import { ShareSheet } from './share/ShareSheet';
import type { LineQuote } from './share/shareModel';
import type { SermonStore } from './sermonStore';
import { ANONYMOUS_USER, syncLabel } from './sermonStore';
import type { SermonStyle } from './sermonStyle';
import {
  audioEnd,
  audioPending,
  fmtDate,
  fmtTime,
  galpiByWeek,
  galpiToggle,
  isGalpi,
  isLocalId,
  noteRefs,
  plainText,
  todayString,
  type SermonAudioSegment,
  type SermonNote,
  type Thought,
} from './sermonTypes';
import { useSermonRecorder } from './useSermonRecorder';
import { deleteMedia } from './sermonMedia';
import { sermonAudioStore } from './sermonAudioStore';
import { VersionTracker, listVersions, saveVersion, type NoteVersion } from './sermonVersions';
import { firstVerseText, useBible } from './useBible';
import { Mascot } from './Mascot';
import './actionBar.css';
import type { MascotId } from './sermonLook';
import { loadGalpiPrefs, resolveGalpiRule } from './galpiPrefs';
import { useProfile } from './profile/ProfileContext';

/**
 * 설교 기록 화면 — 기획서 §2 상단 바, §3 노트 머리, §4 본문 편집기, §6 내 생각 패널.
 * 왼쪽 설교 본문(종이) · 오른쪽 내 생각 패널(여백). 폰에서는 패널이 하단 시트.
 */

interface SermonEditorProps {
  note: SermonNote;
  store: SermonStore;
  userId: string;
  style: SermonStyle;
  onStyleChange: (s: SermonStyle) => void;
  onBack: () => void;
  /** 하단 뒤로의 도착지 이름 (독립 화면 폰) — "노트", "6팀" 등 */
  backLabel?: string;
  /** 노트 삭제 후 목록으로 */
  onDeleted: () => void;
  /** 열면서 바로 이동할 연결 위치 */
  initialAid?: string | null;
  /** 로그인 전이면 첨부 불가 */
  canAttach: boolean;
  onLogin?: () => void;
  /** 꾸미기에서 고른 마스코트 — 녹음 버튼에서 같이 귀를 기울인다 */
  mascot?: MascotId;
  /** 모임 설교 자리 띠 (group/SessionBand) — 상단 바 바로 아래 */
  groupBand?: React.ReactNode;
}

const SERVICE_OPTIONS = [
  '주일 1부',
  '주일 2부',
  '주일 3부',
  '수요예배',
  '금요기도회',
  '새벽기도',
  '청년부',
];
const RECENT_KEY = 'sermon-recent-v1';
const ASIDE_KEY = 'sermon-aside-w';
const PANEL_KEY = 'sermon-panel';
/** '0' 이면 녹음 없이 시간만 기록 */
const AUDIO_PREF_KEY = 'sermon-rec-audio';
const NARROW_MQ = '(max-width: 899px)';
/** 멈춘 채 이만큼 지나면 녹음 토막을 닫고 올린다 */
const PAUSE_CLOSE_MS = 5 * 60 * 1000;
/** 생각 시각으로 재생할 때 이만큼 앞에서 시작 */
const SEEK_LEAD_SEC = 5;

function loadAudioPref(): boolean {
  try {
    return localStorage.getItem(AUDIO_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

function rememberRef(r: Ref) {
  try {
    const arr = (JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[]).filter(
      (x) => x !== encRef(r),
    );
    arr.unshift(encRef(r));
    localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, 20)));
  } catch {
    /* ignore */
  }
}

function recentRefs(store: SermonStore): Ref[] {
  let arr: string[] = [];
  try {
    arr = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[];
  } catch {
    arr = [];
  }
  const seen = new Set(arr);
  store
    .all()
    .slice(0, 10)
    .forEach((n) =>
      noteRefs(n).forEach((r) => {
        const k = encRef(r);
        if (!seen.has(k)) {
          seen.add(k);
          arr.push(k);
        }
      }),
    );
  return arr
    .map(decRef)
    .filter((r): r is Ref => !!r)
    .slice(0, 16);
}

/** 내용 길이에 맞춰 늘어나는 입력란 — 10자 넘는 설교자 이름도 잘리지 않게 */
function FitInput({
  id,
  value,
  placeholder,
  list,
  inputRef,
  onChange,
  onKeyDown,
}: {
  id: string;
  value: string;
  placeholder: string;
  list?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  useLayoutEffect(() => {
    const inp = ref.current;
    const m = measureRef.current;
    if (!inp || !m) return;
    const cs = getComputedStyle(inp);
    m.style.font = cs.font;
    m.style.letterSpacing = cs.letterSpacing;
    m.textContent = value || placeholder || '';
    inp.style.width = `${Math.ceil(m.getBoundingClientRect().width + 4)}px`;
  }, [value, placeholder, ref]);
  return (
    <>
      <input
        id={id}
        ref={ref}
        value={value}
        placeholder={placeholder}
        list={list}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <span ref={measureRef} className="sn-measure" aria-hidden="true" />
    </>
  );
}

export function SermonEditor({
  note,
  store,
  userId,
  style,
  onStyleChange,
  onBack,
  backLabel = '노트',
  onDeleted,
  initialAid,
  canAttach,
  onLogin,
  mascot = 'galpi',
  groupBand,
}: SermonEditorProps) {
  const { bible } = useBible();
  const noteRef = useRef<SermonNote>(note);
  const [noteId, setNoteId] = useState(note.id);
  const [title, setTitle] = useState(note.title);
  const [preacher, setPreacher] = useState(note.preacher);
  const [service, setService] = useState(note.service);
  const [date, setDate] = useState(note.date);
  const [refs, setRefs] = useState<string[]>(note.refs);
  const [thoughts, setThoughts] = useState<Thought[]>(note.thoughts);
  const [elapsed, setElapsed] = useState(note.elapsed || 0);
  const [recording, setRecording] = useState(false);
  const [audioSegs, setAudioSegs] = useState<SermonAudioSegment[]>(note.audio?.segments || []);
  const [audioPref, setAudioPref] = useState(loadAudioPref);
  /** 녹음이 끊겼고 자동으로 잇지 못함 — 「이어서 녹음」 버튼을 보인다 */
  const [micLost, setMicLost] = useState(false);
  const [confirmDelAudio, setConfirmDelAudio] = useState(false);
  const [syncTick, setSyncTick] = useState(0);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [ptrTick, setPtrTick] = useState(0);
  const [picking, setPicking] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_MQ).matches);
  const [panelOpen, setPanelOpen] = useState(() => {
    if (window.matchMedia(NARROW_MQ).matches) return false;
    try {
      return localStorage.getItem(PANEL_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [asideW, setAsideW] = useState<number | null>(() => {
    try {
      const w = Number(localStorage.getItem(ASIDE_KEY));
      return w > 0 ? w : null;
    } catch {
      return null;
    }
  });
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const profile = useProfile();
  const [picker, setPicker] = useState<{ open: boolean; target: PickerTarget }>({
    open: false,
    target: 'editor',
  });
  const [styleOpen, setStyleOpen] = useState(false);
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [bodyChars, setBodyChars] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [topTitleShow, setTopTitleShow] = useState(false);
  const [mvClosed, setMvClosed] = useState<Set<string>>(() => new Set());
  const [dateShown, setDateShown] = useState(false);
  /** 폰에서 키보드가 열렸을 때 보이는 뷰포트 (iOS Safari — 레이아웃 뷰포트가 줄지 않는다) */
  const [kb, setKb] = useState<{ top: number; height: number } | null>(null);

  const editorElRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<EditorCore | null>(null);
  const [core, setCore] = useState<EditorCore | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const preacherRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const thoughtInputRef = useRef<HTMLTextAreaElement>(null);
  const panelHandleRef = useRef<ThoughtsPanelHandle>(null);
  const saveTimer = useRef<number | null>(null);
  const trackerRef = useRef<VersionTracker | null>(null);
  const deletedRef = useRef(false);
  const pickWasPanel = useRef(false);
  const recordingRef = useRef(false);
  recordingRef.current = recording;
  const playerRef = useRef<SermonPlayerHandle>(null);
  const micWarned = useRef(false);

  // ───────── 저장 ─────────
  const saveNow = useCallback(() => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const core = coreRef.current;
    if (!core || deletedRef.current) return;
    const body = core.serialize();
    const n = { ...noteRef.current, body };
    trackerRef.current?.maybe(body, false);
    noteRef.current = store.save(n);
  }, [store]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(saveNow, 700);
  }, [saveNow]);

  // ───────── 카드로 공유 ─────────
  /** 열 때 노트 사본(본문까지 저장한 최신) + 선택 버블에서 고른 문장 */
  const [share, setShare] = useState<{ note: SermonNote; quote: LineQuote | null } | null>(null);
  const openShare = useCallback(
    (quote: LineQuote | null = null) => {
      saveNow();
      setShare({ note: noteRef.current, quote });
    },
    [saveNow],
  );

  /** 메타·구절·생각처럼 React 가 들고 있는 필드를 바꿀 때 */
  const patchNote = useCallback(
    (patch: Partial<SermonNote>) => {
      noteRef.current = { ...noteRef.current, ...patch };
      scheduleSave();
    },
    [scheduleSave],
  );

  // ───────── 갈피 (그 주의 중심 설교) ─────────
  const [galpiOn, setGalpiOn] = useState(() => {
    const all = store.all();
    return isGalpi(note, galpiByWeek(all, resolveGalpiRule(loadGalpiPrefs(), all)));
  });
  const toggleGalpi = useCallback(() => {
    const all = store.all();
    const t = galpiToggle(all, noteRef.current, resolveGalpiRule(loadGalpiPrefs(), all));
    t.rivals.forEach((r) => store.save(r));
    setGalpiOn(t.on);
    patchNote({ bookmarked_at: t.bookmarked_at });
    toast(
      !t.on
        ? '이번 주는 갈피를 뺐어요'
        : t.moved
          ? '이 설교로 갈피를 옮겼어요'
          : '이 주의 갈피를 꽂았어요',
    );
  }, [patchNote, store]);

  const updateThoughts = useCallback(
    (fn: (prev: Thought[]) => Thought[]) => {
      const next = fn(noteRef.current.thoughts || []);
      setThoughts(next);
      patchNote({ thoughts: next });
    },
    [patchNote],
  );

  // ───────── 녹음 ─────────
  const patchAudio = useCallback(
    (fn: (prev: SermonAudioSegment[]) => SermonAudioSegment[], now = false) => {
      const next = fn(noteRef.current.audio?.segments || []);
      setAudioSegs(next);
      noteRef.current = { ...noteRef.current, audio: next.length ? { segments: next } : undefined };
      if (deletedRef.current) return;
      if (now) {
        if (coreRef.current) saveNow();
        else noteRef.current = store.save(noteRef.current); // 화면을 닫은 뒤 토막이 닫힘
      } else scheduleSave();
    },
    [saveNow, scheduleSave, store],
  );

  const rec = useSermonRecorder({
    noteId: () => noteRef.current.id,
    getElapsed: () => noteRef.current.elapsed || 0,
    onSegmentStart: ({ id, mime, offset }) =>
      patchAudio((prev) => [...prev, { id, url: null, mime, offset, duration: 0, size: 0 }], true),
    onSegmentProgress: ({ id, duration, size }) =>
      patchAudio((prev) => prev.map((x) => (x.id === id ? { ...x, duration, size } : x))),
    onSegmentEnd: ({ id, duration, size }) =>
      patchAudio((prev) => prev.map((x) => (x.id === id ? { ...x, duration, size } : x)), true),
    onInterrupted: () => {
      if (!recordingRef.current) return;
      if (document.visibilityState === 'visible') {
        void recStartRef.current().then((ok) => {
          setMicLost(!ok);
          if (ok) toast('녹음이 잠깐 끊겨 이어서 녹음해요');
        });
      } else setMicLost(true);
    },
    onLimit: () => {
      setRecording(false);
      saveNow();
      toast('녹음이 한도(200MB)에 닿아 저장했어요. 이어서 하려면 다시 눌러주세요');
    },
  });
  const { start: recStart, stop: recStop } = rec;
  const recStartRef = useRef(recStart);
  recStartRef.current = recStart;
  const audioOn = rec.supported && audioPref && !rec.denied;
  const hasAudio = audioSegs.length > 0;

  // ───────── 편집기 코어 ─────────
  const openPicker = useCallback((target: PickerTarget) => {
    setMenuOpen(false);
    setPicker({ open: true, target });
  }, []);

  useEffect(() => {
    const el = editorElRef.current;
    if (!el) return;
    const core = new EditorCore(el, {
      onChange: scheduleSave,
      onHistory: (u, r) => {
        setCanUndo(u);
        setCanRedo(r);
      },
      onOpenPicker: () => openPicker('editor'),
      onPtrChange: () => setPtrTick((t) => t + 1),
      onPickingChange: (p) => {
        setPicking(p);
        if (p) {
          if (window.matchMedia(NARROW_MQ).matches) {
            pickWasPanel.current = true;
            setPanelOpen(false);
          } else pickWasPanel.current = false;
        } else {
          if (pickWasPanel.current) setPanelOpen(true);
          window.setTimeout(() => thoughtInputRef.current?.focus({ preventScroll: true }), 30);
        }
      },
      toast: (m) => toast(m),
    });
    coreRef.current = core;
    setCore(core);
    core.mount();
    core.load(noteRef.current.body);
    store.openId = noteRef.current.id;
    trackerRef.current = new VersionTracker(
      userId,
      noteRef.current.id,
      noteRef.current.body || '',
      () => noteRef.current.title,
    );
    if (initialAid) window.setTimeout(() => core.jumpTo(initialAid, null), 80);

    // 새로고침·탭 종료로 안 닫힌 녹음 토막이 있으면 길이를 확정한다
    void store.reconcileAudio(noteRef.current.id).then(() => {
      const n = store.get(noteRef.current.id);
      if (!n || deletedRef.current) return;
      noteRef.current = { ...noteRef.current, audio: n.audio };
      setAudioSegs(n.audio?.segments || []);
    });

    const onPageHide = () => saveNow();
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.removeEventListener('pagehide', onPageHide);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (!deletedRef.current) {
        const body = core.serialize();
        trackerRef.current?.maybe(body, true);
        noteRef.current = { ...noteRef.current, body };
        noteRef.current = store.save(noteRef.current);
      }
      if (store.openId === noteRef.current.id) store.openId = null;
      core.unmount();
      coreRef.current = null;
      setCore(null);
    };
    // 노트 하나당 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 성경 데이터가 늦게 오면 블록 다시 채움
  useEffect(() => {
    if (bible) coreRef.current?.refreshVerses();
  }, [bible]);

  // 로컬 id → 서버 id
  useEffect(
    () =>
      store.onRemap((from, to) => {
        if (noteRef.current.id !== from) return;
        noteRef.current = { ...noteRef.current, id: to };
        trackerRef.current?.setNoteId(to);
        setNoteId(to);
      }),
    [store],
  );

  // 저장 상태 표시 + 올라간 녹음 토막(id·URL 교체)을 화면 사본에 반영
  useEffect(
    () =>
      store.subscribe(() => {
        setSyncTick((t) => t + 1);
        const srv = store.get(noteRef.current.id)?.audio?.segments;
        const mine = noteRef.current.audio?.segments;
        if (!srv || !mine || deletedRef.current) return;
        const byOffset = new Map(srv.map((x) => [x.offset, x] as const));
        let changed = false;
        const merged = mine.map((x) => {
          const y = byOffset.get(x.offset);
          if (!y || y.id === x.id) return x;
          if ((isLocalId(x.id) && !isLocalId(y.id)) || (y.lost && !x.lost)) {
            changed = true;
            return { ...x, id: y.id, url: y.url, ...(y.lost ? { lost: true } : {}) };
          }
          return x;
        });
        if (changed) {
          noteRef.current = { ...noteRef.current, audio: { segments: merged } };
          setAudioSegs(merged);
        }
      }),
    [store],
  );

  // 화면 폭
  useEffect(() => {
    const mq = window.matchMedia(NARROW_MQ);
    const fn = () => setNarrow(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  // 키보드: 보이는 뷰포트가 25% 이상 줄면 기록 화면을 그 높이에 고정 (서식 바가 키보드 위에 붙는다)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const open = window.matchMedia(NARROW_MQ).matches && vv.height < window.innerHeight * 0.75;
      setKb((prev) => {
        if (!open) return prev ? null : prev;
        const next = { top: Math.round(vv.offsetTop), height: Math.round(vv.height) };
        return prev && prev.top === next.top && prev.height === next.height ? prev : next;
      });
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // 큰 제목이 60% 이상 가려지면 상단 바에 제목
  useEffect(() => {
    const t = titleRef.current;
    const root = scrollerRef.current;
    if (!t || !root) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((en) => setTopTitleShow(en.intersectionRatio < 0.6)),
      { root, threshold: [0, 0.6, 1] },
    );
    io.observe(t);
    return () => io.disconnect();
  }, []);

  // 타이머
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      noteRef.current = { ...noteRef.current, elapsed: (noteRef.current.elapsed || 0) + 1 };
      setElapsed(noteRef.current.elapsed);
    }, 1000);
    return () => window.clearInterval(id);
  }, [recording]);

  // 멈춘 채 5분이 지나면 녹음 토막을 닫는다 (올리기 시작)
  useEffect(() => {
    if (recording || rec.status !== 'paused') return;
    const id = window.setTimeout(() => void recStop(), PAUSE_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [recording, rec.status, recStop]);

  // 녹음 중에 창을 닫으려 하면 묻는다
  useEffect(() => {
    if (!recording) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [recording]);

  // 끊긴 녹음: 화면이 돌아오면 이어 본다
  useEffect(() => {
    if (!micLost) return;
    const fn = () => {
      if (document.visibilityState !== 'visible' || !recordingRef.current) return;
      void recStart().then((ok) => {
        if (ok) {
          setMicLost(false);
          toast('녹음을 이어서 시작했어요');
        }
      });
    };
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }, [micLost, recStart]);

  // Ctrl/Cmd+K → 구절 찾기 (페이지의 빠른 입력 단축키보다 먼저 받는다)
  // Ctrl/Cmd+S → 즉시 저장 (브라우저 "별도 저장" 대화상자 대신)
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'k') {
        e.preventDefault();
        e.stopPropagation();
        openPicker('editor');
      } else if (k === 's' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        saveNow();
      }
    };
    document.addEventListener('keydown', fn, true);
    return () => document.removeEventListener('keydown', fn, true);
  }, [openPicker, saveNow]);

  // ⋯ 메뉴 바깥 클릭
  useEffect(() => {
    if (!menuOpen) return;
    const fn = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.sn-menu-wrap')) setMenuOpen(false);
    };
    document.addEventListener('click', fn);
    return () => document.removeEventListener('click', fn);
  }, [menuOpen]);

  // 제목 자동 높이
  const growTitle = useCallback(() => {
    const t = titleRef.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
  }, []);
  useLayoutEffect(() => {
    growTitle();
  }, [title, growTitle]);
  useEffect(() => {
    if (document.fonts?.ready) document.fonts.ready.then(growTitle).catch(() => {});
    if (!noteRef.current.title) window.setTimeout(() => titleRef.current?.focus(), 60);
  }, [growTitle]);

  // ───────── 패널 ─────────
  const setPanel = useCallback(
    (open: boolean) => {
      setPanelOpen(open);
      if (!narrow) {
        try {
          localStorage.setItem(PANEL_KEY, open ? '1' : '0');
        } catch {
          /* ignore */
        }
      }
    },
    [narrow],
  );

  const asideBounds = useCallback((): [number, number] => {
    const w = bodyRef.current?.getBoundingClientRect().width || 1000;
    return [260, Math.max(300, w - 380)];
  }, []);
  const applyAsideW = useCallback(
    (px: number, persist: boolean) => {
      const [mn, mx] = asideBounds();
      const w = Math.round(Math.min(mx, Math.max(mn, px)));
      setAsideW(w);
      if (persist) {
        try {
          localStorage.setItem(ASIDE_KEY, String(w));
        } catch {
          /* ignore */
        }
      }
    },
    [asideBounds],
  );
  const onSplitterDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const sp = e.currentTarget;
    sp.setPointerCapture(e.pointerId);
    setDragging(true);
    const right = bodyRef.current?.getBoundingClientRect().right || 0;
    const move = (ev: PointerEvent) => applyAsideW(right - ev.clientX, false);
    const up = () => {
      sp.releasePointerCapture(e.pointerId);
      sp.removeEventListener('pointermove', move);
      sp.removeEventListener('pointerup', up);
      sp.removeEventListener('pointercancel', up);
      setDragging(false);
      const w = bodyRef.current?.querySelector('.sn-aside')?.getBoundingClientRect().width;
      if (w) applyAsideW(w, true);
    };
    sp.addEventListener('pointermove', move);
    sp.addEventListener('pointerup', up);
    sp.addEventListener('pointercancel', up);
  };

  // ───────── 타이머 ─────────
  const today = todayString();
  const recState = recording ? 'run' : elapsed ? 'pause' : 'idle';
  const audioLive = recording && rec.status === 'on';
  const toggleRec = () => {
    const on = !recording;
    if (!on) {
      setRecording(false);
      rec.pause();
      saveNow();
      return;
    }
    playerRef.current?.pause();
    setRecording(true);
    if (!audioOn) return;
    void rec.resume().then((ok) => {
      if (ok) {
        setMicLost(false);
        return;
      }
      if (!micWarned.current) {
        micWarned.current = true;
        toast('마이크를 쓸 수 없어 시간만 기록해요');
      }
    });
  };
  const retryMic = () => {
    void rec.start().then((ok) => {
      setMicLost(!ok);
      if (!ok) toast('마이크를 다시 열지 못했어요');
    });
  };
  const toggleAudioPref = () => {
    const next = !audioPref;
    setAudioPref(next);
    try {
      localStorage.setItem(AUDIO_PREF_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!next && rec.status !== 'off') void rec.stop();
    toast(next ? '다음 기록부터 녹음도 함께 해요' : '녹음 없이 시간만 기록해요');
  };
  const deleteAudio = () => {
    setConfirmDelAudio(false);
    void rec.stop().then(() => {
      const segs = noteRef.current.audio?.segments || [];
      segs.forEach((sg) => {
        if (isLocalId(sg.id)) void sermonAudioStore.removeSegment(sg.id);
        else deleteMedia(sg.id);
      });
      patchAudio(() => [], true);
      toast('녹음을 지웠어요');
    });
  };
  /** 생각에 찍을 시각: 녹음을 듣는 중이면 그 위치, 아니면 타이머 */
  const stampNow = useCallback(() => {
    if (!recordingRef.current) {
      const p = playerRef.current?.position();
      if (p != null) return Math.floor(p);
    }
    return noteRef.current.elapsed || recordingRef.current ? noteRef.current.elapsed || 0 : null;
  }, []);

  // ───────── 본문 말씀 ─────────
  const mainRefs = useMemo(
    () =>
      refs.map((k) => [k, decRef(k)] as const).filter((x): x is readonly [string, Ref] => !!x[1]),
    [refs],
  );
  const removeMainRef = (k: string) => {
    const i = refs.indexOf(k);
    if (i < 0) return;
    const next = refs.filter((x) => x !== k);
    setRefs(next);
    patchNote({ refs: next });
    toast('설교 본문에서 뺐어요', {
      duration: 5500,
      action: {
        label: '되돌리기',
        onClick: () => {
          const cur = [...noteRef.current.refs];
          if (cur.includes(k)) return;
          cur.splice(Math.min(i, cur.length), 0, k);
          setRefs(cur);
          patchNote({ refs: cur });
        },
      },
    });
  };

  // ───────── 구절 찾기 ─────────
  const closePicker = useCallback(() => {
    setPicker((p) => ({ ...p, open: false }));
    if (picker.target === 'editor') window.setTimeout(() => coreRef.current?.focus(), 10);
  }, [picker.target]);

  const onInsert = (ref: Ref, form: InsertForm) => {
    rememberRef(ref);
    setPicker((p) => ({ ...p, open: false }));
    const core = coreRef.current;
    if (form === 'meta') {
      const k = encRef(ref);
      const next = [...noteRef.current.refs.filter((x) => x !== k), k];
      setRefs(next);
      patchNote({ refs: next });
      return;
    }
    if (form === 'block') core?.insertBlock(ref);
    else if (form === 'chip') core?.insertChip(ref);
    else {
      setPanel(true);
      window.setTimeout(() => panelHandleRef.current?.appendText(`(${refShort(ref)}) `), 30);
    }
  };

  // ───────── 버전 ─────────
  const openVersions = () => {
    saveNow();
    setBodyChars(plainText(noteRef.current.body).length);
    setVersions(listVersions(userId, noteRef.current.id));
  };
  const restoreVersion = (v: NoteVersion) => {
    const core = coreRef.current;
    if (!core) return;
    core.snapNow();
    saveVersion(userId, noteRef.current.id, noteRef.current.title, core.serialize(), 'restore');
    core.setBody(v.body);
    core.markRestored();
    core.snapNow();
    setVersions(null);
    toast('그 시점으로 되돌렸어요', {
      duration: 5500,
      action: { label: '취소', onClick: () => core.undo() },
    });
  };

  // ───────── 삭제 ─────────
  const deleteNote = () => {
    setConfirmDelete(false);
    deletedRef.current = true;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setRecording(false);
    void rec.stop();
    store.remove(noteRef.current.id);
    toast('노트를 삭제했어요');
    afterSheetClose(onDeleted); // 확인창 칸이 기록에서 빠진 뒤에 노트를 닫는다
  };

  const onJump = (aid: string | null, label: string | null, t?: number | null) => {
    if (aid || label) coreRef.current?.jumpTo(aid, label);
    if (t != null && hasAudio && !recording) {
      playerRef.current?.seek(Math.max(0, t - SEEK_LEAD_SEC), true);
    }
    if (narrow) setPanel(false);
  };

  const sync = syncLabel(store.status);
  void syncTick;
  // 올리는 중 → 저장됨 으로 바뀌는 순간에만 점이 한 번 톡 (계속 움직이는 표시는 예배 중에 거슬린다)
  const prevSyncSt = useRef(sync.state);
  const [savedTick, setSavedTick] = useState(0);
  useEffect(() => {
    if (prevSyncSt.current === 'wait' && sync.state === 'ok') setSavedTick((n) => n + 1);
    prevSyncSt.current = sync.state;
  }, [sync.state]);
  const dockBtn = (e: React.MouseEvent) => e.preventDefault();

  return (
    <section
      className="sn-edit"
      aria-label="설교 기록"
      data-panel={panelOpen ? 'open' : 'closed'}
      data-kb={kb ? '1' : undefined}
      style={kb ? { top: kb.top, height: kb.height } : undefined}
    >
      <header className="sn-topbar">
        <button
          type="button"
          className="sn-btn sn-icon-only sn-top-back"
          aria-label="목록으로"
          onClick={onBack}
        >
          <ArrowLeft className="sn-icon" />
        </button>
        <div className="sn-ttl">
          <b data-show={topTitleShow}>{title || '새 설교'}</b>
          <span
            className="sn-save-state"
            data-st={sync.state}
            data-fx={savedTick ? (savedTick % 2 ? 'a' : 'b') : undefined}
          >
            {sync.text}
          </span>
        </div>
        <button
          type="button"
          className="sn-rec"
          data-on={recording}
          data-state={recState}
          data-audio={audioLive}
          data-compact={!recording && !!date && date !== today}
          aria-label={
            recState === 'run'
              ? `${audioLive ? '설교 녹음 중' : '설교 시간 기록 중'} ${fmtTime(elapsed)}. 누르면 멈춥니다`
              : recState === 'pause'
                ? `설교 시간 ${fmtTime(elapsed)}에서 멈춤. 누르면 이어서 ${audioOn ? '녹음' : '기록'}합니다`
                : audioOn
                  ? '설교 녹음 시작'
                  : '설교 시간 기록 시작'
          }
          onClick={toggleRec}
        >
          <Mascot
            kind={mascot}
            size={26}
            className="sn-rec-m"
            state={recState === 'run' ? 'listen' : recState === 'pause' ? 'think' : 'idle'}
          />
          {audioLive ? <Mic className="sn-icon sn-mic" aria-hidden /> : <span className="sn-dot" />}
          <span className="sn-rs">
            {recState === 'run'
              ? audioLive
                ? '녹음 중'
                : '기록 중'
              : recState === 'pause'
                ? '멈춤'
                : '설교 시간'}
          </span>
          <span className="sn-mono sn-rt" hidden={recState === 'idle'}>
            {fmtTime(elapsed)}
          </span>
          <span className="sn-ra">
            {recState === 'run'
              ? '멈추기'
              : recState === 'pause'
                ? audioOn
                  ? '이어서 녹음'
                  : '이어서 기록'
                : audioOn
                  ? '녹음 시작'
                  : '기록 시작'}
          </span>
        </button>
        <button
          type="button"
          className="sn-btn sn-ghost"
          title="카드로 공유"
          aria-label="카드로 공유"
          onClick={() => openShare()}
        >
          <Share2 className="sn-icon" />
          <span className="sn-hide-sm">공유</span>
        </button>
        <button
          type="button"
          className="sn-btn sn-ghost sn-hide-sm"
          title="버전 기록"
          onClick={openVersions}
        >
          <History className="sn-icon" />
          <span className="sn-hide-sm">버전</span>
        </button>
        <button
          type="button"
          className="sn-btn sn-ghost"
          aria-pressed={panelOpen}
          title="내 생각 패널 열고 닫기"
          onClick={() => {
            const open = !panelOpen;
            setPanel(open);
            if (open) window.setTimeout(() => thoughtInputRef.current?.focus(), 30);
          }}
        >
          <PanelRight className="sn-icon" />
          <span className="sn-hide-sm">내 생각</span>
        </button>
        <div className="sn-menu-wrap">
          <button
            type="button"
            className="sn-btn sn-icon-only sn-ghost"
            aria-label="더보기"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
          >
            <MoreHorizontal className="sn-icon" />
          </button>
          {menuOpen && (
            <div className="sn-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  openVersions();
                }}
              >
                <History className="sn-icon" />
                버전 기록
              </button>
              {profile && (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={profile.isPinned(note.id)}
                  onClick={() => {
                    setMenuOpen(false);
                    const r = profile.togglePin(note.id, (id) => !!store.get(id));
                    toast(
                      r === 'added'
                        ? '나의 갈피에 고정했어요'
                        : r === 'removed'
                          ? '고정을 풀었어요'
                          : '고정은 3장까지예요. 나의 갈피에서 한 장을 먼저 내려놓아 주세요',
                    );
                  }}
                >
                  {profile.isPinned(note.id) ? (
                    <PinOff className="sn-icon" />
                  ) : (
                    <Pin className="sn-icon" />
                  )}
                  {profile.isPinned(note.id) ? '나의 갈피 고정 풀기' : '나의 갈피에 고정'}
                </button>
              )}
              {rec.supported && (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={audioPref}
                  onClick={() => {
                    setMenuOpen(false);
                    toggleAudioPref();
                  }}
                >
                  {audioPref ? <MicOff className="sn-icon" /> : <Mic className="sn-icon" />}
                  {audioPref ? '녹음 없이 시간만 기록' : '설교 녹음 켜기'}
                </button>
              )}
              {hasAudio && (
                <button
                  type="button"
                  role="menuitem"
                  className="sn-danger-text"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelAudio(true);
                  }}
                >
                  <Trash2 className="sn-icon" />
                  녹음 지우기
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className="sn-danger-text"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmDelete(true);
                }}
              >
                <Trash2 className="sn-icon" />
                노트 삭제
              </button>
            </div>
          )}
        </div>
      </header>
      {groupBand && <div className="sg-band-wrap">{groupBand}</div>}

      {recording && micLost && (
        <div className="sn-player sn-player-lost" role="status">
          <MicOff className="sn-icon" aria-hidden />
          <span>녹음이 끊겼어요. 시간은 계속 기록 중이에요.</span>
          <button type="button" className="sn-btn sn-primary" onClick={retryMic}>
            이어서 녹음
          </button>
        </div>
      )}
      {hasAudio && !recording && (
        <SermonPlayer
          ref={playerRef}
          segments={audioSegs}
          end={Math.max(audioEnd({ audio: { segments: audioSegs } }), elapsed)}
          pending={audioPending({ audio: { segments: audioSegs } })}
          offline={store.status.online === false}
        />
      )}

      <div className="sn-body" ref={bodyRef}>
        <div className="sn-page">
          <div className="sn-scroll" ref={scrollerRef}>
            <div className="sn-paper">
              <textarea
                ref={titleRef}
                className="sn-title-in"
                rows={1}
                placeholder="설교 제목"
                aria-label="설교 제목"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  patchNote({ title: e.target.value });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    preacherRef.current?.focus();
                  }
                }}
              />
              <div className="sn-meta-row">
                <label className="sn-mfield" htmlFor="sn-preacher">
                  <span>설교자</span>
                  <FitInput
                    id="sn-preacher"
                    inputRef={preacherRef}
                    value={preacher}
                    placeholder="이름"
                    onChange={(v) => {
                      setPreacher(v);
                      patchNote({ preacher: v });
                    }}
                  />
                </label>
                <span className="sn-msep" aria-hidden="true" />
                <label className="sn-mfield" htmlFor="sn-service">
                  <span>예배</span>
                  <FitInput
                    id="sn-service"
                    value={service}
                    placeholder="예배"
                    list="sn-service-list"
                    onChange={(v) => {
                      setService(v);
                      patchNote({ service: v });
                    }}
                  />
                </label>
                <datalist id="sn-service-list">
                  {SERVICE_OPTIONS.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
                <span className="sn-msep" aria-hidden="true" />
                <div className="sn-mfield">
                  <span>날짜</span>
                  <button
                    type="button"
                    className="sn-date-btn"
                    aria-label="날짜 바꾸기"
                    onClick={() => {
                      const d = dateRef.current;
                      if (!d) return;
                      try {
                        d.showPicker();
                      } catch {
                        setDateShown(true);
                        d.focus();
                      }
                    }}
                  >
                    {date ? fmtDate(date) : '날짜 고르기'}
                  </button>
                  <input
                    ref={dateRef}
                    type="date"
                    className={`sn-date-in${dateShown ? ' sn-show' : ''}`}
                    tabIndex={-1}
                    aria-hidden="true"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      patchNote({ date: e.target.value });
                      setDateShown(false);
                    }}
                    onBlur={() => setDateShown(false)}
                  />
                </div>
                {date && (
                  <button
                    type="button"
                    className="sn-btn sn-galpi-btn sn-meta-galpi"
                    aria-pressed={galpiOn}
                    title="그 주의 중심 설교로 갈피를 꽂아 둡니다"
                    onClick={toggleGalpi}
                  >
                    <Bookmark className="sn-icon" aria-hidden />
                    {galpiOn ? '갈피 빼기' : '갈피 꽂기'}
                  </button>
                )}
              </div>

              <section className="sn-mainv" aria-label="설교 본문 말씀">
                {mainRefs.map(([k, r]) => {
                  const col = mvClosed.has(k);
                  return (
                    <div key={k} className="sn-vblock" data-collapsed={col ? 1 : 0}>
                      <div className="sn-vh">
                        <button
                          type="button"
                          className="sn-vtog"
                          aria-expanded={!col}
                          onClick={() =>
                            setMvClosed((s) => {
                              const n = new Set(s);
                              if (n.has(k)) n.delete(k);
                              else n.add(k);
                              return n;
                            })
                          }
                        >
                          <ChevronDown className="sn-icon sn-chev" aria-hidden />
                          <span>{refLong(r)}</span>
                        </button>
                        <span className="sn-tr">개역한글</span>
                        <span className="sn-peek">{firstVerseText(r)}</span>
                        <button
                          type="button"
                          className="sn-act"
                          onClick={() => {
                            // 들어간 자리로 스크롤되고 말씀이 붙는 게 보이므로 토스트는 생략
                            coreRef.current?.insertBlock(r);
                          }}
                        >
                          노트에 넣기
                        </button>
                        <button
                          type="button"
                          className="sn-act"
                          aria-label={`${refShort(r)} 본문에서 빼기`}
                          onClick={() => removeMainRef(k)}
                        >
                          빼기
                        </button>
                      </div>
                      <div
                        className="sn-vt"
                        dangerouslySetInnerHTML={{ __html: verseHTML(r, false) }}
                      />
                    </div>
                  );
                })}
                <div className="sn-mvh">
                  <button type="button" className="sn-linkbtn" onClick={() => openPicker('meta')}>
                    <Plus className="sn-icon" aria-hidden />
                    {mainRefs.length ? '본문 하나 더' : '설교 본문 추가'}
                  </button>
                </div>
              </section>

              {picking && (
                <div className="sn-pickbar">
                  <span style={{ flex: 1, minWidth: 0 }}>
                    생각을 연결할 곳을 본문에서 눌러주세요
                  </span>
                  <button type="button" onClick={() => coreRef.current?.endPick()}>
                    취소
                  </button>
                </div>
              )}
              <div
                ref={editorElRef}
                className="sn-editor sn-rich"
                contentEditable
                suppressContentEditableWarning
                spellCheck={false}
                role="textbox"
                aria-multiline="true"
                aria-label="설교 내용"
                data-placeholder="말씀을 받아 적어보세요. 문장 중에 ‘롬8:28’처럼 쓰고 띄어쓰면 구절로 바뀌어요. 빈 줄에 ‘# ’은 제목, ‘- ’은 목록. 아래 ‘구절 넣기’나 빈 줄에서 / 로 구절을 넣을 수 있어요."
              />
              <SelectionBubble
                core={core}
                canPolish={canAttach}
                onNeedLogin={onLogin}
                polish={(text) => personalFeatureAPI.polishText('sermon', text).then((r) => r.text)}
                onMakeCard={openShare}
                onInsertVerse={(r) => {
                  rememberRef(r);
                  coreRef.current?.insertBlock(r);
                }}
              />
            </div>
          </div>

          <div className="sn-dock">
            <div className="sn-dgrp">
              <button
                type="button"
                className="sn-btn sn-icon-only"
                aria-label="실행 취소"
                title="실행 취소 (Ctrl+Z)"
                disabled={!canUndo}
                onMouseDown={dockBtn}
                onClick={() => coreRef.current?.undo()}
              >
                <Undo2 className="sn-icon" />
              </button>
              <button
                type="button"
                className="sn-btn sn-icon-only"
                aria-label="다시 실행"
                title="다시 실행 (Ctrl+Shift+Z)"
                disabled={!canRedo}
                onMouseDown={dockBtn}
                onClick={() => coreRef.current?.redo()}
              >
                <Redo2 className="sn-icon" />
              </button>
              <span className="sn-sep" />
              <button
                type="button"
                className="sn-btn"
                title="소제목 (Ctrl+E · 빈 줄에 # 띄어쓰기)"
                onMouseDown={dockBtn}
                onClick={() => coreRef.current?.format('h3')}
              >
                제목
              </button>
              <button
                type="button"
                className="sn-btn"
                title="강조 (Ctrl+B)"
                onMouseDown={dockBtn}
                onClick={() => coreRef.current?.format('bold')}
              >
                <b>강조</b>
              </button>
              <button
                type="button"
                className="sn-btn sn-hide-sm"
                title="목록"
                onMouseDown={dockBtn}
                onClick={() => coreRef.current?.format('list')}
              >
                목록
              </button>
              <button
                type="button"
                className="sn-btn"
                title="서식 설정"
                aria-label="서식 설정"
                onMouseDown={dockBtn}
                onClick={() => setStyleOpen(true)}
              >
                <SlidersHorizontal className="sn-icon" />
                <span className="sn-hide-sm">서식</span>
              </button>
            </div>
            {/* 독립 화면 폰: 뒤로는 하단 왼쪽 (키보드가 열리면 「완료」로 바뀐다) */}
            <button type="button" className="sn-abar-back sn-dock-back" onClick={onBack}>
              <ArrowLeft className="sn-icon" aria-hidden />
              <span className="sn-sr">돌아가기: </span>
              <span className="sn-abar-to">{backLabel}</span>
            </button>
            <button
              type="button"
              className="sn-btn sn-dock-done"
              onClick={() => (document.activeElement as HTMLElement | null)?.blur()}
            >
              완료
            </button>
            <button
              type="button"
              className="sn-versefield"
              onMouseDown={dockBtn}
              onClick={() => openPicker('editor')}
            >
              <BookOpen className="sn-icon" aria-hidden />
              <span className="sn-vf-t">구절 넣기</span>
              <span className="sn-vf-h">요 3:16 · 시 23편</span>
              <span className="sn-kbd sn-hide-coarse">/</span>
            </button>
            {!panelOpen && (
              <button
                type="button"
                className="sn-btn sn-dock-thought"
                onMouseDown={dockBtn}
                onClick={() => {
                  setPanel(true);
                  window.setTimeout(() => thoughtInputRef.current?.focus(), 40);
                }}
              >
                <PenLine className="sn-icon" />
                생각 쓰기
              </button>
            )}
          </div>
        </div>

        {panelOpen && !narrow && (
          <div
            className="sn-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="본문과 내 생각 패널 너비 조절"
            tabIndex={0}
            title="끌어서 너비 조절 · 두 번 눌러 기본값"
            data-drag={dragging}
            onPointerDown={onSplitterDown}
            onDoubleClick={() => applyAsideW(340, true)}
            onKeyDown={(e) => {
              const w =
                bodyRef.current?.querySelector('.sn-aside')?.getBoundingClientRect().width || 340;
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                applyAsideW(w + 24, true);
              }
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                applyAsideW(w - 24, true);
              }
            }}
          />
        )}
        {panelOpen && (
          <ThoughtsPanel
            ref={panelHandleRef}
            thoughts={thoughts}
            updateThoughts={updateThoughts}
            core={core}
            ptrTick={ptrTick}
            stampNow={stampNow}
            narrow={narrow}
            width={!narrow && asideW ? asideW : undefined}
            canAttach={canAttach}
            ownerId={userId}
            onLogin={onLogin}
            onClose={() => setPanel(false)}
            inputRef={thoughtInputRef}
            onJump={onJump}
            hasAudio={hasAudio && !recording}
          />
        )}
      </div>

      <VersePicker
        open={picker.open}
        target={picker.target}
        recent={recentRefs(store)}
        onClose={closePicker}
        onInsert={onInsert}
      />
      <StyleSettingsModal
        open={styleOpen}
        style={style}
        onChange={onStyleChange}
        onClose={() => setStyleOpen(false)}
      />
      <ShareSheet
        open={!!share}
        note={share?.note ?? null}
        initialQuote={share?.quote ?? null}
        mascot={mascot}
        onClose={() => setShare(null)}
      />
      <VersionHistoryModal
        open={versions !== null}
        versions={versions || []}
        noteId={versions !== null ? noteRef.current.id : null}
        remote={userId !== ANONYMOUS_USER}
        currentChars={bodyChars}
        onRestore={restoreVersion}
        onClose={() => setVersions(null)}
      />
      <SnOverlay
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        className="sn-modal"
        role="alertdialog"
        aria-labelledby="sn-cf-title"
      >
        <h2 id="sn-cf-title">이 노트를 삭제할까요?</h2>
        <p>삭제한 노트와 생각 메모는 되돌릴 수 없어요.</p>
        <SnSheetBar onClose={() => setConfirmDelete(false)} closeLabel="취소">
          <button type="button" className="sn-btn sn-danger" onClick={deleteNote}>
            삭제
          </button>
        </SnSheetBar>
      </SnOverlay>
      <SnOverlay
        open={confirmDelAudio}
        onClose={() => setConfirmDelAudio(false)}
        className="sn-modal"
        role="alertdialog"
        aria-labelledby="sn-ca-title"
      >
        <h2 id="sn-ca-title">이 설교의 녹음을 지울까요?</h2>
        <p>녹음 파일만 지워지고, 노트와 생각 메모는 그대로 남아요. 되돌릴 수 없어요.</p>
        <SnSheetBar onClose={() => setConfirmDelAudio(false)} closeLabel="취소">
          <button type="button" className="sn-btn sn-danger" onClick={deleteAudio}>
            녹음 지우기
          </button>
        </SnSheetBar>
      </SnOverlay>
      <span hidden>{noteId}</span>
    </section>
  );
}
