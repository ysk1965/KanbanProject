import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Link2, Loader2, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { SnOverlay } from '../SnOverlay';
import { useFx } from '../microFx';
import { decRef, refShort } from '../bibleRefs';
import type { MascotId } from '../sermonLook';
import type { SermonNote } from '../sermonTypes';
import { ShareCard } from './ShareCard';
import {
  cardShareText,
  cardUrl,
  coverData,
  lineCandidates,
  lineData,
  segsText,
  trimSegs,
  type CardData,
  type CardFmt,
  type CardKind,
  type LineCandidate,
  type LineQuote,
} from './shareModel';
import {
  CARD_RENDER_WIDTH,
  cardFileName,
  cardToBlob,
  copyText,
  downloadBlob,
  shareImage,
} from './shareImage';

/**
 * 「카드로 공유」 시트 — 표지 카드 / 밑줄 카드를 고르고 이미지로 공유·저장하거나 카드 링크를 복사한다.
 * 이미지는 화면 밖에 360px 로 그린 같은 카드를 찍는다(미리보기 크기와 무관하게 1080px).
 */
interface ShareSheetProps {
  open: boolean;
  note: SermonNote | null;
  mascot: MascotId;
  /** 선택 버블에서 연 경우 — 그 문장으로 밑줄 카드를 연다 */
  initialQuote?: LineQuote | null;
  onClose: () => void;
}

const FMTS: Array<{ id: CardFmt; name: string; ratio: string }> = [
  { id: 'feed', name: '피드', ratio: '4:5' },
  { id: 'story', name: '스토리', ratio: '9:16' },
];
const PREF_KEY = 'sermon-share-pref-v1';

function loadPref(): { fmt: CardFmt; preacher: boolean } {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null') as {
      fmt?: string;
      preacher?: boolean;
    } | null;
    return { fmt: p?.fmt === 'story' ? 'story' : 'feed', preacher: p?.preacher !== false };
  } catch {
    return { fmt: 'feed', preacher: true };
  }
}

