import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, PenLine } from 'lucide-react';
import { decRef, refLong } from '../bibleRefs';
import { Mascot } from '../Mascot';
import { applyInk, loadLook } from '../sermonLook';
import { ShareCard } from './ShareCard';
import { ensureSermonFonts } from './fonts';
import { cardDate, parseCard, startPath } from './shareModel';
import '../sermon.css';
import './shareCard.css';

/**
 * /sermonnote/c?… — 공유받은 설교 카드.
 * 받은 사람이 30초 안에 첫 노트를 쓰게: 로그인 없음 · 설교 정보 미리 채움 · 빈 화면 대신 한 줄.
 * 서버를 부르지 않는다(카드 내용은 주소에 들어 있다). 「남기기」는 /sermonnote?start=… 로 넘겨
 * 설교 노트 저장소가 새 노트를 만든다.
 */
export default function CardPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const data = useMemo(() => parseCard(params), [params]);
  const [look] = useState(loadLook);
  const [step, setStep] = useState<'card' | 'first'>('card');
  const [first, setFirst] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ensureSermonFonts();
    return applyInk(look.ink);
  }, [look.ink]);

  useEffect(() => {
    const prev = document.title;
    document.title = data?.title ? `${data.title} · 설교 노트` : '설교 노트';
    return () => {
      document.title = prev;
    };
  }, [data?.title]);

  useEffect(() => {
    if (step === 'first') window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [step]);

  const r = decRef(data?.ref);
  const meta = data
    ? [data.preacher, [cardDate(data.date), data.service].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div className="sermon-app snc-page">
      <header className="sn-strip">
        <div className="sn-brand">
          설교 노트 <small>개역한글</small>
        </div>
        <span className="sn-sp" />
        <button type="button" className="sn-btn sn-ghost" onClick={() => navigate('/sermonnote')}>
          내 노트
        </button>
      </header>

      <main className="snc-page-main">
        {!data ? (
          <div className="snc-page-panel snc-page-empty">
            <Mascot kind={look.mascot} size={72} state="think" />
            <h1>카드 내용을 읽지 못했어요</h1>
            <p>
              주소가 잘렸을 수 있어요. 보낸 분께 다시 받아 보거나, 바로 내 노트를 시작해 보세요.
            </p>
            <button
              type="button"
              className="sn-btn sn-primary"
              onClick={() => navigate(startPath(null))}
            >
              <PenLine className="sn-icon" />새 설교 기록하기
            </button>
          </div>
        ) : (
          <>
            <div className="snc-page-card">
              <ShareCard data={data} fmt="feed" mascot={look.mascot} />
            </div>

            <div className="snc-page-panel">
              {step === 'card' ? (
                <>
                  <h1>같은 설교를 들었나요?</h1>
                  <p>
                    이 설교로 바로 노트를 시작할 수 있어요. 설교 제목과 본문은 미리 채워 두고,
                    로그인 없이 이 기기에 저장돼요.
                  </p>
                  <button
                    type="button"
                    className="sn-btn sn-primary snc-page-main-btn"
                    onClick={() => setStep('first')}
                  >
                    나도 이 설교 기록하기
                    <ArrowRight className="sn-icon" />
                  </button>
                  <button
                    type="button"
                    className="sn-btn"
                    onClick={() => navigate(startPath(null))}
                  >
                    다른 설교 기록하기
                  </button>
                </>
              ) : (
                <form
                  className="snc-first-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (first.trim()) navigate(startPath(data, first));
                  }}
                >
                  <dl className="snc-seed">
                    {data.title && (
                      <>
                        <dt>설교</dt>
                        <dd>{data.title}</dd>
                      </>
                    )}
                    {meta && (
                      <>
                        <dt>설교자 · 예배</dt>
                        <dd>{meta}</dd>
                      </>
                    )}
                    {r && (
                      <>
                        <dt>본문</dt>
                        <dd>{refLong(r)}</dd>
                      </>
                    )}
                  </dl>
                  <label htmlFor="snc-first-input" className="snc-first-q">
                    이 설교에서 남은 한 문장은?
                  </label>
                  <textarea
                    id="snc-first-input"
                    ref={inputRef}
                    value={first}
                    maxLength={500}
                    rows={3}
                    placeholder="예: 모든 사람 안에 나도 들어간다"
                    onChange={(e) => setFirst(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="sn-btn sn-primary snc-page-main-btn"
                    disabled={!first.trim()}
                  >
                    남기기
                  </button>
                  <button
                    type="button"
                    className="sn-btn"
                    onClick={() => navigate(startPath(data))}
                  >
                    건너뛰고 노트 열기
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
