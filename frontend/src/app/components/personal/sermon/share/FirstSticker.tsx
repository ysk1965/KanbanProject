import { LogIn } from 'lucide-react';
import { SnOverlay } from '../SnOverlay';
import { Mascot } from '../Mascot';
import { mainRef, type SermonNote } from '../sermonTypes';
import type { MascotId } from '../sermonLook';
import { cardBookName, cardChapterUnit } from './shareModel';
import './shareCard.css';

/**
 * 공유받은 카드로 첫 노트를 남긴 직후 — 첫 설교 스티커. 로그인 전이면 여기서 로그인을 권한다.
 */
interface FirstStickerProps {
  open: boolean;
  note: SermonNote | null;
  mascot: MascotId;
  onLogin?: () => void;
  onClose: () => void;
}

export function FirstSticker({ open, note, mascot, onLogin, onClose }: FirstStickerProps) {
  const r = note ? mainRef(note) : null;
  return (
    <SnOverlay
      open={open && !!note}
      onClose={onClose}
      className="snc-first"
      aria-labelledby="snc-first-title"
    >
      <div className="snc-first-body">
        <div className="snc-first-stk" aria-hidden>
          <span className="snc-first-in">
            {r ? (
              <>
                <b>{cardBookName(r)}</b>
                <strong>
                  {r.c}
                  <small>{cardChapterUnit(r)}</small>
                </strong>
              </>
            ) : (
              <b>첫 장</b>
            )}
          </span>
          <span className="snc-first-badge">첫 장</span>
        </div>
        <Mascot kind={mascot} size={56} state="done" className="snc-first-m" />
        <h2 id="snc-first-title">첫 설교 스티커를 모았어요</h2>
        <p>
          {onLogin
            ? '노트는 이 기기에 저장됐어요. 로그인하면 다른 기기에서도 이어서 쓸 수 있어요.'
            : '노트에 저장됐어요. 생각나는 걸 더 적어 보세요.'}
        </p>
        <div className="snc-first-acts">
          {onLogin && (
            <button type="button" className="sn-btn" onClick={onLogin}>
              <LogIn className="sn-icon" />
              로그인
            </button>
          )}
          <button type="button" className="sn-btn sn-primary" onClick={onClose}>
            노트 계속 쓰기
          </button>
        </div>
      </div>
    </SnOverlay>
  );
}
