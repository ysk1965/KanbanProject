import { useMemo, useState } from 'react';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { GalpiMark } from './GalpiMark';
import { Mascot } from './Mascot';
import { SnOverlay } from './SnOverlay';
import { SnSheetBar } from './SnSheetBar';
import { saveGalpiPrefs, useGalpiPrefs } from './galpiPrefs';
import { useSermonGroups } from './group/GroupContext';
import { ServiceCard, type Pick } from './group/ServicePicker';
import { SERVICE_PRESETS } from './group/servicePresets';
import type { SermonNote } from './sermonTypes';
import {
  galpiWorship,
  newWorshipId,
  suggestWorship,
  worshipLabel,
  worshipTimes,
  type WorshipService,
} from './worship';
import './worship.css';

/**
 * 「나의 갈피」 메뉴의 「내 예배표」 한 줄 + 시트. 기획: https://claude.ai/artifact/TGNziM4tRteB8koxfNZGb3 ①②③
 * 예배마다 요일·시각·내 부·자동 채우기·갈피 예배, 짝지은 모임을 보여 준다. 고치면 바로 저장(galpiPrefs).
 */
export function GalpiSettingsRows({ notes }: { notes: SermonNote[] }) {
  const prefs = useGalpiPrefs();
  const [open, setOpen] = useState(false);
  const star = galpiWorship(prefs.worship);
  const others = prefs.worship.length - (star ? 1 : 0);
  const empty = !prefs.worship.length;

  return (
    <>
      <button
        type="button"
        className="sn-ws-row"
        data-empty={empty || undefined}
        onClick={() => setOpen(true)}
      >
        내 예배표
        <span>
          {empty ? (
            '정하기'
          ) : star ? (
            <>
              <span className="sn-ws-tag">
                <GalpiMark size={12} />
                {worshipLabel(star)}
              </span>
              {others > 0 && `외 ${others}`}
            </>
          ) : (
            prefs.worship.map((s) => s.name).join(' · ')
          )}
          <ChevronRight className="sn-icon" aria-hidden />
        </span>
      </button>
      <WorshipSheet open={open} notes={notes} onClose={() => setOpen(false)} />
    </>
  );
}

