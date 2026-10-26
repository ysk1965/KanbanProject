import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { BOOKS } from '../bibleRefs';
import { SnOverlay } from '../SnOverlay';
import { SnSheetBar } from '../SnSheetBar';
import { todayString } from '../sermonTypes';
import { readingAPI, readingErrorMessage, type PlanDetail } from './readingApi';
import { refreshMine } from './readingStore';
import {
  REST_OPTIONS,
  TEMPLATES,
  addDays,
  buildPlan,
  mdDow,
  type RestDow,
  withYear,
  type TemplateId,
} from './readingPlan';
import './reading.css';

/**
 * 통독 길 내기 — 모임 길(groupId)이면 리더가, 없으면 나의 길.
 * 템플릿 → 시작일 → 쉼표. 미리보기 한 줄로 며칠·언제 끝나는지 보여 준다.
 */
interface Props {
  open: boolean;
  groupId?: string;
  groupName?: string;
  onClose: () => void;
  onCreated: (plan: PlanDetail) => void;
}

export function PlanSheet({ open, groupId, groupName, onClose, onCreated }: Props) {
  const today = todayString();
  const [template, setTemplate] = useState<TemplateId>('mark16');
  const [start, setStart] = useState(today);
  const [rest, setRest] = useState<RestDow>(6);
  const [b1, setB1] = useState(44);
  const [b2, setB2] = useState(44);
  const [perDay, setPerDay] = useState(1);
  const [busy, setBusy] = useState(false);

  const built = useMemo(
    () => buildPlan(template, start || today, rest, { b1, b2, perDay }),
    [template, start, today, rest, b1, b2, perDay],
  );
  const last = built?.days[built.days.length - 1];

  const submit = async () => {
    if (!built || busy) return;
    setBusy(true);
    try {
      const plan = await readingAPI.create({
        group_id: groupId,
        title: built.title,
        template,
        days: built.days,
      });
      void refreshMine();
      toast.success(groupId ? `${groupName || '모임'} 통독 길을 냈어요` : '나의 길을 시작했어요');
      onCreated(plan);
    } catch (e) {
      toast.error(readingErrorMessage(e, '길을 내지 못했어요'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SnOverlay
      open={open}
      onClose={onClose}
      className="sn-dialog sg-dialog rp-sheet"
      aria-labelledby="rp-sheet-title"
    >
      <div className="rp-sheet-head">
        <small>{groupId ? `${groupName || '모임'} · 함께 읽는 길` : '혼자 읽는 길'}</small>
        <h2 id="rp-sheet-title">{groupId ? '통독 길 내기' : '나의 길 시작'}</h2>
      </div>
      <div className="sg-form">
        <div className="rp-tpls" role="radiogroup" aria-label="길 고르기">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={template === t.id}
              className="rp-tpl"
              onClick={() => setTemplate(t.id)}
            >
              <b>{t.title}</b>
              <span>{t.pace}</span>
              <small>{t.fit}</small>
            </button>
          ))}
        </div>

        {template === 'custom' && (
          <div className="rp-custom">
            <label className="sg-field" htmlFor="rp-b1">
              처음 책
              <select id="rp-b1" value={b1} onChange={(e) => setB1(Number(e.target.value))}>
                {BOOKS.map((b, i) => (
                  <option key={b[0]} value={i}>
                    {b[0]}
                  </option>
                ))}
              </select>
            </label>
            <label className="sg-field" htmlFor="rp-b2">
              마지막 책
              <select id="rp-b2" value={b2} onChange={(e) => setB2(Number(e.target.value))}>
                {BOOKS.map((b, i) => (
                  <option key={b[0]} value={i}>
                    {b[0]}
                  </option>
                ))}
              </select>
            </label>
            <label className="sg-field" htmlFor="rp-per">
              하루에
              <select
                id="rp-per"
                value={perDay}
                onChange={(e) => setPerDay(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}장
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="rp-row2">
          <label className="sg-field" htmlFor="rp-start">
            시작하는 날
            <input
              id="rp-start"
              type="date"
              value={start}
              min={addDays(today, -1)}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <div className="sg-field">
            <span id="rp-rest-l">쉼표</span>
            <div className="sg-chips" role="group" aria-labelledby="rp-rest-l">
              {REST_OPTIONS.map(([v, l]) => (
                <button key={l} type="button" aria-pressed={rest === v} onClick={() => setRest(v)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="rp-preview" aria-live="polite">
          {built && last ? (
            <>
              <b>{built.title}</b> · {built.days.length}일, {built.chapters}장
              <br />
              {mdDow(built.days[0].date)} 시작 → {withYear(last.date, built.days[0].date, mdDow)} 끝
            </>
          ) : (
            '400일을 넘어요. 범위를 줄이거나 하루 장 수를 늘려 주세요.'
          )}
        </p>
        {groupId && (
          <p className="sg-note">
            모임 사람 모두가 같은 날 같은 장을 읽어요. 읽은 사람과 아직인 사람이 통독 탭에 보여요.
          </p>
        )}
      </div>
      <SnSheetBar onClose={onClose}>
        <button
          type="button"
          className="sn-btn sn-primary"
          disabled={!built || busy || !start}
          onClick={() => void submit()}
        >
          {busy && <Loader2 className="sn-icon animate-spin" aria-hidden />}
          {groupId ? '길 내기' : '시작하기'}
        </button>
      </SnSheetBar>
    </SnOverlay>
  );
}
