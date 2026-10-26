import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { BOOKS } from '../bibleRefs';
import { UNTITLED, fmtDate, noteRefs, type ApplyItem, type SermonNote } from '../sermonTypes';
import { Coin } from './ChallengeBits';
import './lifeGalpi.css';

/**
 * 「이번 주 삶의 갈피」 — 한 주에 갈피를 두 군데 꽂는다: 말씀에(노트 1편) · 삶에(적용 1개 살아 냄).
 * 옛 「이번 주 완주」 + 「이번 주 적용」 목록을 한 카드로 합쳤다. 적용 체크는 카드 안에서 바로 한다.
 */

export interface LifeGalpiApply {
  /** 최근 7일 설교의 적용 */
  week: ApplyItem[];
  /** 지난 설교에서 아직 안 한 적용 */
  older: ApplyItem[];
}

/** 노트의 첫 구절 → 「롬 5」 (장 번호만 쓰지 않고 늘 책 이름과 함께) */
function noteLabel(n: SermonNote | null): string {
  const r = n ? noteRefs(n)[0] : null;
  return r ? `${BOOKS[r.b][1]} ${r.c}` : '말씀';
}

function src(n: SermonNote): string {
  return `${fmtDate(n.date)} · ${n.title || UNTITLED}`;
}

