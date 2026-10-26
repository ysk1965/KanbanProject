import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, Loader2, LogIn, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../../contexts/AuthContext';
import { decRef, refLong } from '../bibleRefs';
import { Mascot } from '../Mascot';
import { applyInk, loadLook } from '../sermonLook';
import { todayString } from '../sermonTypes';
import { weekStartOf } from './sessionMatch';
import { ensureSermonFonts } from '../share/fonts';
import { startPath } from '../share/shareModel';
import { groupErrorMessage, sermonGroupAPI, type InvitePreview } from './groupApi';
import { groupStoreFor } from './groupStore';
import { GroupSticker, stickerTilt, stickerTone } from './GroupSticker';
import { DOW_KO, kindName, meetLabel, slotsLabel } from './servicePresets';
import '../sermon.css';
import './group.css';

/**
 * /g/:code — 모임 초대 링크. 로그인 없이 미리보기(모임 이름·인원·이번 주 설교까지, 멤버 노트는 없음).
 * 참여는 로그인 후. 참여하면 /sermonnote?adopt=<모임> 으로 보내 「한 주 동안」에 자리가 놓인 걸 먼저 보여 준다.
 */
export default function GroupJoinPage() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, isLoading } = useAuth();
  const [look] = useState(loadLook);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [muted, setMuted] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ensureSermonFonts();
    return applyInk(look.ink);
  }, [look.ink]);

  useEffect(() => {
    if (isLoading) return;
    sermonGroupAPI
      .invitePreview(code, isAuthenticated, weekStartOf(todayString()))
      .then((p) => {
        setPreview(p);
        document.title = `${p.name} · 설교 노트`;
      })
      .catch((e) => setFailed(groupErrorMessage(e, '초대 링크를 열지 못했어요')));
  }, [code, isAuthenticated, isLoading]);

  useEffect(() => {
    if (currentUser?.name && !name) setName(String(currentUser.name).slice(0, 20));
  }, [currentUser, name]);

  const first = useMemo(
    () => (preview?.this_week || []).find((s) => s.title || (s.refs || []).length),
    [preview],
  );

  const goLogin = () => navigate(`/login?returnTo=${encodeURIComponent(`/g/${code}?join=1`)}`);

  const join = async () => {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const g = await sermonGroupAPI.join(code, {
        display_name: name.trim().slice(0, 20),
        muted_service_ids: muted,
      });
      groupStoreFor(String(currentUser?.id)).upsert(g);
      toast(
        g.me.status === 'pending'
          ? '참여를 요청했어요 · 리더가 승인하면 함께 볼 수 있어요'
          : `${g.name}에 참여했어요`,
      );
      navigate(`/sermonnote?adopt=${encodeURIComponent(g.id)}`);
    } catch (e) {
      toast(groupErrorMessage(e, '참여하지 못했어요'));
    } finally {
      setBusy(false);
    }
  };

  const writeFirst = () => {
    const r = first?.refs?.[0] ?? null;
    navigate(
      startPath(
        first
          ? {
              kind: 'cover',
              title: first.title || '',
              preacher: '',
              service:
                first.name || preview?.services.find((s) => s.id === first.service_id)?.name || '',
              date: first.date,
              ref: r,
              verse: '',
            }
          : null,
      ),
    );
  };

  return (
    <div className="sermon-app sg-joinpage">
      <header className="sn-strip">
        <div className="sn-brand">
          설교 노트 <small>개역한글</small>
        </div>
        <span className="sn-sp" />
      </header>
      <main className="sg-join-main">
        {failed ? (
          <div className="sg-empty">
            <Mascot kind={look.mascot} size={72} state="think" />
            <b>{failed}</b>
            <span className="sg-note">보낸 분께 새 링크를 받아 보세요.</span>
            <button type="button" className="sn-btn" onClick={() => navigate('/sermonnote')}>
              설교 노트 열기
            </button>
          </div>
        ) : !preview ? (
          <div className="sg-empty" role="status" aria-label="불러오는 중">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--sn-accent)' }} />
          </div>
        ) : (
          <>
            <section className="sg-invite">
              <span className="sg-cover-tape" aria-hidden />
              <GroupSticker
                name={preview.name}
                kind={kindName(preview.kind)}
                sub={preview.services
                  .filter((s) => s.active)
                  .map((s) => s.name)
                  .slice(0, 2)
                  .join(' · ')}
                size={176}
                tone={stickerTone(preview.group_id)}
                tilt={stickerTilt(preview.group_id)}
              >
                <Mascot kind={look.mascot} size={56} className="sg-stk-m" />
              </GroupSticker>
              <p className="sg-hand sg-invite-hi">
                {preview.leader_name
                  ? `${preview.leader_name} 님이 「${preview.name}」에 초대했어요`
                  : `「${preview.name}」에 초대받았어요`}
              </p>
              <h1>같은 설교, 같이 꽂아요</h1>
              <div className="sg-cover-chips">
                <span className="sg-tagchip">{preview.member_count}명</span>
                {preview.services
                  .filter((s) => s.active)
                  .map((s) => (
                    <span key={s.id} className="sg-tagchip">
                      {s.name}
                    </span>
                  ))}
                {preview.meet_dow != null && (
                  <span className="sg-tagchip" data-tone="2">
                    {meetLabel(preview.meet_dow, preview.meet_time)} 모임
                  </span>
                )}
              </div>
            </section>

            {(preview.this_week || []).length > 0 && (
              <section className="sg-week">
                <div className="sg-wkh">
                  <b>이번 주 설교 자리</b>
                  <span className="sg-hand">참여하면 내 노트도 여기 붙어요</span>
                </div>
                {(preview.this_week || []).map((s, idx) => {
                  const r = (s.refs || []).map(decRef).find(Boolean);
                  const [y, m, d] = s.date.split('-').map(Number);
                  const title = s.title || (r ? refLong(r) : '');
                  return (
                    <div
                      key={`${s.service_id}${s.date}${s.name}`}
                      className="sg-dcard"
                      data-static
                      data-empty={!s.recorded_count || undefined}
                      style={{ ['--i' as string]: idx }}
                    >
                      <span className="sg-dnum">
                        <b>{d}</b>
                        <small>{DOW_KO[new Date(y, m - 1, d).getDay()]}</small>
                      </span>
                      <span className="sg-dbody">
                        <small className="sg-dsvc">
                          {s.name || preview.services.find((x) => x.id === s.service_id)?.name}
                        </small>
                        <b className="sg-dttl" data-ph={!title || undefined}>
                          {title || '아직 제목 없는 설교'}
                        </b>
                        <span className="sg-hand sg-dhand">
                          {s.recorded_count
                            ? `${s.recorded_count}명이 꽂았어요`
                            : '아직 비어 있어요'}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </section>
            )}
            <p className="sg-note">멤버들의 노트는 참여한 뒤에 보여요.</p>

            {preview.my_status === 'active' ? (
              <button
                type="button"
                className="sn-btn sn-primary"
                onClick={() =>
                  navigate(`/sermonnote?group=${encodeURIComponent(preview.group_id)}`)
                }
              >
                모임 홈 열기
              </button>
            ) : preview.my_status === 'pending' ? (
              <div className="sg-quiet">
                <Mascot kind={look.mascot} size={60} state="think" />
                <p className="sg-hand">리더 승인을 기다리는 중이에요</p>
                <button type="button" className="sn-btn" onClick={() => navigate('/sermonnote')}>
                  내 노트로
                </button>
              </div>
            ) : !isAuthenticated ? (
              <>
                <button type="button" className="sn-btn sn-primary" onClick={goLogin}>
                  <LogIn className="sn-icon" />
                  로그인하고 참여하기
                </button>
                <button type="button" className="sn-btn" onClick={writeFirst}>
                  <PenLine className="sn-icon" />
                  먼저 이번 주 노트 쓰기 (로그인 없이)
                </button>
              </>
            ) : (
              <div className="sg-setcard">
                <h3>
                  <span className="sg-label-stk">참여</span>모임에서 이렇게 불려요
                </h3>
                <label className="sg-field" htmlFor="sg-join-name">
                  모임에서 쓸 내 이름
                  <input
                    id="sg-join-name"
                    value={name}
                    maxLength={20}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                {preview.services.filter((s) => s.active).length > 1 && (
                  <div className="sg-field">
                    내가 드리는 예배{' '}
                    <span style={{ fontWeight: 500 }}>
                      · 안 드리는 예배는 끄면 그 시간 노트가 모임에 붙지 않아요
                    </span>
                    <div className="sg-svstk">
                      {preview.services
                        .filter((s) => s.active)
                        .map((s, i) => (
                          <button
                            key={s.id}
                            type="button"
                            className="sg-sv"
                            data-tone={i % 2 ? 2 : 1}
                            title={slotsLabel(s)}
                            aria-pressed={!muted.includes(s.id)}
                            onClick={() =>
                              setMuted((m) =>
                                m.includes(s.id) ? m.filter((x) => x !== s.id) : [...m, s.id],
                              )
                            }
                          >
                            <span className="sg-sv-bx" aria-hidden>
                              <Check size={12} strokeWidth={3} />
                            </span>
                            {s.name}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="sn-btn sn-primary"
                  disabled={busy || !name.trim()}
                  onClick={() => void join()}
                  autoFocus={params.get('join') === '1'}
                >
                  {busy && <Loader2 className="sn-icon animate-spin" />}
                  {preview.join_approval ? '참여 요청하기' : '참여하기'}
                </button>
                {preview.join_approval && (
                  <p className="sg-note">리더가 승인하면 모임 사람들의 노트가 보여요.</p>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
