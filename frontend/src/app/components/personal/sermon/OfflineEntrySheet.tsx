import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SnOverlay } from './SnOverlay';
import { Mascot } from './Mascot';
import { prefersReducedMotion } from './microFx';
import { hasStoredBible } from './useBible';
import { isOffline, type SyncStatus } from './sermonStore';
import type { MascotId } from './sermonLook';
import './offlineSheet.css';

/**
 * 연결 없이 설교 노트에 들어왔을 때 한 번 띄우는 안내 시트.
 * - 열고 1.5초 뒤에도 끊겨 있을 때만 (잠깐 끊김에 번쩍이지 않게), 들어온 뒤 15초 안에서만 (쓰던 중 끊김은 상태 줄이 말한다)
 * - 앱을 한 번 열 때 한 번 (sessionStorage), '다시 보지 않기'면 이 기기에서는 다시 안 띄운다 (localStorage)
 * - 로그인 전은 어차피 기기에만 저장되므로 띄우지 않는다
 * 닫으면 작은 점이 연결 표시([data-sn-net])로 날아가 붙어, 다음부터 어디를 보면 되는지 알려 준다.
 */

const SEEN_KEY = 'sn-offline-entry-seen';
const OFF_KEY = 'sn-offline-entry-off';
const WAIT_MS = 1500;
const ENTRY_WINDOW_MS = 15_000;

