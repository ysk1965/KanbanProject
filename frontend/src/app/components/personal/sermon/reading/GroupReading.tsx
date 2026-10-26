import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Mascot } from '../Mascot';
import type { MascotId } from '../sermonLook';
import { todayString } from '../sermonTypes';
import type { SermonGroup } from '../group/groupApi';
import { readingAPI, type PlanDetail } from './readingApi';
import { PlanSheet } from './PlanSheet';
import { PlanView } from './PlanView';
import './reading.css';

/** 모임 「통독」 탭 — 진행 중인 길이 있으면 PlanView, 없으면 리더에게 길 내기 */
interface Props {
  group: SermonGroup;
  mascot: MascotId;
  onRead: (chapter: string) => void;
}

export function GroupReading({ group, mascot, onRead }: Props) {
  const [plan, setPlan] = useState<PlanDetail | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState(false);
  const isLeader = group.me.role === 'leader' || group.me.role === 'co_leader';

  const load = useCallback(
    (signal?: { cancelled: boolean }) => {
      setFailed(false);
      const fetchOnce = () => readingAPI.ofGroup(group.id, todayString());
      // 배포 롤링·인스턴스 기동 중엔 첫 요청만 튕기는 일이 있어 한 번은 조용히 다시 묻는다
      fetchOnce()
        .catch(() => new Promise((r) => setTimeout(r, 800)).then(fetchOnce))
        .then((r) => {
          if (!signal?.cancelled) setPlan(r.plan || null);
        })
        .catch(() => {
          if (!signal?.cancelled) setFailed(true);
        });
    },
    [group.id],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  if (failed) {
    return (
      <div className="rp-empty">
        <p>통독 길을 불러오지 못했어요.</p>
        <button type="button" className="sn-btn sn-ghost" onClick={() => load()}>
          다시 불러오기
        </button>
      </div>
    );
  }
  if (plan === undefined) {
    return (
      <div className="rp-empty" aria-busy>
        <Loader2 className="sn-icon animate-spin" aria-label="불러오는 중" />
      </div>
    );
  }

  return (
    <>
      {plan ? (
        <PlanView plan={plan} onRead={onRead} onChange={setPlan} onEnded={() => setPlan(null)} />
      ) : (
        <div className="rp-empty">
          <Mascot kind={mascot} size={72} />
          <p className="sg-hand">
            {isLeader ? '모임이 같이 걸을 통독 길을 내 보세요' : '아직 진행 중인 통독 길이 없어요'}
          </p>
          <p className="sg-note">
            {isLeader
              ? '같은 날 같은 장을 읽고, 누가 읽었는지 함께 봐요. 마가복음 16일처럼 짧은 길부터 추천해요.'
              : '리더가 길을 내면 여기서 오늘 읽을 곳과 함께 읽은 사람을 볼 수 있어요.'}
          </p>
          {isLeader && (
            <button type="button" className="sn-btn sn-primary" onClick={() => setSheet(true)}>
              <Plus className="sn-icon" aria-hidden />
              통독 길 내기
            </button>
          )}
        </div>
      )}
      {isLeader && (
        <PlanSheet
          open={sheet}
          groupId={group.id}
          groupName={group.name}
          onClose={() => setSheet(false)}
          onCreated={(p) => {
            setSheet(false);
            setPlan(p);
          }}
        />
      )}
    </>
  );
}
