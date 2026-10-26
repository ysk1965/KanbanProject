import { useSyncExternalStore } from 'react';
import type { GroupStore } from './groupStore';
import { stickerTone } from './GroupSticker';

/** 「모임」 탭 왼쪽 패널 — 내 모임, 모임 만들기 (모임이 없을 때 안내는 본문 GroupsLanding) */
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
      <div className="sn-label">내 모임</div>
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
            <i className="sg-navdot" data-tone={stickerTone(g.id)} aria-hidden />
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
    </div>
  );
}
