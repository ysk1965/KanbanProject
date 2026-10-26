import { useSyncExternalStore } from 'react';
import type { GroupStore } from './groupStore';

/** 목록 사이드바 「함께」 — 내 모임, 모임 만들기 */
export function GroupNav({
  store,
  current,
  onOpen,
  onCreate,
  onLogin,
}: {
  store: GroupStore;
  current: string | null;
  onOpen: (groupId: string) => void;
  onCreate: () => void;
  onLogin?: () => void;
}) {
  useSyncExternalStore(store.subscribe, store.snapshot);
  const groups = store.groups;
  return (
    <div className="sn-nav">
      <div className="sn-label">함께</div>
      {groups.map((g) => {
        const pending = g.members.filter((m) => m.status === 'pending').length;
        const leader = g.me.role !== 'member';
        return (
          <button
            key={g.id}
            type="button"
            aria-current={current === g.id}
            onClick={() => onOpen(g.id)}
          >
            {g.name}
            <span className="sn-count">
              {g.me.status === 'pending'
                ? '승인 대기'
                : leader && pending
                  ? `요청 ${pending}`
                  : g.member_count}
            </span>
          </button>
        );
      })}
      {store.anonymous ? (
        onLogin && (
          <button type="button" onClick={onLogin}>
            로그인하고 모임 만들기
          </button>
        )
      ) : (
        <button type="button" onClick={onCreate} style={{ color: 'var(--sn-t1)', fontWeight: 700 }}>
          + 모임 만들기
        </button>
      )}
      {!groups.length && !store.anonymous && (
        <p
          style={{ margin: '2px 10px 0', fontSize: 12, color: 'var(--sn-muted)', lineHeight: 1.5 }}
        >
          같이 설교를 듣는 사람들과 노트를 나눠 보세요.
        </p>
      )}
    </div>
  );
}
