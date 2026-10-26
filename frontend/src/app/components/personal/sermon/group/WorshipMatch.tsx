import { useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { GalpiMark } from '../GalpiMark';
import { saveGalpiPrefs, useGalpiPrefs } from '../galpiPrefs';
import {
  pendingGuesses,
  setGroupMatch,
  worshipForGroupService,
  worshipFromGroupService,
  worshipLabel,
  worshipTimes,
} from '../worship';
import type { GroupService, SermonGroup } from './groupApi';
import { timesSummary } from './servicePresets';
import '../worship.css';

/**
 * 모임 예배 ↔ 내 예배 짝짓기 (기획 TGNziM4tRteB8koxfNZGb3 ⑥⑦).
 * 왼쪽 = 모임 예배(파랑), 오른쪽 = 내 예배(갈피 예배면 분홍). 짝지은 내 예배로 쓴 노트는
 * 모임 예배 시간과 상관없이 그 모임 자리에 붙는다. 고르면 바로 저장(내 예배표 = galpiPrefs).
 * 짝이 없는 줄은 요일·시간이 겹치거나 이름이 같은 내 예배를 「추천」으로 보여 준다.
 */
export function WorshipMatch({
  group,
  muted,
  onMute,
}: {
  group: Pick<SermonGroup, 'id' | 'services'>;
  muted: string[];
  /** 「이 예배는 안 드려요」 — 모임의 muted_service_ids 를 바꾼다 */
  onMute: (serviceId: string, mute: boolean) => void;
}) {
  const prefs = useGalpiPrefs();
  const list = prefs.worship;
  const [open, setOpen] = useState<string | null>(null);
  const rows = group.services.filter((s) => s.active);
  const guesses = useMemo(() => pendingGuesses(list, group), [list, group]);

  const match = (gs: GroupService, worshipId: string | null) => {
    saveGalpiPrefs({ worship: setGroupMatch(list, group.id, gs.id, worshipId) });
    if (worshipId && muted.includes(gs.id)) onMute(gs.id, false);
    setOpen(null);
  };
  const addNew = (gs: GroupService) => {
    const base = setGroupMatch(list, group.id, gs.id, null);
    const item = worshipFromGroupService(base, gs, group.id);
    // 처음 넣는 예배가 주일이면 갈피 예배로
    item.galpi = !base.some((s) => s.galpi) && gs.slots.some((x) => x.dow === 0);
    saveGalpiPrefs({ worship: [...base, item] });
    if (muted.includes(gs.id)) onMute(gs.id, false);
    setOpen(null);
  };

  return (
    <div className="sg-wm">
      {rows.map((gs) => {
        const mine = worshipForGroupService(list, group.id, gs.id);
        const off = muted.includes(gs.id);
        const guess = !mine && !off ? guesses.get(gs.id) : undefined;
        const isOpen = open === gs.id;
        return (
          <div key={gs.id} className="sg-wm-row">
            <div className="sg-wm-pair">
              <div className="sg-wm-grp">
                <b>{gs.name}</b>
                <small>{timesSummary(gs)}</small>
              </div>
              <span className="sg-wm-knot" data-off={off || !mine || undefined} aria-hidden>
                {off ? '–' : mine ? '=' : '?'}
              </span>
              <button
                type="button"
                className="sg-wm-mine"
                data-star={mine?.galpi || undefined}
                data-state={off ? 'off' : mine ? 'on' : guess ? 'guess' : 'none'}
                aria-expanded={isOpen}
                aria-label={`모임 ${gs.name}에 맞출 내 예배 고르기`}
                onClick={() => setOpen(isOpen ? null : gs.id)}
              >
                {off ? (
                  <>
                    <b>안 드려요</b>
                    <small>눌러서 바꾸기</small>
                  </>
                ) : mine ? (
                  <>
                    <b>
                      {mine.galpi && <GalpiMark size={12} />}
                      {worshipLabel(mine)}
                    </b>
                    <small>{worshipTimes(mine)}</small>
                  </>
                ) : guess ? (
                  <>
                    <b>{worshipLabel(guess)}?</b>
                    <small>추천 · 눌러서 고르기</small>
                  </>
                ) : (
                  <>
                    <b>맞추기</b>
                    <small>눌러서 고르기</small>
                  </>
                )}
              </button>
            </div>
            {isOpen && (
              <div className="sg-wm-pick" role="listbox" aria-label={`${gs.name}에 맞출 내 예배`}>
                {list.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    role="option"
                    aria-selected={mine?.id === w.id}
                    onClick={() => match(gs, w.id)}
                  >
                    <span>
                      {w.galpi && <GalpiMark size={12} />}
                      {worshipLabel(w)}
                    </span>
                    <small>
                      {worshipTimes(w)}
                      {mine?.id === w.id && <Check size={14} aria-hidden />}
                    </small>
                  </button>
                ))}
                <button type="button" className="sg-wm-new" onClick={() => addNew(gs)}>
                  <span>
                    <Plus size={14} aria-hidden />내 예배표에 「{gs.name}」 새로 넣기
                  </span>
                </button>
                {mine && (
                  <button type="button" className="sg-wm-quiet" onClick={() => match(gs, null)}>
                    <span>짝 풀기</span>
                  </button>
                )}
                <button
                  type="button"
                  className="sg-wm-quiet"
                  onClick={() => {
                    if (!off)
                      saveGalpiPrefs({ worship: setGroupMatch(list, group.id, gs.id, null) });
                    onMute(gs.id, !off);
                    setOpen(null);
                  }}
                >
                  <span>{off ? '이 예배 드려요' : '이 예배는 안 드려요'}</span>
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
