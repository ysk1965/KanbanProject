import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Copy, Image as ImageIcon, PenLine, Trash2, Underline, X } from 'lucide-react';
import { HL_COLORS, MEMO_MAX, type HlColor } from './bibleHighlights';

/**
 * 성경 읽기 형광펜 버블 — 고른 구절 아래(폰은 OS 선택 메뉴를 피해 항상 아래)에 뜬다.
 * 색 4 · 밑줄 · 한 줄 메모 · 카드 · 복사 · 지우기. 위치는 .sn-bible-page 기준 absolute.
 */
interface HighlightBubbleProps {
  x: number;
  y: number;
  color: HlColor | null;
  ul: boolean;
  memo: string;
  /** 지울 형광펜이 있는지 */
  canClear: boolean;
  /** 메모 입력부터 열기 (여백 메모를 눌러 연 경우) */
  memoFirst?: boolean;
  label: string;
  onColor: (c: HlColor) => void;
  onUnderline: () => void;
  onMemo: (text: string) => void;
  onCard: () => void;
  onCopy: () => void;
  onClear: () => void;
  onClose: () => void;
}

export function HighlightBubble(p: HighlightBubbleProps) {
  const [editing, setEditing] = useState(!!p.memoFirst);
  const [draft, setDraft] = useState(p.memo);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditing(!!p.memoFirst);
    setDraft(p.memo);
    // 고른 구절이 바뀔 때만 (메모 글자가 바뀔 때마다 초기화하지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.label, p.memoFirst]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // 쪽 가장자리에서 잘리지 않게
  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.offsetParent as HTMLElement | null;
    if (!el || !host) return;
    const half = el.offsetWidth / 2;
    const x = Math.max(half + 6, Math.min(host.clientWidth - half - 6, p.x));
    el.style.left = `${x}px`;
    el.style.setProperty('--sn-bubble-arrow', `${p.x - x}px`);
  }, [p.x, p.y, editing]);

  const save = () => {
    p.onMemo(draft.trim());
    setEditing(false);
  };

  return (
    <div
      ref={ref}
      className="sn-hlb"
      style={{ top: p.y }}
      role="toolbar"
      aria-label={`${p.label} 형광펜`}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        // 버튼을 눌러도 고른 글자가 풀리지 않게 (입력칸은 예외)
        if (!(e.target as HTMLElement).closest('input')) e.preventDefault();
      }}
    >
      {editing ? (
        <form
          className="sn-hlb-memo"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            ref={inputRef}
            id="sn-hl-memo"
            value={draft}
            maxLength={MEMO_MAX}
            placeholder="이 구절에 한 줄"
            aria-label="한 줄 메모"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setEditing(false);
                setDraft(p.memo);
              }
            }}
          />
          <button type="submit" className="sn-hlb-save">
            저장
          </button>
        </form>
      ) : (
        <>
          {HL_COLORS.map(([c, name]) => (
            <button
              key={c}
              type="button"
              className="sn-hlb-sw"
              data-c={c}
              aria-pressed={p.color === c}
              aria-label={p.color === c ? `${name} 빼기` : name}
              title={name}
              onClick={() => p.onColor(c)}
            />
          ))}
          <span className="sn-hlb-sep" aria-hidden />
          <button
            type="button"
            className="sn-hlb-btn"
            aria-pressed={p.ul}
            aria-label="밑줄"
            title="밑줄"
            onClick={p.onUnderline}
          >
            <Underline className="sn-icon" aria-hidden />
          </button>
          <button
            type="button"
            className="sn-hlb-btn"
            aria-pressed={!!p.memo}
            aria-label="한 줄 메모"
            title="한 줄 메모"
            onClick={() => setEditing(true)}
          >
            <PenLine className="sn-icon" aria-hidden />
          </button>
          <button
            type="button"
            className="sn-hlb-btn"
            aria-label="카드로 만들기"
            title="카드"
            onClick={p.onCard}
          >
            <ImageIcon className="sn-icon" aria-hidden />
          </button>
          <button
            type="button"
            className="sn-hlb-btn"
            aria-label="복사"
            title="복사"
            onClick={p.onCopy}
          >
            <Copy className="sn-icon" aria-hidden />
          </button>
          {p.canClear && (
            <button
              type="button"
              className="sn-hlb-btn"
              aria-label="형광펜 지우기"
              title="지우기"
              onClick={p.onClear}
            >
              <Trash2 className="sn-icon" aria-hidden />
            </button>
          )}
          <button
            type="button"
            className="sn-hlb-btn sn-hlb-x"
            aria-label="닫기"
            onClick={p.onClose}
          >
            <X className="sn-icon" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
