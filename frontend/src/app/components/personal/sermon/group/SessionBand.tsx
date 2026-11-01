import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { EyeOff, Lock, Users } from 'lucide-react';
import { SnOverlay } from '../SnOverlay';
import { fmtDate, todayString, type NoteGroupLink, type SermonNote } from '../sermonTypes';
import { Faces } from './Faces';
import { faceColor, josa, type GroupStore } from './groupStore';
import type { Suggestion } from './sessionMatch';
import { weekStartOf } from './sessionMatch';
import './group.css';

/**
 * 노트 정보 줄(설교자·예배·날짜) 아래 「모임」 칩 한 줄.
 * 알림처럼 묻지 않고 지금 공개 상태만 보여 준다. 칩을 누르면 그 모임에 무엇이 보이는지
 * 같이 보기 · 기록만 · 안 보임 세 단계로 고른다 (데스크톱은 칩 아래 작은 창, 폰은 시트).
 * 아직 안 붙었는데 맞을 만한 자리가 있으면 점선 칩 「같은 설교?」 하나.
 */
interface Props {
  note: SermonNote;
  store: GroupStore;
  suggestions: Suggestion[];
  onOpenSession: (sessionId: string, groupId: string) => void;
  onSetLink: (groupId: string, patch: Partial<NoteGroupLink>) => void;
  onAccept: (s: Suggestion) => void;
  onDismiss: (s: Suggestion) => void;
}

type Mode = 'open' | 'record' | 'off';

/** 저장 형식(off·private)은 그대로, 화면에서만 세 단계로 읽는다. 둘 다 켜진 예전 값은 안 보임 */
const linkMode = (l: NoteGroupLink): Mode => (l.off ? 'off' : l.private ? 'record' : 'open');
const MODE_PATCH: Record<Mode, Partial<NoteGroupLink>> = {
  open: { off: false, private: false },
  record: { off: false, private: true },
  off: { off: true, private: false },
};
const MODES: Array<[Mode, string, typeof Users]> = [
  ['open', '같이 보기', Users],
  ['record', '기록만', Lock],
  ['off', '안 보임', EyeOff],
];
const MODE_ICON = { open: Users, record: Lock, off: EyeOff } as const;
const DESC: Record<Mode, (name: string) => string> = {
  open: (n) => `${n} 사람들이 이 노트 내용을 볼 수 있어요.`,
  record: (n) => `${n}에는 내가 이 설교를 기록했다는 것만 보이고, 내용은 나만 봐요.`,
  off: (n) => `${n}에는 이 노트가 보이지 않아요. 다시 열어도 자동으로 붙지 않아요.`,
};
const HOW = {
  auto: '예배 시간이라 자동으로 붙었어요',
  suggest: '같은 설교로 붙였어요',
  manual: '이 설교 자리에서 붙였어요',
} as const;

/* 오늘 자동으로 붙은 칩의 「새로」 점 — 한 번 열어 보면 지운다 */
const SEEN_KEY = 'sermon-group-link-seen';
function loadSeen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function saveSeen(keys: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(keys.slice(-100)));
  } catch {
    /* 이 창 동안만 */
  }
}

