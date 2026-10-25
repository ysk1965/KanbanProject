import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { finalRef, parseRef, refShort, type Ref } from './bibleRefs';
import type { EditorCore } from './editorCore';
import { segsFromNode, segsText, type LineQuote } from './share/shareModel';

/**
 * 본문에서 글자를 드래그하면 선택 영역 위에 뜨는 작은 서식 바 — 제목 · 강조 · 목록 · AI 문장 정리,
 * 선택한 글이 ‘롬 5:12’ 모양이면 말씀 넣기.
 * 폰(coarse pointer)에서는 OS 선택 메뉴와 겹치므로 띄우지 않는다 (키보드 위 서식 바가 그 역할).
 * SnOverlay 처럼 body 에 포털 + .sn-scope (탭 전환 transform 안에서 fixed 가 깨지는 문제 회피).
 */
interface SelectionBubbleProps {
  core: EditorCore | null;
  onInsertVerse: (ref: Ref) => void;
  /** 로그인 사용자만 — 개인 AI 크레딧을 쓴다 */
  canPolish: boolean;
  onNeedLogin?: () => void;
  /** 선택한 글 → 정리된 글 */
  polish: (text: string) => Promise<string>;
  /** 고른 문장으로 밑줄 카드 만들기 */
  onMakeCard?: (q: LineQuote) => void;
}

interface Anchor {
  x: number;
  y: number;
  /** 뷰포트 위쪽에 공간이 없으면 선택 영역 아래로 */
  below: boolean;
}

interface BubbleInfo extends Anchor {
  /** 말씀 블록 안의 선택 — 강조(밑줄 표시)만 된다 */
  inVerse: boolean;
  isH3: boolean;
  ref: Ref | null;
  text: string;
  range: Range;
}

interface AiState extends Anchor {
  status: 'loading' | 'done' | 'error';
  range: Range;
  original: string;
  result?: string;
  error?: string;
}

const GAP = 10;
const MIN_TOP = 56;
/** 정리 결과 카드는 키가 있어 위쪽 여유가 더 필요하다 */
const CARD_MIN_TOP = 260;

function closest(n: Node | null, sel: string): HTMLElement | null {
  if (!n) return null;
  const el = n.nodeType === 3 ? n.parentElement : (n as HTMLElement);
  return el && el.closest ? el.closest<HTMLElement>(sel) : null;
}

function selectionRect(r: Range): DOMRect | null {
  const rect = r.getBoundingClientRect();
  if (rect.width || rect.height) return rect;
  const rs = r.getClientRects();
  return rs.length ? rs[0] : null;
}

function measure(root: HTMLElement): BubbleInfo | null {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.commonAncestorContainer)) return null;
  const rect = selectionRect(r);
  if (!rect) return null;
  const text = sel.toString().trim();
  if (!text) return null;
  const inVerse = !!(
    closest(r.startContainer, '.sn-vblock') || closest(r.endContainer, '.sn-vblock')
  );
  let top: Node | null = r.startContainer;
  while (top && top.parentNode !== root) top = top.parentNode;
  const isH3 = !!top && top.nodeName === 'H3';
  const ref = !inVerse && text.length <= 16 ? finalRef(parseRef(text)) : null;
  const below = rect.top < MIN_TOP;
  return {
    x: rect.left + rect.width / 2,
    y: below ? rect.bottom : rect.top,
    below,
    inVerse,
    isH3,
    ref,
    text,
    range: r.cloneRange(),
  };
}

function errorMessage(err: unknown): string {
  const e = err as { code?: string; status?: number; message?: string } | null;
  if (e && (e.code === 'PERSONAL_AI_CREDITS_EXHAUSTED' || e.code === 'AI_CREDITS_EXHAUSTED')) {
    return '이번 달 개인 AI 크레딧을 다 썼어요';
  }
  return '정리하지 못했어요. 잠시 후 다시 시도해 주세요';
}

