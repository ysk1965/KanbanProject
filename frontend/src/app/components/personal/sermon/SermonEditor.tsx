import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  History,
  MoreHorizontal,
  PanelRight,
  PenLine,
  Plus,
  Redo2,
  SlidersHorizontal,
  Trash2,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import { decRef, encRef, refLong, refShort, type Ref } from './bibleRefs';
import { EditorCore, verseHTML } from './editorCore';
import { SnOverlay } from './SnOverlay';
import { ThoughtsPanel, type ThoughtsPanelHandle } from './ThoughtsPanel';
import { VersePicker, type InsertForm, type PickerTarget } from './VersePicker';
import { StyleSettingsModal } from './StyleSettingsModal';
import { VersionHistoryModal } from './VersionHistoryModal';
import type { SermonStore } from './sermonStore';
import { syncLabel } from './sermonStore';
import type { SermonStyle } from './sermonStyle';
import {
  fmtDate,
  fmtTime,
  noteRefs,
  plainText,
  todayString,
  type SermonNote,
  type Thought,
} from './sermonTypes';
import { VersionTracker, listVersions, saveVersion, type NoteVersion } from './sermonVersions';
import { firstVerseText, useBible } from './useBible';

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
  /** 노트 삭제 후 목록으로 */
  onDeleted: () => void;
  /** 열면서 바로 이동할 연결 위치 */
  initialAid?: string | null;
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
const NARROW_MQ = '(max-width: 899px)';

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
  onDeleted,
  initialAid,
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

  /** 메타·구절·생각처럼 React 가 들고 있는 필드를 바꿀 때 */
  const patchNote = useCallback(
    (patch: Partial<SermonNote>) => {
      noteRef.current = { ...noteRef.current, ...patch };
      scheduleSave();
    },
    [scheduleSave],
  );

  const updateThoughts = useCallback(
    (fn: (prev: Thought[]) => Thought[]) => {
      const next = fn(noteRef.current.thoughts || []);
      setThoughts(next);
      patchNote({ thoughts: next });
    },
    [patchNote],
  );

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

    const onPageHide = () => saveNow();
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.removeEventListener('pagehide', onPageHide);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (!deletedRef.current) {
        const body = core.serialize();
        trackerRef.current?.maybe(body, true);
        store.save({ ...noteRef.current, body });
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

  // 저장 상태 표시
  useEffect(() => store.subscribe(() => setSyncTick((t) => t + 1)), [store]);

  // 화면 폭
  useEffect(() => {
    const mq = window.matchMedia(NARROW_MQ);
    const fn = () => setNarrow(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
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

  // Ctrl/Cmd+K → 구절 찾기 (페이지의 빠른 입력 단축키보다 먼저 받는다)
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        openPicker('editor');
      }
    };
    document.addEventListener('keydown', fn, true);
    return () => document.removeEventListener('keydown', fn, true);
  }, [openPicker]);

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
  const toggleRec = () => {
    const on = !recording;
    setRecording(on);
    if (!on) saveNow();
  };
  const stampNow = useCallback(
    () => (noteRef.current.elapsed || recordingRef.current ? noteRef.current.elapsed || 0 : null),
    [],
  );

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
    store.remove(noteRef.current.id);
    toast('노트를 삭제했어요');
    onDeleted();
  };

  const onJump = (aid: string | null, label: string | null) => {
    coreRef.current?.jumpTo(aid, label);
    if (narrow) setPanel(false);
  };

  const sync = syncLabel(store.status);
  void syncTick;
  const dockBtn = (e: React.MouseEvent) => e.preventDefault();

  return (
    <section className="sn-edit" aria-label="설교 기록" data-panel={panelOpen ? 'open' : 'closed'}>
      <header className="sn-topbar">
        <button
          type="button"
          className="sn-btn sn-icon-only"
          aria-label="목록으로"
          onClick={onBack}
        >
          <ArrowLeft className="sn-icon" />
        </button>
        <div className="sn-ttl">
          <b data-show={topTitleShow}>{title || '새 설교'}</b>
          <span className="sn-save-state" data-st={sync.state}>
            {sync.text}
          </span>
        </div>
        <button
          type="button"
          className="sn-rec"
          data-on={recording}
          data-state={recState}
          data-compact={!recording && !!date && date !== today}
          aria-label={
            recState === 'run'
              ? `설교 시간 기록 중 ${fmtTime(elapsed)}. 누르면 멈춥니다`
              : recState === 'pause'
                ? `설교 시간 ${fmtTime(elapsed)}에서 멈춤. 누르면 이어서 기록합니다`
                : '설교 시간 기록 시작'
          }
          onClick={toggleRec}
        >
          <span className="sn-dot" />
          <span className="sn-rs">
            {recState === 'run' ? '기록 중' : recState === 'pause' ? '멈춤' : '설교 시간'}
          </span>
          <span className="sn-mono sn-rt" hidden={recState === 'idle'}>
            {fmtTime(elapsed)}
          </span>
          <span className="sn-ra">
            {recState === 'run' ? '멈추기' : recState === 'pause' ? '이어서 기록' : '기록 시작'}
          </span>
        </button>
        <button type="button" className="sn-btn sn-ghost" title="버전 기록" onClick={openVersions}>
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
                            coreRef.current?.insertBlock(r);
                            toast('본문 말씀을 노트에 넣었어요');
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
                data-placeholder="말씀을 받아 적어보세요. 문장 중에 ‘롬8:28’처럼 쓰고 띄어쓰면 구절로 바뀌어요. 아래 ‘구절 넣기’나 빈 줄에서 / 로 구절을 넣을 수 있어요."
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
                title="소제목"
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
                className="sn-btn"
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
            onClose={() => setPanel(false)}
            inputRef={thoughtInputRef}
            onJump={onJump}
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
      <VersionHistoryModal
        open={versions !== null}
        versions={versions || []}
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
        <div className="sn-acts">
          <button type="button" className="sn-btn" onClick={() => setConfirmDelete(false)}>
            취소
          </button>
          <button type="button" className="sn-btn sn-danger" onClick={deleteNote}>
            삭제
          </button>
        </div>
      </SnOverlay>
      <span hidden>{noteId}</span>
    </section>
  );
}