function readFlag(kind: 'session' | 'local', key: string): boolean {
  try {
    return (kind === 'session' ? sessionStorage : localStorage).getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(kind: 'session' | 'local', key: string) {
  try {
    (kind === 'session' ? sessionStorage : localStorage).setItem(key, '1');
  } catch {
    /* 저장 못 해도 이번 화면에서는 한 번만 뜬다 */
  }
}

/** 화면에 보이는 연결 표시(넓은 화면 사이드바 상태 줄 · 좁은 화면 머리말 칩) */
function visibleNetTarget(): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>('[data-sn-net]');
  for (const el of Array.from(els)) if (el.getClientRects().length) return el;
  return null;
}

function land(target: HTMLElement) {
  target.removeAttribute('data-fx');
  void target.offsetWidth;
  target.setAttribute('data-fx', 'land');
  window.setTimeout(() => target.removeAttribute('data-fx'), 1400);
}

/** 버튼 자리에서 연결 표시로 점을 날려 붙인다. 표시가 없으면 false */
function flyToNet(from: HTMLElement | null): boolean {
  const target = visibleNetTarget();
  if (!target) return false;
  if (!from || prefersReducedMotion() || typeof document.body.animate !== 'function') {
    land(target);
    return true;
  }
  const a = from.getBoundingClientRect();
  const b = (target.querySelector('i') ?? target).getBoundingClientRect();
  const x0 = a.left + a.width / 2 - 6;
  const y0 = a.top + a.height / 2 - 6;
  const dx = b.left + b.width / 2 - 6 - x0;
  const dy = b.top + b.height / 2 - 6 - y0;
  const dot = document.createElement('span');
  dot.className = 'sn-scope sn-net-fly';
  dot.style.left = `${x0}px`;
  dot.style.top = `${y0}px`;
  document.body.appendChild(dot);
  const anim = dot.animate(
    [
      { transform: 'translate(0, 0) scale(2.2)', opacity: 0 },
      { transform: 'translate(0, 0) scale(1.4)', opacity: 1, offset: 0.12 },
      { transform: `translate(${dx / 2}px, ${Math.min(0, dy) - 60}px) scale(1.1)`, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.7)`, opacity: 1 },
    ],
    { duration: 520, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  );
  const end = () => {
    dot.remove();
    land(target);
  };
  anim.onfinish = end;
  anim.oncancel = end;
  return true;
}

function useOfflineEntry(offline: boolean, anonymous: boolean) {
  const mountedAt = useRef(Date.now());
  const [eligible] = useState(
    () => !anonymous && !readFlag('session', SEEN_KEY) && !readFlag('local', OFF_KEY),
  );
  const shown = useRef(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!eligible || shown.current || !offline) return;
    const elapsed = Date.now() - mountedAt.current;
    if (elapsed > ENTRY_WINDOW_MS) return;
    const t = window.setTimeout(
      () => {
        shown.current = true;
        writeFlag('session', SEEN_KEY);
        setOpen(true);
      },
      Math.max(0, WAIT_MS - elapsed),
    );
    return () => window.clearTimeout(t);
  }, [eligible, offline]);

  const dismiss = (never: boolean) => {
    if (never) writeFlag('local', OFF_KEY);
    setOpen(false);
  };
  return { open, dismiss };
}

/**
 * 좁은 화면 머리말의 연결 칩 상태. 끊기면 'off', 다시 연결되면 3초 동안 'back' 뒤 사라진다.
 */
export function useNetChip(offline: boolean): 'off' | 'back' | null {
  const [state, setState] = useState<'off' | 'back' | null>(offline ? 'off' : null);
  const wasOff = useRef(offline);
  useEffect(() => {
    if (offline) {
      wasOff.current = true;
      setState('off');
      return;
    }
    if (!wasOff.current) return;
    wasOff.current = false;
    setState('back');
    const t = window.setTimeout(() => setState(null), 3000);
    return () => window.clearTimeout(t);
  }, [offline]);
  return state;
}

interface OfflineEntrySheetProps {
  status: SyncStatus;
  anonymous: boolean;
  mascot: MascotId;
}

export function OfflineEntrySheet({ status, anonymous, mascot }: OfflineEntrySheetProps) {
  const offline = isOffline(status);
  const { open, dismiss } = useOfflineEntry(offline, anonymous);
  const [bible, setBible] = useState(false);
  const goRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void hasStoredBible().then((b) => alive && setBible(b));
    return () => {
      alive = false;
    };
  }, [open]);

  // 시트가 열린 채 연결이 돌아오면 갈피가 깨어나고 ✕ 가 ✓ 로 바뀐다
  const back = open && !offline;
  const pending = status.pending;

  const close = (never: boolean) => {
    const found = flyToNet(goRef.current);
    dismiss(never);
    if (never) toast('다음부터는 연결 표시로만 알려 드려요');
    else if (!back && found) toast('연결되면 이 표시가 초록으로 바뀌어요');
  };

  const can: Array<[string, string?]> = [
    ['노트 쓰기·고치기'],
    ...(bible ? ([['받아 둔 성경 읽기']] as Array<[string]>) : []),
    ['새 녹음'],
    ['사진·영상 붙이기', '연결되면 올라가요'],
  ];
  const cannot = ['지난 녹음 듣기', '공유·모임 새 소식'];

  const lead = back
    ? pending
      ? `기다리던 변경 ${pending}건을 올리고 있어요.`
      : '이제 녹음 듣기와 공유도 돼요.'
    : pending
      ? `못 올린 변경 ${pending}건도 이 기기에 안전하게 있어요. 연결되면 자동으로 올라가요.`
      : '적는 건 이 기기에 그대로 저장되고, 연결되면 자동으로 올라가요.';

  return (
    <SnOverlay
      open={open}
      onClose={() => close(false)}
      className="sn-offline"
      aria-labelledby="sn-offline-title"
      initialFocus=".sn-offline-go"
    >
      <span className="sn-offline-tape" aria-hidden />
      <div className="sn-offline-top">
        <Mascot kind={mascot} size={52} state={back ? 'done' : 'sleep'} />
        <div>
          <h2 id="sn-offline-title">
            {back ? '다시 연결됐어요' : '지금은 인터넷에 연결돼 있지 않아요'}
          </h2>
          <p>{lead}</p>
        </div>
      </div>
      <ul className="sn-offline-list">
        {can.map(([label, hint], i) => (
          <li key={label} data-ok="true" style={{ '--i': i } as React.CSSProperties}>
            <b aria-hidden>✓</b>
            <span>
              {label}
              {hint && <small>{hint}</small>}
            </span>
          </li>
        ))}
        {cannot.map((label, i) => (
          <li
            key={label}
            data-ok={back}
            data-flip={back || undefined}
            style={{ '--i': can.length + i } as React.CSSProperties}
          >
            <b aria-hidden>{back ? '✓' : '✕'}</b>
            <span>
              {label}
              {!back && <small>연결되면 돼요</small>}
            </span>
          </li>
        ))}
      </ul>
      <div className="sn-offline-acts">
        <button type="button" className="sn-offline-never" onClick={() => close(true)}>
          다시 보지 않기
        </button>
        <button ref={goRef} type="button" className="sn-offline-go" onClick={() => close(false)}>
          {back ? '계속 적기' : '바로 적기'}
        </button>
      </div>
    </SnOverlay>
  );
}
