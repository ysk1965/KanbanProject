import { useEffect, useSyncExternalStore } from 'react';
import { LogIn, Plus } from 'lucide-react';
import { Mascot } from '../Mascot';
import type { MascotId } from '../sermonLook';
import { todayString } from '../sermonTypes';
import type { SermonGroup } from './groupApi';
import { useSermonGroups } from './GroupContext';
import { Faces } from './Faces';
import { GroupSticker, stickerTilt, stickerTone } from './GroupSticker';
import { josa, type GroupStore } from './groupStore';
import { kindName } from './servicePresets';
import { weekStartOf } from './sessionMatch';
import './group.css';

/**
 * 「모임」 탭 첫 화면 — 모임 스티커 판.
 * 모임마다 만들 때 받은 스티커 + 이번 주 몇 명이 썼는지, 빈 자리는 점선 「새 모임」 스티커.
 */
export function GroupsLanding({ mascot }: { mascot: MascotId }) {
  const ctx = useSermonGroups();
  const store = ctx?.store;
  useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    store ? store.snapshot : zeroSnapshot,
  );
  const thisWeek = weekStartOf(todayString());
  const ids = (store?.active() || []).map((g) => g.id).join(',');
  useEffect(() => {
    if (!store || !ids) return;
    ids.split(',').forEach((id) => store.ensureWeek(id, thisWeek));
  }, [store, ids, thisWeek]);

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

  const stats = groups.map((g) => ({ g, ...weekStats(store, g, thisWeek) }));
  const best = stats
    .filter((x) => x.g.me.status === 'active' && x.loaded)
    .sort((a, b) => b.writers.length - a.writers.length)[0];
  const allDone = !!best && best.total > 0 && best.writers.length >= best.total;

  return (
    <div className="sg-landing">
      <div className="sg-landing-h">
        <div>
          <h2>모임</h2>
          <p className="sg-hand">이번 주 말씀, 누가 꽂았나 볼까요</p>
        </div>
        <button type="button" className="sn-btn sn-primary" onClick={ctx.openCreate}>
          <Plus className="sn-icon" aria-hidden />
          모임 만들기
        </button>
      </div>

      {best && (
        <div className="sg-say">
          <Mascot kind={mascot} size={44} state={allDone ? 'done' : 'idle'} />
          <p>
            {allDone ? (
              <>
                <b>{best.g.name}</b> 다 같이 꽂았어요!
              </>
            ) : best.writers.length ? (
              <>
                {josa(best.g.name, '은', '는')} 이번 주 <b>{best.writers.length}명</b>이 먼저
                꽂았어요.
              </>
            ) : (
              <>이번 주 말씀, 먼저 꽂아 볼까요? 예배 시간에 노트를 열면 모임에 붙어요.</>
            )}
          </p>
        </div>
      )}

      <div className="sg-board">
        {stats.map(({ g, writers, total, loaded }, idx) => {
          const pending = g.members.filter((m) => m.status === 'pending').length;
          const leader = g.me.role !== 'member';
          const active = g.members.filter((m) => m.status === 'active');
          const faces = [
            ...active.filter((m) => writers.includes(m.user_id)),
            ...active.filter((m) => !writers.includes(m.user_id)).map((m) => ({ ...m, off: true })),
          ];
          const svcs = g.services
            .filter((s) => s.active)
            .map((s) => s.name.replace(/ ?(설교|예배)$/, ''));
          return (
            <button
              key={g.id}
              type="button"
              className="sg-slot2"
              style={{ ['--i' as string]: idx }}
              onClick={() => ctx.openGroup(g.id)}
            >
              <GroupSticker
                name={g.name}
                kind={kindName(g.kind)}
                sub={svcs.slice(0, 2).join(' · ') || `${g.member_count}명`}
                size={150}
                tone={stickerTone(g.id)}
                tilt={stickerTilt(g.id)}
              />
              <span className="sg-slot2-meta">
                {g.me.status === 'pending' ? (
                  <span className="sg-ring" data-tone="2">
                    승인 기다리는 중
                  </span>
                ) : (
                  <span
                    className="sg-ring"
                    data-done={(total > 0 && writers.length >= total) || undefined}
                  >
                    {loaded ? `이번 주 ${writers.length} / ${total}명` : `${g.member_count}명`}
                  </span>
                )}
                <Faces people={faces} max={5} size={24} />
                {leader && pending > 0 && g.me.status === 'active' && (
                  <span className="sg-ring" data-tone="2">
                    참여 요청 {pending}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        <button type="button" className="sg-slot2" onClick={ctx.openCreate}>
          <span className="sg-stk sg-stk-new" style={{ ['--sg-stk' as string]: '150px' }}>
            <span className="sg-stk-in">
              <span className="sg-stk-name">+ 새 모임</span>
              <span className="sg-stk-sub">셀 · 가족 · 친구</span>
            </span>
          </span>
          <span className="sg-slot2-meta">
            <span className="sg-note">초대 링크로 들어가도 돼요</span>
          </span>
        </button>
      </div>
    </div>
  );
}

/** 이번 주 쓴 멤버(중복 없이)와 활동 멤버 수 */
function weekStats(store: GroupStore, g: SermonGroup, start: string) {
  const w = store.weekCached(g.id, start);
  const active = g.members.filter((m) => m.status === 'active').map((m) => m.user_id);
  const writers = [
    ...new Set((w?.sessions || []).flatMap((s) => (s.members || []).map((m) => m.user_id))),
  ].filter((u) => active.includes(u));
  return { writers, total: active.length, loaded: !!w };
}

const noopSubscribe = () => () => {};
const zeroSnapshot = () => 0;
