import { forwardRef } from 'react';
import { decRef, refLong } from '../bibleRefs';
import { Mascot } from '../Mascot';
import type { MascotId } from '../sermonLook';
import {
  cardBookName,
  cardChapterUnit,
  cardDate,
  cardVerseRange,
  segsText,
  type CardData,
  type CardFmt,
} from './shareModel';
import './shareCard.css';

/**
 * 공유 카드 한 장. 크기는 부모 폭을 따르고 안쪽은 cqw 로 잰다(미리보기·이미지 저장이 같은 비율).
 * 색은 꾸미기 잉크의 「밝은 종이」 값(--ink-*)만 쓴다 — 앱이 다크여도 카드 이미지는 종이색.
 */
interface ShareCardProps {
  data: CardData;
  fmt: CardFmt;
  mascot: MascotId;
  showPreacher?: boolean;
}

/** 줄 수 제한(line-clamp)은 이미지 캡처에서 말줄임이 안 찍혀서, 글자 수로 미리 자른다 */
function clipText(t: string, max: number): string {
  return t.length > max ? t.slice(0, max).trimEnd() + '…' : t;
}

export const CARD_BRAND = 'bridgespots.com/sermonnote';

function Brand({ mascot }: { mascot: MascotId }) {
  return (
    <div className="snc-brand">
      <Mascot kind={mascot} size={20} className="snc-brand-m" />
      <b>설교 노트</b>
      <span className="snc-url">{CARD_BRAND}</span>
    </div>
  );
}

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  { data, fmt, mascot, showPreacher = true },
  ref,
) {
  const r = decRef(data.ref);
  const date = cardDate(data.date);
  const who = [showPreacher ? data.preacher : '', date].filter(Boolean).join(' · ');
  const meta = [date, data.service].filter(Boolean).join(' · ');

  if (data.kind === 'line' && data.quote) {
    const q = data.quote;
    const qr = decRef(q.ref);
    const len = segsText(q.segs).length;
    const size = len <= 50 ? 'l' : len <= 110 ? 'm' : 's';
    return (
      <div className="snc-wrap">
        <div ref={ref} className="snc snc-line" data-fmt={fmt}>
          <span className="snc-src" data-src={q.src}>
            {q.src === 'verse' ? (qr ? `말씀 · ${refLong(qr)}` : '말씀') : '내 노트에서'}
          </span>
          <span className="snc-qm" aria-hidden>
            “
          </span>
          <p className="snc-body" data-serif={q.src === 'verse'} data-size={size}>
            {q.segs.map((s, i) => (s.m ? <mark key={i}>{s.t}</mark> : <span key={i}>{s.t}</span>))}
          </p>
          <div className="snc-ctx">
            {r && (
              <span className="snc-ref">
                {refLong(r)}
                {q.src === 'note' ? ' 설교를 듣고' : ''}
              </span>
            )}
            {data.title && <b>{data.title}</b>}
            {who && <span>{who}</span>}
          </div>
          <Brand mascot={mascot} />
        </div>
      </div>
    );
  }

  return (
    <div className="snc-wrap">
      <div ref={ref} className="snc snc-cover" data-fmt={fmt}>
        <div className="snc-band">
          <span className="snc-disc" aria-hidden />
          <span className="snc-dots" aria-hidden />
          <span className="snc-peek" aria-hidden>
            <Mascot kind={mascot} size={60} />
          </span>
          {r ? (
            <>
              <span className="snc-book">
                <span className="snc-bk">{cardBookName(r)}</span>
                <span className="snc-ch">
                  {r.c}
                  <small>{cardChapterUnit(r)}</small>
                </span>
              </span>
              <span className="snc-pill">{cardVerseRange(r)} · 개역한글</span>
            </>
          ) : (
            <span className="snc-book">
              <span className="snc-bk">설교 노트</span>
            </span>
          )}
        </div>
        {meta && <div className="snc-meta">{meta}</div>}
        <h3 className="snc-title">{data.title || (r ? refLong(r) : '이번 주 설교')}</h3>
        {showPreacher && data.preacher && <div className="snc-who">{data.preacher}</div>}
        {r && data.verse && (
          <div className="snc-verse">
            <b>{refLong({ ...r, v2: r.v1, whole: false })}</b>
            <span>{clipText(data.verse, fmt === 'story' ? 120 : 50)}</span>
          </div>
        )}
        <Brand mascot={mascot} />
      </div>
    </div>
  );
});