export function SelectionBubble({
  core,
  onInsertVerse,
  canPolish,
  onNeedLogin,
  polish,
  onMakeCard,
}: SelectionBubbleProps) {
  const [info, setInfo] = useState<BubbleInfo | null>(null);
  const [ai, setAi] = useState<AiState | null>(null);
  const aiRef = useRef<AiState | null>(null);
  aiRef.current = ai;
  const pressed = useRef(false);
  const raf = useRef(0);
  const elRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const coarse = useRef(window.matchMedia('(pointer: coarse)').matches);
  const reqSeq = useRef(0);

  const update = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const root = core?.el;
      if (!root || pressed.current || aiRef.current) {
        setInfo(null);
        return;
      }
      setInfo(measure(root));
    });
  }, [core]);

  const closeAi = useCallback(() => {
    reqSeq.current += 1;
    setAi(null);
  }, []);

  useEffect(() => {
    if (!core || coarse.current) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      // 버블·카드 자체를 누를 땐 선택을 유지한다
      if (elRef.current && elRef.current.contains(t)) return;
      if (cardRef.current && cardRef.current.contains(t)) return;
      if (aiRef.current) closeAi();
      pressed.current = true;
      setInfo(null);
    };
    const up = () => {
      pressed.current = false;
      update();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && aiRef.current) {
        e.stopPropagation();
        closeAi();
      }
    };
    document.addEventListener('selectionchange', update);
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    document.addEventListener('scroll', update, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      document.removeEventListener('scroll', update, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', update);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [core, update, closeAi]);

  // 화면 가장자리에서 잘리지 않게 (버블·카드 공통)
  useLayoutEffect(() => {
    const el = ai ? cardRef.current : elRef.current;
    const a: Anchor | null = ai || info;
    if (!el || !a) return;
    const half = el.offsetWidth / 2;
    const x = Math.max(half + 8, Math.min(window.innerWidth - half - 8, a.x));
    el.style.left = `${x}px`;
    el.style.setProperty('--sn-bubble-arrow', `${a.x - x}px`);
  }, [info, ai]);

  const runPolish = useCallback(
    (range: Range, original: string, anchor: Anchor) => {
      const seq = ++reqSeq.current;
      const rect = selectionRect(range);
      const below = rect ? rect.top < CARD_MIN_TOP : anchor.below;
      const base: AiState = {
        status: 'loading',
        range,
        original,
        x: anchor.x,
        y: rect ? (below ? rect.bottom : rect.top) : anchor.y,
        below,
      };
      setAi(base);
      setInfo(null);
      polish(original).then(
        (text) => {
          if (reqSeq.current !== seq) return;
          const t = (text || '').trim();
          if (!t) setAi({ ...base, status: 'error', error: '바꿀 내용이 없어요' });
          else setAi({ ...base, status: 'done', result: t });
        },
        (err) => {
          if (reqSeq.current !== seq) return;
          setAi({ ...base, status: 'error', error: errorMessage(err) });
        },
      );
    },
    [polish],
  );

  if (!core || coarse.current) return null;

  const keep = (e: React.SyntheticEvent) => e.preventDefault();

  if (ai) {
    const unchanged = ai.status === 'done' && ai.result === ai.original;
    return createPortal(
      <div
        ref={cardRef}
        className="sn-scope sn-bubble sn-bubble-card"
        data-pos={ai.below ? 'below' : 'above'}
        role="dialog"
        aria-label="AI 문장 정리"
        style={{ left: ai.x, top: ai.y }}
        onMouseDown={keep}
      >
        <div className="sn-bc-head">
          <Sparkles size={14} aria-hidden />
          <span>AI 문장 정리</span>
          <span className="sn-bc-hint">
            {ai.status === 'loading' ? '정리하는 중…' : ai.status === 'done' ? '크레딧 1 사용' : ''}
          </span>
        </div>
        {ai.status === 'loading' && (
          <div className="sn-bc-body sn-bc-loading">
            <Loader2 size={16} className="sn-spin" aria-hidden />
            <span className="sn-bc-orig">{ai.original}</span>
          </div>
        )}
        {ai.status === 'done' && (
          <div className="sn-bc-body">
            {unchanged ? <span className="sn-bc-hint">고칠 곳이 없어요</span> : ai.result}
          </div>
        )}
        {ai.status === 'error' && <div className="sn-bc-body sn-bc-err">{ai.error}</div>}
        <div className="sn-bc-foot">
          <button type="button" onClick={closeAi}>
            닫기
          </button>
          {ai.status !== 'loading' && (
            <button
              type="button"
              onClick={() => runPolish(ai.range, ai.original, ai)}
              title="다시 정리"
            >
              다시
            </button>
          )}
          {ai.status === 'done' && !unchanged && (
            <button
              type="button"
              className="sn-bc-apply"
              onClick={() => {
                const { range, result } = ai;
                closeAi();
                if (result) core.replaceRangeText(range, result);
              }}
            >
              바꾸기
            </button>
          )}
        </div>
      </div>,
      document.body,
    );
  }

  if (!info) return null;

  return createPortal(
    <div
      ref={elRef}
      className="sn-scope sn-bubble"
      data-pos={info.below ? 'below' : 'above'}
      role="toolbar"
      aria-label="선택 서식"
      style={{ left: info.x, top: info.y }}
      onMouseDown={keep}
    >
      {!info.inVerse && (
        <button
          type="button"
          className="sn-bubble-h"
          aria-pressed={info.isH3}
          title="제목 ↔ 본문 (Ctrl+E)"
          onClick={() => core.format('h3')}
        >
          제목
        </button>
      )}
      <button type="button" title="강조 (Ctrl+B)" onClick={() => core.format('bold')}>
        <b>강조</b>
      </button>
      {!info.inVerse && (
        <button type="button" title="목록" onClick={() => core.format('list')}>
          목록
        </button>
      )}
      {!info.inVerse && (canPolish || onNeedLogin) && (
        <>
          <span className="sn-bsep" aria-hidden />
          <button
            type="button"
            className="sn-bubble-ai"
            title={
              canPolish
                ? 'AI로 문장 정리 (개인 크레딧 1)'
                : '로그인하면 AI 문장 정리를 쓸 수 있어요'
            }
            onClick={() => {
              if (!canPolish) {
                onNeedLogin?.();
                return;
              }
              runPolish(info.range, info.text, info);
            }}
          >
            <Sparkles size={13} aria-hidden />
            정리
          </button>
        </>
      )}
      {onMakeCard && (
        <>
          <span className="sn-bsep" aria-hidden />
          <button
            type="button"
            title="이 문장으로 공유 카드 만들기"
            onClick={() => {
              const segs = segsFromNode(info.range.cloneContents());
              const vb = closest(info.range.startContainer, '.sn-vblock');
              setInfo(null);
              if (!segsText(segs)) return;
              onMakeCard({ src: vb ? 'verse' : 'note', segs, ref: vb?.dataset.ref ?? null });
            }}
          >
            카드
          </button>
        </>
      )}
      {info.ref && (
        <>
          <span className="sn-bsep" aria-hidden />
          <button
            type="button"
            title={`${refShort(info.ref)} 말씀을 아래에 넣기`}
            onClick={() => {
              const r = info.ref as Ref;
              setInfo(null);
              onInsertVerse(r);
            }}
          >
            {refShort(info.ref)} 넣기
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