function useNarrow(): boolean {
  const q = '(max-width: 640px)';
  const [on, setOn] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const fn = () => setOn(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return on;
}

interface Person {
  user_id: string;
  display_name: string;
}
interface Row {
  link: NoteGroupLink;
  id: string;
  name: string;
  slot: string;
  mode: Mode;
  people: Person[];
  fresh: boolean;
}

export function SessionBand({
  note,
  store,
  suggestions,
  onOpenSession,
  onSetLink,
  onAccept,
  onDismiss,
}: Props) {
  useSyncExternalStore(store.subscribe, store.snapshot);
  const narrow = useNarrow();
  const [openId, setOpenId] = useState<string | null>(null);
  const [seen, setSeen] = useState(loadSeen);
  const boxRef = useRef<HTMLDivElement>(null);

  // 바깥을 누르거나 Esc 면 작은 창을 닫는다 (폰 시트는 SnOverlay 가 맡는다)
  useEffect(() => {
    if (!openId || narrow) return;
    const down = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpenId(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const id = openId;
      setOpenId(null);
      boxRef.current?.querySelector<HTMLElement>(`[data-gid="${id}"]`)?.focus();
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [openId, narrow]);

  if (store.anonymous) return null;
  const today = todayString();
  const rows: Row[] = (note.groups || []).flatMap((l) => {
    const g = store.get(l.group_id);
    if (!g || g.me.status !== 'active') return [];
    const svc = g.services.find((s) => s.id === l.service_id);
    const sess = l.session_id
      ? store.weekCached(g.id, weekStartOf(l.date))?.sessions.find((s) => s.id === l.session_id)
      : undefined;
    const people = (sess?.members || [])
      .filter((m) => m.user_id !== g.me.user_id)
      .map((m) => ({
        user_id: m.user_id,
        display_name: g.members.find((x) => x.user_id === m.user_id)?.display_name || '?',
      }));
    const seenKey = `${note.id}|${g.id}`;
    return [
      {
        link: l,
        id: g.id,
        name: g.name,
        slot: `${fmtDate(l.date)} ${sess?.name || svc?.name || '설교'}`,
        mode: linkMode(l),
        people,
        fresh: l.how === 'auto' && l.date === today && !l.off && !seen.includes(seenKey),
      },
    ];
  });
  const sug = suggestions[0];
  if (!rows.length && !sug) return null;

  const toggle = (r: Row) => {
    const key = `${note.id}|${r.id}`;
    if (r.fresh) {
      const next = [...seen, key];
      setSeen(next);
      saveSeen(next);
    }
    setOpenId(openId === r.id ? null : r.id);
  };
  const setMode = (r: Row, m: Mode) => {
    if (m !== r.mode) onSetLink(r.id, MODE_PATCH[m]);
  };
  const goSession = (r: Row) => {
    if (!r.link.session_id) return;
    setOpenId(null);
    onOpenSession(r.link.session_id, r.id);
  };

  const fresh = rows.find((r) => r.fresh);
  const on = rows.filter((r) => r.mode === 'open').map((r) => r.name);
  const rec = rows.filter((r) => r.mode === 'record').map((r) => r.name);
  const summary =
    [
      on.length
        ? `${[...on.slice(0, -1), josa(on[on.length - 1], '과', '와')].join(' · ')} 같이 봐요`
        : '',
      rec.length ? `${rec.join(' · ')}에는 기록만 보여요` : '',
    ]
      .filter(Boolean)
      .join(', ') || (rows.length ? '어느 모임에도 보이지 않아요' : '');

  // 같은 설교를 기록한 사람 — 안 보임으로 둔 모임은 빼고, 여러 모임에 겹치면 한 번만
  const peopleRow = rows.find((r) => r.mode !== 'off' && r.people.length && r.link.session_id);
  const everyone = [
    ...new Map(
      rows.filter((r) => r.mode !== 'off').flatMap((r) => r.people.map((p) => [p.user_id, p])),
    ).values(),
  ];

  const panel = (r: Row) => (
    <div className="sg-gpanel" key={r.id}>
      <div className="sg-gpanel-h">
        <i className="sg-gdot" style={{ background: faceColor(r.id) }} aria-hidden />
        <b>{r.name}에 보이는 것</b>
      </div>
      <small className="sg-gwhy">
        {r.slot} · {HOW[r.link.how]}
      </small>
      <div className="sg-seg" role="radiogroup" aria-label={`${r.name} 공개 범위`}>
        {MODES.map(([m, label, Icon]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={r.mode === m}
            onClick={() => setMode(r, m)}
          >
            <Icon size={15} aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <p className="sg-gdesc">{DESC[r.mode](r.name)}</p>
      {r.link.session_id && r.mode !== 'off' && (
        <button type="button" className="sg-glink" onClick={() => goSession(r)}>
          {r.people.length > 0 && <Faces people={r.people} max={3} size={20} />}
          {r.people.length ? `같은 설교 노트 ${r.people.length}개 보기 →` : '같은 설교 자리 열기 →'}
        </button>
      )}
    </div>
  );

  const openRow = rows.find((r) => r.id === openId);

  return (
    <div className="sg-strip" ref={boxRef}>
      {rows.length > 0 && <span className="sg-strip-lbl">모임</span>}
      {rows.map((r) => {
        const Icon = MODE_ICON[r.mode];
        return (
          <span className="sg-gwrap" key={r.id}>
            <button
              type="button"
              className="sg-gchip"
              data-gid={r.id}
              data-mode={r.mode}
              aria-expanded={openId === r.id}
              aria-haspopup="dialog"
              aria-label={`${r.name} 공개 범위: ${MODES.find((x) => x[0] === r.mode)![1]}`}
              onClick={() => toggle(r)}
            >
              <i className="sg-gdot" style={{ background: faceColor(r.id) }} aria-hidden />
              {r.name}
              <Icon size={14} aria-hidden />
              {r.fresh && <i className="sg-gnew" aria-hidden />}
            </button>
            {!narrow && openId === r.id && (
              <div className="sg-gpop" role="dialog" aria-label={`${r.name} 공개 범위`}>
                {panel(r)}
              </div>
            )}
          </span>
        );
      })}
      {sug && (
        <span className="sg-gwrap">
          <button
            type="button"
            className="sg-gchip"
            data-mode="sug"
            aria-expanded={openId === 'sug'}
            aria-haspopup="dialog"
            onClick={() => setOpenId(openId === 'sug' ? null : 'sug')}
          >
            {store.get(sug.group_id)?.name} {fmtDate(sug.session.date)} 설교와 같나요?
          </button>
          {!narrow && openId === 'sug' && (
            <div className="sg-gpop" role="dialog" aria-label="같은 설교인지 확인">
              {sugPanel(sug)}
            </div>
          )}
        </span>
      )}
      {rows.length > 0 && (
        <span className="sg-strip-sum">
          {fresh ? (
            <>
              <b>{fresh.name}</b> 방금 자동으로 붙음
            </>
          ) : (
            summary
          )}
        </span>
      )}
      {peopleRow && (
        <button type="button" className="sg-strip-people" onClick={() => goSession(peopleRow)}>
          <Faces people={everyone} max={3} size={22} />
          {everyone.length}명도 기록했어요 →
        </button>
      )}
      {narrow && (
        <SnOverlay
          open={!!openId}
          onClose={() => setOpenId(null)}
          className="sg-gsheet"
          aria-label="모임 공개 범위"
        >
          {openId === 'sug' && sug ? (
            sugPanel(sug)
          ) : (
            <>
              <h2 className="sg-gsheet-h">이 노트는 누구와 보나요</h2>
              {/* 누른 모임을 맨 위에 */}
              {[...(openRow ? [openRow] : []), ...rows.filter((r) => r !== openRow)].map(panel)}
            </>
          )}
        </SnOverlay>
      )}
    </div>
  );

  function sugPanel(s: Suggestion) {
    return (
      <div className="sg-gpanel">
        <div className="sg-gpanel-h">
          <i className="sg-gdot" style={{ background: faceColor(s.group_id) }} aria-hidden />
          <b>
            {store.get(s.group_id)?.name} · {fmtDate(s.session.date)}{' '}
            {s.session.title || s.session.name || '설교'}와 같은 설교인가요?
          </b>
        </div>
        <small className="sg-gwhy">{s.reasons.join(' · ')}</small>
        <div className="sg-gacts">
          <button
            type="button"
            className="sg-chip"
            onClick={() => {
              setOpenId(null);
              onDismiss(s);
            }}
          >
            아니에요
          </button>
          <button
            type="button"
            className="sg-chip"
            aria-pressed
            onClick={() => {
              setOpenId(null);
              onAccept(s);
            }}
          >
            같은 설교예요
          </button>
        </div>
      </div>
    );
  }
}