export function ShareSheet({ open, note, mascot, initialQuote, onClose }: ShareSheetProps) {
  const [kind, setKind] = useState<CardKind>('cover');
  const [fmt, setFmt] = useState<CardFmt>(() => loadPref().fmt);
  const [showPreacher, setShowPreacher] = useState(() => loadPref().preacher);
  const [pickId, setPickId] = useState<string | null>(null);
  const [custom, setCustom] = useState<LineQuote | null>(null);
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const shotRef = useRef<HTMLDivElement>(null);
  // 옵션을 바꾸면 미리보기 카드가 살짝 흔들리고, 저장하면 들렸다 내려앉는다 (sermon.css 「마이크로 인터랙션」)
  const [fx, fire, fxN] = useFx(700);

  // 열 때마다 처음 상태로 (선택 버블에서 열었으면 그 문장)
  useEffect(() => {
    if (!open) return;
    setCustom(initialQuote ?? null);
    setKind(initialQuote ? 'line' : 'cover');
    setPickId(null);
  }, [open, initialQuote]);

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ fmt, preacher: showPreacher }));
    } catch {
      /* ignore */
    }
  }, [fmt, showPreacher]);

  const candidates = useMemo<LineCandidate[]>(() => {
    if (!open || !note) return [];
    // 선택 버블에서 고른 문장과 같은 문단은 목록에서 뺀다
    const picked = custom ? segsText(custom.segs).trim() : '';
    return lineCandidates(note).filter((c) => !picked || segsText(c.segs).trim() !== picked);
  }, [open, note, custom]);
  const markedCount = candidates.filter((c) => c.marked).length;

  const quote: LineQuote | null = useMemo(() => {
    if (pickId === 'custom' || (!pickId && custom)) return custom;
    const c = candidates.find((x) => x.id === pickId) ?? candidates[0];
    return c ?? null;
  }, [pickId, custom, candidates]);

  const data: CardData | null = useMemo(() => {
    if (!note) return null;
    if (kind === 'line' && quote) return lineData(note, quote);
    return coverData(note);
  }, [note, kind, quote]);

  const shown: CardData | null = useMemo(
    () => (data && !showPreacher ? { ...data, preacher: '' } : data),
    [data, showPreacher],
  );
  const link = shown ? cardUrl(shown) : '';

  const optSig = `${kind}|${fmt}|${showPreacher}|${pickId}`;
  const lastSig = useRef(optSig);
  useEffect(() => {
    if (lastSig.current === optSig) return;
    lastSig.current = optSig;
    if (open) fire('bump');
  }, [optSig, open, fire]);

  const makeBlob = useCallback(async () => {
    const el = shotRef.current;
    if (!el) throw new Error('card not mounted');
    return cardToBlob(el);
  }, []);

  const onShare = useCallback(async () => {
    if (!shown || busy) return;
    setBusy('share');
    try {
      const blob = await makeBlob();
      const name = cardFileName(shown.title);
      const res = await shareImage(blob, name, cardShareText(shown), link);
      if (res === 'unsupported') {
        downloadBlob(blob, name);
        const ok = await copyText(link);
        toast(ok ? '이미지를 저장하고 카드 링크를 복사했어요' : '이미지를 저장했어요');
      }
    } catch (e) {
      console.error('sermon share failed', e);
      toast('카드를 만들지 못했어요. 다시 시도해 주세요');
    } finally {
      setBusy(null);
    }
  }, [shown, busy, makeBlob, link]);

  const onSave = useCallback(async () => {
    if (!shown || busy) return;
    setBusy('save');
    try {
      downloadBlob(await makeBlob(), cardFileName(shown.title));
      fire('saved');
      toast('이미지를 저장했어요');
    } catch (e) {
      console.error('sermon card save failed', e);
      toast('카드를 만들지 못했어요. 다시 시도해 주세요');
    } finally {
      setBusy(null);
    }
  }, [shown, busy, makeBlob, fire]);

  const onCopy = useCallback(async () => {
    if (!link) return;
    toast((await copyText(link)) ? '카드 링크를 복사했어요' : '복사하지 못했어요');
  }, [link]);

  const noRef = !!note && !coverData(note).ref;

  return (
    <SnOverlay
      open={open && !!note}
      onClose={onClose}
      className="snc-sheet"
      overlayClassName="snc-sheet-ov"
      aria-labelledby="snc-sheet-title"
    >
      <div className="sn-shead">
        <h2 id="snc-sheet-title">카드로 공유</h2>
        <button
          type="button"
          className="sn-btn sn-icon-only sn-ghost"
          aria-label="닫기"
          onClick={onClose}
        >
          <X className="sn-icon" />
        </button>
      </div>
      {shown && (
        <div className="snc-sheet-body">
          <div className="snc-stage" data-fmt={fmt}>
            <div
              className="snc-stage-card"
              data-fx={fx ? `${fx}-${fxN % 2 ? 'a' : 'b'}` : undefined}
            >
              <ShareCard data={shown} fmt={fmt} mascot={mascot} showPreacher={showPreacher} />
            </div>
          </div>

          <div className="snc-ctl">
            <div className="snc-tabs" role="tablist" aria-label="카드 종류">
              <button
                type="button"
                role="tab"
                aria-selected={kind === 'cover'}
                onClick={() => setKind('cover')}
              >
                표지
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={kind === 'line'}
                onClick={() => setKind('line')}
              >
                밑줄
              </button>
            </div>

            {kind === 'cover' && (
              <p className="snc-hint">
                {noRef
                  ? '설교 본문 구절을 넣으면 책 이름과 장이 카드 그림이 돼요.'
                  : '오늘 들은 말씀과 설교 제목을 보여 주는 카드예요.'}
              </p>
            )}

            {kind === 'line' && (
              <div className="snc-picks" role="radiogroup" aria-label="카드에 넣을 문장">
                {custom && (
                  <PickRow
                    q={custom}
                    label="고른 문장"
                    checked={pickId === 'custom' || (!pickId && !!custom)}
                    onPick={() => setPickId('custom')}
                  />
                )}
                {candidates.map((c, i) => (
                  <PickRow
                    key={c.id}
                    q={c}
                    label={c.marked ? undefined : '밑줄 없는 문단'}
                    first={!c.marked && (i === 0 || candidates[i - 1].marked)}
                    checked={pickId === c.id || (!pickId && !custom && i === 0)}
                    onPick={() => setPickId(c.id)}
                  />
                ))}
                {!custom && !candidates.length && (
                  <p className="snc-hint">
                    아직 카드에 넣을 문장이 없어요. 노트에서 문장을 강조하거나 말씀에 밑줄을 그어
                    보세요.
                  </p>
                )}
                {!custom && !!candidates.length && !markedCount && (
                  <p className="snc-hint">
                    노트에서 강조하거나 말씀에 밑줄 그은 곳이 여기에 먼저 떠요.
                  </p>
                )}
              </div>
            )}

            <div className="snc-row">
              <span className="snc-lbl">크기</span>
              <div className="snc-chips">
                {FMTS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={fmt === f.id}
                    onClick={() => setFmt(f.id)}
                  >
                    {f.name} <small>{f.ratio}</small>
                  </button>
                ))}
              </div>
            </div>
            <label className="snc-row snc-toggle">
              <span className="snc-lbl">설교자 이름</span>
              <input
                type="checkbox"
                checked={showPreacher}
                onChange={(e) => setShowPreacher(e.target.checked)}
              />
              <span className="snc-sw" aria-hidden />
            </label>

            <div className="snc-acts">
              <button
                type="button"
                className="sn-btn sn-primary snc-main"
                onClick={() => void onShare()}
                disabled={!!busy || (kind === 'line' && !quote)}
              >
                {busy === 'share' ? (
                  <Loader2 className="sn-icon animate-spin" />
                ) : (
                  <Share2 className="sn-icon" />
                )}
                공유하기
              </button>
              <button
                type="button"
                className="sn-btn"
                onClick={() => void onSave()}
                disabled={!!busy || (kind === 'line' && !quote)}
              >
                {busy === 'save' ? (
                  <Loader2 className="sn-icon animate-spin" />
                ) : (
                  <Download className="sn-icon" />
                )}
                이미지 저장
              </button>
              <button type="button" className="sn-btn" onClick={() => void onCopy()}>
                <Link2 className="sn-icon" />
                링크 복사
              </button>
            </div>
            <p className="snc-note">
              카드에 보이는 내용만 나가요. 링크를 받은 사람은 같은 설교로 바로 노트를 쓸 수 있어요.
            </p>
          </div>

          {/* 이미지용 — 화면 밖에 고정 폭으로 그린다 */}
          <div className="snc-shot" aria-hidden style={{ width: CARD_RENDER_WIDTH }}>
            <ShareCard
              ref={shotRef}
              data={shown}
              fmt={fmt}
              mascot={mascot}
              showPreacher={showPreacher}
            />
          </div>
        </div>
      )}
    </SnOverlay>
  );
}

function PickRow({
  q,
  label,
  first,
  checked,
  onPick,
}: {
  q: LineQuote;
  label?: string;
  first?: boolean;
  checked: boolean;
  onPick: () => void;
}) {
  const r = decRef(q.ref);
  const segs = trimSegs(q.segs, 90);
  const over = segsText(q.segs).length > 220;
  return (
    <>
      {first && label && <div className="snc-pick-sep">{label}</div>}
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        className="snc-pick"
        onClick={onPick}
      >
        <span className="snc-pick-src" data-src={q.src}>
          {q.src === 'verse'
            ? r
              ? refShort(r)
              : '말씀'
            : label === '고른 문장'
              ? '고른 문장'
              : '내 노트'}
        </span>
        <span className="snc-pick-t">
          {segs.map((s, i) => (s.m ? <mark key={i}>{s.t}</mark> : <span key={i}>{s.t}</span>))}
        </span>
        {over && <span className="snc-pick-over">길어서 앞부분만 카드에 들어가요</span>}
      </button>
    </>
  );
}
