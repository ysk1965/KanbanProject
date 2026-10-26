import { useMemo, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { SnOverlay } from './SnOverlay';
import { SnSheetBar } from './SnSheetBar';
import { resolveGalpiRule, saveGalpiPrefs, useGalpiPrefs } from './galpiPrefs';
import { sameService, sundayServices, type SermonNote } from './sermonTypes';

/**
 * 「나의 갈피」 메뉴의 갈피 설정 두 줄 — 자동으로 꽂기 · 내 주일 예배.
 * 내 주일 예배는 고르지 않으면 최근 8주 일요일 노트에서 가장 많이 쓴 예배(자동)를 쓴다.
 */
export function GalpiSettingsRows({ notes }: { notes: SermonNote[] }) {
  const prefs = useGalpiPrefs();
  const [picking, setPicking] = useState(false);
  const rule = useMemo(() => resolveGalpiRule(prefs, notes), [prefs, notes]);

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={prefs.auto}
        onClick={() => saveGalpiPrefs({ auto: !prefs.auto })}
      >
        주일 예배에 갈피 자동으로 꽂기
        <span className="sn-gp-sw" data-on={prefs.auto} aria-hidden />
      </button>
      {prefs.auto && (
        <button type="button" onClick={() => setPicking(true)}>
          내 주일 예배
          <span>
            {rule.service || '아직 없음'}
            {!prefs.service && rule.service && ' · 자동'}
            <ChevronRight className="sn-icon" aria-hidden />
          </span>
        </button>
      )}
      <ServicePicker open={picking} notes={notes} onClose={() => setPicking(false)} />
    </>
  );
}

function ServicePicker({
  open,
  notes,
  onClose,
}: {
  open: boolean;
  notes: SermonNote[];
  onClose: () => void;
}) {
  const prefs = useGalpiPrefs();
  const counts = useMemo(() => sundayServices(notes), [notes]);
  const guess = counts[0]?.service ?? null;
  const [custom, setCustom] = useState('');
  const pick = (service: string | null) => {
    saveGalpiPrefs({ service });
    onClose();
  };
  const listed = prefs.service && !counts.some((c) => sameService(c.service, prefs.service));

  return (
    <SnOverlay open={open} onClose={onClose} className="sn-modal sn-gp" aria-labelledby="sn-gp-h">
      <h2 id="sn-gp-h">내 주일 예배</h2>
      <p>이 예배로 쓴 일요일 노트에 갈피가 자동으로 꽂혀요. 직접 꽂은 주는 그대로 둬요.</p>
      <div className="sn-gp-list" role="radiogroup" aria-label="내 주일 예배">
        <GpOption
          on={!prefs.service}
          label="최근 노트로 정하기"
          sub={guess ? `지금은 ${guess}` : '일요일 노트가 아직 없어요'}
          onClick={() => pick(null)}
        />
        {counts.map((c) => (
          <GpOption
            key={c.service}
            on={!!prefs.service && sameService(prefs.service, c.service)}
            label={c.service}
            sub={`최근 8주 ${c.count}번`}
            onClick={() => pick(c.service)}
          />
        ))}
        {listed && prefs.service && (
          <GpOption on label={prefs.service} sub="직접 입력" onClick={() => pick(prefs.service)} />
        )}
      </div>
      <form
        className="sn-gp-custom"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim()) pick(custom.trim());
          setCustom('');
        }}
      >
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="다른 예배 이름 (예: 주일 3부)"
          aria-label="다른 예배 이름"
          maxLength={30}
        />
        <button type="submit" disabled={!custom.trim()}>
          정하기
        </button>
      </form>
      <SnSheetBar onClose={onClose} />
    </SnOverlay>
  );
}

function GpOption({
  on,
  label,
  sub,
  onClick,
}: {
  on: boolean;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button type="button" role="radio" aria-checked={on} className="sn-gp-opt" onClick={onClick}>
      <span>
        <b>{label}</b>
        <small>{sub}</small>
      </span>
      {on && <Check className="sn-icon" aria-hidden />}
    </button>
  );
}
