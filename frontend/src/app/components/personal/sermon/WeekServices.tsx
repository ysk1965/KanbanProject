import { Plus } from 'lucide-react';
import { GroupDaySlots, NoteGroupFaces } from './group/GroupWeekBits';
import { MyDaySlots } from './WorshipHomeBits';
import { applyCount, bookName, chapterUnit, dayLabel } from './homeFmt';
import { isGalpi, mainRef, UNTITLED, type SermonNote } from './sermonTypes';

/**
 * 홈 아래 「이번 주 들은 예배」 — 이번 주(일~토) 노트를 날짜 순으로 카드 한 장씩.
 * 개인 노트 = g1, 모임 노트 = g3, 갈피 노트는 리본. 「적용 N」을 누르면 위 「한 주 동안」에서 그 노트 항목이 표시된다.
 * 아직 안 쓴 예배 자리(모임 GroupDaySlots · 내 예배표 MyDaySlots)는 카드 뒤에 날짜별 줄로 붙는다 (자리 없는 날은 숨김).
 */
interface WeekServicesProps {
  /** 이번 주 노트 (날짜 오름차순) */
  notes: SermonNote[];
  days: string[];
  weekStart: string;
  galpi: Map<string, SermonNote>;
  isGroupNote: (n: SermonNote) => boolean;
  highlight: string | null;
  onHighlight: (noteId: string | null) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}

export function WeekServices({
  notes,
  days,
  weekStart,
  galpi,
  isGroupNote,
  highlight,
  onHighlight,
  onOpen,
  onNew,
}: WeekServicesProps) {
  return (
    <section className="sn-ws" aria-label="이번 주 들은 예배">
      <div className="sn-sec-h">
        <h4>이번 주 들은 예배</h4>
        <span>{notes.length ? `${notes.length}편` : '아직 없어요'}</span>
      </div>
      <div className="sn-ws-grid">
        {notes.map((n) => {
          const r = mainRef(n);
          const ap = applyCount(n);
          const grp = isGroupNote(n);
          return (
            <article
              key={n.id}
              className="sn-ws-card"
              data-grp={grp || undefined}
              data-hl={highlight === n.id || undefined}
            >
              <button
                type="button"
                className="sn-ws-open"
                onClick={() => onOpen(n.id)}
                aria-label={`${n.title || UNTITLED} 노트 열기`}
              />
              {isGalpi(n, galpi) && <span className="sn-ws-rib" role="img" aria-label="갈피" />}
              <div className="sn-ws-band" aria-hidden>
                <b>
                  {r ? bookName(r) : '✦'}
                  {r && (
                    <small>
                      {r.c}
                      {chapterUnit(r)}
                    </small>
                  )}
                </b>
                <span>{dayLabel(n.date)}</span>
              </div>
              <div className="sn-ws-bd">
                <span className="sn-ws-kind">
                  <i />
                  {n.service || '예배'}
                  {grp && ' · 모임'}
                </span>
                <span className="sn-ws-t">{n.title || UNTITLED}</span>
                {(n.preacher || null) && <span className="sn-ws-who">{n.preacher}</span>}
                <div className="sn-ws-meta">
                  <span>생각 {(n.thoughts || []).length}</span>
                  {ap ? (
                    <button
                      type="button"
                      className="sn-ws-ap"
                      aria-pressed={highlight === n.id}
                      onClick={() => onHighlight(highlight === n.id ? null : n.id)}
                    >
                      적용 {ap}
                    </button>
                  ) : null}
                  <NoteGroupFaces note={n} />
                </div>
              </div>
            </article>
          );
        })}
        <button type="button" className="sn-ws-card sn-ws-new" onClick={onNew}>
          <Plus className="sn-icon" style={{ width: 22, height: 22 }} />
          예배 기록
        </button>
      </div>
      <div className="sn-ws-slots" aria-label="아직 안 쓴 예배 자리">
        {days.map((ds) => {
          const dayNotes = notes.filter((n) => n.date === ds);
          return (
            <div key={ds} className="sn-ws-day">
              <span className="sn-ws-day-l">{dayLabel(ds)}</span>
              <GroupDaySlots date={ds} notes={dayNotes} />
              <MyDaySlots date={ds} weekStart={weekStart} notes={dayNotes} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