function WorshipSheet({
  open,
  notes,
  onClose,
}: {
  open: boolean;
  notes: SermonNote[];
  onClose: () => void;
}) {
  const prefs = useGalpiPrefs();
  const list = prefs.worship;
  const gctx = useSermonGroups();
  const groups = gctx && !gctx.anonymous ? gctx.store.active() : [];
  const [editing, setEditing] = useState<string | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [focusName, setFocusName] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const guess = useMemo(
    () => (open && !list.length ? suggestWorship(notes) : []),
    [open, list.length, notes],
  );

  const save = (next: WorshipService[]) => saveGalpiPrefs({ worship: next });
  const patch = (id: string, p: Partial<WorshipService>) =>
    save(list.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const setGalpi = (id: string, on: boolean) => {
    const prevStar = galpiWorship(list);
    save(list.map((s) => ({ ...s, galpi: on ? s.id === id : s.id === id ? false : !!s.galpi })));
    const target = list.find((s) => s.id === id);
    if (on && target && prevStar && prevStar.id !== id)
      toast(`갈피 예배를 ${worshipLabel(target)}(으)로 바꿨어요`);
  };
  const add = (base: Omit<WorshipService, 'id'>, focus = false) => {
    const id = newWorshipId(list);
    const item: WorshipService = {
      ...base,
      id,
      // 처음 넣는 예배가 주일이면 갈피 예배로
      galpi: !galpiWorship(list) && base.slots.some((x) => x.dow === 0),
    };
    save([...list, item]);
    setEditing(id);
    setPick(null);
    setFocusName(focus);
  };
  const addPreset = (p: (typeof SERVICE_PRESETS)[number]) =>
    add({
      name: p.name,
      active: true,
      slots: p.slots.map((x) => ({ ...x })),
      my_part: null,
      groups: [],
    });
  const addBlank = () =>
    add(
      {
        name: '새 예배',
        active: true,
        slots: [{ dow: 0, start: '11:00', end: '12:30', part: null }],
        my_part: null,
        groups: [],
      },
      true,
    );
  const remove = (id: string) => {
    save(list.filter((s) => s.id !== id));
    setEditing(null);
    setConfirmDel(null);
  };
  const unusedPresets = SERVICE_PRESETS.filter(
    (p) => !list.some((s) => s.name.replace(/\s+/g, '') === p.name.replace(/\s+/g, '')),
  );
  const groupName = (gid: string) => groups.find((g) => g.id === gid)?.name;

  return (
    <SnOverlay
      open={open}
      onClose={onClose}
      className="sn-modal sn-gp sn-ws"
      aria-labelledby="sn-ws-h"
    >
      <h2 id="sn-ws-h">내 예배표</h2>

      {!list.length ? (
        <div className="sn-ws-empty">
          <Mascot kind="galpi" size={56} />
          <b>어느 예배에서 말씀을 들으세요?</b>
          <p>자주 가는 예배를 골라 주세요. 시간은 바로 고칠 수 있어요.</p>
          {guess.length > 0 && (
            <button
              type="button"
              className="sn-ws-guess"
              onClick={() => save(guess.map(({ count: _c, ...s }) => s))}
            >
              최근 노트로 채우기
              <small>{guess.map((g) => `${g.name} ${worshipTimes(g)}`).join(' · ')}</small>
            </button>
          )}
          <div className="sn-ws-presets">
            {SERVICE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="sn-ws-preset"
                onClick={() => addPreset(p)}
              >
                {p.name}
              </button>
            ))}
          </div>
          <button type="button" className="sn-ws-hand" onClick={addBlank}>
            직접 만들게요
          </button>
        </div>
      ) : (
        <>
          <p className="sn-ws-hint">이 시간에 노트를 열면 예배 이름이 저절로 들어가요</p>
          <div className="sn-ws-list">
            {list.map((s) => {
              const isOpen = editing === s.id;
              const times = [...new Set(s.slots.map((x) => x.start))].sort();
              const linked = (s.groups || [])
                .map((g) => groupName(g.group_id))
                .filter((x): x is string => !!x);
              return (
                <div
                  key={s.id}
                  className="sn-ws-card"
                  data-star={s.galpi || undefined}
                  data-off={!s.active || undefined}
                >
                  <div className="sn-ws-top">
                    <button
                      type="button"
                      className="sn-ws-open"
                      aria-expanded={isOpen}
                      onClick={() => {
                        setEditing(isOpen ? null : s.id);
                        setPick(null);
                        setConfirmDel(null);
                      }}
                    >
                      {s.galpi && <GalpiMark size={26} />}
                      <span>
                        <b>{worshipLabel(s)}</b>
                        <small>
                          {s.slots.length ? worshipTimes(s) : '시간을 정하면 자동으로 채워요'}
                          {!s.active && ' · 자동 채우기 꺼짐'}
                        </small>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={s.active}
                      aria-label={`${s.name} 자동 채우기`}
                      className="sn-ws-swbtn"
                      onClick={() => patch(s.id, { active: !s.active })}
                    >
                      <span className="sn-gp-sw" data-on={s.active} aria-hidden />
                    </button>
                  </div>
                  {(s.galpi || linked.length > 0) && (
                    <div className="sn-ws-meta">
                      {s.galpi && (
                        <span className="sn-ws-tag">
                          <GalpiMark size={12} />
                          갈피 예배
                        </span>
                      )}
                      {linked.map((n) => (
                        <span key={n} className="sg-chip">
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                  {isOpen && (
                    <div className="sn-ws-edit">
                      <ServiceCard
                        service={s}
                        pick={pick}
                        onPick={setPick}
                        autoFocusName={focusName}
                        onFocused={() => setFocusName(false)}
                        onChange={(p) => {
                          const next = { ...s, ...p };
                          // 내 부가 지워진 시각이면 풀기
                          if (next.my_part && !next.slots.some((x) => x.start === next.my_part))
                            next.my_part = null;
                          patch(s.id, next);
                        }}
                      />
                      {times.length > 1 && (
                        <div className="sn-ws-part">
                          <span>내가 가는 시간</span>
                          <div>
                            {times.map((t) => (
                              <button
                                key={t}
                                type="button"
                                aria-pressed={s.my_part === t}
                                onClick={() => patch(s.id, { my_part: s.my_part === t ? null : t })}
                              >
                                {t.replace(/^0/, '')}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="sn-me-menu sn-ws-opts">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={!!s.galpi}
                          onClick={() => setGalpi(s.id, !s.galpi)}
                        >
                          <span className="sn-ws-lb">
                            <GalpiMark size={14} />
                            갈피 예배로
                          </span>
                          <span className="sn-gp-sw" data-on={!!s.galpi} aria-hidden />
                        </button>
                      </div>
                      {confirmDel === s.id ? (
                        <div className="sn-ws-del">
                          <span>{s.name}을(를) 지울까요? 이미 쓴 노트는 그대로예요.</span>
                          <button
                            type="button"
                            className="sn-btn"
                            onClick={() => setConfirmDel(null)}
                          >
                            두기
                          </button>
                          <button
                            type="button"
                            className="sn-btn sn-danger"
                            onClick={() => remove(s.id)}
                          >
                            지우기
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="sn-ws-delbtn"
                          onClick={() => setConfirmDel(s.id)}
                        >
                          <Trash2 className="sn-icon" aria-hidden />
                          예배 지우기
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="sn-ws-add">
            {unusedPresets.slice(0, 4).map((p) => (
              <button
                key={p.id}
                type="button"
                className="sn-ws-preset"
                onClick={() => addPreset(p)}
              >
                <Plus size={13} aria-hidden />
                {p.name}
              </button>
            ))}
            <button type="button" className="sn-ws-preset" onClick={addBlank}>
              <Plus size={13} aria-hidden />새 예배
            </button>
          </div>
        </>
      )}

      <div className="sn-me-menu sn-ws-opts">
        <button
          type="button"
          role="switch"
          aria-checked={prefs.auto}
          onClick={() => saveGalpiPrefs({ auto: !prefs.auto })}
        >
          <span className="sn-ws-lb">갈피 자동으로 꽂기</span>
          <span className="sn-gp-sw" data-on={prefs.auto} aria-hidden />
        </button>
      </div>
      <p className="sn-ws-foot">
        {prefs.auto
          ? '직접 꽂은 주가 없으면 갈피 예배로 쓴 노트에 갈피가 꽂혀요.'
          : '갈피는 직접 꽂을 때만 꽂혀요.'}
      </p>
      <SnSheetBar onClose={onClose} />
    </SnOverlay>
  );
}
