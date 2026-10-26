import { useMemo } from 'react';
import { ChevronRight, LogIn } from 'lucide-react';
import { refShort } from './bibleRefs';
import { Mascot } from './Mascot';
import type { MascotId } from './sermonLook';
import {
  fmtDate,
  galpiByWeek,
  mainRef,
  UNTITLED,
  weekOf,
  weekRangeLabel,
  type SermonNote,
} from './sermonTypes';

/** 오늘이 든 주부터 거꾸로, 노트가 하나라도 있는 주가 몇 주째 이어지는지 (이번 주가 비었으면 지난주부터 센다) */
function weekStreak(notes: SermonNote[], today = new Date()): number {
  const weeks = new Set(notes.map((n) => weekOf(n.date)).filter(Boolean));
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!weeks.has(weekOf(ymd(d)))) d.setDate(d.getDate() - 7);
  let n = 0;
  while (weeks.has(weekOf(ymd(d)))) {
    n += 1;
    d.setDate(d.getDate() - 7);
  }
  return n;
}

/**
 * 「나의 갈피」 — 마이페이지이자 내가 꽂아 둔 갈피가 모이는 자리.
 * 위: 나(프로필·기록) / 가운데: 내 갈피 책장 + 지난 갈피 / 아래: 스티커·꾸미기·계정
 */
export function MyGalpi({
  notes,
  mascot,
  name,
  anonymous,
  syncLine,
  onOpen,
  onOpenLook,
  onLogin,
  onGoStickers,
}: {
  notes: SermonNote[];
  mascot: MascotId;
  name?: string;
  anonymous: boolean;
  syncLine: string;
  onOpen: (id: string) => void;
  onOpenLook?: () => void;
  onLogin?: () => void;
  onGoStickers: () => void;
}) {
  const galpiWeeks = useMemo(
    () => [...galpiByWeek(notes).entries()].sort((a, b) => b[0].localeCompare(a[0])),
    [notes],
  );
  const streak = useMemo(() => weekStreak(notes), [notes]);

  return (
    <div className="sn-me">
      <div className="sn-me-prof">
        <span className="sn-me-av">
          <Mascot kind={mascot} size={44} />
        </span>
        <div>
          <b>{name || '나'}</b>
          <span>{anonymous ? '로그인 전 · 이 기기에만 저장돼요' : syncLine}</span>
        </div>
        {anonymous && onLogin && (
          <button type="button" className="sn-btn sn-primary" onClick={onLogin}>
            <LogIn className="sn-icon" aria-hidden />
            로그인
          </button>
        )}
      </div>

      <div className="sn-me-stats" role="list">
        <div role="listitem">
          <b>{galpiWeeks.length}</b>갈피
        </div>
        <div role="listitem">
          <b>{notes.length}</b>설교 노트
        </div>
        <div role="listitem">
          <b>{streak}주</b>연속 기록
        </div>
      </div>

      <section className="sn-me-sec" aria-label="내 갈피">
        <div className="sn-sec-h">
          <h4>내 갈피</h4>
          <span>주마다 꽂은 그 주의 중심 설교</span>
        </div>
        {galpiWeeks.length ? (
          <>
            <div className="sn-shelf">
              {galpiWeeks.slice(0, 14).map(([w, n], i) => {
                const r = mainRef(n);
                return (
                  <button
                    key={w}
                    type="button"
                    className="sn-spine"
                    style={
                      {
                        '--c': i % 2 ? 'var(--sn-g2)' : 'var(--sn-g1)',
                        '--h': `${76 + ((i * 37) % 5) * 6}%`,
                      } as React.CSSProperties
                    }
                    onClick={() => onOpen(n.id)}
                    aria-label={`${weekRangeLabel(w)} ${n.title || UNTITLED} 노트 열기`}
                    title={n.title || UNTITLED}
                  >
                    <span>{r ? refShort(r).split(':')[0] : n.title || '설교'}</span>
                  </button>
                );
              })}
            </div>
            <div className="sn-nlist">
              {galpiWeeks.map(([w, n]) => {
                const r = mainRef(n);
                return (
                  <button key={w} type="button" className="sn-nrow" onClick={() => onOpen(n.id)}>
                    <span className="sn-nd">{weekRangeLabel(w)}</span>
                    <span className="sn-nm">
                      <b>{n.title || UNTITLED}</b>
                      <span className="sn-ns">
                        {[fmtDate(n.date), n.preacher, n.service].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="sn-nr">{r ? refShort(r) : ''}</span>
                    <span className="sn-nt">
                      {(n.thoughts || []).length ? `생각 ${(n.thoughts || []).length}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="sn-empty">
            <Mascot kind={mascot} size={80} state="think" />
            아직 꽂은 갈피가 없어요.
            <br />한 주를 붙들고 살 설교를 열고 ‘갈피 꽂기’를 눌러 보세요.
          </div>
        )}
      </section>

      <div className="sn-me-menu">
        <button type="button" onClick={onGoStickers}>
          모은 설교 스티커
          <span>
            {notes.length}장 <ChevronRight className="sn-icon" aria-hidden />
          </span>
        </button>
        {onOpenLook && (
          <button type="button" onClick={onOpenLook}>
            꾸미기
            <span>
              <Mascot kind={mascot} size={20} />
              <ChevronRight className="sn-icon" aria-hidden />
            </span>
          </button>
        )}
        <div className="sn-me-row">
          기기·동기화
          <span>{anonymous ? '이 기기에만 저장' : syncLine}</span>
        </div>
      </div>
    </div>
  );
}
