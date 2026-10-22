import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  MapPin,
  Paperclip,
  Pencil,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { EditorCore } from './editorCore';
import { MediaUploadError, deleteMedia, mediaErrorMessage, uploadMedia } from './sermonMedia';
import {
  THOUGHT_TAGS,
  fmtTime,
  uid,
  type Thought,
  type ThoughtMedia,
  type ThoughtTag,
} from './sermonTypes';

/**
 * 내 생각 패널 — 기획서 §6.
 * 머리(개수 + 보기), 생각 목록(구분선 목록), 입력(태그 · 연결 위치 · 첨부).
 * 생각 저장 후 커서는 입력창에 남는다. 연결 위치는 EditorCore 의 포인터가 결정한다.
 */

interface PendingMedia extends Partial<ThoughtMedia> {
  key: string;
  type: 'image' | 'video';
  url: string;
  busy: boolean;
}

interface ThoughtsPanelProps {
  thoughts: Thought[];
  updateThoughts: (fn: (prev: Thought[]) => Thought[]) => void;
  core: EditorCore | null;
  /** 포인터가 바뀔 때마다 증가 — 연결 줄을 다시 그린다 */
  ptrTick: number;
  /** 지금 설교 타이머 경과 초. 타이머를 쓰지 않았으면 null */
  stampNow: () => number | null;
  narrow: boolean;
  /** 데스크톱에서 분할선으로 정한 패널 폭(px) */
  width?: number;
  /** 로그인 전에는 첨부를 올릴 곳이 없다 → 안내만 */
  canAttach: boolean;
  onLogin?: () => void;
  onClose: () => void;
  inputRef: RefObject<HTMLTextAreaElement>;
  onJump: (aid: string | null, label: string | null) => void;
}

type Filter = '전체' | ThoughtTag;

export interface ThoughtsPanelHandle {
  /** 구절 찾기 창의 「생각 패널에」 — 입력창 끝에 (요 3:16) 을 붙이고 포커스 */
  appendText: (s: string) => void;
}

const HINT_KEY = 'sermon-hint-n';
function hintCount(): number {
  try {
    return Number(localStorage.getItem(HINT_KEY) || 0);
  } catch {
    return 0;
  }
}
function bumpHint() {
  try {
    localStorage.setItem(HINT_KEY, String(hintCount() + 1));
  } catch {
    /* ignore */
  }
}

