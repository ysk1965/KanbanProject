import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import {
  fmtDate,
  THOUGHT_TAGS,
  type SermonNote,
  type Thought,
  type ThoughtTag,
} from './sermonTypes';
import { displayTitle } from './noteTidy';
import { Mascot } from './Mascot';
import type { MascotId } from './sermonLook';
import './thoughtsBoard.css';

/**
 * 설교 노트 「내 생각」 — 노트마다 남긴 생각을 메모지로 모아 본다.
 *  - 적용: 「실천했어요」 체크 (노트 thoughts[].done 그대로)
 *  - 질문: 답 적기 (thoughts[].answer). 답이 있으면 「풀린 질문」으로 접힌다
 */
interface Props {
  notes: SermonNote[];
  query: string;
  mascot: MascotId;
  onOpen: (id: string, aid?: string | null) => void;
  onToggleApply: (noteId: string, thoughtId: string) => void;
  onAnswer: (noteId: string, thoughtId: string, answer: string | null) => void;
  /** 설치 앱 좁은 화면 — 종류 고르기를 보기 줄 위 선반에 그린다. undefined = 본문 위 */
  shelfHost?: HTMLElement | null;
}

type Filter = 'all' | ThoughtTag;
const ANSWER_MAX = 1000;

export function SermonThoughts({
  notes,
  query,
  mascot,
  onOpen,
  onToggleApply,
  onAnswer,
  shelfHost,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [showSolved, setShowSolved] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: Array<{ n: SermonNote; t: Thought }> = [];
    notes.forEach((n) =>
      (n.thoughts || []).forEach((t) => {
        if (
          !q ||
          t.text.toLowerCase().includes(q) ||
          (t.answer || '').toLowerCase().includes(q) ||
          displayTitle(n).text.toLowerCase().includes(q)
        )
          out.push({ n, t });
      }),
    );
    return out.sort((a, b) => (b.n.date || '').localeCompare(a.n.date || '') || a.t.at - b.t.at);
  }, [notes, query]);

  const count = (f: Filter) =>
    f === 'all' ? rows.length : rows.filter((r) => r.t.tag === f).length;
  const shown = rows.filter((r) => filter === 'all' || r.t.tag === filter);
  const isSolved = (t: Thought) => t.tag === '질문' && !!(t.answer || '').trim();
  const open = shown.filter((r) => !isSolved(r.t));
  const solved = shown.filter((r) => isSolved(r.t));

  const startAnswer = (t: Thought) => {
    setEditing(t.id);
    setDraft(t.answer || '');
  };
  const saveAnswer = (n: SermonNote, t: Thought) => {
    const v = draft.trim().slice(0, ANSWER_MAX);
    onAnswer(n.id, t.id, v || null);
    setEditing(null);
  };

  const card = ({ n, t }: { n: SermonNote; t: Thought }) => {
    const title = displayTitle(n);
    return (
      <article
        key={t.id}
        className="sn-memo"
        data-tag={t.tag}
        data-done={(t.tag === '적용' && t.done) || undefined}
      >
        <span className="sn-memo-tape" aria-hidden />
        <div className="sn-memo-top">
          <span className="sn-memo-tag">{t.tag}</span>
          <button type="button" className="sn-memo-src" onClick={() => onOpen(n.id, t.aid)}>
            {fmtDate(n.date)} · <span data-auto={title.auto || undefined}>{title.text}</span>
          </button>
        </div>
        <p className="sn-memo-tx">{t.text}</p>
        {t.label && <blockquote className="sn-memo-q">{t.label}</blockquote>}
        {(t.media || []).length > 0 && (
          <span className="sn-memo-media">첨부 {(t.media || []).length}개</span>
        )}
        {t.tag === '질문' && editing !== t.id && t.answer && (
          <div className="sn-memo-ans">
            <b>내 답</b>
            {t.answer}
          </div>
        )}
        {editing === t.id && (
          <div className="sn-memo-edit">
            <label className="sn-sr" htmlFor={`sn-ans-${t.id}`}>
              답
            </label>
            <textarea
              id={`sn-ans-${t.id}`}
              value={draft}
              maxLength={ANSWER_MAX}
              rows={3}
              placeholder="찾은 답, 들은 이야기, 다시 읽은 구절…"
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(null);
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveAnswer(n, t);
              }}
            />
            <div className="sn-memo-acts">
              <button type="button" className="sn-memo-pri" onClick={() => saveAnswer(n, t)}>
                저장
              </button>
              <button type="button" onClick={() => setEditing(null)}>
                취소
              </button>
            </div>
          </div>
        )}
        {editing !== t.id && (
          <div className="sn-memo-acts">
            {t.tag === '적용' && (
              <button
                type="button"
                className={t.done ? undefined : 'sn-memo-pri'}
                aria-pressed={!!t.done}
                onClick={() => onToggleApply(n.id, t.id)}
              >
                <Check aria-hidden />
                {t.done ? '실천함' : '실천했어요'}
              </button>
            )}
            {t.tag === '질문' && (
              <button
                type="button"
                className={t.answer ? undefined : 'sn-memo-pri'}
                onClick={() => startAnswer(t)}
              >
                {t.answer ? '답 고치기' : '답 적기'}
              </button>
            )}
            <button type="button" onClick={() => onOpen(n.id, t.aid)}>
              노트에서 보기
            </button>
          </div>
        )}
      </article>
    );
  };

  const seg = (
    <div className="sn-thoughts-seg" role="group" aria-label="생각 종류">
      {(['all', ...THOUGHT_TAGS] as Filter[]).map((f) => (
        <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
          {f === 'all' ? '전체' : f}
          <span className="sn-count">{count(f)}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="sn-thoughts">
      {shelfHost ? createPortal(seg, shelfHost) : shelfHost === undefined && seg}
      {!shown.length ? (
        <div className="sn-empty">
          <Mascot kind={mascot} size={72} state="think" />
          {query
            ? `‘${query}’에 맞는 생각이 없어요.`
            : filter === 'all'
              ? '노트를 쓰다가 남긴 생각이 여기 모여요.'
              : `아직 ${filter} 메모가 없어요.`}
        </div>
      ) : (
        <>
          <div className="sn-memos">{open.map(card)}</div>
          {solved.length > 0 && (
            <div className="sn-solved">
              <button
                type="button"
                className="sn-solved-tg"
                aria-expanded={showSolved}
                onClick={() => setShowSolved((v) => !v)}
              >
                풀린 질문 {solved.length}
              </button>
              {showSolved && <div className="sn-memos">{solved.map(card)}</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