export function LifeGalpiCard({
  weekNote,
  doneNote,
  doneApply,
  apply,
  onToggleApply,
  onOpenNote,
  onNew,
}: {
  /** 이번 주에 쓴 가장 최근 노트 (없으면 null) */
  weekNote: SermonNote | null;
  doneNote: boolean;
  doneApply: boolean;
  apply: LifeGalpiApply;
  onToggleApply: (noteId: string, thoughtId: string) => void;
  onOpenNote: (noteId: string, aid?: string | null) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [just, setJust] = useState(false);
  const both = doneNote && doneApply;
  const weekLeft = apply.week.filter((x) => !x.t.done);
  const weekDone = apply.week.filter((x) => x.t.done);
  const shown = doneApply ? (weekDone[0] ?? null) : (weekLeft[0] ?? null);
  const more = doneApply ? weekLeft.length : Math.max(0, weekLeft.length - 1);
  const listCount = apply.week.length + apply.older.length;

  const live = (x: ApplyItem) => {
    if (!x.t.done && !doneApply) setJust(true);
    onToggleApply(x.n.id, x.t.id);
  };

  return (
    <section className="sn-lg" aria-label="이번 주 삶의 갈피" data-both={both || undefined}>
      <div className="sn-lg-head">
        <h4>이번 주 삶의 갈피</h4>
        <span className="sn-lg-due">말씀에 하나, 삶에 하나 · 일요일 22시까지</span>
        <span className="sn-lg-prize">
          <Coin size={18} />
          {both ? '받았어요 +20' : '+20'}
        </span>
      </div>

      <div className="sn-lg-slots">
        <div className="sn-lg-slot">
          <span className="sn-lg-rib" data-on={doneNote ? 'word' : undefined} aria-hidden>
            {doneNote ? noteLabel(weekNote) : '말씀'}
          </span>
          <div className="sn-lg-body">
            <small>말씀에 꽂기</small>
            <b>설교 노트 1편</b>
            {doneNote && weekNote ? (
              <span className="sn-lg-src">{src(weekNote)}</span>
            ) : (
              <>
                <span className="sn-lg-src">이번 주 설교를 아직 기록하지 않았어요.</span>
                <span className="sn-lg-row">
                  <button type="button" className="sn-btn sn-primary sn-lg-btn" onClick={onNew}>
                    새 설교 기록
                  </button>
                </span>
              </>
            )}
          </div>
        </div>

        <div className="sn-lg-slot">
          {doneApply ? (
            <span className="sn-lg-rib" data-on="life" data-just={just || undefined} aria-hidden>
              삶
            </span>
          ) : shown ? (
            <button
              type="button"
              className="sn-lg-rib"
              aria-label="살아 냈어요"
              onClick={() => live(shown)}
            >
              눌러서
              <br />
              꽂기
            </button>
          ) : (
            <span className="sn-lg-rib" aria-hidden>
              삶
            </span>
          )}
          <div className="sn-lg-body">
            <small>삶에 꽂기</small>
            {shown ? (
              <>
                <span className="sn-lg-memo" data-done={!!shown.t.done || undefined}>
                  {shown.t.text || '(사진·영상 메모)'}
                </span>
                <span className="sn-lg-src">{src(shown.n)}</span>
                <span className="sn-lg-row">
                  {!doneApply && (
                    <button
                      type="button"
                      className="sn-btn sn-primary sn-lg-btn"
                      onClick={() => live(shown)}
                    >
                      살아 냈어요
                    </button>
                  )}
                  {listCount > 1 && (
                    <button
                      type="button"
                      className="sn-lg-more"
                      aria-expanded={open}
                      onClick={() => setOpen((o) => !o)}
                    >
                      {doneApply
                        ? more
                          ? `남은 적용 ${more}개`
                          : '적용 모두 보기'
                        : more
                          ? `${more}개 더`
                          : '적용 모두 보기'}
                      <ChevronRight className="sn-icon" aria-hidden />
                    </button>
                  )}
                </span>
              </>
            ) : doneApply ? (
              <>
                <b>적용 1개 살아 냄</b>
                <span className="sn-lg-src">이번 주 적용을 실천했어요.</span>
              </>
            ) : (
              <>
                <b>적용 1개 살아 내기</b>
                <span className="sn-lg-src">이번 주 노트에 아직 적용이 없어요.</span>
                <span className="sn-lg-row">
                  <button
                    type="button"
                    className="sn-btn sn-ghost sn-lg-btn"
                    onClick={() => (weekNote ? onOpenNote(weekNote.id) : onNew())}
                  >
                    이번 주 노트에 적용 남기기
                  </button>
                  {apply.older.length > 0 && (
                    <button
                      type="button"
                      className="sn-lg-more"
                      aria-expanded={open}
                      onClick={() => setOpen((o) => !o)}
                    >
                      지난 적용 {apply.older.length}개
                      <ChevronRight className="sn-icon" aria-hidden />
                    </button>
                  )}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {both && (
        <p className="sn-lg-ribbon">
          <b>이번 주 갈피를 삶에 꽂았어요</b>
          말씀에 하나, 삶에 하나. 다음 주에 또 꽂아요.
        </p>
      )}

      {open && (
        <div className="sn-lg-list">
          {apply.week.map((x) => (
            <ApplyLine key={`${x.n.id}|${x.t.id}`} x={x} onToggle={live} onOpen={onOpenNote} />
          ))}
          {apply.older.length > 0 && (
            <>
              <div className="sn-lg-list-h">지난 설교에서 아직 남은 적용</div>
              {apply.older.map((x) => (
                <ApplyLine key={`${x.n.id}|${x.t.id}`} x={x} onToggle={live} onOpen={onOpenNote} />
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ApplyLine({
  x,
  onToggle,
  onOpen,
}: {
  x: ApplyItem;
  onToggle: (x: ApplyItem) => void;
  onOpen: (noteId: string, aid?: string | null) => void;
}) {
  return (
    <div className="sn-lg-line" data-done={!!x.t.done || undefined}>
      <button
        type="button"
        className="sn-lg-ck"
        aria-pressed={!!x.t.done}
        aria-label={x.t.done ? '실천 표시 지우기' : '살아 냈어요'}
        onClick={() => onToggle(x)}
      />
      <span className="sn-lg-line-tx">
        <span className="sn-lg-memo">{x.t.text || '(사진·영상 메모)'}</span>
        <span className="sn-lg-src">{src(x.n)}</span>
      </span>
      <button type="button" className="sn-btn sn-ghost" onClick={() => onOpen(x.n.id, x.t.aid)}>
        노트 보기
      </button>
    </div>
  );
}
