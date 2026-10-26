import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { GalpiMark } from './GalpiMark';
import { Mascot } from './Mascot';
import { saveGalpiPrefs, useGalpiPrefs } from './galpiPrefs';
import { useSermonGroups } from './group/GroupContext';
import { todayString, type SermonNote } from './sermonTypes';
import {
  suggestWorship,
  weekWorshipSlots,
  worshipLabel,
  worshipOfNote,
  worshipTimes,
} from './worship';
import './worship.css';

/**
 * 홈 「한 주 동안」의 내 예배 자리 + 처음 설정 제안 (기획 TGNziM4tRteB8koxfNZGb3 ④).
 * 모임과 짝지은 예배는 모임 자리(GroupDaySlots)가 그리므로 여기선 건너뛴다.
 */
export function MyDaySlots({
  date,
  weekStart,
  notes,
}: {
  date: string;
  weekStart: string;
  notes: SermonNote[];
}) {
  const prefs = useGalpiPrefs();
  const gctx = useSermonGroups();
  const groupIds = new Set(gctx && !gctx.anonymous ? gctx.store.active().map((g) => g.id) : []);
  const today = todayString();
  if (date < today) return null;
  const slots = weekWorshipSlots(prefs.worship, weekStart).filter(
    (x) =>
      x.date === date &&
      !(x.service.groups || []).some((g) => groupIds.has(g.group_id)) &&
      !notes.some((n) => n.date === date && worshipOfNote(n, prefs.worship)?.id === x.service.id),
  );
  if (!slots.length) return null;
  return (
    <>
      {slots.map(({ service: w, start }) => {
        const label = (
          <>
            <span className="sg-tm">{start.replace(/^0/, '')}</span>
            {w.galpi && <GalpiMark size={13} />}
            {worshipLabel(w)}
          </>
        );
        return date === today && gctx ? (
          <button
            key={w.id}
            type="button"
            className="sg-slot sn-wslot"
            data-galpi={w.galpi || undefined}
            onClick={() => gctx.startWorship(w.id, date)}
          >
            {label}
            <small>이 예배로 쓰기</small>
          </button>
        ) : (
          <span key={w.id} className="sg-slot sn-wslot" data-galpi={w.galpi || undefined}>
            {label}
          </span>
        );
      })}
    </>
  );
}

const LATER_KEY = 'sn-worship-suggest-later';
const LATER_DAYS = 30;

function laterUntil(): number {
  try {
    return Number(localStorage.getItem(LATER_KEY) || '0');
  } catch {
    return 0;
  }
}

/** 예배표가 비어 있고 최근 노트에서 예배가 보이면 한 번 묻는다. 「나중에」는 30일 */
export function WorshipSuggest({ notes }: { notes: SermonNote[] }) {
  const prefs = useGalpiPrefs();
  const [hidden, setHidden] = useState(() => laterUntil() > Date.now());
  const rows = useMemo(
    () => (prefs.worship.length || hidden ? [] : suggestWorship(notes)),
    [prefs.worship.length, hidden, notes],
  );
  if (!rows.length) return null;

  const later = () => {
    try {
      localStorage.setItem(LATER_KEY, String(Date.now() + LATER_DAYS * 86400000));
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  return (
    <div className="sn-ws-suggest" role="region" aria-label="예배표 제안">
      <div className="sn-ws-who">
        <Mascot kind="galpi" size={40} />
        <p>요즘 이 예배들에서 말씀을 들으셨네요. 예배표로 정리해 둘까요?</p>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <span>
              {r.galpi && (
                <span className="sn-ws-tag">
                  <GalpiMark size={12} />
                  갈피
                </span>
              )}
              {r.name}
            </span>
            <small>
              {worshipTimes(r)} · {r.count}번
            </small>
          </li>
        ))}
      </ul>
      <div className="sn-ws-acts">
        <button
          type="button"
          className="sn-btn sn-primary"
          onClick={() => {
            saveGalpiPrefs({ worship: rows.map(({ count: _c, ...s }) => s) });
            toast('내 예배표에 넣었어요', {
              description: '나의 갈피 › 내 예배표에서 고칠 수 있어요',
            });
          }}
        >
          이대로 저장
        </button>
      </div>
      <button type="button" className="sn-ws-later" onClick={later}>
        나중에 할게요
      </button>
    </div>
  );
}
