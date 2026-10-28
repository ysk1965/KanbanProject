import { useMemo, useState } from 'react';
import { fmtDate, type SermonNote } from './sermonTypes';
import { useGalpiPrefs } from './galpiPrefs';
import {
  autoName,
  mergeService,
  serviceKeyOf,
  serviceKeys,
  stickerLabel,
  type TidyList,
} from './noteTidy';
import { Mascot } from './Mascot';
import type { MascotId } from './sermonLook';
import './tidy.css';

/**
 * 설교 노트 「다듬기」 — 제목 없는 노트 · 빈 노트 · 같은 예배 다른 이름 · 구절 없는 노트.
 * 다듬을 게 없으면 사이드바에서 메뉴가 숨는다(useTidy → tidy.count === 0).
 */
interface Props {
  notes: SermonNote[];
  tidy: TidyList;
  mascot: MascotId;
  onDismiss: (name: string) => void;
  onOpen: (id: string) => void;
  onSave: (notes: SermonNote[]) => void;
  onRemove: (ids: string[]) => void;
}

export function SermonTidy({ notes, tidy, mascot, onDismiss, onOpen, onSave, onRemove }: Props) {
  const worship = useGalpiPrefs().worship;
  const keys = useMemo(() => serviceKeys(notes, worship), [notes, worship]);
  const colorOf = (n: SermonNote) =>
    keys.find((k) => k.key === serviceKeyOf(n, worship))?.color || 'var(--sn-surface-2)';
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [showNoRef, setShowNoRef] = useState(false);

  const left = tidy.count;
  const sticker = (n: SermonNote) => (
    <span className="sn-tidy-s" style={{ background: colorOf(n) }} aria-hidden>
      {stickerLabel(n)}
    </span>
  );
  const fillAll = () => onSave(tidy.untitled.map((n) => ({ ...n, title: autoName(n) })));

  return (
    <div className="sn-tidy">
      <div className="sn-tidy-helper">
        <Mascot kind={mascot} size={60} state={left ? 'think' : undefined} />
        <div className="sn-tidy-bubble" role="status">
          {left ? `${left}가지만 다듬으면 달력이 깔끔해져요!` : '다듬을 노트가 없어요. 깔끔해요!'}
        </div>
      </div>

      <div className="sn-tidy-grid">
        {tidy.untitled.length > 0 && (
          <section className="sn-tidy-card" data-wide>
            <h3>
              <span className="sn-tidy-n">{tidy.untitled.length}</span>제목이 없는 노트
            </h3>
            <p>첫 줄이나 「예배 + 날짜」로 채워 둘게요. 고치고 싶으면 노트를 열어 주세요.</p>
            <ul>
              {tidy.untitled.map((n) => (
                <li key={n.id} className="sn-tidy-row">
                  {sticker(n)}
                  <span className="sn-tidy-d">{fmtDate(n.date)}</span>
                  <button type="button" className="sn-tidy-name" onClick={() => onOpen(n.id)}>
                    {autoName(n)}
                    <em>제안</em>
                  </button>
                  <button
                    type="button"
                    className="sn-tidy-pri"
                    onClick={() => onSave([{ ...n, title: autoName(n) }])}
                  >
                    이대로
                  </button>
                </li>
              ))}
            </ul>
            {tidy.untitled.length > 1 && (
              <button type="button" className="sn-tidy-pri sn-tidy-all" onClick={fillAll}>
                제안대로 모두 채우기
              </button>
            )}
          </section>
        )}

        {tidy.merges.map((m) => (
          <section key={m.from} className="sn-tidy-card">
            <h3>
              <span className="sn-tidy-n">{m.notes.length}</span>같은 예배 같아요
            </h3>
            <p>
              「{m.from}」 노트 {m.notes.length}편을 「{m.to.label}」{m.to.id ? '(내 예배표)' : ''}
              로 합칠까요? 달력 색이 하나로 맞춰져요.
            </p>
            <div className="sn-tidy-acts">
              <button
                type="button"
                className="sn-tidy-pri"
                onClick={() => onSave(mergeService(m.notes, m.to))}
              >
                「{m.to.label}」로 합치기
              </button>
              <button type="button" onClick={() => onDismiss(m.from)}>
                다른 예배예요
              </button>
            </div>
          </section>
        ))}

        {tidy.empty.length > 0 && (
          <section className="sn-tidy-card">
            <h3>
              <span className="sn-tidy-n">{tidy.empty.length}</span>비어 있는 노트
            </h3>
            <p>제목·본문·생각·녹음이 모두 없어요.</p>
            <ul>
              {tidy.empty.map((n) => (
                <li key={n.id} className="sn-tidy-row">
                  {sticker(n)}
                  <span className="sn-tidy-d">{fmtDate(n.date)}</span>
                  <span className="sn-tidy-name" data-plain>
                    {n.service || '예배 없음'}
                  </span>
                </li>
              ))}
            </ul>
            <div className="sn-tidy-acts">
              {confirmEmpty ? (
                <>
                  <button
                    type="button"
                    className="sn-tidy-danger"
                    onClick={() => {
                      onRemove(tidy.empty.map((n) => n.id));
                      setConfirmEmpty(false);
                    }}
                  >
                    {tidy.empty.length}편 지우기
                  </button>
                  <button type="button" onClick={() => setConfirmEmpty(false)}>
                    그대로 두기
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmEmpty(true)}>
                  빈 노트 지우기…
                </button>
              )}
            </div>
          </section>
        )}

        {tidy.noRef.length > 0 && (
          <section className="sn-tidy-card" data-soft>
            <h3>
              <span className="sn-tidy-n">{tidy.noRef.length}</span>본문 구절이 없는 노트
            </h3>
            <p>
              구절을 달면 스티커에 「롬 5」처럼 책 이름이 찍히고 성경 읽기 「설교 구절」에도 모여요.
            </p>
            {showNoRef ? (
              <ul>
                {tidy.noRef.map((n) => (
                  <li key={n.id} className="sn-tidy-row">
                    {sticker(n)}
                    <span className="sn-tidy-d">{fmtDate(n.date)}</span>
                    <span className="sn-tidy-name" data-plain>
                      {(n.title || '').trim() || autoName(n)}
                    </span>
                    <button type="button" onClick={() => onOpen(n.id)}>
                      열어서 달기
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="sn-tidy-acts">
                <button type="button" onClick={() => setShowNoRef(true)}>
                  {tidy.noRef.length}편 보기
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
