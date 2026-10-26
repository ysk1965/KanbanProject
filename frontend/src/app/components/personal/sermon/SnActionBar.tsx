import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import './actionBar.css';

/**
 * 상세 화면 동작 바 — 왼쪽 뒤로(도착지 이름) · 가운데 보조 · 오른쪽 주요 동작.
 * 독립 화면 + 좁은 화면이면 하단 탭 바 자리(SermonList 의 .sn-bdock)로 아래에서 올라오고 탭 바는 내려간다.
 * 그 밖(넓은 화면 · 마이 스페이스 안)에서는 본문 맨 위 한 줄로 그리고, 주요 동작은 본문 쪽 버튼을 그대로 쓴다.
 */

const BOTTOM_MQ = '(max-width: 760px)';

interface Host {
  slot: HTMLElement | null;
  /** 바가 하단 자리에 올라오면 부르고, 내려가면 돌려받은 함수를 부른다 */
  mount: () => () => void;
}

const ActionBarHost = createContext<Host | null>(null);
export const ActionBarHostProvider = ActionBarHost.Provider;

/** SermonList 가 하단 자리를 열어 둔다 — slotRef 를 자리 요소에, active 면 탭 바를 내린다 */
export function useActionBarHost() {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [count, setCount] = useState(0);
  const mount = useCallback(() => {
    setCount((c) => c + 1);
    return () => setCount((c) => c - 1);
  }, []);
  const host = useMemo<Host>(() => ({ slot, mount }), [slot, mount]);
  return { host, slotRef: setSlot, active: count > 0 };
}

function useMedia(q: string): boolean {
  const [on, setOn] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const fn = () => setOn(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [q]);
  return on;
}

/** 보이는 뷰포트가 25% 이상 줄면 키보드가 열린 것으로 본다 (SermonEditor 와 같은 기준) */
function useKeyboardOpen(enabled: boolean): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) {
      setOpen(false);
      return;
    }
    const update = () => setOpen(vv.height < window.innerHeight * 0.75);
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, [enabled]);
  return open;
}

interface Props {
  /** 돌아갈 곳 이름 — "뒤로"가 아니라 "6팀", "챌린지"처럼 */
  backLabel: string;
  onBack: () => void;
  /** 오른쪽 주요 동작 (하단에 있을 때만 그린다) */
  primary?: ReactNode;
  /** 가운데 보조 버튼 0~2개 */
  children?: ReactNode;
}

export function SnActionBar({ backLabel, onBack, primary, children }: Props) {
  const host = useContext(ActionBarHost);
  const narrow = useMedia(BOTTOM_MQ);
  const bottom = !!host?.slot && narrow;
  const kb = useKeyboardOpen(bottom);
  const mount = host?.mount;
  useEffect(() => (bottom && mount ? mount() : undefined), [bottom, mount]);

  const bar = (
    <div className="sn-abar" data-at={bottom ? 'bottom' : 'top'} data-kb={kb || undefined}>
      <button type="button" className="sn-abar-back" onClick={onBack}>
        <ArrowLeft className="sn-icon" aria-hidden />
        <span className="sn-sr">돌아가기: </span>
        <span className="sn-abar-to">{backLabel}</span>
      </button>
      {children && <div className="sn-abar-mid">{children}</div>}
      {bottom && primary && <div className="sn-abar-main">{primary}</div>}
    </div>
  );
  return bottom && host?.slot ? createPortal(bar, host.slot) : bar;
}
