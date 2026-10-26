import { useSyncExternalStore } from 'react';
import { LogIn, Plus } from 'lucide-react';
import { Mascot } from '../Mascot';
import type { MascotId } from '../sermonLook';
import { useSermonGroups } from './GroupContext';
import { Faces } from './Faces';
import './group.css';

/** 「모임」 탭 첫 화면 — 모임을 고르기 전. 내 모임 카드 · 만들기 · 비었을 때 안내 */
export function GroupsLanding({ mascot }: { mascot: MascotId }) {
  const ctx = useSermonGroups();
  const store = ctx?.store;
  useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.snapshot : zeroSnapshot,
  );
  if (!ctx || !store) return null;

  if (ctx.anonymous) {
    return (
      <div className="sn-empty">
        <Mascot kind={mascot} size={96} state="think" />
        <h2>같이 설교를 듣는 사람들과 나눠요</h2>
        <div>
          셀·가족·친구와 모임을 만들면 같은 예배의 노트가 한자리에 모여요.
          <br />
          모임은 로그인하면 쓸 수 있어요.
        </div>
        {ctx.onLogin && (
          <button type="button" className="sn-btn sn-primary" onClick={ctx.onLogin}>
            <LogIn className="sn-icon" aria-hidden />
            로그인
          </button>
        )}
      </div>
    );
  }

  const groups = store.groups;
  if (!groups.length) {
    return (
      <div className="sn-empty">
        <Mascot kind={mascot} size={96} state="think" />
        <h2>아직 모임이 없어요</h2>
        <div>
          같이 설교를 듣는 사람들과 모임을 만들어 보세요.
          <br />
          같은 예배 시간에 쓴 노트가 자동으로 한자리에 모여요.
        </div>
        <button type="button" className="sn-btn sn-primary" onClick={ctx.openCreate}>
          <Plus className="sn-icon" aria-hidden />
          모임 만들기
        </button>
      </div>
    );
  }

  return (
    <div className="sn-glanding">
      <div className="sn-apply-head">
        <div>
          <h2>모임</h2>
          <p>모임을 고르면 이번 주 설교 자리와 같이 쓴 노트가 보여요.</p>
        </div>
        <button type="button" className="sn-btn" onClick={ctx.openCreate}>
          <Plus className="sn-icon" aria-hidden />
          모임 만들기
        </button>
      </div>
      <div className="sn-gcards">
        {groups.map((g) => {
          const active = g.members.filter((m) => m.status === 'active');
          const pending = g.members.filter((m) => m.status === 'pending').length;
          const leader = g.me.role !== 'member';
          return (
            <button
              key={g.id}
              type="button"
              className="sn-gcard"
              onClick={() => ctx.openGroup(g.id)}
            >
              <b>{g.name}</b>
              <span className="sn-gcard-meta">
                <Faces people={active} max={4} />
                {g.member_count}명
              </span>
              {g.me.status === 'pending' ? (
                <span className="sn-gbadge">승인 대기</span>
              ) : (
                leader && pending > 0 && <span className="sn-gbadge">가입 요청 {pending}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const noopSubscribe = () => () => {};
const zeroSnapshot = () => 0;