function autoGrow(ta: HTMLTextAreaElement | null) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(140, ta.scrollHeight)}px`;
}

function MediaGrid({
  list,
  removable,
  onRemove,
  onZoom,
}: {
  list: Array<PendingMedia | ThoughtMedia>;
  removable?: boolean;
  onRemove?: (i: number) => void;
  onZoom: (src: string) => void;
}) {
  if (!list.length) return null;
  return (
    <div className="sn-media">
      {list.map((m, i) => {
        const busy = 'busy' in m && m.busy;
        const key = 'key' in m ? m.key : m.id;
        return (
          <div key={key ?? i} className={`sn-m${m.type === 'video' ? ' sn-vid' : ''}`}>
            {busy ? (
              <div className="sn-busy">올리는 중…</div>
            ) : m.type === 'video' ? (
              <video src={m.url} controls playsInline preload="metadata" />
            ) : (
              <img src={m.url} alt="첨부한 사진" loading="lazy" onClick={() => onZoom(m.url)} />
            )}
            {removable && (
              <button
                type="button"
                className="sn-rm"
                aria-label="첨부 빼기"
                onClick={() => onRemove?.(i)}
              >
                <X className="sn-icon" style={{ width: 15, height: 15 }} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 연결 위치 줄 */
function AnchorRow({
  core,
  target,
  onAfter,
}: {
  core: EditorCore | null;
  target: 'new' | 'edit';
  onAfter: () => void;
}) {
  if (!core) return null;
  const el = core.ptrEl();
  const act = (a: 'up' | 'down' | 'none' | 'auto' | 'pick') => {
    core.ancAction(a);
    if (a !== 'pick') onAfter();
  };
  const stop = (e: React.MouseEvent) => e.preventDefault();
  if (!el) {
    return (
      <div className="sn-anc">
        <div className="sn-anc-l">
          <MapPin className="sn-icon" aria-hidden />
          <span className="sn-lab">본문과 연결하지 않음</span>
        </div>
        <div className="sn-anc-b">
          <button type="button" onMouseDown={stop} onClick={() => act('pick')}>
            본문에서 고르기
          </button>
          {core.ptr.manual && (
            <button type="button" onMouseDown={stop} onClick={() => act('auto')}>
              적던 곳으로
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="sn-anc">
      <div className="sn-anc-l">
        <MapPin className="sn-icon" aria-hidden />
        <span className="sn-lab">
          <b>{core.labelFor(el)}</b>
          {!core.ptr.manual && <span className="sn-auto">적던 곳</span>}
        </span>
      </div>
      <div className="sn-anc-b">
        <button
          type="button"
          onMouseDown={stop}
          disabled={!core.prevContent(el)}
          onClick={() => act('up')}
        >
          <ChevronUp className="sn-icon" aria-hidden />앞
        </button>
        <button
          type="button"
          onMouseDown={stop}
          disabled={!core.nextContent(el)}
          onClick={() => act('down')}
        >
          <ChevronDown className="sn-icon" aria-hidden />
          다음
        </button>
        <button type="button" onMouseDown={stop} onClick={() => act('pick')}>
          본문에서 고르기
        </button>
        <button type="button" onMouseDown={stop} onClick={() => act('none')}>
          연결 안 함
        </button>
      </div>
      <span hidden>{target}</span>
    </div>
  );
}

export const ThoughtsPanel = forwardRef<ThoughtsPanelHandle, ThoughtsPanelProps>(
  function ThoughtsPanel(
    {
      thoughts,
      updateThoughts,
      core,
      ptrTick,
      stampNow,
      narrow,
      width,
      canAttach,
      onLogin,
      onClose,
      inputRef,
      onJump,
    },
    handleRef,
  ) {
    const [filter, setFilter] = useState<Filter>('전체');
    const [tag, setTag] = useState<ThoughtTag>('생각');
    const [composeOpen, setComposeOpen] = useState(false);
    const [text, setText] = useState('');
    const [pending, setPending] = useState<PendingMedia[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<{
      tag: ThoughtTag;
      text: string;
      media: PendingMedia[];
    } | null>(null);
    const [zoom, setZoom] = useState<string | null>(null);
    // 폰 하단 시트: 반 높이 / 전체 높이, 손잡이를 끌어 닫기
    const [sheet, setSheet] = useState<'half' | 'full'>('half');
    const [dragging, setDragging] = useState(false);
    const asideRef = useRef<HTMLElement>(null);
    const dragStart = useRef<{ y: number; moved: boolean } | null>(null);
    const justDragged = useRef(false);
    const onHandleDown = (e: React.PointerEvent<HTMLButtonElement>) => {
      dragStart.current = { y: e.clientY, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    };
    const onHandleMove = (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = dragStart.current;
      if (!d) return;
      const dy = e.clientY - d.y;
      if (Math.abs(dy) > 6) d.moved = true;
      if (asideRef.current) asideRef.current.style.transform = `translateY(${Math.max(0, dy)}px)`;
    };
    const onHandleUp = (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = dragStart.current;
      dragStart.current = null;
      setDragging(false);
      if (asideRef.current) asideRef.current.style.transform = '';
      if (!d) return;
      const dy = e.clientY - d.y;
      if (!d.moved) return; // 탭은 click 에서 토글한다
      justDragged.current = true;
      if (dy > 70)
        onClose(); // 아래로 끌어 닫기
      else if (dy < -40) setSheet('full');
      else if (dy > 30) setSheet('half');
    };
    const [showHint, setShowHint] = useState(() => hintCount() < 3);
    const fileRef = useRef<HTMLInputElement>(null);
    const editRef = useRef<HTMLTextAreaElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const fileTarget = useRef<'new' | 'edit'>('new');
    // 수정 중 첨부가 비동기로 끝나면 최신 draft 에 반영해야 한다
    const draftRef = useRef(draft);
    draftRef.current = draft;
    const pendingRef = useRef(pending);
    pendingRef.current = pending;

    useImperativeHandle(handleRef, () => ({
      appendText: (s: string) => {
        setText((prev) => (prev ? `${prev.trimEnd()} ${s}` : s));
        setComposeOpen(true);
        requestAnimationFrame(() => {
          const ta = inputRef.current;
          if (!ta) return;
          autoGrow(ta);
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        });
      },
    }));

    // 수정 모드 textarea 포커스
    useEffect(() => {
      if (editingId && editRef.current) {
        const ta = editRef.current;
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }, [editingId]);

    const focusComposer = useCallback(() => {
      const t = editingId ? editRef.current : inputRef.current;
      t?.focus({ preventScroll: true });
    }, [editingId, inputRef]);

    // ───────── 첨부 ─────────
    const addFile = useCallback(async (file: File, target: 'new' | 'edit') => {
      const item: PendingMedia = {
        key: uid('m'),
        type: /^video\//.test(file.type) ? 'video' : 'image',
        url: URL.createObjectURL(file),
        busy: true,
      };
      const put = (fn: (l: PendingMedia[]) => PendingMedia[]) => {
        if (target === 'edit') {
          const d = draftRef.current;
          if (d) setDraft({ ...d, media: fn(d.media) });
        } else setPending(fn);
      };
      try {
        // 형식·크기 검사는 올리기 전에 — 실패하면 목록에 넣지 않는다
        const uploaded = uploadMedia(file);
        put((l) => [...l, item]);
        const res = await uploaded;
        URL.revokeObjectURL(item.url);
        put((l) => l.map((m) => (m.key === item.key ? { ...m, ...res, busy: false } : m)));
      } catch (err) {
        put((l) => l.filter((m) => m.key !== item.key));
        const code = err instanceof MediaUploadError ? err.code : 'upload_failed';
        toast(mediaErrorMessage(code));
      }
    }, []);

    const loginNudge = useCallback(() => {
      toast('로그인하면 사진·영상을 첨부할 수 있어요', {
        action: onLogin ? { label: '로그인', onClick: onLogin } : undefined,
      });
    }, [onLogin]);

    const pickFiles = (target: 'new' | 'edit') => {
      if (!canAttach) {
        loginNudge();

        return;
      }
      fileTarget.current = target;
      const f = fileRef.current;
      if (!f) return;
      f.value = '';
      f.click();
    };

    const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = [...(e.target.files || [])];
      files.forEach((f) => void addFile(f, fileTarget.current));
    };

    const onPasteImages = (e: React.ClipboardEvent, target: 'new' | 'edit') => {
      const fs = [...(e.clipboardData?.files || [])].filter((f) => /^image\//.test(f.type));
      if (!fs.length) return;
      e.preventDefault();
      if (!canAttach) {
        loginNudge();
        return;
      }
      fs.forEach((f) => void addFile(f, target));
    };

    // ───────── 새 생각 ─────────
    const addThought = useCallback(() => {
      const t = text.trim();
      const pend = pendingRef.current;
      if (pend.some((m) => m.busy)) {
        toast('첨부를 올리는 중이에요. 잠시만요');
        return;
      }
      if (!t && !pend.length) return;
      const a = core ? core.currentAnchor() : { aid: null, label: null };
      const media: ThoughtMedia[] = pend
        .filter((m): m is PendingMedia & ThoughtMedia => !!m.id)
        .map(({ id, type, url, thumb }) => ({ id, type, url, thumb }));
      updateThoughts((prev) => [
        ...prev,
        {
          id: uid('t'),
          tag,
          text: t,
          media,
          t: stampNow(),
          aid: a.aid,
          label: a.label,
          at: Date.now(),
        },
      ]);
      setText('');
      setPending([]);
      requestAnimationFrame(() => {
        autoGrow(inputRef.current);
        inputRef.current?.focus({ preventScroll: true });
        const box = listRef.current;
        if (box) box.scrollTop = box.scrollHeight;
      });
      core?.afterAdd();
      bumpHint();
      if (hintCount() >= 3) setShowHint(false);
    }, [text, tag, core, stampNow, updateThoughts, inputRef]);

    // ───────── 수정 ─────────
    const startEdit = (t: Thought) => {
      setEditingId(t.id);
      setDraft({
        tag: t.tag,
        text: t.text || '',
        media: (t.media || []).map((m) => ({ ...m, key: m.id, busy: false })),
      });
      core?.beginEdit(t.aid, t.label);
    };
    const cancelEdit = () => {
      setEditingId(null);
      setDraft(null);
      core?.endEdit();
    };
    const saveEdit = () => {
      const d = draftRef.current;
      if (!d || !editingId) return;
      const t = (editRef.current?.value ?? d.text).trim();
      if (d.media.some((m) => m.busy)) {
        toast('첨부를 올리는 중이에요. 잠시 후 저장해 주세요');
        return;
      }
      if (!t && !d.media.length) {
        toast('내용이나 첨부가 있어야 저장할 수 있어요');
        return;
      }
      const a = core ? core.currentAnchor() : { aid: null, label: null };
      const keep = new Set(d.media.map((m) => m.id));
      const media: ThoughtMedia[] = d.media
        .filter((m): m is PendingMedia & ThoughtMedia => !!m.id)
        .map(({ id, type, url, thumb }) => ({ id, type, url, thumb }));
      let removed: ThoughtMedia[] = [];
      updateThoughts((prev) =>
        prev.map((x) => {
          if (x.id !== editingId) return x;
          removed = (x.media || []).filter((m) => !keep.has(m.id));
          return { ...x, tag: d.tag, text: t, media, aid: a.aid, label: a.label, edited: true };
        }),
      );
      removed.forEach((m) => deleteMedia(m.id));
      setEditingId(null);
      setDraft(null);
      core?.endEdit();
    };

    // ───────── 삭제 (몇 초간 되돌리기) ─────────
    const deleteThought = (id: string) => {
      const i = thoughts.findIndex((x) => x.id === id);
      if (i < 0) return;
      const t = thoughts[i];
      updateThoughts((prev) => prev.filter((x) => x.id !== id));
      let undone = false;
      toast('생각을 삭제했어요', {
        duration: 5500,
        action: {
          label: '되돌리기',
          onClick: () => {
            undone = true;
            updateThoughts((prev) => {
              const arr = [...prev];
              arr.splice(Math.min(i, arr.length), 0, t);
              return arr;
            });
          },
        },
      });
      window.setTimeout(() => {
        if (!undone) (t.media || []).forEach((m) => deleteMedia(m.id));
      }, 6000);
    };

    const toggleDone = (id: string) => {
      let nowDone = false;
      updateThoughts((prev) =>
        prev.map((x) => {
          if (x.id !== id) return x;
          nowDone = !x.done;
          return { ...x, done: nowDone, done_at: nowDone ? Date.now() : null };
        }),
      );
      if (nowDone) toast('실천했어요. 이번 주 적용에 표시돼요');
    };

    // ───────── 입력창 포커스/블러 ─────────
    const onFocusInput = () => {
      setComposeOpen(true);
      if (narrow) setSheet('full');
      core?.beginNew();
      const el = core?.ptrEl();
      el?.scrollIntoView({ block: narrow ? 'start' : 'nearest', behavior: 'smooth' });
    };
    const onBlurInput = () => {
      window.setTimeout(() => {
        if (!core) return;
        if (core.ptr.picking || core.ptr.target !== 'new') return;
        const a = document.activeElement as HTMLElement | null;
        if (a && a.closest && a.closest('.sn-compose')) return;
        if (!inputRef.current?.value.trim() && !pendingRef.current.length) {
          core.setPtrActive(false);
          setComposeOpen(false);
        }
      }, 150);
    };

    const list = thoughts.filter(
      (t) => filter === '전체' || t.tag === filter || t.id === editingId,
    );
    const Xs = <X className="sn-icon" style={{ width: 15, height: 15 }} />;

    return (
      <aside
        ref={asideRef}
        className="sn-aside"
        aria-label="내 생각"
        data-sheet={narrow ? sheet : undefined}
        data-dragging={dragging}
        style={width ? { width } : undefined}
      >
        {narrow && (
          <button
            type="button"
            className="sn-sheet-handle"
            aria-label={sheet === 'full' ? '패널 반만 보기' : '패널 크게 보기'}
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            onClick={() => {
              if (justDragged.current) {
                justDragged.current = false;
                return;
              }
              setSheet((s) => (s === 'full' ? 'half' : 'full')); // 탭: 반 ↔ 전체
            }}
          >
            <i />
          </button>
        )}
        <div className="sn-ahead">
          <h2>내 생각</h2>
          <span className="sn-label">{thoughts.length}개</span>
          <span style={{ flex: 1 }} />
          <label className="sn-sr" htmlFor="sn-th-filter">
            보기
          </label>
          <select
            id="sn-th-filter"
            className="sn-fsel"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
          >
            <option value="전체">전체 보기</option>
            <option value="생각">생각만</option>
            <option value="질문">질문만</option>
            <option value="적용">적용만</option>
          </select>
          <button
            type="button"
            className="sn-btn sn-icon-only sn-ghost sn-close-aside"
            aria-label="패널 닫기"
            onClick={onClose}
          >
            <X className="sn-icon" />
          </button>
        </div>

        <div className="sn-thoughts" ref={listRef} onMouseLeave={() => core?.unpeek()}>
          {list.length === 0 ? (
            <div className="sn-th-empty">
              {thoughts.length
                ? '이 분류의 생각이 없어요.'
                : '설교를 들으며 떠오른 생각, 질문, 삶에 적용할 점을 여기 적어보세요. 사진이나 영상도 붙일 수 있어요. 그때 듣고 있던 본문 위치와 시간이 함께 남고, 누르면 그 위치로 이동해요.'}
            </div>
          ) : (
            list.map((t) => {
              if (editingId === t.id && draft) {
                return (
                  <div key={t.id} className="sn-th">
                    <div className="sn-th-edit">
                      <div className="sn-row2 sn-tags">
                        {THOUGHT_TAGS.map((x) => (
                          <button
                            key={x}
                            type="button"
                            className="sn-chip"
                            aria-pressed={draft.tag === x}
                            onClick={() => setDraft({ ...draft, tag: x })}
                          >
                            {x}
                          </button>
                        ))}
                      </div>
                      <label className="sn-sr" htmlFor="sn-th-edit-in">
                        생각 수정
                      </label>
                      <textarea
                        id="sn-th-edit-in"
                        ref={editRef}
                        value={draft.text}
                        onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                        onPaste={(e) => onPasteImages(e, 'edit')}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEdit();
                          }
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            saveEdit();
                          }
                        }}
                      />
                      <AnchorRow core={core} target="edit" onAfter={focusComposer} />
                      <MediaGrid
                        list={draft.media}
                        removable
                        onRemove={(i) =>
                          setDraft({ ...draft, media: draft.media.filter((_, k) => k !== i) })
                        }
                        onZoom={setZoom}
                      />
                      <div className="sn-row2">
                        <button
                          type="button"
                          className="sn-attach"
                          aria-label="사진·영상 추가"
                          onClick={() => pickFiles('edit')}
                        >
                          <Paperclip className="sn-icon" />
                        </button>
                        <span style={{ flex: 1 }} />
                        <button type="button" className="sn-btn" onClick={cancelEdit}>
                          취소
                        </button>
                        <button type="button" className="sn-btn sn-primary" onClick={saveEdit}>
                          저장
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
              const can = !!(t.aid || t.label);
              return (
                <div
                  key={t.id}
                  className="sn-th"
                  data-checked={t.tag === '적용' && !!t.done}
                  data-jumpable={can}
                  onMouseEnter={() => {
                    if (!editingId && can) core?.peek(t.aid, t.label);
                  }}
                  onClick={(e) => {
                    if (!can || editingId) return;
                    const tg = e.target as HTMLElement;
                    if (tg.closest('button,video,img,textarea')) return;
                    onJump(t.aid, t.label);
                  }}
                >
                  <div className="sn-top">
                    {t.tag === '적용' && (
                      <button
                        type="button"
                        className="sn-ck"
                        aria-pressed={!!t.done}
                        aria-label={t.done ? '실천 표시 지우기' : '실천했어요'}
                        title={t.done ? '실천 표시 지우기' : '실천했어요'}
                        onClick={() => toggleDone(t.id)}
                      >
                        <Check className="sn-icon" style={{ width: 16, height: 16 }} />
                      </button>
                    )}
                    <span className="sn-tagT" data-t={t.tag}>
                      {t.tag}
                    </span>
                    <span className="sn-tm sn-mono">{t.t != null ? fmtTime(t.t) : ''}</span>
                    {t.edited && <span className="sn-edited">수정됨</span>}
                    <span className="sn-sp" />
                    <button
                      type="button"
                      className="sn-edit"
                      aria-label="생각 수정"
                      onClick={() => startEdit(t)}
                    >
                      <Pencil className="sn-icon" style={{ width: 15, height: 15 }} />
                    </button>
                    <button
                      type="button"
                      className="sn-del"
                      aria-label="생각 삭제"
                      onClick={() => deleteThought(t.id)}
                    >
                      {Xs}
                    </button>
                  </div>
                  {t.text && <div className="sn-txt">{t.text}</div>}
                  <MediaGrid list={t.media || []} onZoom={setZoom} />
                  {t.label && (
                    <button
                      type="button"
                      className="sn-loc"
                      title="본문의 이 위치로 이동"
                      onClick={() => onJump(t.aid, t.label)}
                    >
                      <MapPin className="sn-icon" aria-hidden />
                      <span>{t.label}</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="sn-compose" data-open={composeOpen}>
          <div className="sn-cx">
            <div className="sn-tags">
              {THOUGHT_TAGS.map((x) => (
                <button
                  key={x}
                  type="button"
                  className="sn-chip"
                  aria-pressed={tag === x}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setTag(x);
                    inputRef.current?.focus();
                  }}
                >
                  {x}
                </button>
              ))}
            </div>
            {/* ptrTick 이 바뀌면 다시 그린다 */}
            <AnchorRow key={ptrTick} core={core} target="new" onAfter={focusComposer} />
          </div>
          {pending.length > 0 && (
            <MediaGrid
              list={pending}
              removable
              onRemove={(i) => {
                const m = pending[i];
                setPending((l) => l.filter((_, k) => k !== i));
                if (m?.id) deleteMedia(m.id);
              }}
              onZoom={setZoom}
            />
          )}
          <div className="sn-inrow">
            <button
              type="button"
              className="sn-attach"
              aria-label="사진·영상 첨부"
              title="사진·영상 첨부"
              onClick={() => pickFiles('new')}
            >
              <Paperclip className="sn-icon" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/mp4,video/webm,video/*"
              multiple
              hidden
              onChange={onFiles}
            />
            <label htmlFor="sn-th-in" className="sn-sr">
              생각 입력
            </label>
            <textarea
              id="sn-th-in"
              ref={inputRef}
              rows={1}
              placeholder="생각 적기"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                autoGrow(e.target);
              }}
              onFocus={onFocusInput}
              onBlur={onBlurInput}
              onPaste={(e) => onPasteImages(e, 'new')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addThought();
                }
              }}
            />
            <button
              type="button"
              className="sn-send"
              aria-label="생각 저장"
              onMouseDown={(e) => e.preventDefault()}
              onClick={addThought}
            >
              <ArrowRight className="sn-icon" />
            </button>
          </div>
          {showHint && (
            <div className="sn-foot">Enter 저장 · Shift+Enter 줄바꿈 · 사진은 붙여넣기도 돼요</div>
          )}
        </div>

        {zoom &&
          createPortal(
            <div className="sn-scope sn-lightbox" onClick={() => setZoom(null)}>
              <img src={zoom} alt="첨부한 사진 크게 보기" />
              <button type="button" aria-label="닫기" autoFocus>
                {Xs}
              </button>
            </div>,
            document.body,
          )}
      </aside>
    );
  },
);
